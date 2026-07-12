// GET/POST /api/payments/verify
// Mengambil data pembayaran ASLI dari Pi Platform API berdasarkan paymentId,
// supaya admin (atau proses approve) tidak asal percaya data yang dikirim client/Firestore.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { paymentId } = req.body;
  if (!paymentId) {
    return res.status(400).json({ error: "paymentId wajib diisi" });
  }
  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    return res.status(500).json({ error: "PI_API_KEY tidak di-set" });
  }
  try {
    const response = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}`,
      { headers: { Authorization: `Key ${PI_API_KEY}` } }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: "Gagal ambil data pembayaran dari Pi", detail: data });
    }
    // Kembalikan hanya field yang relevan buat verifikasi, biar admin/dashboard
    // bisa bandingkan dengan data yang ada di Firestore (amount, status, txid).
    return res.status(200).json({
      identifier: data.identifier,
      amount: data.amount,
      memo: data.memo,
      metadata: data.metadata,
      to_address: data.to_address,
      status: data.status, // { developer_approved, transaction_verified, developer_completed, cancelled, user_cancelled }
      transaction: data.transaction, // { txid, verified, _link } kalau sudah ada di blockchain
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
