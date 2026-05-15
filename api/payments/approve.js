// api/payments/approve.js
// Dipanggil oleh dashboard-santri.html saat Pi SDK memicu onReadyForServerApproval
// Tugas: panggil Pi Platform API untuk meng-approve pembayaran

export default async function handler(req, res) {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS header — agar bisa dipanggil dari browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId wajib diisi' });
  }

  // Ambil Pi Server API Key dari environment variable
  // Set di Vercel Dashboard: Settings > Environment Variables > PI_API_KEY
  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    console.error('PI_API_KEY belum di-set di environment variables');
    return res.status(500).json({ error: 'Server belum dikonfigurasi (PI_API_KEY missing)' });
  }

  try {
    const piRes = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await piRes.json();

    if (!piRes.ok) {
      console.error('Pi approve error:', data);
      return res.status(piRes.status).json({ error: data?.error_message || 'Approve gagal dari Pi', detail: data });
    }

    console.log(`Payment ${paymentId} berhasil di-approve`);
    return res.status(200).json({ success: true, payment: data });

  } catch (err) {
    console.error('approve handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
