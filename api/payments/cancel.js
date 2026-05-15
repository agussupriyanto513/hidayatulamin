// api/payments/cancel.js
// Dipanggil saat pembayaran dibatalkan — opsional, untuk logging

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId wajib diisi' });
  }

  // Cancel tidak perlu memanggil Pi API — cukup log di server
  console.log(`Payment ${paymentId} dibatalkan oleh pengguna`);
  return res.status(200).json({ success: true, message: 'Cancel dicatat' });
}
