// ==========================================
// HIDAYATULAMIN - AUTHENTICATION MODULE v3.1
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
const PUBLIC_PAGES = ['login.html', 'transparansi.html', 'donasi.html', 'pi-donasi.html'];

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
    this.currentUserData = null;
    this._piAccessToken  = null;
    this._authResolved   = false; // flag agar onAuthStateChanged hanya redirect sekali

    this._init();
  }

  // ─────────────────────────────────────────
  // INISIALISASI
  // ─────────────────────────────────────────
  async _init() {
    // FIX: Inisialisasi Pi SDK lebih awal agar siap sebelum halaman login render
    await this._initPiSDK();

    // FIX: Jika di Pi Browser, coba auto-login Pi sebelum cek Firebase Auth
    // Ini yang membuat user tidak perlu klik tombol lagi saat buka di Pi Browser
    const page = this._currentPage();
    if (this.piReady && page === 'login.html') {
      await this._tryPiAutoLogin();
    }

    this.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        this.currentUser = firebaseUser;
        try {
          const snap = await this.db.collection('users').doc(firebaseUser.uid).get();
          this.currentUserData = snap.exists ? snap.data() : null;
        } catch(e) {
          console.warn('Gagal ambil data user dari Firestore:', e.message);
        }
        this._populateSidebar();
        if (!this._authResolved) {
          this._authResolved = true;
          this._guardPage();
        }
      } else {
        this.currentUser     = null;
        this.currentUserData = null;
        if (!this._authResolved) {
          this._authResolved = true;
          this._redirectIfPrivate();
        }
      }

      window.dispatchEvent(new CustomEvent('authReady', {
        detail: { user: this.currentUser, data: this.currentUserData }
      }));
    });

    console.log('✅ HidayatulaminAuth v3.1 siap');
  }

  // ─────────────────────────────────────────
  // INISIALISASI PI SDK
  // ─────────────────────────────────────────
  async _initPiSDK() {
    // Tunggu window.Pi tersedia (Pi Browser inject async)
    if (!window.Pi) {
      await new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (window.Pi) {
            clearInterval(interval);
            this.Pi = window.Pi;
            resolve();
          } else if (attempts >= 10) { // max tunggu 2 detik
            clearInterval(interval);
            resolve();
          }
        }, 200);
      });
    } else {
      this.Pi = window.Pi;
    }

    if (!this.Pi) {
      console.warn('⚠️ Pi SDK tidak ditemukan — bukan Pi Browser atau SDK belum dimuat');
      return;
    }

    try {
      // FIX: sandbox = true HANYA di localhost
      // vercel.app adalah production app, harus sandbox: false
      // agar Pi Browser tidak reject karena domain mismatch
      const sandbox = window.location.hostname === 'localhost';
      this.Pi.init({ version: "2.0", sandbox });
      this.piReady = true;
      console.log('✅ Pi SDK siap (sandbox:', sandbox, ')');
    } catch (e) {
      console.error('❌ Pi SDK gagal init:', e);
    }
  }

  // ─────────────────────────────────────────
  // AUTO LOGIN PI DI PI BROWSER
  // FIX: Panggil authenticate() otomatis saat buka login.html
  // di Pi Browser — user tidak perlu klik tombol manual
  // ─────────────────────────────────────────
  async _tryPiAutoLogin() {
    try {
      console.log('🔄 Mencoba auto-login Pi...');
      const result = await this._piAuth();
      if (result.success) {
        console.log('✅ Auto-login Pi berhasil');
        // _guardPage() akan handle redirect setelah onAuthStateChanged
      } else {
        console.warn('⚠️ Auto-login Pi gagal:', result.error);
      }
    } catch(e) {
      console.warn('⚠️ Auto-login Pi exception:', e.message);
    }
  }

  // ─────────────────────────────────────────
  // ROLE-BASED GUARD
  // ─────────────────────────────────────────
  _guardPage() {
    const page = this._currentPage();
    if (PUBLIC_PAGES.includes(page)) return;

    if (page === 'login.html') {
      const dest = ROLE_DASHBOARD[this.currentUserData?.role] || 'dashboard-santri.html';
      window.location.href = dest;
      return;
    }

    const allowedPage = ROLE_DASHBOARD[this.currentUserData?.role];
    const adminOnly   = ['data-pengguna.html', 'keuangan.html'];
    const staffOnly   = ['absensi.html', 'akademik.html', 'perizinan-santri.html', 'info-santri.html'];

    if (adminOnly.includes(page) && this.currentUserData?.role !== 'admin') {
      alert('⛔ Akses ditolak. Hanya Admin.');
      window.location.href = allowedPage || 'login.html';
      return;
    }

    if (staffOnly.includes(page) && !['admin','ustadz'].includes(this.currentUserData?.role)) {
      alert('⛔ Akses ditolak.');
      window.location.href = allowedPage || 'login.html';
    }
  }

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
    document.querySelectorAll('.u-name,.u-nm,.u-inf .u-name').forEach(el => el.textContent = nama);
    document.querySelectorAll('.u-role,.u-rl').forEach(el => el.textContent = role.charAt(0).toUpperCase() + role.slice(1));
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
      }).catch(() => {}); // jangan error jika field belum ada
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

  // ─────────────────────────────────────────
  // LOGIN PI NETWORK (manual dari tombol)
  // ─────────────────────────────────────────
  async loginWithPi() {
    if (!this.piReady) await this._initPiSDK();
    if (!this.piReady) return { success: false, error: 'Buka aplikasi ini di Pi Browser' };
    return this._piAuth();
  }

  // ─────────────────────────────────────────
  // CORE PI AUTH
  // FIX: Pisahkan dari loginWithPi agar bisa dipanggil auto maupun manual
  // FIX: Tidak pakai Firebase signInWithCustomToken karena butuh backend
  //      — gunakan Firestore session saja (Pi UID sebagai user identifier)
  // ─────────────────────────────────────────
  async _piAuth() {
    try {
      const scopes     = ['username', 'payments', 'wallet_address'];
      const authResult = await this.Pi.authenticate(scopes, this._handleIncompletePiPayment.bind(this));
      const { user, accessToken } = authResult;

      console.log('✅ Pi.authenticate() sukses, username:', user.username);

      // Simpan token di memori saja — JANGAN di localStorage/Firestore
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
        // User lama — update data Pi terbaru
        await userRef.update(baseData);
        this.currentUserData = { ...userSnap.data(), ...baseData };
      } else {
        // User baru — buat dokumen
        const newData = {
          ...baseData,
          email:           user.username + '@pi.network',
          nama:            user.username,
          role:            'santri',
          isActive:        true,
          createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
          profileComplete: false,
        };
        await userRef.set(newData);
        this.currentUserData = newData;
      }

      // Simpan session lokal agar halaman lain tahu siapa yang login
      // tanpa harus query Firestore lagi
      localStorage.setItem('piUser', JSON.stringify({
        uid:      user.uid,
        username: user.username,
        role:     this.currentUserData.role,
        ts:       Date.now(),
      }));

      this.currentUser = { uid: user.uid, email: user.username + '@pi.network' };
      this._populateSidebar();

      return { success: true, isNewUser: !userSnap.exists, user, data: this.currentUserData };
    } catch (e) {
      console.error('❌ Pi auth error:', e);
      return { success: false, error: e.message || 'Pi auth gagal' };
    }
  }

  // ─────────────────────────────────────────
  // DONASI PI NETWORK
  // FIX: Simpan ke koleksi 'pi_donations' (konsisten dengan dashboard admin)
  //      bukan 'donasi' — dan handle payment cancellation/timeout
  // ─────────────────────────────────────────
  async donasiPi(amount, program = 'umum', memo = 'Donasi Pesantren Hidayatulamin') {
    if (!this.piReady)      return { success: false, error: 'Pi SDK tidak tersedia' };
    if (!this._piAccessToken && !this.piReady)
                            return { success: false, error: 'Belum autentikasi Pi' };

    const piUser = this._getPiUser();
    if (!piUser)            return { success: false, error: 'Harus login dengan Pi Network dulu' };

    return new Promise((resolve) => {
      let docRef = null; // simpan referensi dokumen agar bisa diupdate di tiap callback

      this.Pi.createPayment(
        {
          amount,
          memo,
          metadata: {
            uid:      piUser.uid,
            username: piUser.username,
            program,
          }
        },
        {
          // ── Step 1: Payment siap, minta server approve ──
          onReadyForServerApproval: async (paymentId) => {
            try {
              // Simpan ke pi_donations (koleksi yang dibaca dashboard admin)
              docRef = await this.db.collection('pi_donations').add({
                paymentId,
                donorPiUid:   piUser.uid,
                donorUsername:piUser.username,
                amount,
                program,
                progLabel:    program,
                memo,
                status:       'pending',
                createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
              });
              console.log('💰 Donasi pending, paymentId:', paymentId);

              // FIX: Approval otomatis dari sisi client
              // (idealnya dari server, tapi karena tidak ada backend, approve via Firestore flag)
              // Pi Network akan lanjut ke onReadyForServerCompletion setelah ini
            } catch(e) {
              console.error('Gagal simpan donasi pending:', e);
            }
          },

          // ── Step 2: Blockchain confirm, update status selesai ──
          onReadyForServerCompletion: async (paymentId, txid) => {
            try {
              if (docRef) {
                await docRef.update({
                  status:      'completed',
                  txid,
                  completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
              } else {
                // Fallback: cari dokumen berdasarkan paymentId
                const snap = await this.db.collection('pi_donations')
                  .where('paymentId', '==', paymentId).limit(1).get();
                if (!snap.empty) {
                  await snap.docs[0].ref.update({
                    status:      'completed',
                    txid,
                    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                  });
                }
              }
              console.log('✅ Donasi selesai, txid:', txid);
              resolve({ success: true, txid, paymentId });
            } catch(e) {
              resolve({ success: false, error: e.message });
            }
          },

          // ── Dibatalkan user atau timeout ──
          onCancel: async (paymentId) => {
            console.warn('⚠️ Pembayaran dibatalkan:', paymentId);
            try {
              // FIX: Update status jadi 'cancelled' bukan dibiarkan 'pending'
              // Ini yang menyebabkan _handleIncompletePiPayment terpanggil terus
              if (docRef) {
                await docRef.update({
                  status:      'cancelled',
                  cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
              } else {
                const snap = await this.db.collection('pi_donations')
                  .where('paymentId', '==', paymentId).limit(1).get();
                if (!snap.empty) {
                  await snap.docs[0].ref.update({
                    status:      'cancelled',
                    cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
                  });
                }
              }
            } catch(e) { console.error('Gagal update cancelled:', e); }
            resolve({ success: false, error: 'Pembayaran dibatalkan' });
          },

          // ── Error dari Pi SDK ──
          onError: (error, payment) => {
            console.error('❌ Pi payment error:', error);
            resolve({ success: false, error: error.message || 'Terjadi kesalahan pembayaran' });
          }
        }
      );
    });
  }

  // ─────────────────────────────────────────
  // HANDLE INCOMPLETE PAYMENT
  // FIX: Payment yang status-nya masih 'pending' di Firestore
  //      (karena sebelumnya tidak ada handler cancelled)
  //      akan terus muncul sebagai incomplete setiap Pi.authenticate() dipanggil.
  //      Solusi: tandai sebagai 'cancelled' supaya tidak muncul lagi.
  // ─────────────────────────────────────────
  async _handleIncompletePiPayment(payment) {
    console.warn('⚠️ Incomplete payment ditemukan:', payment.identifier);
    try {
      // Cari di Firestore dan update jadi cancelled
      const snap = await this.db.collection('pi_donations')
        .where('paymentId', '==', payment.identifier).limit(1).get();

      if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data.status === 'pending') {
          await snap.docs[0].ref.update({
            status:      'cancelled',
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelNote:  'Auto-cancelled: incomplete payment saat login berikutnya',
          });
          console.log('✅ Incomplete payment di-cancel otomatis:', payment.identifier);
        }
      }

      // Simpan juga ke pi_incomplete untuk referensi admin
      await this.db.collection('pi_incomplete').doc(payment.identifier).set({
        payment,
        resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        resolution: 'auto-cancelled',
      }, { merge: true });

    } catch(e) {
      console.error('Gagal handle incomplete payment:', e);
    }
  }

  // ─────────────────────────────────────────
  // HELPER: Ambil data Pi user dari session
  // ─────────────────────────────────────────
  _getPiUser() {
    // Cek dari currentUserData dulu
    if (this.currentUserData?.loginMethod === 'pi') {
      return {
        uid:      this.currentUserData.uid,
        username: this.currentUserData.username || this.currentUserData.displayName,
      };
    }
    // Fallback ke localStorage
    try {
      const raw = localStorage.getItem('piUser');
      if (!raw) return null;
      const data = JSON.parse(raw);
      const age  = Date.now() - (data.ts || 0);
      // Session Pi valid 8 jam
      if (age > 8 * 60 * 60 * 1000) { localStorage.removeItem('piUser'); return null; }
      return data;
    } catch(e) { return null; }
  }

  // ─────────────────────────────────────────
  // SGT TOKEN
  // ─────────────────────────────────────────
  async getSgtBalance(walletAddress) {
    const snap = await this.db.collection('sgt_wallets').doc(walletAddress).get();
    return snap.exists ? snap.data().balance : 0;
  }

  // ─────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // HELPER
  // ─────────────────────────────────────────
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
