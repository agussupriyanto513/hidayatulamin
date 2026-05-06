// ==========================================
// HIDAYATULAMIN - AUTHENTICATION MODULE v3.1
// FIX: sandbox auto-detect, PUBLIC_PAGES includes pi-donasi,
//      no double init, no redirect loop on login.html
// ==========================================

// ██████████████████████████████████████████
// 1. FIREBASE CONFIG
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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db   = firebase.firestore();

// ██████████████████████████████████████████
// 2. KONSTANTA
// ██████████████████████████████████████████
const ROLE_DASHBOARD = {
  admin:  'dashboard-admin.html',
  ustadz: 'dashboard-ustadz.html',
  santri: 'dashboard-santri.html',
  wali:   'dashboard-wali.html'
};

// FIX: pi-donasi.html adalah halaman publik (tidak butuh login)
const PUBLIC_PAGES = [
  'login.html', 'index.html', '',
  'transparansi.html', 'donasi.html', 'pi-donasi.html'
];

// FIX: sandbox true di localhost/vercel, false di domain custom
function isPiSandbox() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h.includes('vercel.app');
}

// ██████████████████████████████████████████
// 3. CLASS UTAMA
// ██████████████████████████████████████████
class HidayatulaminAuth {
  constructor() {
    this.auth            = auth;
    this.db              = db;
    this.Pi              = window.Pi || null;
    this.piReady         = false;
    this.currentUser     = null;
    this.currentUserData = null;
    this._piAccessToken  = null;
    this._authReadyFired = false;

    this._initPiSDK();
    this._watchAuth();
  }

  _initPiSDK() {
    if (!this.Pi) { console.warn('Pi SDK tidak ditemukan'); return; }
    try {
      this.Pi.init({ version: '2.0', sandbox: isPiSandbox() });
      this.piReady = true;
      console.log('Pi SDK ready | sandbox:', isPiSandbox());
    } catch(e) { console.error('Pi SDK init error:', e); }
  }

  _watchAuth() {
    this.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        this.currentUser = firebaseUser;
        try {
          const snap = await this.db.collection('users').doc(firebaseUser.uid).get();
          this.currentUserData = snap.exists ? snap.data() : null;
        } catch(e) { this.currentUserData = null; }
        this._populateSidebar();
      } else {
        this.currentUser = null;
        this.currentUserData = null;
        this._redirectIfPrivate();
      }

