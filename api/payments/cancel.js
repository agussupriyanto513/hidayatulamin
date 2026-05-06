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
      `https://api.minepi.com/v2/payments/${paymentId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${PI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (response.ok) {
      return res.status(200).json({ success: true });
    }
    const data = await response.json();
    return res.status(400).json({ error: "Pi cancel failed", detail: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
