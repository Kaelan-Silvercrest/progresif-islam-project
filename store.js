/**
 * Penyimpanan berbasis file JSON lokal (data.json), tanpa perlu database.
 *
 * Struktur data:
 *   groups             : { [groupJid]: { name, addedAt } }               -> grup yang terdaftar dipantau
 *   sessions           : { [sessionId]: {...lihat index.js...} }         -> sesi verifikasi (aktif & menunggu review)
 *   activeSessionByNum : { [nomor]: sessionId }                          -> sesi yang SEDANG dijawab orang itu
 *   queueByNumber      : { [nomor]: [{ groupJid, groupName }, ...] }     -> grup lain yang antre untuk nomor itu
 *   seenRequests       : { [`${groupJid}:${nomor}`]: timestamp }         -> anti proses dobel
 *   nextId             : number                                          -> counter ID sesi verifikasi
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");

function defaultData() {
  return {
    groups: {},
    sessions: {},
    activeSessionByNumber: {},
    queueByNumber: {},
    seenRequests: {},
    nextId: 1,
    ownerJid: null,
    lastVerificationAt: 0,
    lastVerificationByNumber: {},
    groupGames: {},
    groupQuizCooldowns: {},
    groupModeration: {},
    groupScores: {},
    groupMemberCommandCooldowns: {},
    groupPolls: {},
    groupPollCooldowns: {},
    monitoringPaused: false,
    ollamaModerationEnabled: null,
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return defaultData();
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    return { ...defaultData(), ...raw };
  } catch (e) {
    console.error("Gagal membaca data.json, mulai dari kosong.", e);
    return defaultData();
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

let data = loadData();

module.exports = {
  // ---- grup terdaftar ----
  addGroup(jid, name) {
    data.groups[jid] = { name, addedAt: Date.now() };
    saveData();
  },
  removeGroup(jid) {
    delete data.groups[jid];
    saveData();
  },
  getGroup(jid) {
    const group = data.groups[jid];
    return group ? { jid, ...group } : null;
  },
  listGroups() {
    // urutan stabil berdasarkan waktu ditambahkan
    return Object.entries(data.groups)
      .map(([jid, g]) => ({ jid, ...g }))
      .sort((a, b) => a.addedAt - b.addedAt);
  },

  // ---- sesi verifikasi ----
  nextSessionId() {
    const id = data.nextId;
    data.nextId += 1;
    saveData();
    return id;
  },
  setSession(id, session) {
    data.sessions[id] = session;
    saveData();
  },
  getSession(id) {
    return data.sessions[id] || null;
  },
  deleteSession(id) {
    delete data.sessions[id];
    saveData();
  },
  getSessionsByStatus(status) {
    return Object.values(data.sessions).filter((s) => s.status === status);
  },
  getAllSessions() {
    return Object.values(data.sessions);
  },
  listQueuedNumbers() {
    return Object.keys(data.queueByNumber);
  },
  hasQueuedGroup(number, groupJid) {
    return (data.queueByNumber[number] || []).some((item) => item.groupJid === groupJid);
  },
  getGroupGame(groupJid) {
    return data.groupGames[groupJid] || null;
  },
  setGroupGame(groupJid, game) {
    data.groupGames[groupJid] = game;
    saveData();
  },
  deleteGroupGame(groupJid) {
    delete data.groupGames[groupJid];
    saveData();
  },
  getGroupQuizLastStartedAt(groupJid) {
    return data.groupQuizCooldowns[groupJid] || 0;
  },
  markGroupQuizStarted(groupJid, timestamp) {
    data.groupQuizCooldowns[groupJid] = timestamp;
    saveData();
  },
  getGroupScore(groupJid, number) {
    return data.groupScores[groupJid]?.[number] || 0;
  },
  addGroupScore(groupJid, number) {
    if (!data.groupScores[groupJid]) data.groupScores[groupJid] = {};
    data.groupScores[groupJid][number] = (data.groupScores[groupJid][number] || 0) + 1;
    saveData();
    return data.groupScores[groupJid][number];
  },
  getGroupLeaderboard(groupJid, limit = 5) {
    return Object.entries(data.groupScores[groupJid] || {})
      .map(([number, score]) => ({ number, score }))
      .sort((a, b) => b.score - a.score || a.number.localeCompare(b.number))
      .slice(0, limit);
  },
  getGroupRank(groupJid, number) {
    const leaderboard = Object.entries(data.groupScores[groupJid] || {})
      .map(([memberNumber, score]) => ({ number: memberNumber, score }))
      .sort((a, b) => b.score - a.score || a.number.localeCompare(b.number));
    const index = leaderboard.findIndex((entry) => entry.number === number);
    return index < 0 ? null : { rank: index + 1, totalMembers: leaderboard.length };
  },
  getGroupMemberCommandLastUsedAt(groupJid, number, command) {
    return data.groupMemberCommandCooldowns[`${groupJid}:${number}:${command}`] || 0;
  },
  markGroupMemberCommandUsed(groupJid, number, command, timestamp) {
    data.groupMemberCommandCooldowns[`${groupJid}:${number}:${command}`] = timestamp;
    saveData();
  },
  getGroupPoll(groupJid) {
    return data.groupPolls[groupJid] || null;
  },
  setGroupPoll(groupJid, poll) {
    data.groupPolls[groupJid] = poll;
    saveData();
  },
  deleteGroupPoll(groupJid) {
    delete data.groupPolls[groupJid];
    saveData();
  },
  getGroupPollLastStartedAt(groupJid) {
    return data.groupPollCooldowns[groupJid] || 0;
  },
  markGroupPollStarted(groupJid, timestamp) {
    data.groupPollCooldowns[groupJid] = timestamp;
    saveData();
  },
  getWarningCount(groupJid, number) {
    return data.groupModeration[groupJid]?.warnings?.[number] || 0;
  },
  addWarning(groupJid, number) {
    if (!data.groupModeration[groupJid]) data.groupModeration[groupJid] = {};
    if (!data.groupModeration[groupJid].warnings) data.groupModeration[groupJid].warnings = {};
    data.groupModeration[groupJid].warnings[number] =
      (data.groupModeration[groupJid].warnings[number] || 0) + 1;
    saveData();
    return data.groupModeration[groupJid].warnings[number];
  },
  clearWarnings(groupJid, number) {
    const warnings = data.groupModeration[groupJid]?.warnings;
    if (!warnings) return;
    delete warnings[number];
    saveData();
  },
  getGroupBan(groupJid, number) {
    return data.groupModeration[groupJid]?.bans?.[number] || null;
  },
  setGroupBan(groupJid, number, record) {
    if (!data.groupModeration[groupJid]) data.groupModeration[groupJid] = {};
    if (!data.groupModeration[groupJid].bans) data.groupModeration[groupJid].bans = {};
    data.groupModeration[groupJid].bans[number] = record;
    saveData();
  },
  removeGroupBan(groupJid, number) {
    const bans = data.groupModeration[groupJid]?.bans;
    if (!bans || !bans[number]) return false;
    delete bans[number];
    saveData();
    return true;
  },
  getGroupBans(groupJid) {
    return Object.entries(data.groupModeration[groupJid]?.bans || {})
      .map(([number, record]) => ({ number, ...record }))
      .sort((a, b) => a.bannedAt - b.bannedAt);
  },
  isMonitoringPaused() {
    return data.monitoringPaused === true;
  },
  setMonitoringPaused(paused) {
    data.monitoringPaused = Boolean(paused);
    saveData();
  },
  getOllamaModerationEnabled(defaultValue = true) {
    return typeof data.ollamaModerationEnabled === "boolean"
      ? data.ollamaModerationEnabled
      : defaultValue;
  },
  setOllamaModerationEnabled(enabled) {
    data.ollamaModerationEnabled = Boolean(enabled);
    saveData();
  },
  resetOllamaModerationEnabled() {
    data.ollamaModerationEnabled = null;
    saveData();
  },

  // ---- sesi aktif per nomor (yang lagi dijawab) ----
  getActiveSessionId(number) {
    return data.activeSessionByNumber[number] || null;
  },
  setActiveSessionId(number, id) {
    data.activeSessionByNumber[number] = id;
    saveData();
  },
  clearActiveSessionId(number) {
    delete data.activeSessionByNumber[number];
    saveData();
  },

  // ---- antrean grup per nomor ----
  pushQueue(number, item) {
    if (!data.queueByNumber[number]) data.queueByNumber[number] = [];
    data.queueByNumber[number].push(item);
    saveData();
  },
  popQueue(number) {
    const q = data.queueByNumber[number];
    if (!q || q.length === 0) return null;
    const item = q.shift();
    if (q.length === 0) delete data.queueByNumber[number];
    saveData();
    return item;
  },
  canSendVerification(number, now, globalCooldownMs, numberCooldownMs) {
    const lastForNumber = data.lastVerificationByNumber[number] || 0;
    return (
      now - data.lastVerificationAt >= globalCooldownMs &&
      now - lastForNumber >= numberCooldownMs
    );
  },
  markVerificationSent(number, timestamp) {
    data.lastVerificationAt = timestamp;
    data.lastVerificationByNumber[number] = timestamp;
    saveData();
  },

  // ---- JID persis owner (nomor biasa ATAU LID, sesuai yang terakhir kedeteksi) ----
  setOwnerJid(jid) {
    data.ownerJid = jid;
    saveData();
  },
  getOwnerJid() {
    return data.ownerJid || null;
  },

  // ---- anti proses dobel untuk permintaan join ----
  hasSeenRequest(key) {
    return Boolean(data.seenRequests[key]);
  },
  markRequestSeen(key) {
    data.seenRequests[key] = Date.now();
    saveData();
  },
  clearSeenRequest(key) {
    delete data.seenRequests[key];
    saveData();
  },
};
