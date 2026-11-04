const API_BASE_URL = "https://api.cloudflare.com/client/v4/accounts";
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_PROMPT_CHARS = 1000;

function getImageType(buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}

function safeErrorMessage(value, apiToken) {
  return String(value || "")
    .replaceAll(apiToken, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

async function generateCloudflareImage(prompt, config, fetchImpl = globalThis.fetch) {
  const accountId = String(config.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(config.CLOUDFLARE_API_TOKEN || "").trim();
  const model = String(config.CLOUDFLARE_IMAGE_MODEL || "").trim();
  if (!accountId || !apiToken) {
    throw new Error("Account ID atau API Token Cloudflare belum diatur.");
  }
  if (!model) throw new Error("Model gambar Cloudflare belum dikonfigurasi.");

  const text = String(prompt || "").trim();
  if (!text) throw new Error("Prompt gambar tidak boleh kosong.");
  if (text.length > MAX_PROMPT_CHARS) {
    throw new Error(`Prompt gambar terlalu panjang (maksimal ${MAX_PROMPT_CHARS} karakter).`);
  }

  const modelPath = model.split("/")
    .map((segment) => encodeURIComponent(segment).replaceAll("%40", "@"))
    .join("/");
  const response = await fetchImpl(
    `${API_BASE_URL}/${encodeURIComponent(accountId)}/ai/run/${modelPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "image/png, image/jpeg, image/webp, application/json",
      },
      signal: AbortSignal.timeout(Math.max(1000, Number(config.CLOUDFLARE_IMAGE_TIMEOUT_MS) || 120_000)),
      body: JSON.stringify({ prompt: text }),
    }
  );

  const responseBuffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    let message = responseBuffer.toString("utf8");
    try {
      const payload = JSON.parse(message);
      message = payload?.errors?.map((error) => error.message).filter(Boolean).join("; ")
        || payload?.error?.message
        || payload?.message
        || message;
    } catch {
      // Keep the response text for non-JSON API errors.
    }
    throw new Error(
      `Cloudflare Workers AI HTTP ${response.status}${message ? `: ${safeErrorMessage(message, apiToken)}` : ""}`
    );
  }

  let imageBuffer = responseBuffer;
  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("application/json")) {
    let payload;
    try {
      payload = JSON.parse(responseBuffer.toString("utf8"));
    } catch {
      throw new Error("Cloudflare Workers AI mengembalikan JSON gambar yang tidak valid.");
    }
    const encodedImage = payload?.result?.image;
    if (typeof encodedImage !== "string" || !encodedImage) {
      throw new Error("Cloudflare Workers AI tidak mengembalikan gambar.");
    }
    imageBuffer = Buffer.from(encodedImage, "base64");
  }

  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran gambar melebihi batas pengiriman WhatsApp (16 MB).");
  }
  const mimetype = getImageType(imageBuffer);
  if (!mimetype) throw new Error("Respons Cloudflare Workers AI bukan file gambar PNG, JPEG, atau WebP yang valid.");
  return { buffer: imageBuffer, mimetype };
}

module.exports = { generateCloudflareImage };
