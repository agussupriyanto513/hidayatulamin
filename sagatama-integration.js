/**
 * Sagatama Integration Library
 * Shared SSO & Data Sync antara Yayasan Hidayatullah Amin dan Sagatama Mart
 * @version 2.0.0
 * @author Portal Integration Team
 */

(function(global) {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    
    const CONFIG = {
        sagatamaUrl: 'https://sagatama-mart.vercel.app',
        localStorageKeys: {
            hidayatullahUser: 'hidayatullah_user',
            sagatamaUser: 'sagatama_user',
            ssoSource: 'sagatama_sso_source',
            cart: 'sagatama_cart',
            orders: 'sagatama_orders',
            activity: 'hidayatullah_activity'
        },
        ssoExpiry: 24 * 60 * 60 * 1000, // 24 jam
        syncInterval: 5 * 60 * 1000 // 5 menit
    };

    // ============================================
    // SSO MANAGER
    // ============================================
    
    const SSOManager = {
        /**
         * Inisialisasi SSO dari sistem Hidayatullah
         * @returns {boolean} Success status
         */
        initFromHidayatullah() {
            try {
                const userData = this.getHidayatullahUser();
                if (!userData) return false;

                // Cek expiry
                if (this.isTokenExpired(userData)) {
                    console.warn('[SSO] Token expired');
                    this.clearAllAuth();
                    return false;
                }

                // Sync ke Sagatama
                const sagatamaData = this.transformToSagatamaFormat(userData);
                this.setSagatamaUser(sagatamaData);
                
                console.log('[SSO] Synced from Hidayatullah:', sagatamaData.username);
                return true;
            } catch (error) {
                console.error('[SSO] Init error:', error);
                return false;
            }
        },

        /**
         * Inisialisasi SSO dari Sagatama Mart
         * @returns {boolean} Success status
         */
        initFromSagatama() {
            try {
                const sagatamaData = this.getSagatamaUser();
                if (!sagatamaData) return false;

                // Cek apakah dari SSO Hidayatullah
                if (sagatamaData.authType !== 'hidayatullah_sso') {
                    return false;
                }

                // Cek expiry
                if (this.isTokenExpired(sagatamaData)) {
                    console.warn('[SSO] Sagatama token expired');
                    return false;
                }

                // Transform ke format Hidayatullah
                const hidayatullahData = this.transformToHidayatullahFormat(sagatamaData);
                this.setHidayatullahUser(hidayatullahData);
                
                console.log('[SSO] Synced from Sagatama:', hidayatullahData.username);
                return true;
            } catch (error) {
                console.error('[SSO] Sagatama init error:', error);
                return false;
            }
        },

        /**
         * Cek apakah token sudah expired
         */
        isTokenExpired(userData) {
            if (!userData.ssoTimestamp) return true;
            return (Date.now() - userData.ssoTimestamp) > CONFIG.ssoExpiry;
        },

        /**
         * Transform user data ke format Sagatama
         */
        transformToSagatamaFormat(hidayatullahUser) {
            const roleMap = {
                'admin': 'admin',
                'wali': 'buyer',
                'santri': 'buyer',
                'ustadz': 'buyer'
            };

            return {
                uid: hidayatullahUser.uid || this.generateUID(),
                username: hidayatullahUser.username || hidayatullahUser.fullName,
                fullName: hidayatullahUser.fullName || hidayatullahUser.username,
                role: roleMap[hidayatullahUser.role] || 'buyer',
                authType: 'hidayatullah_sso',
                sekolahRole: hidayatullahUser.role,
                email: hidayatullahUser.email,
                phone: hidayatullahUser.phone,
                ssoTimestamp: Date.now(),
                source: 'hidayatullah_portal'
            };
        },

        /**
         * Transform user data ke format Hidayatullah
         */
        transformToHidayatullahFormat(sagatamaUser) {
            const roleMap = {
                'admin': 'admin',
                'buyer': 'wali',
                'seller': 'ustadz'
            };

            return {
                uid: sagatamaUser.uid,
                username: sagatamaUser.username,
                fullName: sagatamaUser.fullName || sagatamaUser.username,
                role: sagatamaUser.sekolahRole || roleMap[sagatamaUser.role] || 'wali',
                authType: 'hidayatullah_sso',
                email: sagatamaUser.email,
                phone: sagatamaUser.phone,
                ssoTimestamp: Date.now()
            };
        },

        /**
         * Generate unique ID
         */
        generateUID() {
            return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        // ============================================
        // LOCAL STORAGE HELPERS
        // ============================================
        
        getHidayatullahUser() {
            const data = localStorage.getItem(CONFIG.localStorageKeys.hidayatullahUser);
            return data ? JSON.parse(data) : null;
        },

        setHidayatullahUser(userData) {
            localStorage.setItem(CONFIG.localStorageKeys.hidayatullahUser, JSON.stringify(userData));
        },

        getSagatamaUser() {
            const data = localStorage.getItem(CONFIG.localStorageKeys.sagatamaUser);
            return data ? JSON.parse(data) : null;
        },

        setSagatamaUser(userData) {
            localStorage.setItem(CONFIG.localStorageKeys.sagatamaUser, JSON.stringify(userData));
            localStorage.setItem(CONFIG.localStorageKeys.ssoSource, 'hidayatullah');
        },

        clearAllAuth() {
            Object.values(CONFIG.localStorageKeys).forEach(key => {
                if (key !== 'activity') localStorage.removeItem(key);
            });
        },

        // ============================================
        // SESSION MANAGEMENT
        // ============================================
        
        startSessionMonitor(callback) {
            setInterval(() => {
                const isValid = this.validateSession();
                if (!isValid && callback) {
                    callback('SESSION_EXPIRED');
                }
            }, CONFIG.syncInterval);
        },

        validateSession() {
            const hidayatullahUser = this.getHidayatullahUser();
            const sagatamaUser = this.getSagatamaUser();

            // Cek expiry
            if (hidayatullahUser && this.isTokenExpired(hidayatullahUser)) {
                this.clearAllAuth();
                return false;
            }

            // Sync jika perlu
            if (hidayatullahUser && !sagatamaUser) {
                this.initFromHidayatullah();
            } else if (sagatamaUser && !hidayatullahUser) {
                this.initFromSagatama();
            }

            return true;
        }
    };

    // ============================================
    // DATA SYNC MANAGER
    // ============================================
    
    const DataSync = {
        /**
         * Get cart data dari Sagatama
         */
        getCart() {
            const data = localStorage.getItem(CONFIG.localStorageKeys.cart);
            return data ? JSON.parse(data) : [];
        },

        /**
         * Get orders data dari Sagatama
         */
        getOrders() {
            const data = localStorage.getItem(CONFIG.localStorageKeys.orders);
            return data ? JSON.parse(data) : [];
        },

        /**
         * Get activity log dari Hidayatullah
         */
        getActivity() {
            const data = localStorage.getItem(CONFIG.localStorageKeys.activity);
            return data ? JSON.parse(data) : [];
        },

        /**
         * Log activity baru
         */
        logActivity(activity) {
            const activities = this.getActivity();
            activities.unshift({
                ...activity,
                id: 'act_' + Date.now(),
                timestamp: Date.now()
            });

            // Keep only last 50
            if (activities.length > 50) activities.pop();

            localStorage.setItem(CONFIG.localStorageKeys.activity, JSON.stringify(activities));
            return activities;
        },

        /**
         * Get stats untuk dashboard
         */
        getStats() {
            const cart = this.getCart();
            const orders = this.getOrders();

            return {
                cartItems: cart.reduce((sum, item) => sum + (item.qty || 0), 0),
                cartValue: cart.reduce((sum, item) => sum + ((item.pricePi || 0) * (item.qty || 0)), 0),
                orderCount: orders.length,
                pendingOrders: orders.filter(o => o.status === 'pending' || o.status === 'paid').length,
                completedOrders: orders.filter(o => o.status === 'completed').length
            };
        }
    };

    // ============================================
    // URL BUILDER
    // ============================================
    
    const URLBuilder = {
        /**
         * Build Sagatama URL dengan SSO params
         */
        getSagatamaURL(userData) {
            if (!userData) {
                const sso = SSOManager.getSagatamaUser();
                if (!sso) return CONFIG.sagatamaUrl;
                userData = sso;
            }

            const params = new URLSearchParams({
                sso: 'true',
                source: 'hidayatullah',
                role: userData.sekolahRole || userData.role,
                t: Date.now()
            });

            return `${CONFIG.sagatamaUrl}?${params.toString()}`;
        },

        /**
         * Build URL untuk embed (iframe)
         */
        getEmbedURL() {
            return this.getSagatamaURL() + '&embed=true';
        }
    };

    // ============================================
    // ACTIVITY LOGGER
    // ============================================
    
    const ActivityLogger = {
        log(type, data = {}) {
            const user = SSOManager.getHidayatullahUser();
            
            const activity = {
                type,
                title: this.getTitle(type),
                description: this.getDescription(type, data),
                icon: this.getIcon(type),
                userId: user?.uid,
                username: user?.username,
                ...data,
                timestamp: Date.now()
            };

            return DataSync.logActivity(activity);
        },

        getTitle(type) {
            const titles = {
                'sagatama_access': 'Akses Sagatama Mart',
                'sekolah_access': 'Akses Sistem Sekolah',
                'admin_access': 'Akses Admin Panel',
                'login': 'Login',
                'logout': 'Logout',
                'profile_update': 'Update Profil',
                'order_created': 'Pesanan Baru',
                'cart_update': 'Update Keranjang'
            };
            return titles[type] || 'Aktivitas';
        },

        getDescription(type, data) {
            const descriptions = {
                'sagatama_access': 'Membuka marketplace via portal',
                'sekolah_access': 'Kembali ke dashboard sekolah',
                'admin_access': 'Mengelola sistem admin',
                'login': 'Berhasil masuk ke sistem',
                'logout': 'Keluar dari sistem'
            };
            return descriptions[type] || data.description || 'Aktivitas sistem';
        },

        getIcon(type) {
            const icons = {
                'sagatama_access': 'fa-store',
                'sekolah_access': 'fa-graduation-cap',
                'admin_access': 'fa-cog',
                'login': 'fa-sign-in-alt',
                'logout': 'fa-sign-out-alt',
                'profile_update': 'fa-user-edit',
                'order_created': 'fa-shopping-bag',
                'cart_update': 'fa-cart-plus'
            };
            return icons[type] || 'fa-circle';
        }
    };

    // ============================================
    // MAIN API
    // ============================================
    
    const SagatamaIntegration = {
        // Config
        config: CONFIG,
        
        // Modules
        sso: SSOManager,
        data: DataSync,
        url: URLBuilder,
        activity: ActivityLogger,

        /**
         * Initialize library
         */
        init(options = {}) {
            if (options.debug) {
                console.log('[SagatamaIntegration] Initialized', CONFIG);
            }
            
            // Auto-sync
            this.sync();
            
            // Start session monitor
            this.sso.startSessionMonitor((event) => {
                if (event === 'SESSION_EXPIRED') {
                    window.dispatchEvent(new CustomEvent('sso:expired'));
                }
            });
            
            return this;
        },

        /**
         * Force sync antara sistem
         */
        sync() {
            const hidayatullah = this.sso.getHidayatullahUser();
            const sagatama = this.sso.getSagatamaUser();

            if (hidayatullah && !sagatama) {
                return this.sso.initFromHidayatullah();
            } else if (sagatama && !hidayatullah) {
                return this.sso.initFromSagatama();
            }

            return true;
        },

        /**
         * Check apakah user terautentikasi
         */
        isAuthenticated() {
            return this.sso.validateSession();
        },

        /**
         * Get current user (unified format)
         */
        getCurrentUser() {
            const user = this.sso.getHidayatullahUser() || this.sso.getSagatamaUser();
            if (!user) return null;

            return {
                ...user,
                isAdmin: user.role === 'admin' || user.sekolahRole === 'admin',
                isBuyer: user.role === 'buyer' || ['wali', 'santri', 'ustadz'].includes(user.sekolahRole)
            };
        },

        /**
         * Logout dari semua sistem
         */
        logout() {
            this.sso.clearAllAuth();
            this.activity.log('logout');
            window.dispatchEvent(new CustomEvent('sso:logout'));
        },

        /**
         * Navigate ke Sagatama Mart
         */
        goToSagatamaMart(target = '_blank') {
            const url = this.url.getSagatamaURL();
            this.activity.log('sagatama_access');
            
            if (target === '_self') {
                window.location.href = url;
            } else {
                window.open(url, target);
            }
        },

        /**
         * Navigate ke Sistem Sekolah
         */
        goToSekolah() {
            this.activity.log('sekolah_access');
            window.location.href = 'index.html';
        },

        /**
         * Navigate ke Admin Panel
         */
        goToAdmin() {
            this.activity.log('admin_access');
            window.location.href = 'dashboard-admin.html';
        }
    };

    // Expose ke global
    global.SagatamaIntegration = SagatamaIntegration;

    // Auto-init jika DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            SagatamaIntegration.init({ debug: false });
        });
    } else {
        SagatamaIntegration.init({ debug: false });
    }

})(window);