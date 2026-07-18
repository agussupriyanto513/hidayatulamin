// api/sgt-balance.js
// GET/POST { uid }  →  { success, sgtBalance }
//
// Dipanggil dari pembayaran.html (loadSGTBalance) memakai currentUid dari
// sesi Hidayatulamin sendiri (bukan Pi accessToken, karena Pi login di
// halaman ini bersifat opsional/khusus saat bayar, jadi belum tentu ada
// token segar saat halaman dibuka).
//
// Endpoint ini hanya proxy tipis: cari piUsername dari profil user lokal,
// lalu tanya central API pakai internal secret (server-to-server, aman).
import { getFirebaseApp } from './firebase-init.js';
import { sgtBalanceByUsername } from './_sgtClient.js';

getFirebaseApp();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid diperlukan' });

  try {
    const { admin } = await import('./firebase-init.js');
    const snap = await admin.firestore().collection('users').doc(uid).get();
    const piUsername = snap.exists ? snap.data().piUsername : null;

    if (!piUsername) {
      // User belum pernah hubungkan akun Pi-nya — bukan error, saldo 0 saja
      return res.status(200).json({ success: true, sgtBalance: 0, linked: false });
    }

    const result = await sgtBalanceByUsername(piUsername);
    return res.status(200).json({ success: true, sgtBalance: result.sgtBalance, linked: true });
  } catch (err) {
    console.error('[sgt-balance] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
