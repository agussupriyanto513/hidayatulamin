// ==========================================
// HIDAYATULAMIN - AUTHENTICATION MODULE v3.0
// Firebase Config + Role-based Auth + Pi Network
// ==========================================

// ██████████████████████████████████████████
// 1. FIREBASE CONFIG — HIDAYATULAMIN PROJECT
// ██████████████████████████████████████████
const firebaseConfig = {
  apiKey:            "AIzaSyCVKeCAJ6_IitpZfu-tF2QaT0esFbbNCAM",
  authDomain:        "hidayatulamin-e6f22.firebaseapp.com",
  databaseURL:       "https://hidayatulamin-e6f22-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "hidayatulamin-e6f22",
  storageBucket:     "hidayatulamin-e6f22.firebasestorage.app",
  messagingSenderId: "80743607267",
  appId:             "1:80743607267:web:f5f94165de021759958ed6"
};

// Inisialisasi Firebase (hanya sekali)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// ── Variabel global agar bisa dipakai langsung di semua halaman ──
const auth = firebase.auth();
const db   = firebase.firestore();

// ██████████████████████████████████████████
// 2. ROLE → HALAMAN (sesuaikan jika perlu)
// ██████████████████████████████████████████
const ROLE_DASHBOARD = {
  admin:  'dashboard-admin.html',
  ustadz: 'dashboard-ustadz.html',
  santri: 'dashboard-santri.html',
  wali:   'dashboard-wali.html'
};

// Halaman yang boleh diakses tanpa login
const PUBLIC_PAGES = ['login.html', 'transparansi.html', 'donasi.html'];

// ██████████████████████████████████████████
// 3. CLASS UTAMA
// ██████████████████████████████████████████
class HidayatulaminAuth {
  constructor() {
    this.auth    = firebase.auth();
    this.db      = firebase.firestore();
    this.Pi      = window.Pi || null;
    this.piReady = false;
    this.currentUser     = null;
    this.currentUserData = null;  // data Firestore (termasuk role)

    this._init();
  }

  // ─────────────────────────────────────────
  // INISIALISASI
  // ─────────────────────────────────────────
  async _init() {
    await this._initPiSDK();

    this.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        this.currentUser = firebaseUser;
        // Ambil data Firestore termasuk role
        const snap = await this.db.collection('users').doc(firebaseUser.uid).get();
        this.currentUserData = snap.exists ? snap.data() : null;
        this._populateSidebar();
        this._guardPage();
      } else {
        this.currentUser     = null;
        this.currentUserData = null;
        this._redirectIfPrivate();
      }

