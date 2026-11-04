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
  handleImageCommand,
  handleGroupMessage,
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

test(".image generates and sends an image through Cloudflare Workers AI", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDryRun = cfg.DRY_RUN;
  const originalAccountId = cfg.CLOUDFLARE_ACCOUNT_ID;
  const originalApiToken = cfg.CLOUDFLARE_API_TOKEN;
  const originalModel = cfg.CLOUDFLARE_IMAGE_MODEL;
  const originalGetCooldown = store.getGroupMemberCommandLastUsedAt;
  const originalMarkCooldown = store.markGroupMemberCommandUsed;
  t.after(() => {
    globalThis.fetch = originalFetch;
    cfg.DRY_RUN = originalDryRun;
    cfg.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
    cfg.CLOUDFLARE_API_TOKEN = originalApiToken;
    cfg.CLOUDFLARE_IMAGE_MODEL = originalModel;
    store.getGroupMemberCommandLastUsedAt = originalGetCooldown;
    store.markGroupMemberCommandUsed = originalMarkCooldown;
  });
  cfg.DRY_RUN = false;
  cfg.CLOUDFLARE_ACCOUNT_ID = "test-account";
  cfg.CLOUDFLARE_API_TOKEN = "test-token";
  cfg.CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
  store.getGroupMemberCommandLastUsedAt = () => 0;
  store.markGroupMemberCommandUsed = () => {};
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => image,
    };
  };

  const messages = [];
  await handleImageCommand({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "user@s.whatsapp.net", "user@s.whatsapp.net", ".image Kucing astronaut");

  assert.deepEqual(requestBody, { prompt: "Kucing astronaut" });
  assert.match(messages[0].text, /Sedang membuat gambar AI/);
  assert.deepEqual(messages[1].image, image);
  assert.equal(messages[1].mimetype, "image/png");
  assert.match(messages[1].caption, /Kucing astronaut/);
});

test(".image works in registered groups", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDryRun = cfg.DRY_RUN;
  const originalModeration = cfg.AUTO_MODERATION_ENABLED;
  const originalAccountId = cfg.CLOUDFLARE_ACCOUNT_ID;
  const originalApiToken = cfg.CLOUDFLARE_API_TOKEN;
  const originalModel = cfg.CLOUDFLARE_IMAGE_MODEL;
  const originalGetGroup = store.getGroup;
  const originalGetCooldown = store.getGroupMemberCommandLastUsedAt;
  const originalMarkCooldown = store.markGroupMemberCommandUsed;
  t.after(() => {
    globalThis.fetch = originalFetch;
    cfg.DRY_RUN = originalDryRun;
    cfg.AUTO_MODERATION_ENABLED = originalModeration;
    cfg.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
    cfg.CLOUDFLARE_API_TOKEN = originalApiToken;
    cfg.CLOUDFLARE_IMAGE_MODEL = originalModel;
    store.getGroup = originalGetGroup;
    store.getGroupMemberCommandLastUsedAt = originalGetCooldown;
    store.markGroupMemberCommandUsed = originalMarkCooldown;
  });
  cfg.DRY_RUN = false;
  cfg.AUTO_MODERATION_ENABLED = false;
  cfg.CLOUDFLARE_ACCOUNT_ID = "test-account";
  cfg.CLOUDFLARE_API_TOKEN = "test-token";
  cfg.CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
  store.getGroup = () => ({ jid: "group@g.us", name: "Grup uji" });
  store.getGroupMemberCommandLastUsedAt = () => 0;
  store.markGroupMemberCommandUsed = () => {};
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => "image/png" },
    arrayBuffer: async () => image,
  });
  const messages = [];

  await handleGroupMessage({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "group@g.us", "12345@s.whatsapp.net", ".image matahari terbit", {}, false);

  assert.equal(messages[0].jid, "group@g.us");
  assert.match(messages[0].text, /Sedang membuat gambar AI/);
  assert.deepEqual(messages[1].image, image);
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

test(".soshumai routes to the dedicated OpenRouter model", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDryRun = cfg.DRY_RUN;
  const originalEnabled = cfg.AI_PROVIDER_CHAT_ENABLED;
  const originalApiKey = cfg.OPENROUTER_API_KEY;
  const originalModel = cfg.OPENROUTER_SOSHUM_MODEL;
  const originalMaxTokens = cfg.OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS;
  const originalMaxChars = cfg.OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS;
  const originalGetCooldown = store.getGroupMemberCommandLastUsedAt;
  const originalMarkCooldown = store.markGroupMemberCommandUsed;
  t.after(() => {
    globalThis.fetch = originalFetch;
    cfg.DRY_RUN = originalDryRun;
    cfg.AI_PROVIDER_CHAT_ENABLED = originalEnabled;
    cfg.OPENROUTER_API_KEY = originalApiKey;
    cfg.OPENROUTER_SOSHUM_MODEL = originalModel;
    cfg.OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS = originalMaxTokens;
    cfg.OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS = originalMaxChars;
    store.getGroupMemberCommandLastUsedAt = originalGetCooldown;
    store.markGroupMemberCommandUsed = originalMarkCooldown;
  });
  cfg.DRY_RUN = false;
  cfg.AI_PROVIDER_CHAT_ENABLED = true;
  cfg.OPENROUTER_API_KEY = "test-openrouter-key";
  cfg.OPENROUTER_SOSHUM_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
  cfg.OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS = 8192;
  cfg.OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS = 60000;
  store.getGroupMemberCommandLastUsedAt = () => 0;
  store.markGroupMemberCommandUsed = () => {};
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "Analisis sosial. ".repeat(300) } }],
      }),
    };
  };
  const messages = [];

  await handleProviderAiChat({
    sendMessage: async (jid, content) => messages.push({ jid, ...content }),
  }, "user@s.whatsapp.net", "user@s.whatsapp.net", ".soshumai Jelaskan urbanisasi");

  assert.equal(requestBody.model, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(requestBody.max_tokens, 8192);
  assert.match(requestBody.messages[0].content, /sosial-humaniora/);
  assert.equal(requestBody.messages[1].content, "Jelaskan urbanisasi");
  assert.equal(messages.length, 2);
  assert.match(messages[0].text, /^Bagian 1\/2\n/);
  assert.match(messages[1].text, /^Bagian 2\/2\n/);
  assert.ok(messages.every((message) => message.text.length <= 3512));
});
