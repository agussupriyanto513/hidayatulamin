export default async function handler(req, res) {
  // CORS — wajib agar bisa dipanggil dari Pi Browser
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paymentId } = req.body;
  if (!paymentId) return res.status(400).json({ error: 'paymentId wajib diisi' });

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    console.error('[approve] PI_API_KEY tidak di-set!');
    return res.status(500).json({ error: 'PI_API_KEY tidak di-set' });
  }

  try {
    const response = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}/approve`,
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const data = await response.json();
    console.log('[approve] STATUS:', response.status);
    console.log('[approve] RESPONSE:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(400).json({ error: 'Pi approval failed', status: response.status, detail: data });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('[approve] Exception:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
