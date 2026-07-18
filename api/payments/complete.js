// api/payments/complete.js
//
// PERUBAHAN PENTING (migrasi ke SGT terpusat):
// Setelah payment Pi dikonfirmasi selesai, endpoint ini SEKARANG JUGA
// mengkredit bonus SGT ke ledger terpusat (backend Mart) — sebelumnya
// bonus SGT dikredit dari CLIENT langsung ke Firestore lokal Hidayatulamin
// (fungsi creditSGT() lama di pembayaran.html), yang berarti:
//   a) saldo tidak sinkron dengan Mart/Games, dan
//   b) client bisa memalsukan jumlah bonus dengan mengedit request di browser.
//
// Sekarang jumlah bonus (sgtBonus) dan username Pi (piUsername) diambil
// dari dokumen `spp_payments` yang tersimpan server-side saat payment
// dibuat — BUKAN dari body request client — supaya tidak bisa dipalsukan.
import { getFirebaseApp, admin } from '../firebase-init.js';
import { sgtCredit } from '../_sgtClient.js';

getFirebaseApp();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paymentId, txid } = req.body;
  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'paymentId dan txid wajib diisi' });
  }

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    console.error('[complete] PI_API_KEY tidak di-set!');
    return res.status(500).json({ error: 'PI_API_KEY tidak di-set' });
  }

  try {
    // 1. Selesaikan payment di sisi Pi Network (seperti sebelumnya)
    const response = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ txid }),
      }
    );
    const data = await response.json();
    console.log('[complete] STATUS:', response.status);
    console.log('[complete] RESPONSE:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(400).json({ error: 'Pi complete failed', status: response.status, detail: data });
    }

    // 2. Kredit bonus SGT ke ledger terpusat — ambil data dari Firestore
    //    (dokumen spp_payments yang dibuat server-approved di awal alur),
    //    bukan dari body request client.
    let sgtCredited = 0;
    try {
      const db = admin.firestore();
      const snap = await db.collection('spp_payments')
        .where('paymentId', '==', paymentId).limit(1).get();

      if (!snap.empty) {
        const pay = snap.docs[0].data();
        const bonus = parseFloat(pay.sgtBonus) || 0;
        const username = pay.piUsername;

        if (bonus > 0 && username) {
          const result = await sgtCredit({
            username, amount: bonus,
            txId: `hidayatulamin_${paymentId}`, // idempotent kalau complete dipanggil ulang
            source: 'hidayatulamin_spp_bonus',
            meta: { paymentId, txid, type: pay.type, santriId: pay.santriId }
          });
          sgtCredited = result?.sgtBalance !== undefined ? bonus : 0;
        } else {
          console.warn(`[complete] spp_payments ${paymentId} tidak punya sgtBonus/piUsername, skip kredit SGT`);
        }

        // Tandai status lunas di sini juga (sebelumnya dilakukan client
        // setelah fetch ini selesai — dipindah ke server supaya konsisten
        // walau client keburu tertutup/koneksi putus)
        await snap.docs[0].ref.update({
          status: 'lunas',
          txid,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        console.warn(`[complete] Tidak ditemukan spp_payments dengan paymentId=${paymentId}`);
      }
    } catch (sgtErr) {
      // Jangan gagalkan response Pi complete hanya karena kredit SGT error —
      // pembayaran Pi-nya sendiri sudah sah selesai. Log untuk ditindaklanjuti manual.
      console.error('[complete] Gagal kredit SGT terpusat:', sgtErr.message);
    }

    return res.status(200).json({ ...data, sgtCredited });
  } catch (err) {
    console.error('[complete] Exception:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
