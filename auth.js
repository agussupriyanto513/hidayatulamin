// ==========================================
// HIDAYATULAMIN - AUTHENTICATION MODULE v4.1
// Firebase Config + Role-based Auth + Pi Network
// v4.1: Fix Pi login di dashboard — anonymous sign-in agar
//       auth.currentUser tidak null & Firestore rules terpenuhi
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

// ── WAJIB: Aktifkan persistence agar session tidak hilang saat pindah halaman ──
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence: multiple tabs — pakai memory');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence: browser tidak support');
  }
});

// ── Helper: bungkus promise dengan batas waktu, supaya tidak pernah menggantung selamanya ──
function _withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TIMEOUT:${label || 'operasi'}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

const ROLE_DASHBOARD = {
  admin:  'dashboard-admin.html',
  ustadz: 'dashboard-ustadz.html',
  santri: 'dashboard-santri.html',
  wali:   'dashboard-wali.html'
};

const PUBLIC_PAGES = ['login.html', 'transparansi.html', 'donasi.html', 'pi-donasi.html', 'index.html', ''];

// ══════════════════════════════════════════════════════
// FUNGSI UTAMA YANG DIPAKAI SEMUA DASHBOARD
// Ganti onAuthStateChanged di masing-masing dashboard dengan:
//   HA.requireAuth('role', callback)
// ══════════════════════════════════════════════════════
window.HA = {

  // ── Fungsi utama guard: pastikan user login & punya role yang benar ──
  requireAuth(allowedRoles, onSuccess) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    let resolved = false;

    // ── Pengaman utama: apapun yang terjadi, jangan pernah menggantung selamanya.
    //    Kalau dalam 12 detik belum ada keputusan (berhasil / redirect), paksa
    //    kembali ke login supaya user tidak stuck di "Memuat..." tanpa akhir. ──
    const masterTimeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try { unsub(); } catch(e) {}
      console.warn('⏱️ HA.requireAuth timeout — proses auth terlalu lama, kembali ke login');
      window.location.href = 'login.html';
    }, 12000);

    // Helper: tandai selesai & matikan master timeout, dipanggil di SETIAP jalur keluar
    const finish = () => {
      resolved = true;
      clearTimeout(masterTimeout);
      try { unsub(); } catch(e) {}
    };

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (resolved) return;

      if (user) {
        // ── Ada Firebase user (email login ATAU anonymous dari Pi flow) ──
        try {
          // Untuk anonymous user hasil Pi flow, uid aslinya adalah piUid
          // yang sudah kita simpan di _getPiSession().uid
          const piSess   = _getPiSession();
          const lookupUid = (user.isAnonymous && piSess?.uid) ? piSess.uid : user.uid;

          const snap = await _withTimeout(
            db.collection('users').doc(lookupUid).get(), 8000, 'baca data user'
          );
          const data = snap.exists ? snap.data() : null;
          const role = data?.role;

          if (data && roles.includes(role)) {
            finish();
            _saveSession(lookupUid, role, data);
            // Kembalikan uid asli Pi (bukan anonymous UID) ke callback
            if (typeof onSuccess === 'function') onSuccess({ uid: lookupUid, isAnonymous: user.isAnonymous }, data);
          } else {
            // Role tidak cocok → arahkan ke dashboard yang sesuai
            finish();
            window.location.href = ROLE_DASHBOARD[role] || 'login.html';
          }
        } catch (e) {
          console.warn('HA.requireAuth Firestore error:', e.code || e.message);
          const sess = _getSession();
          if (sess && roles.includes(sess.role)) {
            finish();
            if (typeof onSuccess === 'function') onSuccess({ uid: sess.uid }, sess);
          } else {
            finish();
            window.location.href = 'login.html';
          }
        }
        return;
      }

      // ── user null — tunggu dulu, mungkin Firebase Auth masih restore ──
      await new Promise(r => setTimeout(r, 2500));
      if (resolved) return;
      if (auth.currentUser) return; // sudah restore, biarkan callback fire lagi

      // ── Tidak ada Firebase session — cek Pi session ──
      const piSess = _getPiSession();
      if (piSess && roles.includes(piSess.role)) {
        // Ada Pi session valid → sign in anonymous agar auth.currentUser tidak null
        // Ini penting karena Firestore rules butuh request.auth != null
        try {
          console.log('🔑 Pi session ditemukan, sign in anonymous untuk Firestore access...');
          await _withTimeout(auth.signInAnonymously(), 6000, 'sign-in anonymous');
          // onAuthStateChanged akan fire lagi dengan user anonymous
          // dan akan dihandle di blok `if (user)` di atas
          return;
        } catch (e) {
          console.warn('⚠️ Anonymous sign-in gagal/timeout:', e.code || e.message);
          // Fallback: coba panggil callback langsung dengan data dari Firestore
          // (bisa karena rules sudah allow read loginMethod==pi tanpa auth)
          try {
            const snap = await _withTimeout(
              db.collection('users').doc(piSess.uid).get(), 6000, 'fallback baca user'
            );
            const data = snap.exists ? snap.data() : piSess;
            const role = data?.role || piSess.role;
            if (roles.includes(role)) {
              finish();
              if (typeof onSuccess === 'function') onSuccess({ uid: piSess.uid }, data);
              return;
            }
          } catch(e2) {
            console.warn('⚠️ Fallback Firestore read gagal/timeout:', e2.code || e2.message);
          }
          // Jika semua gagal, redirect login
          finish();
          window.location.href = 'login.html';
        }
        return;
      }

      // Benar-benar tidak ada session
      finish();
      window.location.href = 'login.html';
    });
  },

  // ── Logout ──
  async logout() {
    try {
      // Hapus anonymous user dari Firebase Auth (bukan akun permanen)
      const user = auth.currentUser;
      if (user?.isAnonymous) {
        await user.delete().catch(() => {});
      }
      await auth.signOut();
      _clearSession();
      window.location.href = 'login.html';
    } catch(e) {
      _clearSession();
      window.location.href = 'login.html';
    }
  },

  // ── Helpers ──
  isLoggedIn()  { return !!auth.currentUser || !!_getPiSession(); },
  getRole()     { return _getSession()?.role || null; },
  isAdmin()     { return this.getRole() === 'admin'; },
  isUstadz()    { return this.getRole() === 'ustadz'; },
  isSantri()    { return this.getRole() === 'santri'; },
  isWali()      { return this.getRole() === 'wali'; },
  isPiBrowser() { return !!window.Pi; },
};

