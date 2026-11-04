const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  canonicalYouTubeUrl,
  downloadYouTubeMp3,
  normalizeYouTubeError,
  parseYouTubeUrl,
} = require("./youtube.js");

const config = {
  MP3_OUTPUT_DIR: "./tmp/youtube-test",
  MP3_DOWNLOAD_TIMEOUT_MS: 120_000,
  MP3_MAX_DURATION_SECONDS: 900,
  MP3_MAX_FILE_SIZE_BYTES: 16 * 1024 * 1024,
};

test("YouTube URLs are reduced to a single video, removing playlist and tracking parameters", () => {
  const playlistUrl = "https://www.youtube.com/watch?v=xIdE3snEGrI&list=RDxIdE3snEGrI&start_radio=1";
  const shortUrl = "https://youtu.be/qU9mHegkTc4?si=tracking-value";

  assert.equal(parseYouTubeUrl(playlistUrl), "xIdE3snEGrI");
  assert.equal(canonicalYouTubeUrl(parseYouTubeUrl(playlistUrl)), "https://www.youtube.com/watch?v=xIdE3snEGrI");
  assert.equal(canonicalYouTubeUrl(parseYouTubeUrl(shortUrl)), "https://www.youtube.com/watch?v=qU9mHegkTc4");
});

test("metadata lookup disables playlists and does not pass deprecated no-call-home", async (t) => {
  const calls = [];
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-youtube-test-"));
  t.after(() => fs.rm(outputDir, { recursive: true, force: true }));
  await assert.rejects(
    downloadYouTubeMp3(
      "https://www.youtube.com/watch?v=xIdE3snEGrI&list=RDxIdE3snEGrI",
      { ...config, MP3_OUTPUT_DIR: outputDir },
      async (url, options) => {
        calls.push({ url, options });
        throw new Error("metadata lookup stopped for test");
      }
    ),
    /yt-dlp gagal memproses video YouTube/
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.youtube.com/watch?v=xIdE3snEGrI");
  assert.equal(calls[0].options.noPlaylist, true);
  assert.equal("noCallHome" in calls[0].options, false);
});

test("YouTube bot verification failures become a concise actionable error", () => {
  const error = normalizeYouTubeError(new Error(
    "Command failed\nDeprecated Feature: --no-call-home\nERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use cookies."
  ));
  assert.equal(
    error.message,
    "YouTube meminta login untuk memverifikasi akses video ini. Downloader tidak dapat mengakses video tersebut saat ini."
  );
  assert.doesNotMatch(error.message, /cookies|Command failed|Deprecated Feature/);
});

test("yt-dlp command failures do not leak full command dumps to the caller", () => {
  const error = normalizeYouTubeError(new Error(
    "Command failed with exit code 1: yt-dlp https://www.youtube.com/watch?v=abc\nERROR: [youtube] Video unavailable"
  ));
  assert.equal(error.message, "Video YouTube tidak tersedia untuk diakses.");
});
