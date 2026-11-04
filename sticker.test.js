const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { test } = require("node:test");
const ffmpegPath = require("ffmpeg-static");
const { convertToSticker, getStickerSource } = require("./sticker.js");

const execFileAsync = promisify(execFile);

test("getStickerSource accepts attached and quoted images and animated GIFs", () => {
  const image = { key: {}, message: { imageMessage: { mimetype: "image/jpeg" } } };
  assert.equal(getStickerSource(image).kind, "image");

  const gif = { key: {}, message: { videoMessage: { gifPlayback: true } } };
  assert.equal(getStickerSource(gif).kind, "animation");
  const gifDocument = { key: {}, message: { documentMessage: { mimetype: "image/gif" } } };
  assert.equal(getStickerSource(gifDocument).kind, "animation");

  const reply = {
    key: {},
    message: {
      extendedTextMessage: {
        contextInfo: { quotedMessage: { imageMessage: { mimetype: "image/jpeg" } } },
      },
    },
  };
  assert.equal(getStickerSource(reply).kind, "image");
  assert.equal(getStickerSource({ key: {}, message: { videoMessage: {} } }), null);
});

test("convertToSticker converts static and animated media into WebP", async (t) => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-sticker-test-"));
  t.after(() => fs.rm(workDir, { recursive: true, force: true }));
  const pngPath = path.join(workDir, "input.png");
  const gifPath = path.join(workDir, "input.gif");

  await execFileAsync(ffmpegPath, [
    "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64:d=0.4",
    "-frames:v", "1", pngPath,
  ]);
  await execFileAsync(ffmpegPath, [
    "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=5:d=0.4",
    "-loop", "0", gifPath,
  ]);

  for (const [filePath, kind] of [[pngPath, "image"], [gifPath, "animation"]]) {
    const result = await convertToSticker(await fs.readFile(filePath), kind);
    assert.equal(result.toString("ascii", 0, 4), "RIFF");
    assert.equal(result.toString("ascii", 8, 12), "WEBP");
  }
});