// ══════════════════════════════════════════════════════
// SESSION HELPERS (internal)
// ══════════════════════════════════════════════════════
function _saveSession(uid, role, data) {
  try {
    sessionStorage.setItem('haSession', JSON.stringify({
      uid, role,
      nama: data?.nama || data?.displayName || data?.username || '',
      ts: Date.now()
    }));
  } catch(e) {}
}

function _getSession() {
  try {
    const raw = sessionStorage.getItem('haSession') || localStorage.getItem('haSession');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - s.ts > 8 * 3600 * 1000) return null;
    return s;
  } catch(e) { return null; }
}

function _getPiSession() {
  try {
    const raw = localStorage.getItem('piUser');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - (s.ts || 0) > 8 * 3600 * 1000) { localStorage.removeItem('piUser'); return null; }
    return s;
  } catch(e) { return null; }
}

function _clearSession() {
  try {
    sessionStorage.removeItem('haSession');
    sessionStorage.removeItem('currentUser');
    localStorage.removeItem('piUser');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('haSession');
  } catch(e) {}
}

// ══════════════════════════════════════════════════════
// CLASS HidayatulaminAuth (untuk Pi Network & fitur lain)
// ══════════════════════════════════════════════════════
class HidayatulaminAuth {
  constructor() {
    this.auth    = auth;
    this.db      = db;
    this.Pi      = window.Pi || null;
    this.piReady = false;
    this.currentUser     = null;
    this.currentUserData = null;
    this._piAccessToken  = null;
    this._initPiSDK();
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
    } else { this.Pi = window.Pi; }

