/**
 * auth.js — Inisialisasi Firebase & Helper Auth
 * Yayasan Hidayatullah Amin
 */

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

const auth = firebase.auth();
const db   = firebase.firestore();

// Offline Persistence (hanya sekali, pakai flag global)
if (!window.__firestorePersistenceEnabled) {
  window.__firestorePersistenceEnabled = true;
  db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
      console.warn('[Firestore] Persistence error:', err.code);
    }
  });
}

// Secondary App: buat user baru tanpa logout admin
window.getSecondaryAuth = function () {
  const NAME = '__secondary__';
  const app  = firebase.apps.find(a => a.name === NAME)
             || firebase.initializeApp(firebase.app().options, NAME);
  return app.auth();
};

// HA: HidayatAuth — guard semua dashboard
window.HA = {
  _MAX_AGE_MS: 8 * 60 * 60 * 1000,
  _booted: false,

  requireAuth(role, callback) {
    const self = this;
    self._booted = false; // reset tiap halaman load
    document.body.style.visibility = 'hidden';

    // Fallback: jika onAuthStateChanged tidak fire dalam 5 detik
    const fallbackTimer = setTimeout(() => {
      if (self._booted) return;
      const raw = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
      if (raw) {
        try {
          const sess = JSON.parse(raw);
          const ok   = (sess.role === role || sess.role === 'admin')
                     && (Date.now() - (sess.ts || 0)) < self._MAX_AGE_MS;
          if (ok) {
            console.warn('[HA] fallback boot dari localStorage (auth lambat)');
            self._boot({ uid: sess.uid, email: sess.email || '' }, null, callback);
            return;
          }
        } catch (_) {}
      }
      self._clearSession();
      window.location.href = 'login.html?role=' + role;
    }, 5000);

    auth.onAuthStateChanged(async (user) => {
      if (self._booted) { clearTimeout(fallbackTimer); return; }

      if (user) {
        clearTimeout(fallbackTimer);

        // 1. Cek localStorage — cepat, tanpa round-trip
        const raw = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        if (raw) {
          try {
            const sess = JSON.parse(raw);
            const age  = Date.now() - (sess.ts || 0);
            if ((sess.role === role || sess.role === 'admin')
                && sess.uid === user.uid
                && age < self._MAX_AGE_MS) {
              self._boot(user, null, callback);
              return;
            }
          } catch (_) {}
        }

        // 2. Verifikasi via Firestore
        try {
          await user.getIdToken(true).catch(() => {});
          const snap = await db.collection('users').doc(user.uid).get();

          if (snap.exists) {
            const data     = snap.data();
            const userRole = data.role;

            if (userRole === role || userRole === 'admin') {
              localStorage.setItem('currentUser', JSON.stringify({
                uid: user.uid, role: userRole,
                email: user.email || '',
                authMethod: data.authMethod || 'email',
                ts: Date.now()
              }));
              self._boot(user, data, callback);
              return;
            }

            // Role tidak cocok
            await auth.signOut().catch(() => {});
            self._clearSession();
            window.location.href = 'login.html?role=' + role
              + '&message=' + encodeURIComponent('Akun ini terdaftar sebagai "' + userRole + '". Pilih role yang sesuai.');
            return;
          }

          // Dokumen tidak ada di users/
          if (role === 'admin') {
            // Auto-buat dokumen admin agar tidak lock-out
            const payload = {
              uid: user.uid, email: user.email || '',
              displayName: user.displayName || user.email || 'Admin',
              role: 'admin', isActive: true, authMethod: 'email',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(user.uid).set(payload).catch(() => {});
            await db.collection('admins').doc(user.uid).set(payload).catch(() => {});
            localStorage.setItem('currentUser', JSON.stringify({
              uid: user.uid, role: 'admin', email: user.email || '', ts: Date.now()
            }));
            self._boot(user, payload, callback);
            return;
          }

          // Non-admin tanpa dokumen → tolak
          await auth.signOut().catch(() => {});
          self._clearSession();
          window.location.href = 'login.html?role=' + role
            + '&message=' + encodeURIComponent('Akun belum terdaftar. Hubungi administrator.');

        } catch (err) {
          // permission-denied / network error → tetap izinkan masuk
          console.warn('[HA] Firestore error (', err.code, '):', err.message);
          if (err.code === 'permission-denied') {
            console.warn('[HA] ⚠️ Firestore Rules memblokir akses. Perbaiki rules di Firebase Console:\n'
              + 'rules_version = "2";\nservice cloud.firestore {\n  match /databases/{database}/documents {\n'
              + '    match /{document=**} { allow read, write: if request.auth != null; }\n  }\n}');
          }
          self._boot(user, null, callback);
        }
        return;
      }

      // user null — mungkin Firebase masih restore session
      if (!self._booted) {
        const raw = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        if (raw) {
          try {
            const sess = JSON.parse(raw);
            const ok   = (sess.role === role || sess.role === 'admin')
                       && (Date.now() - (sess.ts || 0)) < self._MAX_AGE_MS;
            if (ok) {
              await new Promise(r => setTimeout(r, 2000));
              if (auth.currentUser) return; // onAuthStateChanged akan fire lagi dengan user
            }
          } catch (_) {}
        }

        if (!self._booted) {
          clearTimeout(fallbackTimer);
          self._clearSession();
          window.location.href = 'login.html?role=' + role;
        }
      }
    });
  },

  _boot(user, data, callback) {
    if (this._booted) return;
    this._booted = true;
    document.body.style.visibility = '';
    try { callback(user, data); }
    catch (e) { console.error('[HA] callback error:', e); }
  },

  _clearSession() {
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    localStorage.removeItem('piAuthUser');
    document.body.style.visibility = '';
  }
};
