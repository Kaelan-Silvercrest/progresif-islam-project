const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const ffmpegPath = require("ffmpeg-static");

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_STICKER_BYTES = 1024 * 1024;
const MAX_ANIMATION_SECONDS = 8;
const CONVERSION_TIMEOUT_MS = 15_000;

function unwrapMessage(message) {
  let current = message;
  while (current) {
    const wrapped = current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current;
}

function getStickerSource(message) {
  const content = unwrapMessage(message?.message);
  if (!content) return null;

  if (content.imageMessage) {
    return { message, media: content.imageMessage, kind: "image" };
  }
  if (content.videoMessage?.gifPlayback) {
    return { message, media: content.videoMessage, kind: "animation" };
  }
  if (content.documentMessage?.mimetype?.toLowerCase() === "image/gif") {
    return { message, media: content.documentMessage, kind: "animation" };
  }

  const quoted = unwrapMessage(content.extendedTextMessage?.contextInfo?.quotedMessage);
  if (quoted?.imageMessage) {
    return { message: { ...message, message: quoted }, media: quoted.imageMessage, kind: "image" };
  }
  if (quoted?.videoMessage?.gifPlayback) {
    return { message: { ...message, message: quoted }, media: quoted.videoMessage, kind: "animation" };
  }
  if (quoted?.documentMessage?.mimetype?.toLowerCase() === "image/gif") {
    return { message: { ...message, message: quoted }, media: quoted.documentMessage, kind: "animation" };
  }
  return null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      process.kill("SIGKILL");
    }, CONVERSION_TIMEOUT_MS);
    process.stderr.setEncoding("utf8");
    process.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    process.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("Konversi sticker melewati batas waktu 15 detik."));
      if (code === 0) return resolve();
      reject(new Error(`Konversi sticker gagal${stderr ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`));
    });
  });
}

async function downloadMediaWithinLimit(message) {
  const stream = await downloadMediaMessage(message, "stream", {});
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) {
      stream.destroy();
      throw new Error("Ukuran gambar/GIF maksimal 10 MB.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function convertToSticker(input, kind) {
  if (input.length > MAX_INPUT_BYTES) {
    throw new Error("Ukuran gambar/GIF maksimal 10 MB.");
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-sticker-"));
  const inputPath = path.join(workDir, kind === "image" ? "input-image" : "input-animation");
  const outputPath = path.join(workDir, "sticker.webp");
  try {
    await fs.writeFile(inputPath, input);
    const filters = "scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:-1:-1:color=0x00000000";
    const args = ["-y", "-i", inputPath, "-vf", filters, "-an"];
    if (kind === "image") {
      args.push("-frames:v", "1");
    } else {
      args.push("-t", String(MAX_ANIMATION_SECONDS), "-loop", "0", "-vsync", "0");
    }
    args.push("-c:v", "libwebp", "-quality", "75", "-compression_level", "6", outputPath);
    await runFfmpeg(args);

    const sticker = await fs.readFile(outputPath);
    if (sticker.length > MAX_STICKER_BYTES) {
      throw new Error("Hasil sticker melebihi batas ukuran 1 MB.");
    }
    return sticker;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function createSticker(message) {
  const source = getStickerSource(message);
  if (!source) {
    throw new Error("Kirim gambar atau GIF dengan caption .sticker, atau balas gambar/GIF dengan .sticker.");
  }

  const inputSize = Number(source.media.fileLength || 0);
  if (inputSize > MAX_INPUT_BYTES) {
    throw new Error("Ukuran gambar/GIF maksimal 10 MB.");
  }
  const input = await downloadMediaWithinLimit(source.message);
  return convertToSticker(input, source.kind);
}

module.exports = { convertToSticker, createSticker, getStickerSource };
