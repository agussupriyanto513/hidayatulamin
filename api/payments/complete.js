// api/payments/complete.js
// Dipanggil oleh dashboard-santri.html saat Pi SDK memicu onReadyForServerCompletion
// Tugas: panggil Pi Platform API untuk men-complete pembayaran

export default async function handler(req, res) {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS header
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { paymentId, txid } = req.body;

  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'paymentId dan txid wajib diisi' });
  }

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    console.error('PI_API_KEY belum di-set di environment variables');
    return res.status(500).json({ error: 'Server belum dikonfigurasi (PI_API_KEY missing)' });
  }

  try {
    const piRes = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ txid }),
      }
    );

    const data = await piRes.json();

    if (!piRes.ok) {
      console.error('Pi complete error:', data);
      return res.status(piRes.status).json({ error: data?.error_message || 'Complete gagal dari Pi', detail: data });
    }

    console.log(`Payment ${paymentId} berhasil di-complete (txid: ${txid})`);
    return res.status(200).json({ success: true, payment: data });

  } catch (err) {
    console.error('complete handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
