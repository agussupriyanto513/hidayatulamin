// ==========================================
// HIDAYATULAMIN - AUTHENTICATION MODULE v3.2
// Firebase Config + Role-based Auth + Pi Network
// FIX: Login loop resolved — guard tidak berjalan di login.html
// ==========================================

const firebaseConfig = {
  apiKey:            "AIzaSyCVKeCAJ6_IitpZfu-tF2QaT0esFbbNCAM",
  authDomain:        "hidayatulamin-e6f22.firebaseapp.com",
  databaseURL:       "https://hidayatulamin-e6f22-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "hidayatulamin-e6f22",
  storageBucket:     "hidayatulamin-e6f22.firebasestorage.app",
  messagingSenderId: "80743607267",
  appId:             "1:80743607267:web:f5f94165de021759958ed6"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db   = firebase.firestore();

// ── PENTING: Aktifkan persistence agar session tidak hilang setelah redirect ──
// Ini yang menyebabkan login loop — tanpa ini Firebase lupa session setiap halaman baru
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs terbuka — gunakan memory persistence saja
    console.warn('Firestore persistence: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // Browser tidak support (Safari lama, dll)
    console.warn('Firestore persistence: browser tidak support');
  }
});

const ROLE_DASHBOARD = {
  admin:  'dashboard-admin.html',
  ustadz: 'dashboard-ustadz.html',
  santri: 'dashboard-santri.html',
  wali:   'dashboard-wali.html'
};

// Halaman yang boleh diakses tanpa login
const PUBLIC_PAGES = ['login.html', 'transparansi.html', 'donasi.html', 'pi-donasi.html', 'index.html', ''];

class HidayatulaminAuth {
  constructor() {
    this.auth    = firebase.auth();
    this.db      = firebase.firestore();
    this.Pi      = window.Pi || null;
    this.piReady = false;
    this.currentUser     = null;
    this.currentUserData = null;
    this._piAccessToken  = null;

    this._init();
  }

  _currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  _isLoginPage() {
    const page = this._currentPage();
    return page === 'login.html' || page === '' || page === 'index.html';
  }

  async _init() {
    await this._initPiSDK();

    // FIX v3.2: Jika di halaman login, JANGAN pasang guard apapun.
    // Biarkan login.html menangani redirect sendiri.
    if (this._isLoginPage()) {
      console.log('✅ HidayatulaminAuth v3.2 — mode login page, guard dinonaktifkan');
      window.dispatchEvent(new CustomEvent('authReady', {
        detail: { user: null, data: null }
      }));
      return;
    }

    // Halaman non-login: pasang guard normal
    this.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        this.currentUser = firebaseUser;
        try {
          const snap = await this.db.collection('users').doc(firebaseUser.uid).get();
          this.currentUserData = snap.exists ? snap.data() : null;
        } catch(e) {
          console.warn('Gagal ambil data user:', e.message);
        }
        this._populateSidebar();
        this._guardPage();
      } else {
        // Tidak ada Firebase user — cek Pi session
        const piUser = this._getPiUser();
        if (piUser) {
          this.currentUser = { uid: piUser.uid, email: piUser.username + '@pi.hidayatulamin.id' };
          this.currentUserData = piUser;
          this._populateSidebar();
          this._guardPage();
        } else {
          // Tidak ada session sama sekali — redirect ke login
          this.currentUser     = null;
          this.currentUserData = null;
          this._redirectIfPrivate();
        }
      }