      // Event global agar halaman bisa subscribe
      window.dispatchEvent(new CustomEvent('authReady', {
        detail: { user: this.currentUser, data: this.currentUserData }
      }));
    });

    console.log('✅ HidayatulaminAuth v3.0 siap');
  }

  async _initPiSDK() {
    if (!this.Pi) { console.warn('⚠️ Pi SDK tidak ditemukan'); return; }
    try {
      const sandbox = window.location.hostname === 'localhost' ||
                      window.location.hostname.includes('vercel.app');
      this.Pi.init({ version: "2.0", sandbox });
      this.piReady = true;
      console.log('✅ Pi SDK siap (sandbox:', sandbox, ')');
    } catch (e) {
      console.error('❌ Pi SDK gagal:', e);
    }
  }

  // ─────────────────────────────────────────
  // ROLE-BASED GUARD
  // ─────────────────────────────────────────

  /** Cek apakah halaman ini boleh diakses role yg login */
  _guardPage() {
    const page = this._currentPage();
    if (PUBLIC_PAGES.includes(page)) return;          // halaman publik, bebas
    if (page === 'login.html') {
      // sudah login → redirect ke dashboard sesuai role
      const dest = ROLE_DASHBOARD[this.currentUserData?.role] || 'dashboard-santri.html';
      window.location.href = dest;
      return;
    }

    // Cek halaman dashboard sesuai role
    const allowedPage = ROLE_DASHBOARD[this.currentUserData?.role];
    // Halaman khusus admin
    const adminOnly = ['data-pengguna.html', 'keuangan.html'];
    // Halaman admin + ustadz
    const staffOnly = ['absensi.html', 'akademik.html', 'perizinan-santri.html', 'info-santri.html'];

    if (adminOnly.includes(page) && this.currentUserData?.role !== 'admin') {
      alert('⛔ Akses ditolak. Hanya Admin.');
      window.location.href = allowedPage || 'login.html';
      return;
    }

    if (staffOnly.includes(page) &&
        !['admin','ustadz'].includes(this.currentUserData?.role)) {
      alert('⛔ Akses ditolak.');
      window.location.href = allowedPage || 'login.html';
    }
  }

  /** Redirect ke login jika halaman ini butuh auth */
  _redirectIfPrivate() {
    const page = this._currentPage();
    if (!PUBLIC_PAGES.includes(page) && page !== 'login.html') {
      window.location.href = 'login.html';
    }
  }

  _currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  // ─────────────────────────────────────────
  // ISI SIDEBAR OTOMATIS
  // ─────────────────────────────────────────
  _populateSidebar() {
    const d = this.currentUserData;
    if (!d) return;
    const nama = d.nama || d.username || d.displayName || 'Pengguna';
    const role = d.role || '-';

    // nama user
    document.querySelectorAll('.u-name,.u-nm,.u-inf .u-name').forEach(el => el.textContent = nama);
    // role
    document.querySelectorAll('.u-role,.u-rl').forEach(el => el.textContent = role.charAt(0).toUpperCase() + role.slice(1));
    // avatar inisial
    document.querySelectorAll('.u-av').forEach(el => {
      if (!el.querySelector('img')) el.textContent = nama.charAt(0).toUpperCase();
    });
  }

  // ─────────────────────────────────────────
  // LOGIN EMAIL
  // ─────────────────────────────────────────
  async loginWithEmail(email, password) {
    try {
      const cred = await this.auth.signInWithEmailAndPassword(email, password);
      await this.db.collection('users').doc(cred.user.uid).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: this._errMsg(e.code) };
    }
  }

  // ─────────────────────────────────────────
  // REGISTER EMAIL
  // ─────────────────────────────────────────
  async registerWithEmail(email, password, extraData = {}) {
    try {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      const uid  = cred.user.uid;

      await this.db.collection('users').doc(uid).set({
        uid,
        email,
        nama:        extraData.nama || '',
        role:        extraData.role || 'santri',   // default: santri
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

  // ─────────────────────────────────────────
  // LOGIN / REGISTER PI NETWORK
  // ─────────────────────────────────────────
  async loginWithPi() {
    return this._piAuth('login');
  }

  async registerWithPi() {
    return this._piAuth('register');
  }

  async _piAuth(action) {
    if (!this.piReady) await this._initPiSDK();
    if (!this.piReady) return { success: false, error: 'Pi SDK tidak tersedia' };

    try {
      const scopes    = ['username', 'payments', 'wallet_address'];
      const authResult = await this.Pi.authenticate(scopes, this._handleIncompletePiPayment.bind(this));
      const { user, accessToken } = authResult;

      const userRef  = this.db.collection('users').doc(user.uid);
      const userSnap = await userRef.get();

      const baseData = {
        uid:            user.uid,
        username:       user.username,
        wallet_address: user.wallet_address || null,
        loginMethod:    'pi',
        lastLogin:      firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:      firebase.firestore.FieldValue.serverTimestamp()
        // JANGAN simpan accessToken di Firestore — simpan di memori saja
      };

      // Simpan token di memori (bukan localStorage)
      this._piAccessToken = accessToken;

      if (userSnap.exists) {
        await userRef.update(baseData);
      } else {
        await userRef.set({
          ...baseData,
          email:      user.username + '@pi.network',
          nama:       user.username,
          role:       'santri',     // default baru daftar
          createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
          profileComplete: false
        });
      }

      return { success: true, isNewUser: !userSnap.exists };
    } catch (e) {
      console.error('❌ Pi auth error:', e);
      return { success: false, error: e.message || 'Pi auth gagal' };
    }
  }

  // ─────────────────────────────────────────
  // DONASI PI NETWORK
  // ─────────────────────────────────────────
  async donasiPi(amount, memo = 'Donasi Pesantren Hidayatulamin') {
    if (!this.piReady) return { success: false, error: 'Pi SDK tidak tersedia' };
    if (!this.currentUser)  return { success: false, error: 'Harus login dulu' };

    return new Promise((resolve) => {
      this.Pi.createPayment(
        { amount, memo, metadata: { uid: this.currentUser.uid } },
        {
          onReadyForServerApproval: async (paymentId) => {
            try {
              await this.db.collection('donasi').add({
                paymentId,
                uid:    this.currentUser.uid,
                nama:   this.currentUserData?.nama || '-',
                jumlah: amount,
                metode: 'pi',
                status: 'pending',
                waktu:  firebase.firestore.FieldValue.serverTimestamp()
              });
              console.log('💰 Donasi Pi pending:', paymentId);
            } catch(e) { console.error(e); }
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            try {
              const snap = await this.db.collection('donasi')
                .where('paymentId','==', paymentId).limit(1).get();
              if (!snap.empty) {
                await snap.docs[0].ref.update({ status: 'selesai', txid });
              }
              resolve({ success: true, txid });
            } catch(e) { resolve({ success: false, error: e.message }); }
          },
          onCancel:  (paymentId) => resolve({ success: false, error: 'Dibatalkan' }),
          onError:   (error, payment) => resolve({ success: false, error: error.message })
        }
      );
    });
  }

  async _handleIncompletePiPayment(payment) {
    console.warn('⚠️ Ada payment Pi yang belum selesai:', payment.identifier);
    // Tandai di Firestore agar bisa diinvestigasi admin
    try {
      await this.db.collection('pi_incomplete').doc(payment.identifier).set({
        payment,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e) { console.error(e); }
  }

  // ─────────────────────────────────────────
  // SGT TOKEN (placeholder — sesuaikan kontrak)
  // ─────────────────────────────────────────
  async getSgtBalance(walletAddress) {
    // TODO: Hubungkan ke smart contract SGT token
    // Contoh: panggil endpoint atau baca dari Firestore
    const snap = await this.db.collection('sgt_wallets').doc(walletAddress).get();
    return snap.exists ? snap.data().balance : 0;
  }

  // ─────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────
  async logout() {
    try {
      await this.auth.signOut();
      this._piAccessToken = null;
      window.location.href = 'login.html';
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ─────────────────────────────────────────
  // HELPER
  // ─────────────────────────────────────────
  isLoggedIn() { return !!this.currentUser; }
  getRole()    { return this.currentUserData?.role || null; }
  isAdmin()    { return this.getRole() === 'admin'; }
  isUstadz()   { return this.getRole() === 'ustadz'; }
  isSantri()   { return this.getRole() === 'santri'; }
  isWali()     { return this.getRole() === 'wali'; }

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
      'auth/user-not-found':       'Email tidak terdaftar',
      'auth/wrong-password':       'Password salah',
      'auth/invalid-email':        'Format email tidak valid',
      'auth/user-disabled':        'Akun dinonaktifkan',
      'auth/too-many-requests':    'Terlalu banyak percobaan, coba lagi nanti',
      'auth/email-already-in-use': 'Email sudah terdaftar',
      'auth/weak-password':        'Password minimal 6 karakter',
      'auth/network-request-failed': 'Cek koneksi internet kamu'
    };
    return map[code] || 'Terjadi kesalahan, coba lagi';
  }
}

// ██████████████████████████████████████████
// 4. INISIALISASI GLOBAL
// ██████████████████████████████████████████
document.addEventListener('DOMContentLoaded', () => {
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    console.error('❌ Firebase SDK belum dimuat sebelum auth.js');
    return;
  }
  window.Auth = new HidayatulaminAuth();
});

// ──────────────────────────────────────────
// CARA PAKAI DI HALAMAN LAIN:
//
// // Tunggu auth siap
// window.addEventListener('authReady', ({ detail }) => {
//   console.log(detail.user);   // Firebase user
//   console.log(detail.data);   // data Firestore (nama, role, dll)
// });
//
// // Login email
// Auth.loginWithEmail(email, pass).then(res => { ... });
//
// // Logout
// Auth.logout();
//
// // Cek role
// Auth.isAdmin()   → true/false
// Auth.isSantri()  → true/false
//
// // Donasi Pi
// Auth.donasiPi(3.14, 'Donasi Ramadhan');
// ──────────────────────────────────────────
