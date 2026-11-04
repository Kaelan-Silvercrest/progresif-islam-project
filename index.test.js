const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const cfg = require("./config.js");
const store = require("./store.js");
const {
  handleOwnerCommand,
  handleProviderAiChat,
  handleMathAiChat,
  sendMenu,
  handleTranslateCommand,
  handleVerificationStatus,
} = require("./index.js");
const { renderMathSolution } = require("./math-image.js");

test("menu sends the configured image and menu text", async (t) => {
  const originalImagePath = cfg.MENU_IMAGE_PATH;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bot-menu-test-"));
  const imagePath = path.join(directory, "menu.png");
  await fs.writeFile(imagePath, Buffer.from("test-image"));
  cfg.MENU_IMAGE_PATH = imagePath;
  t.after(async () => {
    cfg.MENU_IMAGE_PATH = originalImagePath;
    await fs.rm(directory, { recursive: true, force: true });
  });

  const messages = [];
  await sendMenu({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "chat@s.whatsapp.net");

  assert.equal(messages.length, 2);
  assert.equal(messages[0].jid, "chat@s.whatsapp.net");
  assert.deepEqual(messages[0].image, Buffer.from("test-image"));
  assert.match(messages[0].caption, /RONAN CALLOWAY BOT/);
  assert.match(messages[1].text, /MENU AI/);
});

test("math solution is rendered as one or more PNG pages", () => {
  const pages = renderMathSolution(
    "## Pembuktian\nJumlah bilangan pertama n:\n\\[1 + 2 + \\dots + n = \\frac{n(n+1)}{2}\\]\n**Jawaban akhir:**\n\\[\\boxed{\\frac{n(n+1)}{2}}\\]"
  );
  assert.ok(pages.length >= 1);
  for (const image of pages) {
    assert.equal(image.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(image.readUInt32BE(16), 1080);
    assert.equal(image.readUInt32BE(20), 1800);
  }
});

test("long math solutions are split across PNG pages", () => {
  const solution = Array.from({ length: 60 }, (_, index) => `Langkah ${index + 1}: periksa hasil perhitungan.`).join("\n");
  assert.ok(renderMathSolution(solution).length > 1);
});

test("owner broadcast sends the message to registered groups and reports the result", async (t) => {
  const originalListGroups = store.listGroups;
  const originalDryRun = cfg.DRY_RUN;
  t.after(() => {
    store.listGroups = originalListGroups;
    cfg.DRY_RUN = originalDryRun;
  });
  store.listGroups = () => [{ jid: "group@g.us", name: "Grup uji" }];
  cfg.DRY_RUN = false;

  const messages = [];
  await handleOwnerCommand({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, ".broadcast Pengumuman");

  assert.equal(messages[0].jid, "group@g.us");
  assert.equal(messages[0].text, "Pengumuman");
  assert.match(messages.at(-1).text, /Berhasil: 1\/1 grup/);
});

test("translate command sends text to the configured endpoint and replies with the result", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalGetCooldown = store.getGroupMemberCommandLastUsedAt;
  const originalMarkCooldown = store.markGroupMemberCommandUsed;
  const originalDryRun = cfg.DRY_RUN;
  let requestUrl;
  t.after(() => {
    globalThis.fetch = originalFetch;
    store.getGroupMemberCommandLastUsedAt = originalGetCooldown;
    store.markGroupMemberCommandUsed = originalMarkCooldown;
    cfg.DRY_RUN = originalDryRun;
  });
  cfg.DRY_RUN = false;
  store.getGroupMemberCommandLastUsedAt = () => 0;
  store.markGroupMemberCommandUsed = () => {};
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({ responseStatus: 200, responseData: { translatedText: "Good morning." } }),
    };
  };

  const messages = [];
  await handleTranslateCommand({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "user@s.whatsapp.net", "user@s.whatsapp.net", ".translate en Selamat pagi.");

  assert.equal(requestUrl.searchParams.get("q"), "Selamat pagi.");
  assert.equal(requestUrl.searchParams.get("langpair"), "autodetect|en");
  assert.match(messages[0].text, /Good morning\./);
});

test("verification status only returns the sender's saved status", async (t) => {
  const originalGetStatuses = store.getVerificationStatuses;
  const originalGetSessions = store.getAllSessions;
  t.after(() => {
    store.getVerificationStatuses = originalGetStatuses;
    store.getAllSessions = originalGetSessions;
  });
  store.getVerificationStatuses = (number) => {
    assert.equal(number, "12345");
    return [{
      groupJid: "group@g.us",
      groupName: "Grup uji",
      status: "diterima",
      sessionId: 7,
      updatedAt: Date.now(),
    }];
  };
  store.getAllSessions = () => [];

  const messages = [];
  await handleVerificationStatus({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "12345@s.whatsapp.net", "12345");

  assert.match(messages[0].text, /Grup uji/);
  assert.match(messages[0].text, /diterima/);
});

test(".mathai uses the local math model and returns the solution", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDryRun = cfg.DRY_RUN;
  const originalChatEnabled = cfg.OLLAMA_CHAT_ENABLED;
  const originalGetCooldown = store.getGroupMemberCommandLastUsedAt;
  const originalMarkCooldown = store.markGroupMemberCommandUsed;
  t.after(() => {
    globalThis.fetch = originalFetch;
    cfg.DRY_RUN = originalDryRun;
    cfg.OLLAMA_CHAT_ENABLED = originalChatEnabled;
    store.getGroupMemberCommandLastUsedAt = originalGetCooldown;
    store.markGroupMemberCommandUsed = originalMarkCooldown;
  });
  cfg.DRY_RUN = false;
  cfg.OLLAMA_CHAT_ENABLED = true;
  store.getGroupMemberCommandLastUsedAt = () => 0;
  store.markGroupMemberCommandUsed = () => {};
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/api\/chat$/);
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        message: { content: "<think>hidden</think>Jawaban akhir:\n\\[\\boxed{4}\\]" },
      }),
    };
  };

  const messages = [];
  await handleMathAiChat({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "user@s.whatsapp.net", "user@s.whatsapp.net", ".mathai Hitung 2 + 2");

  assert.equal(requestBody.model, "deepscaler");
  assert.equal(requestBody.messages[1].content, "Hitung 2 + 2");
  assert.match(messages[0].text, /Sedang menyelesaikan soal/);
  assert.equal(messages.at(-1).mimetype, "image/png");
  assert.equal(messages.at(-1).image.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(messages.at(-1).caption, "Penyelesaian matematika");
});

test("provider AI commands explain how to configure a missing key", async (t) => {
  const originalDryRun = cfg.DRY_RUN;
  const originalApiKey = cfg.GROQ_API_KEY;
  const originalGetCooldown = store.getGroupMemberCommandLastUsedAt;
  const originalMarkCooldown = store.markGroupMemberCommandUsed;
  t.after(() => {
    cfg.DRY_RUN = originalDryRun;
    cfg.GROQ_API_KEY = originalApiKey;
    store.getGroupMemberCommandLastUsedAt = originalGetCooldown;
    store.markGroupMemberCommandUsed = originalMarkCooldown;
  });
  cfg.DRY_RUN = false;
  cfg.GROQ_API_KEY = "";
  store.getGroupMemberCommandLastUsedAt = () => 0;
  store.markGroupMemberCommandUsed = () => {};

  const messages = [];
  await handleProviderAiChat({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "user@s.whatsapp.net", "user@s.whatsapp.net", ".groq Halo");

  assert.match(messages[0].text, /GROQ_API_KEY/);
});
