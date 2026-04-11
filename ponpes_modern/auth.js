
# Update auth.js dengan branding Hidayatulamin
auth_js_updated = '''// ==========================================
// HIDAYATULAMIN - AUTHENTICATION MODULE
// Versi: 2.0
// Deskripsi: Modul autentikasi dengan Pi Network & Firebase
// ==========================================

class HidayatulaminAuth {
    constructor() {
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.Pi = window.Pi;
        this.piInitialized = false;
        this.currentUser = null;
        
        this.init();
    }

    // ==========================================
    // INISIALISASI
    // ==========================================
    
    async init() {
        // Setup auth state listener
        this.auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            this.handleAuthStateChange(user);
        });
        
        // Inisialisasi Pi SDK
        await this.initPiSDK();
        
        console.log('✅ HidayatulaminAuth initialized');
    }

    async initPiSDK() {
        try {
            if (!this.Pi) {
                console.warn('⚠️ Pi SDK tidak tersedia');
                return false;
            }

            // Sandbox mode untuk development, false untuk production
            const isSandbox = window.location.hostname === 'localhost' || 
                             window.location.hostname.includes('vercel.app');
            
            this.Pi.init({ 
                version: "2.0", 
                sandbox: isSandbox 
            });
            
            this.piInitialized = true;
            console.log('✅ Pi SDK initialized (sandbox:', isSandbox, ')');
            return true;
        } catch (error) {
            console.error('❌ Pi SDK init failed:', error);
            return false;
        }
    }

    // ==========================================
    // PI NETWORK AUTHENTICATION
    // ==========================================

    async loginWithPi() {
        try {
            if (!this.piInitialized) {
                await this.initPiSDK();
            }

            const scopes = ['username', 'payments', 'wallet_address'];
            const authResult = await this.Pi.authenticate(scopes, this.onIncompletePaymentFound.bind(this));
            
            console.log('✅ Pi auth success:', authResult.user.username);
            
            // Proses data user
            await this.processPiUser(authResult, 'login');
            
            return { success: true, user: authResult.user };
            
        } catch (error) {
            console.error('❌ Pi login error:', error);
            return { success: false, error: error.message };
        }
    }

    async registerWithPi() {
        try {
            if (!this.piInitialized) {
                await this.initPiSDK();
            }

            const scopes = ['username', 'payments', 'wallet_address'];
            const authResult = await this.Pi.authenticate(scopes, this.onIncompletePaymentFound.bind(this));
            
            console.log('✅ Pi registration success:', authResult.user.username);
            
            // Proses data user
            const result = await this.processPiUser(authResult, 'register');
            
            return result;
            
        } catch (error) {
            console.error('❌ Pi registration error:', error);
            return { success: false, error: error.message };
        }
    }

    async processPiUser(authResult, action) {
        const { user, accessToken } = authResult;
        const userRef = this.db.collection('users').doc(user.uid);
        
        try {
            const userDoc = await userRef.get();
            
            const userData = {
                uid: user.uid,
                username: user.username,
                wallet_address: user.wallet_address || null,
                loginMethod: 'pi',
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                accessToken: accessToken,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (action === 'register') {
                if (userDoc.exists) {
                    // User sudah ada, update saja
                    await userRef.update(userData);
                    return { 
                        success: true, 
                        isNewUser: false, 
                        message: 'Akun sudah terdaftar, login berhasil' 
                    };
                } else {
                    // User baru
                    userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    userData.email = user.username + '@pi.network';
                    userData.firstName = '';
                    userData.lastName = '';
                    userData.phone = '';
                    userData.profileComplete = false;
                    userData.addresses = [];
                    
                    await userRef.set(userData);
                    return { 
                        success: true, 
                        isNewUser: true, 
                        message: 'Pendaftaran berhasil' 
                    };
                }
            } else {
                // Login action
                if (!userDoc.exists) {
                    // Auto-create jika belum ada
                    userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    userData.email = user.username + '@pi.network';
                    userData.profileComplete = false;
                    userData.addresses = [];
                    await userRef.set(userData);
                } else {
                    await userRef.update(userData);
                }
                
                return { success: true, isNewUser: !userDoc.exists };
            }
            
        } catch (error) {
            console.error('❌ Process Pi user error:', error);
            throw error;
        }
    }

    onIncompletePaymentFound(payment) {
        console.log('⚠️ Incomplete payment found:', payment);
        // Simpan ke localStorage untuk ditangani nanti
        localStorage.setItem('pi_incomplete_payment', JSON.stringify(payment));
        return Promise.resolve();
    }

    // ==========================================
    // EMAIL/PASSWORD AUTHENTICATION
    // ==========================================

    async loginWithEmail(email, password) {
        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Update last login
            await this.db.collection('users').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ Email login success:', user.uid);
            return { success: true, user: user };
            
        } catch (error) {
            console.error('❌ Email login error:', error);
            return { 
                success: false, 
                error: this.getErrorMessage(error.code) 
            };
        }
    }

    async registerWithEmail(email, password, userData) {
        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Update profile
            await user.updateProfile({
                displayName: userData.firstName + ' ' + userData.lastName
            });
            
            // Simpan ke Firestore
            const fullUserData = {
                uid: user.uid,
                email: email,
                firstName: userData.firstName,
                lastName: userData.lastName,
                phone: userData.phone,
                displayName: userData.firstName + ' ' + userData.lastName,
                loginMethod: 'email',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                profileComplete: true,
                addresses: []
            };
            
            await this.db.collection('users').doc(user.uid).set(fullUserData);
            
            // Kirim email verifikasi
            await user.sendEmailVerification();
            
            console.log('✅ Email registration success:', user.uid);
            return { success: true, user: user };
            
        } catch (error) {
            console.error('❌ Email registration error:', error);
            return { 
                success: false, 
                error: this.getErrorMessage(error.code) 
            };
        }
    }

    // ==========================================
    // SESSION MANAGEMENT
    // ==========================================

    saveSession(userData) {
        const session = {
            uid: userData.uid,
            email: userData.email || null,
            username: userData.username || null,
            displayName: userData.displayName || null,
            loginMethod: userData.loginMethod,
            isAuthenticated: true,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('hidayatulamin_user', JSON.stringify(session));
        console.log('💾 Session saved');
    }

    getSession() {
        const session = localStorage.getItem('hidayatulamin_user');
        return session ? JSON.parse(session) : null;
    }

    clearSession() {
        localStorage.removeItem('hidayatulamin_user');
        localStorage.removeItem('pi_incomplete_payment');
        console.log('🗑️ Session cleared');
    }

    async logout() {
        try {
            await this.auth.signOut();
            this.clearSession();
            console.log('👋 Logout success');
            return { success: true };
        } catch (error) {
            console.error('❌ Logout error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // USER DATA MANAGEMENT
    // ==========================================

    async getUserData(uid = null) {
        const targetUid = uid || (this.currentUser ? this.currentUser.uid : null);
        
        if (!targetUid) {
            return { success: false, error: 'No user ID provided' };
        }
        
        try {
            const doc = await this.db.collection('users').doc(targetUid).get();
            
            if (doc.exists) {
                return { success: true, data: doc.data() };
            } else {
                return { success: false, error: 'User not found' };
            }
            
        } catch (error) {
            console.error('❌ Get user data error:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUserProfile(uid, data) {
        try {
            data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await this.db.collection('users').doc(uid).update(data);
            
            console.log('✅ Profile updated:', uid);
            return { success: true };
            
        } catch (error) {
            console.error('❌ Update profile error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    handleAuthStateChange(user) {
        if (user) {
            console.log('👤 Auth state: logged in');
            this.saveSession({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                loginMethod: user.email ? 'email' : 'pi'
            });
        } else {
            console.log('👤 Auth state: logged out');
        }
        
        // Trigger custom event
        window.dispatchEvent(new CustomEvent('hidayatulaminAuthChange', { 
            detail: { user: user } 
        }));
    }

    getErrorMessage(code) {
        const messages = {
            'auth/user-not-found': 'Email tidak terdaftar',
            'auth/wrong-password': 'Password salah',
            'auth/invalid-email': 'Format email tidak valid',
            'auth/user-disabled': 'Akun dinonaktifkan',
            'auth/too-many-requests': 'Terlalu banyak percobaan, coba lagi nanti',
            'auth/email-already-in-use': 'Email sudah terdaftar',
            'auth/weak-password': 'Password terlalu lemah (minimal 6 karakter)',
            'auth/operation-not-allowed': 'Operasi tidak diizinkan',
            'auth/requires-recent-login': 'Silakan login ulang untuk melanjutkan'
        };
        
        return messages[code] || 'Terjadi kesalahan, silakan coba lagi';
    }

    isLoggedIn() {
        return !!this.currentUser;
    }

    requireAuth(redirectUrl = 'login.html') {
        if (!this.isLoggedIn()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }
}

// ==========================================
// INISIALISASI GLOBAL
// ==========================================

// Inisialisasi setelah Firebase ready
document.addEventListener('DOMContentLoaded', () => {
    // Pastikan Firebase sudah diinisialisasi di halaman
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        window.hidayatulaminAuth = new HidayatulaminAuth();
    } else {
        console.error('❌ Firebase not initialized. Please initialize Firebase first.');
    }
});

// Export untuk module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HidayatulaminAuth;
}