      window.dispatchEvent(new CustomEvent('authReady', {
        detail: { user: this.currentUser, data: this.currentUserData }
      }));
    });

    console.log('✅ HidayatulaminAuth v3.2 siap');
  }

  async _initPiSDK() {
    if (!window.Pi) {
      await new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (window.Pi) { clearInterval(interval); this.Pi = window.Pi; resolve(); }
          else if (attempts >= 10) { clearInterval(interval); resolve(); }
        }, 200);
      });
    } else {
      this.Pi = window.Pi;
    }

    if (!this.Pi) { console.warn('⚠️ Pi SDK tidak ditemukan'); return; }

    try {
      this.Pi.init({ version: "2.0", sandbox: true });
      this.piReady = true;
      console.log('✅ Pi SDK siap (sandbox: true)');
    } catch (e) {
      console.error('❌ Pi SDK gagal init:', e);
    }
  }

  _guardPage() {
    if (this._isLoginPage()) return;

    const page      = this._currentPage();
    const role      = this.currentUserData?.role;
    const allowedPage = ROLE_DASHBOARD[role];
    const adminOnly   = ['data-pengguna.html', 'keuangan.html'];
    const staffOnly   = ['absensi.html', 'akademik.html', 'perizinan-santri.html', 'info-santri.html'];

    if (PUBLIC_PAGES.includes(page)) return;

    if (adminOnly.includes(page) && role !== 'admin') {
      alert('⛔ Akses ditolak. Hanya Admin.');
      window.location.href = allowedPage || 'login.html';
      return;
    }

    if (staffOnly.includes(page) && !['admin','ustadz'].includes(role)) {
      alert('⛔ Akses ditolak.');
      window.location.href = allowedPage || 'login.html';
    }
  }

  _redirectIfPrivate() {
    const page = this._currentPage();
    if (this._isLoginPage()) return;
    if (!PUBLIC_PAGES.includes(page)) {
      window.location.href = 'login.html';
    }
  }

  _populateSidebar() {
    const d = this.currentUserData;
    if (!d) return;
    const nama = d.nama || d.username || d.displayName || 'Pengguna';
    const role = d.role || '-';
    document.querySelectorAll('.u-name,.u-nm,.u-inf .u-name').forEach(el => el.textContent = nama);
    document.querySelectorAll('.u-role,.u-rl').forEach(el => el.textContent = role.charAt(0).toUpperCase() + role.slice(1));
    document.querySelectorAll('.u-av').forEach(el => {
      if (!el.querySelector('img')) el.textContent = nama.charAt(0).toUpperCase();
    });
  }

  async loginWithEmail(email, password) {
    try {
      const cred = await this.auth.signInWithEmailAndPassword(email, password);
      await this.db.collection('users').doc(cred.user.uid).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
      return { success: true };
    } catch (e) {
      return { success: false, error: this._errMsg(e.code) };
    }
  }

  async registerWithEmail(email, password, extraData = {}) {
    try {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      const uid  = cred.user.uid;
      await this.db.collection('users').doc(uid).set({
        uid, email,
        nama:        extraData.nama || '',
        role:        extraData.role || 'santri',
        loginMethod: 'email',
        createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin:   firebase.firestore.FieldValue.serverTimestamp(),
        ...extraData
      });
      await cred.user.sendEmailVerification();
      return { success: true };
    } catch (e) {
      return { success: false, error: this._errMsg(e.code) };
    }
  }

  async loginWithPi() {
    if (!this.piReady) await this._initPiSDK();
    if (!this.piReady) return { success: false, error: 'Buka aplikasi ini di Pi Browser' };
    return this._piAuth();
  }

  async _piAuth() {
    try {
      const scopes     = ['username', 'payments', 'wallet_address'];
      const authResult = await this.Pi.authenticate(scopes, this._handleIncompletePiPayment.bind(this));
      const { user, accessToken } = authResult;

      this._piAccessToken = accessToken;

      const userRef  = this.db.collection('users').doc(user.uid);
      const userSnap = await userRef.get();

      const baseData = {
        uid:            user.uid,
        username:       user.username,
        displayName:    user.username,
        wallet_address: user.wallet_address || null,
        loginMethod:    'pi',
        lastLogin:      firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:      firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (userSnap.exists) {
        await userRef.update(baseData);
        this.currentUserData = { ...userSnap.data(), ...baseData };
      } else {
        const newData = {
          ...baseData,
          email:           user.username + '@pi.hidayatulamin.id',
          nama:            user.username,
          role:            'santri',
          isActive:        true,
          createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
          profileComplete: false,
        };
        await userRef.set(newData);
        this.currentUserData = newData;
      }

      localStorage.setItem('piUser', JSON.stringify({
        uid:      user.uid,
        username: user.username,
        role:     this.currentUserData.role,
        ts:       Date.now(),
      }));

      this.currentUser = { uid: user.uid, email: user.username + '@pi.hidayatulamin.id' };
      this._populateSidebar();

      return { success: true, isNewUser: !userSnap.exists, user, data: this.currentUserData };
    } catch (e) {
      console.error('❌ Pi auth error:', e);
      return { success: false, error: e.message || 'Pi auth gagal' };
    }
  }

  async donasiPi(amount, program = 'umum', memo = 'Donasi Pesantren Hidayatulamin') {
    if (!this.piReady)      return { success: false, error: 'Pi SDK tidak tersedia' };
    const piUser = this._getPiUser();
    if (!piUser)            return { success: false, error: 'Harus login dengan Pi Network dulu' };

    return new Promise((resolve) => {
      this.Pi.createPayment(
        { amount, memo, metadata: { uid: piUser.uid, username: piUser.username, program } },
        {
          onReadyForServerApproval: async (paymentId) => {
            try {
              await this.db.collection('pi_donations').add({
                paymentId,
                donorPiUid:    piUser.uid,
                donorUsername: piUser.username,
                amount, program, memo,
                status:    'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              });
              const r = await fetch('/api/payments/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId }),
              });
              if (!r.ok) throw new Error('Approve gagal');
            } catch(e) { console.error('Approve error:', e); }
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            try {
              const r = await fetch('/api/payments/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId, txid }),
              });
              if (!r.ok) throw new Error('Complete gagal');
              resolve({ success: true, txid, paymentId });
            } catch(e) { resolve({ success: false, error: e.message }); }
          },
          onCancel: async (paymentId) => {
            try {
              await fetch('/api/payments/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId }),
              });
            } catch(e) {}
            resolve({ success: false, error: 'Pembayaran dibatalkan' });
          },
          onError: (error) => {
            resolve({ success: false, error: error.message || 'Terjadi kesalahan pembayaran' });
          }
        }
      );
    });
  }

  async _handleIncompletePiPayment(payment) {
    console.warn('⚠️ Incomplete payment:', payment.identifier);
    try {
      const snap = await this.db.collection('pi_donations')
        .where('paymentId', '==', payment.identifier).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status === 'pending') {
        await snap.docs[0].ref.update({
          status:      'cancelled',
          cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
          cancelNote:  'Auto-cancelled: incomplete payment',
        });
      }
      await this.db.collection('pi_incomplete').doc(payment.identifier).set({
        payment,
        resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        resolution: 'auto-cancelled',
      }, { merge: true });
    } catch(e) {
      console.error('Handle incomplete error:', e);
    }
  }

  _getPiUser() {
    if (this.currentUserData?.loginMethod === 'pi') {
      return { uid: this.currentUserData.uid, username: this.currentUserData.username || this.currentUserData.displayName, role: this.currentUserData.role };
    }
    try {
      const raw = localStorage.getItem('piUser');
      if (!raw) return null;
      const data = JSON.parse(raw);
      const age  = Date.now() - (data.ts || 0);
      if (age > 8 * 60 * 60 * 1000) { localStorage.removeItem('piUser'); return null; }
      return data;
    } catch(e) { return null; }
  }

  async getSgtBalance(walletAddress) {
    const snap = await this.db.collection('sgt_wallets').doc(walletAddress).get();
    return snap.exists ? snap.data().balance : 0;
  }

  async logout() {
    try {
      await this.auth.signOut();
      this._piAccessToken  = null;
      this.currentUser     = null;
      this.currentUserData = null;
      localStorage.removeItem('piUser');
      localStorage.removeItem('currentUser');
      sessionStorage.removeItem('currentUser');
      window.location.href = 'login.html';
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  isLoggedIn() { return !!this.currentUser || !!this._getPiUser(); }
  getRole()    { return this.currentUserData?.role || this._getPiUser()?.role || null; }
  isAdmin()    { return this.getRole() === 'admin'; }
  isUstadz()   { return this.getRole() === 'ustadz'; }
  isSantri()   { return this.getRole() === 'santri'; }
  isWali()     { return this.getRole() === 'wali'; }
  isPiBrowser(){ return !!window.Pi; }

  async updateProfile(data) {
    if (!this.currentUser) return { success: false, error: 'Belum login' };
    try {
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      await this.db.collection('users').doc(this.currentUser.uid).update(data);
      this.currentUserData = { ...this.currentUserData, ...data };
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  _errMsg(code) {
    const map = {
      'auth/user-not-found':         'Email tidak terdaftar',
      'auth/wrong-password':         'Password salah',
      'auth/invalid-email':          'Format email tidak valid',
      'auth/user-disabled':          'Akun dinonaktifkan',
      'auth/too-many-requests':      'Terlalu banyak percobaan, coba lagi nanti',
      'auth/email-already-in-use':   'Email sudah terdaftar',
      'auth/weak-password':          'Password minimal 6 karakter',
      'auth/network-request-failed': 'Cek koneksi internet kamu',
      'auth/invalid-credential':     'Email atau password salah',
    };
    return map[code] || 'Terjadi kesalahan, coba lagi';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    console.error('❌ Firebase SDK belum dimuat sebelum auth.js');
    return;
  }
  window.Auth = new HidayatulaminAuth();
});
