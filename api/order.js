export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const webhook = process.env.DISCORD_WEBHOOK_URL;

    if (!webhook) {
      return res.status(500).json({
        success: false,
        message: "DISCORD_WEBHOOK_URL belum diatur di Vercel.",
      });
    }

    const body = req.body || {};
    const order = body.order;
    const slip = body.slip;

    if (!order || !order.name || !order.phone || !order.address || !order.method) {
      return res.status(400).json({
        success: false,
        message: "Data pesanan tidak lengkap.",
      });
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Keranjang kosong.",
      });
    }

    if (order.method === "TRANSFER") {
      if (!slip || !slip.data || !slip.filename) {
        return res.status(400).json({
          success: false,
          message: "Bukti transfer wajib diupload.",
        });
      }

      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(slip.contentType)) {
        return res.status(400).json({
          success: false,
          message: "Format slip harus JPG, PNG, WEBP, atau PDF.",
        });
      }

      // Batas keamanan server: 8 MB setelah decode.
      const estimatedBytes = Math.floor((slip.data.length * 3) / 4);
      if (estimatedBytes > 8 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "Ukuran slip maksimal 8 MB.",
        });
      }
    }

    const itemText = order.items
      .map(item => `• ${item.name} × ${item.qty} — ${formatRupiah(item.subtotal)}`)
      .join("\n");

    const content =
`🛍️ **PESANAN BARU — MAYA COOPERATION STARK**
**Nama:** ${safe(order.name)}
**No. WhatsApp:** ${safe(order.phone)}
**Alamat:** ${safe(order.address)}
**Pembayaran:** ${safe(order.method)}

**Pesanan:**
${itemText}

**TOTAL:** ${formatRupiah(Number(order.total) || 0)}
${order.method === "TRANSFER" ? "📎 **Slip transfer:** terlampir" : "💳 **Pembayaran:** QRIS"}`;

    let discordResponse;

    if (order.method === "TRANSFER" && slip) {
      const fileBuffer = Buffer.from(slip.data, "base64");
      const blob = new Blob([fileBuffer], { type: slip.contentType });

      const form = new FormData();
      form.append("payload_json", JSON.stringify({
        username: "MAYA COOPERATION STARK",
        content,
        allowed_mentions: { parse: [] }
      }));
      form.append("files[0]", blob, sanitizeFilename(slip.filename));

      discordResponse = await fetch(webhook, {
        method: "POST",
        body: form,
      });
    } else {
      discordResponse = await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "MAYA COOPERATION STARK",
          content,
          allowed_mentions: { parse: [] }
        }),
      });
    }

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error("Discord error:", discordResponse.status, errorText);

      return res.status(502).json({
        success: false,
        message: "Discord gagal menerima pesanan.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pesanan berhasil dikirim.",
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
}

function safe(value) {
  return String(value ?? "").slice(0, 1000);
}

function sanitizeFilename(name) {
  return String(name || "slip-transfer").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