      if (!this._authReadyFired) {
        this._authReadyFired = true;
        window.dispatchEvent(new CustomEvent('authReady', {
          detail: { user: this.currentUser, data: this.currentUserData }
        }));
      }
    });
  }

  _redirectIfPrivate() {
    const page = window.location.pathname.split('/').pop() || '';
    // Dashboard pages handle their own auth guard — jangan redirect dari sini
    // supaya tidak konflik dengan onAuthStateChanged di masing-masing dashboard
    const DASHBOARD_PAGES = [
      'dashboard-admin.html', 'dashboard-ustadz.html',
      'dashboard-santri.html', 'dashboard-wali.html'
    ];
    if (DASHBOARD_PAGES.includes(page)) return;
    if (!PUBLIC_PAGES.includes(page) && page !== 'login.html') {
      window.location.href = 'login.html';
    }
  }

  _populateSidebar() {
    const d = this.currentUserData;
    if (!d) return;
    const nama = d.nama || d.username || 'Pengguna';
    const role = d.role || '-';
    document.querySelectorAll('.u-name,.u-nm').forEach(el => el.textContent = nama);
    document.querySelectorAll('.u-role,.u-rl').forEach(el => {
      el.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    });
    document.querySelectorAll('.u-av').forEach(el => {
      if (!el.querySelector('img')) el.textContent = nama.charAt(0).toUpperCase();
    });
  }

  async loginWithEmail(email, password) {
    try {
      const cred = await this.auth.signInWithEmailAndPassword(email, password);
      await this.db.collection('users').doc(cred.user.uid)
        .update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
      return { success: true };
    } catch(e) { return { success: false, error: this._errMsg(e.code) }; }
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
      await cred.user.sendEmailVerification().catch(()=>{});
      return { success: true };
    } catch(e) { return { success: false, error: this._errMsg(e.code) }; }
  }

  async loginWithPi() {
    if (!this.piReady) this._initPiSDK();
    if (!this.piReady) return { success: false, error: 'Pi SDK tidak tersedia. Buka di Pi Browser.' };
    try {
      const result = await this.Pi.authenticate(['username','payments'],
        this._handleIncompletePiPayment.bind(this));
      this._piAccessToken = result.accessToken;
      const { user } = result;
      const ref  = this.db.collection('users').doc(user.uid);
      const snap = await ref.get();
      const base = {
        uid: user.uid, username: user.username,
        loginMethod: 'pi',
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (snap.exists) {
        await ref.update(base);
      } else {
        await ref.set({
          ...base,
          email: user.username + '@pi.hidayatulamin.id',
          nama: user.username, role: 'santri',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          profileComplete: false
        });
      }
      return { success: true, isNewUser: !snap.exists, user };
    } catch(e) {
      return { success: false, error: e.message || 'Pi auth gagal' };
    }
  }

  async donasiPi(amount, memo = 'Donasi Yayasan Hidayatulamin', metadata = {}) {
    if (!this.piReady) return { success: false, error: 'Pi SDK tidak tersedia' };
    return new Promise((resolve) => {
      this.Pi.createPayment({ amount, memo, metadata }, {
        onReadyForServerApproval: async (paymentId) => {
          await this.db.collection('pi_donations').doc(paymentId).set({
            paymentId, amount, memo, status: 'pending',
            donorPiUid:    metadata.donorPiUid || 'anonymous',
            donorUsername: metadata.donorUsername || metadata.username || 'anonymous',
            program:       metadata.program || 'umum',
            progLabel:     metadata.progLabel || 'Donasi Umum',
            note:          metadata.note || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }).catch(e => console.error('save pending:', e));
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          try {
            await this.db.collection('pi_donations').doc(paymentId).update({
              status: 'completed', txid,
              completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await this.db.collection('pi_stats').doc('global').set({
              totalPi:     firebase.firestore.FieldValue.increment(amount),
              totalDonors: firebase.firestore.FieldValue.increment(1),
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch(()=>{});
            resolve({ success: true, txid, paymentId });
          } catch(e) { resolve({ success: false, error: e.message }); }
        },
        onCancel: (paymentId) => {
          this.db.collection('pi_donations').doc(paymentId)
            .update({ status: 'cancelled' }).catch(()=>{});
          resolve({ success: false, error: 'Donasi dibatalkan' });
        },
        onError: (error) => resolve({ success: false, error: error.message || 'Error' })
      });
    });
  }

  async _handleIncompletePiPayment(payment) {
    if (!payment?.identifier) return;
    await this.db.collection('pi_incomplete').doc(payment.identifier).set({
      payment, timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  }

  async logout() {
    await this.auth.signOut().catch(()=>{});
    this._piAccessToken = null;
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }

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
    } catch(e) { return { success: false, error: e.message }; }
  }

  _errMsg(code) {
    const map = {
      'auth/user-not-found':           'Email tidak terdaftar',
      'auth/wrong-password':           'Password salah',
      'auth/invalid-email':            'Format email tidak valid',
      'auth/user-disabled':            'Akun dinonaktifkan',
      'auth/too-many-requests':        'Terlalu banyak percobaan, coba lagi nanti',
      'auth/email-already-in-use':     'Email sudah terdaftar',
      'auth/weak-password':            'Password minimal 6 karakter',
      'auth/network-request-failed':   'Cek koneksi internet kamu',
      'auth/invalid-credential':       'Email atau password salah',
      'auth/invalid-login-credentials':'Email atau password salah'
    };
    return map[code] || `Terjadi kesalahan (${code})`;
  }
}

// ██████████████████████████████████████████
// 4. INISIALISASI GLOBAL (satu kali)
// ██████████████████████████████████████████
if (typeof window.Auth === 'undefined') {
  window.Auth = new HidayatulaminAuth();
}