    if (!this.Pi) { console.warn('⚠️ Pi SDK tidak ditemukan'); return; }
    try {
      this.Pi.init({ version: "2.0", sandbox: false });
      this.piReady = true;
      console.log("✅ Pi SDK siap (sandbox: false - mainnet)");
    } catch(e) { console.error('❌ Pi SDK gagal init:', e); }
  }

  async loginWithEmail(email, password) {
    try {
      const cred = await this.auth.signInWithEmailAndPassword(email, password);
      await this.db.collection('users').doc(cred.user.uid).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
      return { success: true };
    } catch(e) { return { success: false, error: this._errMsg(e.code) }; }
  }

  async loginWithPi() {
    if (!this.piReady) await this._initPiSDK();
    if (!this.piReady) return { success: false, error: 'Buka aplikasi ini di Pi Browser' };
    return this._piAuth();
  }

  async _piAuth() {
    try {
      // Scope hanya 'username' untuk lulus CT review Mainnet.
      // Tambah 'payments','wallet_address' hanya di halaman donasi/payment.
      const scopes     = ['username'];
      const authResult = await this.Pi.authenticate(scopes, this._handleIncompletePiPayment.bind(this));
      const { user, accessToken } = authResult;
      this._piAccessToken = accessToken;

      const userRef  = this.db.collection('users').doc(user.uid);
      const userSnap = await userRef.get();
      const baseData = {
        uid: user.uid, username: user.username, displayName: user.username,
        loginMethod: 'pi',
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (userSnap.exists) {
        await userRef.update(baseData);
        this.currentUserData = { ...userSnap.data(), ...baseData };
      } else {
        const newData = {
          ...baseData,
          email: user.username + '@pi.hidayatulamin.id',
          nama: user.username, role: 'santri', isActive: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          profileComplete: false,
        };
        await userRef.set(newData);
        this.currentUserData = newData;
      }

      localStorage.setItem('piUser', JSON.stringify({
        uid: user.uid, username: user.username,
        role: this.currentUserData.role, ts: Date.now(),
      }));
      this.currentUser = { uid: user.uid };
      return { success: true, isNewUser: !userSnap.exists, user, data: this.currentUserData };
    } catch(e) {
      console.error('❌ Pi auth error:', e);
      return { success: false, error: e.message || 'Pi auth gagal' };
    }
  }

  async donasiPi(amount, program = 'umum', memo = 'Donasi Pesantren Hidayatulamin') {
    if (!this.piReady) return { success: false, error: 'Pi SDK tidak tersedia' };
    const piUser = _getPiSession();
    if (!piUser) return { success: false, error: 'Harus login dengan Pi Network dulu' };

    return new Promise((resolve) => {
      this.Pi.createPayment(
        { amount, memo, metadata: { uid: piUser.uid, username: piUser.username, program } },
        {
          onReadyForServerApproval: async (paymentId) => {
            try {
              await this.db.collection('pi_donations').add({
                paymentId, donorPiUid: piUser.uid, donorUsername: piUser.username,
                amount, program, memo, status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              });
              const r = await fetch('/api/payments/approve', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId }),
              });
              if (!r.ok) throw new Error('Approve gagal');
            } catch(e) { console.error('Approve error:', e); }
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            try {
              const r = await fetch('/api/payments/complete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId, txid }),
              });
              if (!r.ok) throw new Error('Complete gagal');
              resolve({ success: true, txid, paymentId });
            } catch(e) { resolve({ success: false, error: e.message }); }
          },
          onCancel: async (paymentId) => {
            try {
              await fetch('/api/payments/cancel', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    try {
      const snap = await this.db.collection('pi_donations')
        .where('paymentId', '==', payment.identifier).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status === 'pending') {
        await snap.docs[0].ref.update({
          status: 'cancelled',
          cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
          cancelNote: 'Auto-cancelled: incomplete payment',
        });
      }
      await this.db.collection('pi_incomplete').doc(payment.identifier).set({
        payment, resolvedAt: firebase.firestore.FieldValue.serverTimestamp(), resolution: 'auto-cancelled',
      }, { merge: true });
    } catch(e) { console.error('Handle incomplete error:', e); }
  }

  async getSgtBalance(walletAddress) {
    const snap = await this.db.collection('sgt_wallets').doc(walletAddress).get();
    return snap.exists ? snap.data().balance : 0;
  }

  async logout() { return HA.logout(); }

  async updateProfile(data) {
    if (!auth.currentUser) return { success: false, error: 'Belum login' };
    try {
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      await this.db.collection('users').doc(auth.currentUser.uid).update(data);
      this.currentUserData = { ...this.currentUserData, ...data };
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
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
  if (typeof firebase === 'undefined') {
    console.error('❌ Firebase SDK belum dimuat sebelum auth.js');
    return;
  }
  window.Auth = new HidayatulaminAuth();
  console.log('✅ HidayatulaminAuth v4.0 siap — HA.requireAuth() tersedia');
});
