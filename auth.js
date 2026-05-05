/**
 * auth.js — Inisialisasi Firebase & Helper Auth
 * Yayasan Hidayatullah Amin
 *
 * ⚠️  GANTI nilai di bawah dengan konfigurasi Firebase project Anda.
 *     Buka: Firebase Console → Project Settings → Your apps → Firebase SDK snippet → Config
 */

const firebaseConfig = {
  apiKey: "AIzaSyCVKeCAJ6_IitpZfu-tF2QaT0esFbbNCAM",
  authDomain: "hidayatulamin-e6f22.firebaseapp.com",
  databaseURL: "https://hidayatulamin-e6f22-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hidayatulamin-e6f22",
  storageBucket: "hidayatulamin-e6f22.firebasestorage.app",
  messagingSenderId: "80743607267",
  appId: "1:80743607267:web:f5f94165de021759958ed6"
};

// ── Inisialisasi Firebase (hanya sekali) ─────────────────────────────────────
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db   = firebase.firestore();

// ── Offline Persistence (hanya sekali, pakai flag global) ────────────────────
if (!window.__firestorePersistenceEnabled) {
  window.__firestorePersistenceEnabled = true;
  db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('[Firestore] Persistence: beberapa tab terbuka, hanya satu yang aktif.');
    } else if (err.code === 'unimplemented') {
      console.warn('[Firestore] Persistence: browser tidak mendukung IndexedDB.');
    }
  });
}

// ── Helper: Secondary App untuk buat user baru tanpa logout admin ────────────
window.createSecondaryAuth = function() {
  const SEC = '__secondary__';
  const existing = firebase.apps.find(a => a.name === SEC);
  if (existing) return existing.auth();
  return firebase.initializeApp(firebase.app().options, SEC).auth();
};

// ── HA: HidayatAuth — requireAuth helper ─────────────────────────────────────
/**
 * HA.requireAuth(role, callback)
 *  - role     : 'admin' | 'santri' | 'ustadz' | 'wali'
 *  - callback : function(user, firestoreData)
 *
 * Alur:
 *  1. Cek localStorage session (cepat, hindari round-trip Firestore)
 *  2. Dengarkan Firebase onAuthStateChanged
 *  3. Verifikasi role di Firestore koleksi 'users'
 *  4. Jika cocok → panggil callback
 *  5. Jika tidak → redirect ke login.html
 */
window.HA = {
  _ready: false,
  _verifiedUid: null,
  _MAX_AGE_MS: 8 * 60 * 60 * 1000, // 8 jam

  requireAuth(role, callback) {
    const self = this;

    // Sembunyikan body sampai auth selesai
    document.body.style.visibility = 'hidden';

    // Tunggu sedikit agar Firebase Auth restore session dari IndexedDB
    setTimeout(() => {
      auth.onAuthStateChanged(async user => {
        // Sudah diverifikasi sebelumnya — abaikan trigger ulang
        if (self._ready && user && user.uid === self._verifiedUid) return;

        if (user) {
          // ── Cek localStorage dulu ──────────────────────────────────────────
          const raw = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
          if (raw) {
            try {
              const sess = JSON.parse(raw);
              const age  = Date.now() - (sess.ts || 0);
              // Izinkan admin masuk ke halaman apapun, atau user dengan role yang tepat
              const roleOk = sess.role === role || sess.role === 'admin';
              if (roleOk && sess.uid === user.uid && age < self._MAX_AGE_MS) {
                self._boot(user, null, callback);
                return;
              }
            } catch (e) { /* abaikan */ }
          }

          // ── Verifikasi via Firestore ───────────────────────────────────────
          try {
            // Refresh token agar tidak pakai token basi
            await user.getIdToken(true).catch(() => {});

            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
              const data     = doc.data();
              const userRole = data.role;
              // Admin boleh akses semua halaman
              if (userRole === role || userRole === 'admin') {
                // Perbarui session
                localStorage.setItem('currentUser', JSON.stringify({
                  uid: user.uid, role: userRole,
                  authMethod: data.authMethod || 'email', ts: Date.now()
                }));
                self._boot(user, data, callback);
                return;
              }
            }
            // Role tidak cocok → redirect
            await auth.signOut();
            self._clearSession();
            window.location.href = `login.html?role=${role}&message=${encodeURIComponent('Akses ditolak. Silakan login dengan akun yang sesuai.')}`;
          } catch (err) {
            console.warn('[HA] Firestore verify error:', err.code, err.message);
            // Permission-denied atau network error → tetap izinkan masuk
            // (agar tidak lock-out saat Firestore Rules belum sempurna)
            if (err.code === 'permission-denied' || err.code === 'unavailable') {
              self._boot(user, null, callback);
            } else {
              self._boot(user, null, callback);
            }
          }
          return;
        }

        // ── user null ─────────────────────────────────────────────────────────
        if (self._ready) {
          // Sudah boot — tunggu sebentar (bisa jadi transisi auth sementara)
          await new Promise(r => setTimeout(r, 800));
          if (auth.currentUser) return;
        } else {
          // Belum boot — cek apakah ada session localStorage yang masih valid
          const raw = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
          if (raw) {
            try {
              const sess = JSON.parse(raw);
              const age  = Date.now() - (sess.ts || 0);
              if ((sess.role === role || sess.role === 'admin') && age < self._MAX_AGE_MS) {
                // Session masih valid, mungkin Firebase Auth masih restore
                await new Promise(r => setTimeout(r, 1500));
                if (auth.currentUser) return;
              }
            } catch (e) { /* abaikan */ }
          }
        }

        // Tidak ada user valid → redirect
        if (!auth.currentUser) {
          self._clearSession();
          window.location.href = `login.html?role=${role}`;
        }
      });
    }, 400);
  },

  _boot(user, data, callback) {
    if (this._ready) return;
    this._ready       = true;
    this._verifiedUid = user.uid;
    document.body.style.visibility = '';
    callback(user, data);
  },

  _clearSession() {
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    localStorage.removeItem('piAuthUser');
    document.body.style.visibility = '';
  }
};
