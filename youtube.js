/*
 * Utility download audio YouTube menjadi MP3.
 * Gunakan hanya untuk konten yang diizinkan untuk diunduh.
 */

const fs = require("fs/promises");
const path = require("path");
const ytDlp = require("yt-dlp-exec");
const ffmpegPath = require("ffmpeg-static");

function parseYouTubeUrl(value) {
  try {
    const url = new URL(String(value).trim());
    const isYouTubeHost = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname.toLowerCase());
    if (!isYouTubeHost) return null;
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function safeFilename(title) {
  return String(title || "audio")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "audio";
}

async function downloadYouTubeMp3(input, config) {
  const videoId = parseYouTubeUrl(input);
  if (!videoId) throw new Error("URL YouTube tidak valid");

  const outputDir = path.resolve(config.MP3_OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  const timeout = Math.max(10_000, Number(config.MP3_DOWNLOAD_TIMEOUT_MS) || 120_000);

  const metadata = await ytDlp(input, {
    dumpSingleJson: true,
    skipDownload: true,
    noWarnings: true,
    noCallHome: true,
    socketTimeout: Math.ceil(timeout / 1000),
  }, { timeout });
  const duration = Number(metadata.duration || 0);
  if (duration > Number(config.MP3_MAX_DURATION_SECONDS)) {
    throw new Error(`Durasi video maksimal ${Math.floor(config.MP3_MAX_DURATION_SECONDS / 60)} menit`);
  }

  const outputBase = `${Date.now()}-${metadata.id || videoId}`;
  const outputTemplate = path.join(outputDir, `${outputBase}.%(ext)s`);
  const expectedFilePath = path.join(outputDir, `${outputBase}.mp3`);

  await ytDlp(input, {
    extractAudio: true,
    audioFormat: "mp3",
    audioQuality: "128K",
    ffmpegLocation: ffmpegPath,
    output: outputTemplate,
    noPlaylist: true,
    noWarnings: true,
    noCallHome: true,
    socketTimeout: Math.ceil(timeout / 1000),
  }, { timeout });

  const filePath = expectedFilePath;
  try {
    await fs.access(filePath);
  } catch {
    throw new Error("File MP3 tidak berhasil dibuat");
  }

  const stat = await fs.stat(filePath);
  if (stat.size > Number(config.MP3_MAX_FILE_SIZE_BYTES)) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error("Ukuran file terlalu besar untuk dikirim melalui WhatsApp");
  }

  return {
    filePath,
    title: safeFilename(metadata.title),
    duration,
    size: stat.size,
  };
}

async function removeDownloadedFile(filePath) {
  if (filePath) await fs.unlink(filePath).catch(() => {});
}

module.exports = { downloadYouTubeMp3, parseYouTubeUrl, removeDownloadedFile };
