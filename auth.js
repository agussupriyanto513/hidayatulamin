// ==========================================
// HIDAYATULAMIN - AUTHENTICATION MODULE v4.0
// Firebase Config + Role-based Auth + Pi Network
// v4.0: Centralized auth guard — satu pola untuk semua dashboard
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

    // Tunggu Firebase Auth selesai restore session dari IndexedDB
    // unsubscribe setelah pertama kali dipanggil agar tidak loop
    let resolved = false;
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (resolved) return;

      if (user) {
        // Ada Firebase user — verifikasi role via Firestore
        try {
          const snap = await db.collection('users').doc(user.uid).get();
          const data = snap.exists ? snap.data() : null;
          const role = data?.role;

          if (roles.includes(role) || roles.includes('admin') && role === 'admin') {
            resolved = true;
            unsub();
            // Simpan session ringkas agar Pi flow juga bisa pakai
            _saveSession(user.uid, role, data);
            if (typeof onSuccess === 'function') onSuccess(user, data);
          } else {
            // Role salah — arahkan ke dashboard yang benar
            resolved = true;
            unsub();
            const dest = ROLE_DASHBOARD[role] || 'login.html';
            window.location.href = dest;
          }
        } catch (e) {
          // Firestore gagal (permission / network) — percayai Firebase Auth saja
          console.warn('HA.requireAuth Firestore error:', e.code, e.message);
          const sess = _getSession();
          if (sess && roles.includes(sess.role)) {
            resolved = true;
            unsub();
            if (typeof onSuccess === 'function') onSuccess(user, sess);
          } else {
            // Tidak bisa verifikasi role → redirect ke login
            resolved = true;
            unsub();
            window.location.href = 'login.html';
          }
        }
        return;
      }

      // user null — mungkin Firebase Auth masih restore dari IndexedDB
      // Tunggu maksimal 2.5 detik sebelum benar-benar redirect
      await new Promise(r => setTimeout(r, 2500));

      if (auth.currentUser) return; // sudah restore, biarkan onAuthStateChanged fire lagi

      // Cek Pi session sebagai fallback
      const piSess = _getPiSession();
      if (piSess && roles.includes(piSess.role)) {
        resolved = true;
        unsub();
        if (typeof onSuccess === 'function') onSuccess({ uid: piSess.uid }, piSess);
        return;
      }

      // Benar-benar tidak ada session — redirect ke login
      resolved = true;
      unsub();
      window.location.href = 'login.html';
    });
  },

  // ── Logout ──
  async logout() {
    try {
      await auth.signOut();
      _clearSession();
      window.location.href = 'login.html';
    } catch(e) {
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
      this.Pi.init({ version: "2.0", sandbox: true });
      this.piReady = true;
      console.log('✅ Pi SDK siap (sandbox: true)');
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
      const scopes     = ['username', 'payments', 'wallet_address'];
      const authResult = await this.Pi.authenticate(scopes, this._handleIncompletePiPayment.bind(this));
      const { user, accessToken } = authResult;
      this._piAccessToken = accessToken;

      const userRef  = this.db.collection('users').doc(user.uid);
      const userSnap = await userRef.get();
      const baseData = {
        uid: user.uid, username: user.username, displayName: user.username,
        wallet_address: user.wallet_address || null,
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
