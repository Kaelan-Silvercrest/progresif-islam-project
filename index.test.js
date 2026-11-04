const assert = require("node:assert/strict");
const { test } = require("node:test");
const cfg = require("./config.js");
const store = require("./store.js");
const {
  handleOwnerCommand,
  handleTranslateCommand,
  handleVerificationStatus,
} = require("./index.js");

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
