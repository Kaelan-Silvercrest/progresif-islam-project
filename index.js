/**
 * BOT VERIFIKASI ANGGOTA - RONAN COLLAWAY (multi-grup, universal)
 * -------------------------------------------------------------------
 * Fitur inti:
 *   1. Owner (OWNER_NUMBER di config.js) mendaftarkan grup lewat .addgroup
 *      dari chat pribadi ke bot — bot bisa pantau banyak grup sekaligus.
 *   2. Bot mendeteksi permintaan join di semua grup terdaftar, lalu DM
 *      calon anggota untuk menjalani sesi verifikasi dengan kombinasi
 *      pertanyaan yang diacak (beda-beda tiap orang).
 *   3. Tidak ada auto-approve. Semua hasil ditahan & direkap ke owner,
 *      owner memutuskan lewat .approve <id> / .reject <id>.
 *   4. Kalau satu nomor mengajukan join ke >1 grup terdaftar, diantre
 *      supaya jawabannya tidak tercampur antar grup.
 *
 * Menjalankan:
 *   npm install
 *   npm start   -> scan QR pakai nomor yang mau jadi bot
 *
 * CATATAN PENTING (tidak bisa diotomatisasi dari kode, ini aturan WhatsApp):
 *   - Tiap grup yang didaftarkan HARUS sudah mengaktifkan "Perlu disetujui
 *     admin" di setelan grup, dan nomor bot harus jadi admin grup itu.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

const cfg = require("./config.js");
const store = require("./store.js");
const { matchModerationKeywords } = require("./moderation.js");
const { classifyTargetedAbuse, generateChatResponse, getOllamaStatus } = require("./ollama.js");

const logger = pino({ level: "silent" }); // ganti ke "info" untuk debug baileys
const botGeneratedMessageIds = new Set();
let ollamaRequestInFlight = false;
let lastOllamaFailureLogAt = 0;

const jidFromNumber = (num) => `${num}@s.whatsapp.net`;
const numberFromJid = (jid) => jid.split("@")[0].split(":")[0];
const participantTargetJid = (session) =>
  session.participantJid || jidFromNumber(session.number);

// JID owner yang benar untuk dikirimi pesan. Pakai JID persis yang tercatat
// terakhir kali owner chat ke bot (bisa berupa nomor biasa atau LID) kalau
// sudah ada; kalau belum pernah chat sama sekali, fallback ke config.
function ownerTargetJid() {
  return store.getOwnerJid() || jidFromNumber(cfg.OWNER_NUMBER);
}

function canonicalJid(jid) {
  return jid?.replace(/:\d+(?=@)/, "");
}

async function canonicalParticipantJid(sock, jid) {
  if (!jid?.endsWith("@lid")) return jid;
  try {
    return (await sock.signalRepository?.lidMapping?.getPNForLID(jid)) || jid;
  } catch {
    return jid;
  }
}

function isBotSelfChat(sock, jid, fromMe) {
  if (!fromMe) return false;
  return [sock.user?.id, sock.user?.lid]
    .filter(Boolean)
    .some((ownJid) => canonicalJid(ownJid) === canonicalJid(jid));
}

function shouldIgnorePrivateMessage(sock, jid, fromMe) {
  return fromMe && !isBotSelfChat(sock, jid, fromMe);
}

async function privateSenderNumber(sock, remoteJid, remoteJidAlt) {
  const senderJids = [remoteJid, remoteJidAlt].filter(Boolean);
  const configuredOwnerJid = senderJids.find((jid) => numberFromJid(jid) === cfg.OWNER_NUMBER);
  const senderJid = configuredOwnerJid ||
    senderJids.find((jid) => jid.endsWith("@s.whatsapp.net")) ||
    await canonicalParticipantJid(sock, remoteJid);
  return numberFromJid(senderJid);
}

function extractWhatsAppInviteCode(link) {
  try {
    const url = new URL(link.trim());
    if (url.hostname !== "chat.whatsapp.com") return null;
    return url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1] || null;
  } catch {
    return null;
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeKeywordText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function installMessageGuard(sock) {
  const sendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const messageType = content.delete ? "delete" : content.image ? "image" : "text";

    if (cfg.DRY_RUN) {
      console.log(`[SIMULASI] Tidak mengirim ${messageType} ke ${jid}.`);
      return { key: { id: "DRY_RUN", remoteJid: jid } };
    }

    try {
      const result = await sendMessage(jid, content, options);
      if (result?.key?.id) {
        botGeneratedMessageIds.add(result.key.id);
        if (botGeneratedMessageIds.size > 1000) {
          botGeneratedMessageIds.delete(botGeneratedMessageIds.values().next().value);
        }
      }
      console.log(
        `[WA] Baileys menerima permintaan kirim ${messageType} ke ${jid}` +
          `${result?.key?.id ? ` (id ${result.key.id})` : ""}; status terkirim belum dikonfirmasi.`
      );
      return result;
    } catch (error) {
      console.error(`[WA] Gagal meminta pengiriman ${messageType} ke ${jid}:`, error?.message || "error tidak diketahui");
      throw error;
    }
  };
}

function wasBotGeneratedMessage(message) {
  return Boolean(message?.key?.fromMe && botGeneratedMessageIds.delete(message.key.id));
}

let isPollingGroups = false;
const dryRunSeenRequests = new Set();

function buildQuestionSet() {
  const openQuestions = ["identitas", "motivasi", "tujuan"].map((key) => {
    const variant = pickRandom(cfg.OPEN_QUESTION_POOL[key]);
    return { key, text: variant.text, minLength: variant.minLength };
  });
  return { openQuestions };
}

function formatOpenQuestion(session) {
  const idx = session.step;
  const q = session.questionSet.openQuestions[idx];
  const nomor = idx + 1;
  return `${nomor}️⃣ ${q.text.replaceAll("{groupName}", session.groupName)}`;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
  });
  installMessageGuard(sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\nScan QR code ini dengan nomor yang mau dipakai jadi bot:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      console.log("Koneksi terputus. Reconnect?", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("✅ Bot terhubung ke WhatsApp.");
      console.log(`👑 Owner terdaftar: ${cfg.OWNER_NUMBER}`);
      const groups = store.listGroups();
      console.log(`📋 Grup terdaftar saat ini: ${groups.length}`);
      console.log(`🧪 Mode simulasi: ${cfg.DRY_RUN ? "aktif, tidak ada aksi/pesan keluar" : "mati"}`);
      pollAllGroups(sock);
      setInterval(() => pollAllGroups(sock), cfg.POLL_INTERVAL_MS);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return;
    if (wasBotGeneratedMessage(msg)) return;
    if (shouldIgnorePrivateMessage(sock, remoteJid, msg.key.fromMe)) return;

    if (remoteJid.endsWith("@g.us")) {
      if (type !== "notify") return;
      const text = extractText(msg);
      if (text) {
        const senderJid = msg.key.participantPn || msg.key.participantAlt || msg.key.participant;
        await handleGroupMessage(
          sock,
          remoteJid,
          senderJid,
          text.trim(),
          msg,
          isConfiguredOwnerJid(msg.key.participantPn, msg.key.participantAlt, msg.key.participant)
        );
      }
      return;
    }

    if (shouldIgnorePrivateMessage(sock, remoteJid, msg.key.fromMe)) return;

    const senderNumber = await privateSenderNumber(sock, remoteJid, msg.key.remoteJidAlt);
    const text = extractText(msg);
    if (!text) return;

    if (text.trim().toLowerCase() === ".menu") {
      await sock.sendMessage(remoteJid, { text: MENU_TEXT });
      return;
    }

    if (/^\.ai(?:\s|$)/i.test(text.trim())) {
      await handleAiChat(sock, remoteJid, jidFromNumber(senderNumber), text.trim());
      return;
    }

    const isOwner =
      senderNumber === cfg.OWNER_NUMBER || isBotSelfChat(sock, remoteJid, msg.key.fromMe);

    // Simpan JID persis (nomor biasa ATAU LID) yang dipakai owner, supaya semua
    // balasan/notifikasi proaktif ke owner nanti dikirim ke alamat yang benar,
    // apa pun format identifier yang dipakai WhatsApp untuk akun ini.
    if (senderNumber === cfg.OWNER_NUMBER) store.setOwnerJid(remoteJid);

    if (isOwner && text.trim().startsWith(".")) {
      const handled = await handleOwnerCommand(sock, text.trim());
      if (handled) return;
    }

    await handleUserMessage(sock, senderNumber, text.trim());
  });

  sock.ev.on("group-participants.update", async (update) => {
    const group = store.getGroup(update.id);
    if (!group) return;
    console.log(`[GRUP] Event peserta: aksi=${update.action} grup="${group.name}" jumlah=${update.participants?.length || 0}`);
    if (update.action !== "add") return;

    const ownJids = [sock.user?.id, sock.user?.lid].filter(Boolean);
    for (const participant of update.participants || []) {
      const participantJid = participant.id || participant.phoneNumber || participant.lid;
      const participantJids = [participant.id, participant.phoneNumber, participant.lid].filter(Boolean);
      if (!participantJid) continue;
      if (
        ownJids.some((ownJid) =>
          participantJids.some((jid) => numberFromJid(ownJid) === numberFromJid(jid))
        )
      ) continue;

      const mention = `@${numberFromJid(participantJid)}`;
      const text = cfg.GROUP_WELCOME_TEMPLATE(group.name, mention);
      const message = { text, mentions: [participantJid] };

      if (cfg.WELCOME_SHOW_PROFILE_PICTURE) {
        try {
          const imageUrl = await sock.profilePictureUrl(participantJid, "image");
          await sock.sendMessage(update.id, {
            image: { url: imageUrl },
            caption: text,
            mentions: [participantJid],
          });
          continue;
        } catch (err) {
          console.log("Foto profil anggota tidak tersedia; kirim sambutan teks saja.", err?.message || err);
        }
      }

      await sock.sendMessage(update.id, message);
    }
  });
}

function extractText(msg) {
  const m = msg.message;
  return m.conversation || m.extendedTextMessage?.text || null;
}

function isConfiguredOwnerJid(...jids) {
  return jids.filter(Boolean).some((jid) => numberFromJid(jid) === cfg.OWNER_NUMBER);
}

async function getModerationReason(text, fetchImpl = globalThis.fetch) {
  const localReason = matchModerationKeywords(text, cfg);
  const candidate = localReason || matchModerationKeywords(text, {
    ...cfg,
    MODERATION_MATCH_THRESHOLD: 1,
  });
  if (!candidate) return null;

  if (!store.getOllamaModerationEnabled(cfg.OLLAMA_MODERATION_ENABLED)) return localReason;

  const localScore = Number(localReason?.match(/skor (\d+)/i)?.[1] || 0);
  if (localScore >= cfg.OLLAMA_RULE_OVERRIDE_SCORE) return localReason;
  if (ollamaRequestInFlight) return localReason;

  ollamaRequestInFlight = true;
  try {
    const decision = await classifyTargetedAbuse(text, cfg, fetchImpl);
    if (decision.confidence < cfg.OLLAMA_MODERATION_CONFIDENCE_THRESHOLD) return localReason;
    if (!decision.targetedAbuse) return null;
    return `AI moderation: ${decision.category} (confidence ${decision.confidence.toFixed(2)})`;
  } catch (error) {
    if (Date.now() - lastOllamaFailureLogAt >= 60_000) {
      console.warn(`[OLLAMA] Moderation AI unavailable; using local rules: ${error?.message || "error tidak diketahui"}`);
      lastOllamaFailureLogAt = Date.now();
    }
    return localReason;
  } finally {
    ollamaRequestInFlight = false;
  }
}

async function handleAiChat(sock, chatJid, senderJid, text) {
  const prompt = text.replace(/^\.ai\b/i, "").trim();
  if (!prompt) {
    await sock.sendMessage(chatJid, { text: "Format: .ai <pertanyaan>" });
    return;
  }
  if (!cfg.OLLAMA_CHAT_ENABLED) {
    await sock.sendMessage(chatJid, { text: "Chat AI sedang dinonaktifkan." });
    return;
  }
  if (prompt.length > cfg.OLLAMA_CHAT_MAX_PROMPT_CHARS) {
    await sock.sendMessage(chatJid, {
      text: `Pertanyaan terlalu panjang. Maksimal ${cfg.OLLAMA_CHAT_MAX_PROMPT_CHARS} karakter.`,
    });
    return;
  }
  if (cfg.DRY_RUN) {
    console.log(`[SIMULASI] Chat AI diminta di ${chatJid}; prompt tidak dikirim ke Ollama.`);
    return;
  }
  if (ollamaRequestInFlight) {
    await sock.sendMessage(chatJid, { text: "AI sedang menjawab pesan lain; coba lagi sebentar." });
    return;
  }

  const number = numberFromJid(senderJid || chatJid);
  const lastUsed = store.getGroupMemberCommandLastUsedAt(chatJid, number, "ai");
  const cooldownLeft = cfg.OLLAMA_CHAT_COOLDOWN_MS - (Date.now() - lastUsed);
  if (cooldownLeft > 0) {
    await sock.sendMessage(chatJid, {
      text: `Chat AI bisa digunakan lagi sekitar ${Math.ceil(cooldownLeft / 1000)} detik lagi.`,
    });
    return;
  }

  store.markGroupMemberCommandUsed(chatJid, number, "ai", Date.now());
  ollamaRequestInFlight = true;
  try {
    const answer = await generateChatResponse(prompt, cfg);
    await sock.sendMessage(chatJid, { text: answer });
  } catch (error) {
    console.error(`[OLLAMA] Chat gagal (${error?.message || "error tidak diketahui"}).`);
    await sock.sendMessage(chatJid, { text: "Chat AI lokal sedang tidak tersedia. Coba lagi nanti." });
  } finally {
    ollamaRequestInFlight = false;
  }
}

async function handleGroupMessage(sock, groupJid, senderJid, text, message, senderIsOwner) {
  const group = store.getGroup(groupJid);
  if (!group) return;

  const command = text.toLowerCase();
  if (command === ".menu") {
    await sock.sendMessage(groupJid, { text: MENU_TEXT });
    return;
  }

  if (/^\.(kuis|kuisstatus|kuisstop|diskusi|fakta)\b/i.test(text)) {
    await sock.sendMessage(groupJid, {
      text: "Fitur kuis, diskusi, dan fakta sedang dinonaktifkan sementara.",
    });
    return;
  }

  if (await handleGroupModerationCommand(sock, group, senderJid, text, message, senderIsOwner)) return;

  const ownerExempt = senderIsOwner && cfg.MODERATION_OWNER_EXEMPT === true;
  const shouldCheckModeration =
    cfg.AUTO_MODERATION_ENABLED &&
    !ownerExempt &&
    senderJid &&
    !/^\.(saran|lapor)\b/i.test(text);
  const moderationReason = shouldCheckModeration ? await getModerationReason(text) : null;
  if (moderationReason) {
    await moderateMatchedMessage(sock, group, senderJid, message, text, moderationReason);
    return;
  }

  if (/^\.ai(?:\s|$)/i.test(text.trim())) {
    await handleAiChat(sock, groupJid, senderJid, text.trim());
    return;
  }

  if (cfg.DRY_RUN && /^\.(saran|lapor)\b/i.test(text)) {
    console.log(`[SIMULASI] Command ${command.split(/\s+/)[0]} grup="${group.name}"; tidak mengirim laporan/saran atau menyimpan cooldown.`);
    return;
  }

  const memberCommands = [
    ".tebakangka", ".tebakkata", ".tebak", ".jawabkata",
    ".skor", ".topskor", ".profil", ".poll", ".vote",
    ".hasilpoll", ".tutupoll",
    ".jurnal",
  ];
  if (cfg.DRY_RUN && memberCommands.some((name) => command === name || command.startsWith(`${name} `))) {
    console.log(`[SIMULASI] Command grup="${group.name}": ${command.split(/\s+/)[0]}`);
    return;
  }

  if (/^\.saran\b/i.test(text) || /^\.lapor\b/i.test(text)) {
    await handlePrivateGroupFeedback(sock, group, senderJid, text, message);
    return;
  }

  if (command === ".skor") {
    if (!senderJid) return;
    const number = numberFromJid(senderJid);
    await sock.sendMessage(groupJid, {
      text: `🏅 Skor kamu di grup ini: *${store.getGroupScore(groupJid, number)}* poin.`,
      mentions: [senderJid],
    });
    return;
  }

  if (command === ".topskor") {
    const leaders = store.getGroupLeaderboard(groupJid, 5);
    const board = leaders.length
      ? leaders.map((entry, index) => `${index + 1}. @${entry.number} — ${entry.score} poin`).join("\n")
      : "Belum ada skor. Mulai permainan untuk mengumpulkan poin!";
    await sock.sendMessage(groupJid, {
      text: `🏆 *Top skor grup*\n${board}`,
      mentions: leaders.map((entry) => jidFromNumber(entry.number)),
    });
    return;
  }

  if (command === ".profil") {
    if (!senderJid) return;
    const number = numberFromJid(senderJid);
    const score = store.getGroupScore(groupJid, number);
    const standing = store.getGroupRank(groupJid, number);
    await sock.sendMessage(groupJid, {
      text: `👤 Profil permainan @${number}\nPoin: *${score}*${standing ? `\nPeringkat: *#${standing.rank}* dari ${standing.totalMembers} anggota` : "\nBelum punya peringkat; ikuti permainan untuk mulai mengumpulkan poin."}`,
      mentions: [senderJid],
    });
    return;
  }

  if (command === ".jurnal" || command.startsWith(".jurnal ")) {
    await handleJournalSearch(sock, group, senderJid, text);
    return;
  }

  if (command === ".poll" || command.startsWith(".poll ")) {
    await startGroupPoll(sock, group, senderJid, text);
    return;
  }

  if (command === ".vote" || command.startsWith(".vote ")) {
    await castGroupPollVote(sock, groupJid, senderJid, text);
    return;
  }

  if (command === ".hasilpoll") {
    const poll = store.getGroupPoll(groupJid);
    await sock.sendMessage(groupJid, {
      text: poll ? formatGroupPollResults(poll) : "Belum ada polling di grup ini.",
    });
    return;
  }

  if (command === ".tutupoll") {
    await closeGroupPoll(sock, group, senderJid, senderIsOwner);
    return;
  }

  if ([".tebakangka", ".tebakkata"].includes(command)) {
    let currentGame = store.getGroupGame(groupJid);
    if (currentGame?.type === "quiz" || currentGame?.correctLetter) {
      store.deleteGroupGame(groupJid);
      currentGame = null;
    }
    if (currentGame && currentGame.expiresAt > Date.now()) {
      await sock.sendMessage(groupJid, {
        text: `${formatGameName(currentGame.type)} masih berlangsung dan berakhir otomatis setelah 2 menit.`,
      });
      return;
    }
    if (currentGame) store.deleteGroupGame(groupJid);

    const cooldownLeft =
      cfg.GROUP_GAME_COOLDOWN_MS -
      (Date.now() - store.getGroupQuizLastStartedAt(groupJid));
    if (cooldownLeft > 0) {
      await sock.sendMessage(groupJid, {
        text: `Permainan grup sedang cooldown. Coba lagi sekitar ${Math.ceil(cooldownLeft / 60_000)} menit lagi.`,
      });
      return;
    }

    const game = createGroupGame(command);
    store.setGroupGame(groupJid, game);
    store.markGroupQuizStarted(groupJid, Date.now());
    await sock.sendMessage(groupJid, {
      text: formatNewGameMessage(game),
    });
    return;
  }

  const game = store.getGroupGame(groupJid);
  if (!game || game.expiresAt <= Date.now()) {
    if (game) store.deleteGroupGame(groupJid);
    return;
  }

  await handleGameAnswer(sock, group, senderJid, command, game);
}

async function startGroupPoll(sock, group, senderJid, text) {
  const groupJid = group.jid;
  const currentPoll = store.getGroupPoll(groupJid);
  if (currentPoll && !currentPoll.closedAt && currentPoll.expiresAt > Date.now()) {
    await sock.sendMessage(groupJid, { text: "Polling masih aktif. Gunakan .hasilpoll untuk melihat hasil sementara." });
    return;
  }

  const body = text.replace(/^\.poll\b/i, "").trim();
  const separatorIndex = body.indexOf("|");
  if (separatorIndex < 0) {
    await sock.sendMessage(groupJid, {
      text: ".poll <pertanyaan> | <opsi 1>; <opsi 2> [; opsi 3...]",
    });
    return;
  }

  const question = body.slice(0, separatorIndex).trim();
  const options = body.slice(separatorIndex + 1).split(";").map((option) => option.trim()).filter(Boolean);
  const normalizedOptions = options.map(normalizeKeywordText);
  const hasDuplicateOptions = new Set(normalizedOptions).size !== normalizedOptions.length;
  if (
    !question || question.length > 180 ||
    options.length < cfg.GROUP_POLL_MIN_OPTIONS ||
    options.length > cfg.GROUP_POLL_MAX_OPTIONS ||
    options.some((option) => option.length > 60) ||
    hasDuplicateOptions
  ) {
    await sock.sendMessage(groupJid, {
      text: `Polling perlu pertanyaan (maks. 180 karakter) dan ${cfg.GROUP_POLL_MIN_OPTIONS}-${cfg.GROUP_POLL_MAX_OPTIONS} opsi unik (maks. 60 karakter per opsi).`,
    });
    return;
  }

  const cooldownLeft =
    cfg.GROUP_POLL_COOLDOWN_MS -
    (Date.now() - store.getGroupPollLastStartedAt(groupJid));
  if (cooldownLeft > 0) {
    await sock.sendMessage(groupJid, {
      text: `Polling baru bisa dibuat sekitar ${Math.ceil(cooldownLeft / 60_000)} menit lagi.`,
    });
    return;
  }

  const poll = {
    question,
    options,
    votes: {},
    creatorNumber: senderJid ? numberFromJid(senderJid) : null,
    createdAt: Date.now(),
    expiresAt: Date.now() + cfg.GROUP_POLL_DURATION_MS,
    closedAt: null,
  };
  store.setGroupPoll(groupJid, poll);
  store.markGroupPollStarted(groupJid, poll.createdAt);
  await sock.sendMessage(groupJid, { text: formatGroupPoll(poll) });
}

function formatGroupPoll(poll) {
  const options = poll.options.map((option, index) => `${index + 1}. ${option}`).join("\n");
  const remainingMinutes = Math.max(1, Math.ceil((poll.expiresAt - Date.now()) / 60_000));
  return `📊 *Polling grup*\n${poll.question}\n\n${options}\n\nPilih dengan *.vote <nomor>*. Satu suara per orang; suara dapat diubah. Berakhir dalam sekitar ${remainingMinutes} menit.`;
}

function formatGroupPollResults(poll) {
  const counts = poll.options.map(() => 0);
  for (const vote of Object.values(poll.votes || {})) {
    if (Number.isInteger(vote) && vote >= 0 && vote < counts.length) counts[vote] += 1;
  }
  const totalVotes = counts.reduce((sum, count) => sum + count, 0);
  const options = poll.options
    .map((option, index) => `${index + 1}. ${option} — ${counts[index]} suara`)
    .join("\n");
  const closed = poll.closedAt || poll.expiresAt <= Date.now();
  return `📊 *${closed ? "Hasil polling" : "Hasil sementara"}*\n${poll.question}\n\n${options}\n\nTotal suara: ${totalVotes}${closed ? " (ditutup)" : ""}`;
}

async function castGroupPollVote(sock, groupJid, senderJid, text) {
  const poll = store.getGroupPoll(groupJid);
  if (!poll) {
    await sock.sendMessage(groupJid, { text: "Belum ada polling aktif. Buat dengan .poll <pertanyaan> | opsi 1; opsi 2." });
    return;
  }
  if (poll.closedAt || poll.expiresAt <= Date.now()) {
    if (!poll.closedAt) {
      poll.closedAt = poll.expiresAt;
      store.setGroupPoll(groupJid, poll);
    }
    await sock.sendMessage(groupJid, { text: "Polling sudah ditutup. Gunakan .hasilpoll untuk melihat hasil." });
    return;
  }
  const match = text.trim().match(/^\.vote\s+(\d+)$/i);
  if (!match || !senderJid) {
    await sock.sendMessage(groupJid, { text: `Format: .vote <1-${poll.options.length}>` });
    return;
  }
  const optionIndex = Number(match[1]) - 1;
  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    await sock.sendMessage(groupJid, { text: `Pilih nomor opsi 1-${poll.options.length}.` });
    return;
  }

  const number = numberFromJid(senderJid);
  const previousVote = poll.votes[number];
  poll.votes[number] = optionIndex;
  store.setGroupPoll(groupJid, poll);
  await sock.sendMessage(groupJid, {
    text: previousVote === undefined
      ? `Suara kamu tercatat untuk opsi ${optionIndex + 1}.`
      : previousVote === optionIndex
        ? `Suaramu tetap di opsi ${optionIndex + 1}.`
        : `Suaramu diperbarui ke opsi ${optionIndex + 1}.`,
    mentions: [senderJid],
  });
}

async function closeGroupPoll(sock, group, senderJid, senderIsOwner) {
  const poll = store.getGroupPoll(group.jid);
  if (!poll || poll.closedAt) {
    await sock.sendMessage(group.jid, { text: "Tidak ada polling aktif yang bisa ditutup." });
    return;
  }
  const senderNumber = senderJid ? numberFromJid(senderJid) : null;
  const canClose =
    senderIsOwner ||
    senderNumber === poll.creatorNumber ||
    (await isGroupAdmin(sock, group.jid, senderJid));
  if (!canClose) {
    await sock.sendMessage(group.jid, { text: "Hanya pembuat polling, admin grup, atau owner yang bisa menutup polling." });
    return;
  }
  poll.closedAt = Date.now();
  store.setGroupPoll(group.jid, poll);
  await sock.sendMessage(group.jid, { text: formatGroupPollResults(poll) });
}

async function searchJournalArticles(
  query,
  fetchImpl = globalThis.fetch,
  maxResults = cfg.JOURNAL_SEARCH_MAX_RESULTS
) {
  const resultLimit = Math.min(100, Math.max(1, Number(maxResults) || 20));
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query.bibliographic", query);
  endpoint.searchParams.set("filter", "type:journal-article");
  endpoint.searchParams.set("rows", String(Math.min(100, Math.max(30, resultLimit * 3))));
  endpoint.searchParams.set("select", "DOI,title,URL,type,container-title");

  const userAgent = cfg.CROSSREF_CONTACT_EMAIL
    ? `Ronan-Collaway-Bot/1.0.0 (mailto:${cfg.CROSSREF_CONTACT_EMAIL})`
    : "Ronan-Collaway-Bot/1.0.0";
  const response = await fetchImpl(endpoint, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(cfg.JOURNAL_SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);

  const payload = await response.json();
  const items = payload?.message?.items;
  if (!Array.isArray(items)) throw new Error("Respons metadata Crossref tidak valid");

  const seen = new Set();
  const results = [];
  for (const item of items) {
    if (item.type !== "journal-article") continue;
    const title = String(item.title?.[0] || "").replace(/[\r\n]+/g, " ").trim().slice(0, 600);
    if (!title) continue;

    const doi = String(item.DOI || "").trim();
    const key = doi.toLowerCase() || title.toLowerCase();
    if (seen.has(key)) continue;

    let link = "";
    if (/^10\.\d{4,9}\/\S+$/i.test(doi)) {
      link = `https://doi.org/${encodeURI(doi)}`;
    } else if (item.URL) {
      try {
        const url = new URL(item.URL);
        if (url.protocol === "https:") link = url.toString();
      } catch {
        link = "";
      }
    }
    if (!link) continue;

    seen.add(key);
    results.push({ title, link });
    if (results.length === resultLimit) break;
  }
  return results;
}

function chunkJournalResults(results, maxChars = cfg.JOURNAL_SEARCH_OUTPUT_CHUNK_CHARS) {
  const chunks = [];
  let current = "";
  const limit = Math.max(500, Number(maxChars) || 3000);

  for (const result of results) {
    const entry = `${result.index}. ${result.title}\n${result.link}`;
    if (current && current.length + entry.length + 2 > limit) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${entry}` : entry;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function handleJournalSearch(sock, group, senderJid, text) {
  const groupJid = group.jid;
  const query = text.replace(/^\.jurnal\b/i, "").trim();
  if (!cfg.JOURNAL_SEARCH_ENABLED) {
    await sock.sendMessage(groupJid, { text: "Pencarian jurnal sedang dinonaktifkan." });
    return;
  }
  if (!query || query.length > cfg.JOURNAL_SEARCH_MAX_QUERY_LENGTH) {
    await sock.sendMessage(groupJid, {
      text: `.jurnal <topik atau kata kunci> (maksimal ${cfg.JOURNAL_SEARCH_MAX_QUERY_LENGTH} karakter)`,
    });
    return;
  }
  if (cfg.DRY_RUN) {
    console.log(`[SIMULASI] Pencarian jurnal diminta di grup "${group.name}"; query tidak diteruskan dan tidak ada API eksternal dipanggil.`);
    return;
  }
  if (!senderJid) return;

  const number = numberFromJid(senderJid);
  const lastUsed = store.getGroupMemberCommandLastUsedAt(groupJid, number, "jurnal");
  const cooldownLeft = cfg.JOURNAL_SEARCH_COOLDOWN_MS - (Date.now() - lastUsed);
  if (cooldownLeft > 0) {
    await sock.sendMessage(groupJid, {
      text: `Pencarian jurnal bisa digunakan lagi sekitar ${Math.ceil(cooldownLeft / 1000)} detik lagi.`,
    });
    return;
  }

  store.markGroupMemberCommandUsed(groupJid, number, "jurnal", Date.now());
  try {
    const results = await searchJournalArticles(query);
    if (!results.length) {
      await sock.sendMessage(groupJid, { text: "Tidak menemukan artikel jurnal yang cocok. Coba kata kunci lain." });
      return;
    }
    const chunks = chunkJournalResults(
      results.map((result, index) => ({ ...result, index: index + 1 }))
    );
    for (let index = 0; index < chunks.length; index += 1) {
      await sock.sendMessage(groupJid, {
        text: `📚 *Hasil pencarian jurnal (${index + 1}/${chunks.length})*\n${chunks[index]}`,
      });
    }
  } catch (error) {
    console.error(`[JURNAL] Pencarian gagal (${error?.message || "kesalahan tidak diketahui"}).`);
    await sock.sendMessage(groupJid, { text: "Pencarian jurnal sedang bermasalah. Coba lagi nanti." });
  }
}

function createGroupGame(command) {
  const expiresAt = Date.now() + 2 * 60 * 1000;
  if (command === ".tebakangka") {
    return {
      type: "number",
      answer: Math.floor(Math.random() * 50) + 1,
      attemptsRemaining: 6,
      expiresAt,
    };
  }
  return {
    type: "word",
    ...pickRandom(cfg.WORD_GAME_BANK),
    attempts: 0,
    maxAttempts: 20,
    expiresAt,
  };
}

function formatGameName(type) {
  return ({ number: "Tebak angka", word: "Tebak kata" })[type] || "Permainan";
}

function formatNewGameMessage(game) {
  if (game.type === "number") {
    return `🔢 Tebak angka 1-50 dimulai! Kamu punya 2 menit dan 6 kesempatan. Jawab dengan *.tebak <angka>*. Bot memberi petunjuk besar/kecil tanpa membocorkan angka rahasia.`;
  }
  return `🔤 Tebak kata dimulai!\nPetunjuk: ${game.hint}\n\nJawab dengan *.jawabkata <kata>*. Ronde berlaku 2 menit.`;
}

async function handleGameAnswer(sock, group, senderJid, command, game) {
  if (!senderJid) return;
  const groupJid = group.jid;
  const number = numberFromJid(senderJid);
  let won = false;
  let answerText = "";

  if (game.type === "number") {
    const match = command.match(/^\.tebak\s+(\d{1,2})$/);
    if (!match) return;
    const guess = Number(match[1]);
    if (guess < 1 || guess > 50) return;
    if (guess === game.answer) {
      won = true;
      answerText = `Angka rahasianya *${game.answer}*!`;
    } else {
      game.attemptsRemaining -= 1;
      if (game.attemptsRemaining <= 0) {
        store.deleteGroupGame(groupJid);
        await sock.sendMessage(groupJid, { text: `Ronde selesai. Angka rahasianya *${game.answer}*.` });
        return;
      }
      await sock.sendMessage(groupJid, {
        text: `Tebakan itu ${guess < game.answer ? "terlalu kecil" : "terlalu besar"}. Kesempatan tersisa: ${game.attemptsRemaining}.`,
      });
      store.setGroupGame(groupJid, game);
      return;
    }
  } else if (game.type === "word") {
    const match = command.match(/^\.jawabkata\s+(.+)$/);
    if (!match) return;
    if (normalizeKeywordText(match[1]) === normalizeKeywordText(game.word)) {
      won = true;
      answerText = `Kata yang dicari adalah *${game.word}*!`;
    } else {
      game.attempts += 1;
      if (game.attempts >= game.maxAttempts) {
        store.deleteGroupGame(groupJid);
        await sock.sendMessage(groupJid, { text: `Ronde selesai. Kata yang dicari: *${game.word}*.` });
        return;
      }
      store.setGroupGame(groupJid, game);
      return;
    }
  }

  if (!won) return;
  store.deleteGroupGame(groupJid);
  const score = store.addGroupScore(groupJid, number);
  await sock.sendMessage(groupJid, {
    text: `🎉 Benar, @${number}! ${answerText} (+1 poin; total ${score}).`,
    mentions: [senderJid],
  });
}

async function handlePrivateGroupFeedback(sock, group, senderJid, text, message) {
  if (!senderJid) return;
  if (cfg.DRY_RUN) {
    console.log(`[SIMULASI] Feedback grup "${group.name}" tidak diteruskan dan tidak disimpan.`);
    return;
  }
  const isSuggestion = /^\.saran\b/i.test(text);
  const command = isSuggestion ? "saran" : "lapor";
  const body = text.replace(/^\.(saran|lapor)\b/i, "").trim();
  const cooldown = cfg.GROUP_MEMBER_COMMAND_COOLDOWN_MS;
  const lastUsed = store.getGroupMemberCommandLastUsedAt(group.jid, numberFromJid(senderJid), command);
  const cooldownLeft = cooldown - (Date.now() - lastUsed);
  if (cooldownLeft > 0) {
    await sock.sendMessage(group.jid, {
      text: `Command .${command} bisa dipakai lagi sekitar ${Math.ceil(cooldownLeft / 1000)} detik lagi.`,
    });
    return;
  }

  let details = body;
  if (!isSuggestion) {
    const targetJid = parseModerationTarget(body, message);
    if (!targetJid) {
      await sock.sendMessage(group.jid, { text: "Format laporan: .lapor @anggota [alasan]" });
      return;
    }
    details = body
      .replace(/@\d{5,20}/g, " ")
      .replace(/\+?\d{5,20}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    details = `Target: ${numberFromJid(targetJid)}\nAlasan: ${details || "Tidak diberikan"}`;
  }
  if (!details) {
    await sock.sendMessage(group.jid, { text: isSuggestion ? "Format saran: .saran <isi saran>" : "Tambahkan alasan singkat setelah mention." });
    return;
  }

  const now = Date.now();
  store.markGroupMemberCommandUsed(group.jid, numberFromJid(senderJid), command, now);
  console.log(`[GRUP] ${command} privat diteruskan ke owner dari grup "${group.name}".`);
  await sock.sendMessage(ownerTargetJid(), {
    text: `${isSuggestion ? "💡 Saran anggota" : "🚩 Laporan anggota"}\nGrup: ${group.name}\nPengirim: ${numberFromJid(senderJid)}\n${details}`,
  });
  await sock.sendMessage(group.jid, {
    text: `${isSuggestion ? "Saran" : "Laporan"} sudah diteruskan secara privat ke owner.`,
  });
}

async function isGroupAdmin(sock, groupJid, participantJid) {
  if (!participantJid) return false;
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const participantNumber = numberFromJid(participantJid);
    const member = metadata.participants.find((entry) =>
      [entry.id, entry.phoneNumber, entry.lid]
        .filter(Boolean)
        .some((jid) => jid === participantJid || numberFromJid(jid) === participantNumber)
    );
    return member?.admin === "admin" || member?.admin === "superadmin";
  } catch (error) {
    console.error(`[GRUP] Gagal cek admin grup ${groupJid}:`, error?.message || "error tidak diketahui");
    return false;
  }
}

function parseModerationTarget(args, message) {
  const mentions =
    message?.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    message?.message?.imageMessage?.contextInfo?.mentionedJid ||
    [];
  if (mentions[0]) return mentions[0];

  const numberMatch = args.match(/\+?\d{5,20}/);
  return numberMatch ? jidFromNumber(numberMatch[0].replace(/\D/g, "")) : null;
}

async function resolveGroupParticipantJid(sock, groupJid, targetJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const target = canonicalJid(targetJid);
    const participant = metadata.participants.find((entry) =>
      [entry.id, entry.phoneNumber, entry.lid]
        .filter(Boolean)
        .some((jid) => canonicalJid(jid) === target)
    );
    return participant?.phoneNumber || participant?.id || participant?.lid || targetJid;
  } catch (error) {
    console.warn(`[MOD] Tidak bisa mencocokkan identitas target di ${groupJid}:`, error?.message || "error tidak diketahui");
    return targetJid;
  }
}

function isProtectedModerationTarget(sock, participantJid) {
  const ownJids = [sock.user?.id, sock.user?.lid].filter(Boolean);
  return (
    isConfiguredOwnerJid(participantJid) ||
    ownJids.some((jid) => numberFromJid(jid) === numberFromJid(participantJid))
  );
}

function ensureParticipantActionSucceeded(results, action) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`${action} tidak mengembalikan status anggota dari WhatsApp`);
  }
  const failures = results.filter((result) => result.status !== "200");
  if (failures.length) {
    throw new Error(`${action} gagal untuk ${failures.map((result) => `${result.jid || "anggota"} (status ${result.status})`).join(", ")}`);
  }
}

async function handleGroupModerationCommand(sock, group, senderJid, text, message, senderIsOwner) {
  const commandMatch = text.match(/^\.(kick|warn|ban|unban|warnings)\b\s*(.*)$/i);
  if (!commandMatch) return false;

  const [, command, args] = commandMatch;
  if (!senderIsOwner) {
    console.warn(`[MOD] Command .${command.toLowerCase()} diabaikan: pengirim bukan owner terdaftar.`);
    return true;
  }

  const requestedTargetJid = parseModerationTarget(args, message);
  if (!requestedTargetJid) {
    await sock.sendMessage(group.jid, {
      text: `Format: .${command.toLowerCase()} @anggota [alasan]`,
    });
    return true;
  }
  const targetJid = await resolveGroupParticipantJid(sock, group.jid, requestedTargetJid);
  if (isProtectedModerationTarget(sock, targetJid)) {
    await sock.sendMessage(group.jid, { text: "Aksi moderasi untuk owner atau akun bot ditolak." });
    return true;
  }

  const number = numberFromJid(targetJid);
  const reason = args
    .replace(/@\d{5,20}/g, " ")
    .replace(/\+?\d{5,20}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const action = command.toLowerCase();

  if (cfg.DRY_RUN && action !== "warnings") {
    console.log(`[SIMULASI][MOD] Owner meminta .${action} target=${targetJid} grup="${group.name}"; tidak ada tindakan atau perubahan warning/ban.`);
    return true;
  }

  if (action === "warnings") {
    const count = store.getWarningCount(group.jid, number);
    await sock.sendMessage(group.jid, {
      text: `Anggota @${number} memiliki ${count}/${cfg.MAX_WARNINGS_BEFORE_KICK} peringatan.`,
      mentions: [targetJid],
    });
    return true;
  }

  if (action === "warn") {
    await issueWarning(sock, group, targetJid, reason, "manual");
    return true;
  }

  if (action === "kick" || action === "ban") {
    if (action === "ban") {
      store.setGroupBan(group.jid, number, {
        participantJid: targetJid,
        reason,
        bannedAt: Date.now(),
      });
    }
    try {
      const results = await sock.groupParticipantsUpdate(group.jid, [targetJid], "remove");
      ensureParticipantActionSucceeded(results, action);
      const label = action === "ban" ? "diblokir dan dikeluarkan" : "dikeluarkan";
      console.log(`[MOD] ${number} ${label} dari grup "${group.name}" oleh owner.`);
      await sock.sendMessage(group.jid, {
        text: `Anggota @${number} ${label}${reason ? `: ${reason}` : "."}`,
        mentions: [targetJid],
      });
    } catch (error) {
      console.error(`[MOD] Gagal ${action} ${number} dari grup "${group.name}":`, error?.message || "error tidak diketahui");
      await sock.sendMessage(group.jid, {
        text: `Gagal ${action} @${number}. Pastikan bot admin grup dan target bukan admin.`,
        mentions: [targetJid],
      });
    }
    return true;
  }

  if (action === "unban") {
    const removed = store.removeGroupBan(group.jid, number);
    if (removed) {
      store.clearWarnings(group.jid, number);
      store.clearSeenRequest(`${group.jid}:${number}`);
    }
    await sock.sendMessage(group.jid, {
      text: removed ? `Ban untuk @${number} di grup ini sudah dicabut.` : `@${number} tidak ada dalam daftar ban grup ini.`,
      mentions: [targetJid],
    });
    return true;
  }

  return true;
}

async function issueWarning(sock, group, participantJid, reason, source) {
  const number = numberFromJid(participantJid);
  const warningCount = store.getWarningCount(group.jid, number) + 1;
  const shouldRemove = warningCount >= cfg.MAX_WARNINGS_BEFORE_KICK;
  console.log(
    `[MOD] Peringatan ${warningCount}/${cfg.MAX_WARNINGS_BEFORE_KICK} untuk ${number} ` +
      `di "${group.name}" (sumber=${source}).${shouldRemove ? " Batas tercapai; mengeluarkan anggota." : ""}`
  );

  await sock.sendMessage(group.jid, {
    text: `⚠️ @${number}, peringatan ${warningCount}/${cfg.MAX_WARNINGS_BEFORE_KICK}${reason ? ` (${reason})` : ""}.` +
      (shouldRemove ? " Batas peringatan tercapai; anggota akan dikeluarkan." : ""),
    mentions: [participantJid],
  });
  store.addWarning(group.jid, number);

  if (!shouldRemove || cfg.MODERATION_KICK_ON_THRESHOLD === false) return;
  try {
    const results = await sock.groupParticipantsUpdate(group.jid, [participantJid], "remove");
    ensureParticipantActionSucceeded(results, "kick");
    await sock.sendMessage(group.jid, {
      text: `@${number} dikeluarkan setelah mencapai batas peringatan.`,
      mentions: [participantJid],
    });
  } catch (error) {
    console.error(`[MOD] Gagal mengeluarkan ${number} setelah warning:`, error?.message || "error tidak diketahui");
  }
}

async function moderateMatchedMessage(sock, group, senderJid, message, text, reason) {
  if (!reason) return;

  if (cfg.MODERATION_ADMIN_EXEMPT && await isGroupAdmin(sock, group.jid, senderJid)) return;

  if (cfg.DRY_RUN) {
    console.log(`[SIMULASI][MOD] Pesan cocok aturan ${reason} di grup "${group.name}" dari ${senderJid}; rencana: hapus pesan dan beri warning.`);
    return;
  }

  if (cfg.MODERATION_DELETE_MATCHED_MESSAGES !== false && message?.key) {
    try {
      await sock.sendMessage(group.jid, { delete: message.key });
    } catch (error) {
      console.error(`[MOD] Gagal menghapus pesan di "${group.name}":`, error?.message || "error tidak diketahui");
    }
  }
  if (cfg.MODERATION_WARN_ON_MATCH !== false) {
    await issueWarning(sock, group, senderJid, reason, "sensor otomatis");
  }
}

// =========================================================================
// POLLING PERMINTAAN JOIN DI SEMUA GRUP TERDAFTAR
// =========================================================================

async function pollAllGroups(sock) {
  if (store.isMonitoringPaused()) return;
  if (isPollingGroups) return;
  isPollingGroups = true;

  try {
    if (cfg.DRY_RUN) {
      for (const group of store.listGroups()) {
        try {
          const pending = await sock.groupRequestParticipantsList(group.jid);
          for (const request of pending) {
            const key = `${group.jid}:${request.jid}`;
            if (dryRunSeenRequests.has(key)) continue;
            dryRunSeenRequests.add(key);
            console.log(
              `[SIMULASI] Permintaan join terdeteksi: grup="${group.name}" ` +
                `peserta=${request.jid}; tidak membuat sesi atau mengirim DM.`
            );
          }
        } catch (error) {
          console.error(`[POLL] Gagal membaca permintaan grup "${group.name}":`, error?.message || "error tidak diketahui");
        }
      }
      return;
    }

    cleanupExpiredSessions();
    await processQueuedVerifications(sock);

    const groups = store.listGroups();
    for (const g of groups) {
      try {
        const pending = await sock.groupRequestParticipantsList(g.jid);
        for (const req of pending) {
          const requestJid = req.jid;
          if (!requestJid) continue;
          const participantJid = await canonicalParticipantJid(sock, requestJid);
          const number = numberFromJid(participantJid);
          const requestNumber = numberFromJid(requestJid);
          const seenKey = `${g.jid}:${number}`;
          const legacySeenKey = `${g.jid}:${requestNumber}`;

          const banRecord = store.getGroupBan(g.jid, number) ||
            (requestNumber !== number ? store.getGroupBan(g.jid, requestNumber) : null);
          if (banRecord) {
            const retryAfterMs = cfg.POLL_INTERVAL_MS;
            if (!banRecord.lastRejectedAt || Date.now() - banRecord.lastRejectedAt >= retryAfterMs) {
              try {
                const results = await sock.groupRequestParticipantsUpdate(g.jid, [requestJid], "reject");
                ensureParticipantActionSucceeded(results, "reject permintaan join");
                store.setGroupBan(g.jid, number, { ...banRecord, lastRejectedAt: Date.now() });
                console.log(`[MOD] Permintaan join ${number} ditolak karena diblokir di "${g.name}".`);
              } catch (error) {
                console.error(`[MOD] Gagal menolak permintaan join terblokir ${number}:`, error?.message || "error tidak diketahui");
              }
            }
            continue;
          }

          const sessions = store.getAllSessions().filter((item) =>
            ["menunggu_mulai", "tanya_open", "tanya_kuis", "menunggu_review"].includes(item.status)
          );
          let session = sessions.find((item) =>
            item.number === number || item.number === requestNumber || item.participantJid === requestJid
          );
          if (!session) {
            for (const item of sessions) {
              if (!item.participantJid) continue;
              if (numberFromJid(await canonicalParticipantJid(sock, item.participantJid)) === number) {
                session = item;
                break;
              }
            }
          }

          if (session && (
            session.number !== number ||
            !session.participantJid ||
            session.participantJid !== participantJid
          )) {
            const wasActive = store.getActiveSessionId(session.number) === session.id;
            if (wasActive && session.number !== number) store.clearActiveSessionId(session.number);
            session.number = number;
            session.participantJid = participantJid;
            store.setSession(session.id, session);
            if (wasActive) store.setActiveSessionId(number, session.id);
          }

          if (store.hasSeenRequest(seenKey) || store.hasSeenRequest(legacySeenKey)) continue;
          const handled = await onNewJoinRequest(sock, number, participantJid, g.jid, g.name);
          if (handled) {
            store.markRequestSeen(seenKey);
            if (legacySeenKey !== seenKey) store.markRequestSeen(legacySeenKey);
          }
        }
      } catch (err) {
        console.error(
          `Gagal cek permintaan join grup "${g.name}" (${g.jid}). Pastikan bot masih admin & mode approve aktif.`,
          err?.message || err
        );
      }
    }
  } finally {
    isPollingGroups = false;
  }
}

async function processQueuedVerifications(sock) {
  for (const number of store.listQueuedNumbers()) {
    if (hasOutstandingSession(number)) continue;
    const next = store.popQueue(number);
    if (!next) continue;

    const started = await startVerificationSession(
      sock,
      number,
      next.participantJid || jidFromNumber(number),
      next.groupJid,
      next.groupName
    );
    if (!started) store.pushQueue(number, next);
    else return;
  }
}

async function onNewJoinRequest(sock, number, participantJid, groupJid, groupName) {
  const existingSession = store.getAllSessions().find(
    (session) =>
      session.number === number &&
      ["menunggu_mulai", "tanya_open", "tanya_kuis", "menunggu_review"].includes(session.status)
  );

  if (existingSession?.groupJid === groupJid) {
    if (!existingSession.participantJid) {
      existingSession.participantJid = participantJid;
      store.setSession(existingSession.id, existingSession);
    }
    return true;
  }

  if (existingSession || store.hasQueuedGroup(number, groupJid)) {
    if (!store.hasQueuedGroup(number, groupJid)) {
      store.pushQueue(number, { participantJid, groupJid, groupName });
    }
    return true;
  }

  return startVerificationSession(sock, number, participantJid, groupJid, groupName);
}

function hasOutstandingSession(number) {
  return store.getAllSessions().some(
    (session) =>
      session.number === number &&
      ["menunggu_mulai", "tanya_open", "tanya_kuis", "menunggu_review"].includes(session.status)
  );
}

async function startVerificationSession(sock, number, participantJid, groupJid, groupName) {
  const now = Date.now();
  if (
    !store.canSendVerification(
      number,
      now,
      cfg.VERIFICATION_GLOBAL_COOLDOWN_MS,
      cfg.VERIFICATION_NUMBER_COOLDOWN_MS
    )
  ) {
    return false;
  }

  const id = store.nextSessionId();
  const session = {
    id,
    groupJid,
    groupName,
    number,
    participantJid,
    status: "menunggu_mulai",
    answers: {},
    step: 0,
    createdAt: Date.now(),
    questionSet: buildQuestionSet(),
  };
  store.setSession(id, session);
  store.setActiveSessionId(number, id);
  store.markVerificationSent(number, now);

  await sock.sendMessage(participantJid, { text: cfg.WELCOME_TEMPLATE(groupName) });
  console.log(`📨 [#${id}] Verifikasi dimulai untuk ${number} -> grup "${groupName}"`);
  return true;
}

// Bersihkan sesi yang kelamaan nggak dijawab, biar antrean orang itu jalan lagi.
function cleanupExpiredSessions() {
  const now = Date.now();
  const activeStatuses = ["menunggu_mulai", "tanya_open", "tanya_kuis"];

  for (const session of store.getAllSessions()) {
    if (!activeStatuses.includes(session.status)) continue;
    if (now - session.createdAt < cfg.SESSION_TIMEOUT_MS) continue;

    console.log(`⌛ [#${session.id}] Sesi ${session.number} kedaluwarsa, dibersihkan.`);
    store.deleteSession(session.id);
    store.clearActiveSessionId(session.number);
    store.clearSeenRequest(`${session.groupJid}:${session.number}`);

  }
}

// =========================================================================
// STATE MACHINE PERCAKAPAN VERIFIKASI (per nomor, lewat sesi aktifnya)
// =========================================================================

async function handleUserMessage(sock, number, text) {
  const sessionId = store.getActiveSessionId(number);
  if (!sessionId) return; // bukan bagian dari flow verifikasi manapun saat ini

  const session = store.getSession(sessionId);
  if (!session) {
    store.clearActiveSessionId(number);
    return;
  }
  const recipientJid = participantTargetJid(session);

  if (["menunggu_mulai", "tanya_open"].includes(session.status)) {
    const questionKeys = session.questionSet?.openQuestions?.map((question) => question.key).join(":");
    if (questionKeys !== "identitas:motivasi:tujuan") {
      session.answers.tujuan ||= session.answers.minat;
      delete session.answers.minat;
      session.questionSet = buildQuestionSet();
      store.setSession(session.id, session);
    }
  }

  if (session.status === "tanya_kuis") {
    session.answers.tujuan ||= session.answers.minat || "Belum dijawab";
    delete session.answers.minat;
    delete session.answers.kuis;
    await finishVerification(sock, session);
    return;
  }

  if (session.status === "menunggu_mulai") {
    if (text.toLowerCase() !== ".mulai") {
      await sock.sendMessage(recipientJid, {
        text: "Ketik *.mulai* dulu ya untuk memulai proses verifikasi 🙏",
      });
      return;
    }
    session.status = "tanya_open";
    session.step = 0;
    store.setSession(session.id, session);
    await sock.sendMessage(recipientJid, { text: formatOpenQuestion(session) });
    return;
  }

  if (session.status === "tanya_open") {
    const q = session.questionSet.openQuestions[session.step];
    if (text.length < q.minLength) {
      await sock.sendMessage(recipientJid, {
        text: `Jawaban kamu kayaknya masih terlalu singkat 🙏 Coba dijelaskan sedikit lebih lengkap ya.\n\n${formatOpenQuestion(session)}`,
      });
      return;
    }

    session.answers[q.key] = text;
    session.step += 1;

    if (session.step < session.questionSet.openQuestions.length) {
      store.setSession(session.id, session);
      await sock.sendMessage(recipientJid, { text: formatOpenQuestion(session) });
    } else {
      await finishVerification(sock, session);
    }
    return;
  }
}

async function finishVerification(sock, session) {
  session.status = "menunggu_review";
  delete session.skor;
  delete session.rekomendasi;
  store.setSession(session.id, session);
  store.clearActiveSessionId(session.number);

  await sock.sendMessage(participantTargetJid(session), { text: cfg.MSG_SUBMITTED });

  const rekap =
    `📋 *Verifikasi baru* (ID #${session.id})\n\n` +
    `*Grup:* ${session.groupName}\n` +
    `*Nomor:* wa.me/${session.number}\n\n` +
    `*Identitas:* ${session.answers.identitas}\n` +
    `*Motivasi:* ${session.answers.motivasi}\n` +
    `*Tujuan bergabung:* ${session.answers.tujuan}\n\n` +
    `Balas dengan:\n.approve ${session.id}\n.reject ${session.id}`;

  await sock.sendMessage(ownerTargetJid(), { text: rekap });
  console.log(`📥 [#${session.id}] Selesai dijawab, menunggu review owner.`);
}

async function approveSession(sock, session) {
  if (cfg.DRY_RUN) {
    console.log(`[SIMULASI] Tidak menyetujui #${session.id} ke grup "${session.groupName}".`);
    return false;
  }
  try {
    const results = await sock.groupRequestParticipantsUpdate(
      session.groupJid,
      [participantTargetJid(session)],
      "approve"
    );
    ensureParticipantActionSucceeded(results, "approve");
    await sock.sendMessage(participantTargetJid(session), {
      text: cfg.MSG_APPROVED_TEMPLATE(session.groupName),
    });
    store.deleteSession(session.id);
    store.clearSeenRequest(`${session.groupJid}:${session.number}`);
    console.log(`✅ [#${session.id}] ${session.number} disetujui masuk "${session.groupName}".`);
    return true;
  } catch (err) {
    console.error("Gagal approve:", err?.message || err);
    return false;
  }
}

async function rejectSession(sock, session) {
  if (cfg.DRY_RUN) {
    console.log(`[SIMULASI] Tidak menolak #${session.id} dari grup "${session.groupName}".`);
    return false;
  }
  try {
    const results = await sock.groupRequestParticipantsUpdate(
      session.groupJid,
      [participantTargetJid(session)],
      "reject"
    );
    ensureParticipantActionSucceeded(results, "reject");
    await sock.sendMessage(participantTargetJid(session), { text: cfg.MSG_REJECTED });
    store.deleteSession(session.id);
    store.clearSeenRequest(`${session.groupJid}:${session.number}`);
    console.log(`❌ [#${session.id}] ${session.number} ditolak dari "${session.groupName}".`);
    return true;
  } catch (err) {
    console.error("Gagal reject:", err?.message || err);
    return false;
  }
}

// =========================================================================
// PERINTAH OWNER (.menu, .addgroup, .delgroup, .listgroup, .pending, .approve, .reject)
// =========================================================================

const MENU_TEXT =
  "🤖 *RONAN CALLOWAY BOT*\n" +
  "_Asisten grup untuk verifikasi anggota, permainan ringan, dan obrolan yang tetap nyaman._\n" +
  "━━━━━━━━━━━━━━━━━━\n\n" +
  "🎮 *PERMAINAN & INTERAKSI — ANGGOTA (grup terdaftar)*\n" +
  ".tebakangka lalu .tebak <1-50>\n" +
  ".tebakkata lalu .jawabkata <kata>\n" +
  ".poll <pertanyaan> | opsi 1; opsi 2\n" +
  ".vote <nomor> / .hasilpoll\n" +
  ".tutupoll (pembuat/admin/owner)\n\n" +
  "🧰 *UTILITAS & KOMUNITAS — ANGGOTA (grup terdaftar)*\n" +
  ".skor / .topskor\n" +
  ".profil\n" +
  ".jurnal <topik>\n" +
  ".ai <pertanyaan>\n" +
  ".saran <isi saran>\n" +
  ".lapor @anggota [alasan]\n\n" +
  "🔐 *VERIFIKASI — KHUSUS OWNER (lewat DM bot)*\n" +
  ".pending\n" +
  ".approve <id>\n" +
  ".reject <id>\n\n" +
  "🗂️ *KELOLA GRUP — KHUSUS OWNER (lewat DM bot)*\n" +
  ".addgroup <link-undangan>\n" +
  ".delgroup <nomor .listgroup>\n" +
  ".listgroup\n\n" +
  "🧰 *ALAT OWNER (lewat DM bot)*\n" +
  ".status\n" +
  ".ollama status|on|off|reset|test\n" +
  ".testgroup <nomor .listgroup>\n" +
  ".pause / .resume\n" +
  ".banlist <nomor .listgroup>\n" +
  ".review <id> / .cancel <id>\n\n" +
  "🛡️ *MODERASI — KHUSUS OWNER (di grup terdaftar)*\n" +
  ".warn @anggota [alasan] / .warnings @anggota\n" +
  ".kick @anggota [alasan]\n" +
  ".ban @anggota [alasan] / .unban @anggota\n\n" +
  "━━━━━━━━━━━━━━━━━━\n" +
  "_Pilih command sesuai kebutuhan. Jaga diskusi tetap seru dan saling menghargai._";

async function handleOllamaCommand(sock, action, fetchImpl = globalThis.fetch) {
  const ownerJid = ownerTargetJid();
  const requestedAction = action.trim().toLowerCase() || "status";

  if (requestedAction === "off") {
    store.setOllamaModerationEnabled(false);
    await sock.sendMessage(ownerJid, { text: "Moderasi AI Ollama dimatikan; matcher lokal tetap aktif." });
    return true;
  }

  if (requestedAction === "reset") {
    store.resetOllamaModerationEnabled();
    await sock.sendMessage(ownerJid, {
      text: `Pengaturan Ollama kembali mengikuti config: ${cfg.OLLAMA_MODERATION_ENABLED ? "aktif" : "nonaktif"}.`,
    });
    return true;
  }

  const status = await getOllamaStatus(cfg, fetchImpl);
  const enabled = store.getOllamaModerationEnabled(cfg.OLLAMA_MODERATION_ENABLED);
  if (requestedAction === "on") {
    if (!status.available || !status.modelInstalled) {
      await sock.sendMessage(ownerJid, {
        text: `Belum diaktifkan. Ollama ${status.available ? "tersambung tetapi model belum terpasang" : "tidak dapat dijangkau"}: ${cfg.OLLAMA_MODEL}.`,
      });
      return true;
    }
    store.setOllamaModerationEnabled(true);
    await sock.sendMessage(ownerJid, { text: `Moderasi AI aktif memakai ${cfg.OLLAMA_MODEL}.` });
    return true;
  }

  if (requestedAction === "test") {
    if (!status.available || !status.modelInstalled) {
      await sock.sendMessage(ownerJid, {
        text: `Uji gagal: Ollama/model ${cfg.OLLAMA_MODEL} tidak tersedia.`,
      });
      return true;
    }
    try {
      const result = await classifyTargetedAbuse("LGBT goblok", cfg, fetchImpl);
      await sock.sendMessage(ownerJid, {
        text: `Uji ${cfg.OLLAMA_MODEL}: ${result.targetedAbuse ? "terdeteksi" : "tidak terdeteksi"} (${result.category}, confidence ${result.confidence.toFixed(2)}).`,
      });
    } catch (error) {
      await sock.sendMessage(ownerJid, { text: `Uji Ollama gagal: ${error?.message || "error tidak diketahui"}` });
    }
    return true;
  }

  if (requestedAction !== "status") {
    await sock.sendMessage(ownerJid, { text: "Format: .ollama status|on|off|reset|test" });
    return true;
  }

  await sock.sendMessage(ownerJid, {
    text:
      `Moderasi Ollama: ${enabled ? "aktif" : "nonaktif"}\n` +
      `Model: ${cfg.OLLAMA_MODEL}\n` +
      `Endpoint lokal: ${cfg.OLLAMA_BASE_URL}\n` +
      `Service: ${status.available ? "tersambung" : "tidak tersambung"}\n` +
      `Model terpasang: ${status.modelInstalled ? "ya" : "tidak"}`,
  });
  return true;
}

async function handleOwnerCommand(sock, text) {
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(" ").trim();

  if (cmd === ".menu") {
    await sock.sendMessage(ownerTargetJid(), { text: MENU_TEXT });
    return true;
  }

  if (cmd === ".ollama") {
    await handleOllamaCommand(sock, arg);
    return true;
  }

  if (cmd === ".status") {
    const sessions = store.getAllSessions();
    const activeCount = sessions.filter((session) =>
      ["menunggu_mulai", "tanya_open", "tanya_kuis"].includes(session.status)
    ).length;
    const reviewCount = sessions.filter((session) => session.status === "menunggu_review").length;
    const status =
      `📊 *Status bot*\n` +
      `Mode: ${cfg.DRY_RUN ? "SIMULASI (tidak ada aksi WhatsApp)" : "LIVE"}\n` +
      `Pemantauan permintaan join: ${store.isMonitoringPaused() ? "DIJEDA" : "aktif"}\n` +
      `Grup terdaftar: ${store.listGroups().length}\n` +
      `Sesi verifikasi aktif: ${activeCount}\n` +
      `Menunggu review owner: ${reviewCount}\n` +
      `Nomor dalam antrean: ${store.listQueuedNumbers().length}`;
    console.log(`[STATUS OWNER]\n${status}`);
    await sock.sendMessage(ownerTargetJid(), { text: status });
    return true;
  }

  if (cmd === ".pause" || cmd === ".resume") {
    const pause = cmd === ".pause";
    store.setMonitoringPaused(pause);
    const response = pause
      ? "⏸️ Pemantauan permintaan join dijeda. Sesi berjalan tetap bisa menerima jawaban; permintaan baru akan menunggu."
      : "▶️ Pemantauan permintaan join dilanjutkan.";
    console.log(`[POLL] Owner ${pause ? "menjeda" : "melanjutkan"} pemantauan.`);
    await sock.sendMessage(ownerTargetJid(), { text: response });
    return true;
  }

  if (cmd === ".testgroup") {
    await diagnoseRegisteredGroup(sock, arg);
    return true;
  }

  if (cmd === ".banlist") {
    const groups = store.listGroups();
    const index = Number(arg);
    if (!index || index < 1 || index > groups.length) {
      await sock.sendMessage(ownerTargetJid(), { text: "Format: .banlist <nomor .listgroup>" });
      return true;
    }
    const group = groups[index - 1];
    const bans = store.getGroupBans(group.jid);
    const listing = bans.length
      ? bans.map((entry, position) => `${position + 1}. ${entry.number}${entry.reason ? ` — ${entry.reason}` : ""}`).join("\n")
      : "Belum ada anggota yang diban di grup ini.";
    const response = `🚫 *Daftar ban: ${group.name}*\n${listing}`;
    console.log(`[BANLIST OWNER]\n${response}`);
    await sock.sendMessage(ownerTargetJid(), { text: response });
    return true;
  }

  if (cmd === ".review") {
    const id = Number(arg);
    const session = Number.isInteger(id) && id > 0 ? store.getSession(id) : null;
    if (!session) {
      await sock.sendMessage(ownerTargetJid(), { text: "Sesi tidak ditemukan. Cek ID lewat .pending." });
      return true;
    }
    const answers = session.answers || {};
    const excerpt = (value) => String(value || "Belum dijawab").slice(0, 700);
    const response =
      `🔎 *Review sesi #${session.id}*\n` +
      `Status: ${session.status}\nGrup: ${session.groupName}\nNomor: ${session.number}\n\n` +
      `Identitas: ${excerpt(answers.identitas)}\n` +
      `Motivasi: ${excerpt(answers.motivasi)}\n` +
      `Tujuan bergabung: ${excerpt(answers.tujuan)}`;
    console.log(`[REVIEW OWNER]\n${response}`);
    await sock.sendMessage(ownerTargetJid(), { text: response });
    return true;
  }

  if (cmd === ".cancel") {
    if (cfg.DRY_RUN) {
      console.log(`[SIMULASI] Tidak membatalkan sesi ${arg}; data sesi tidak diubah.`);
      return true;
    }
    const id = Number(arg);
    const session = Number.isInteger(id) && id > 0 ? store.getSession(id) : null;
    if (!session) {
      await sock.sendMessage(ownerTargetJid(), { text: "Sesi tidak ditemukan. Cek ID lewat .pending." });
      return true;
    }
    if (store.getActiveSessionId(session.number) === session.id) {
      store.clearActiveSessionId(session.number);
    }
    store.deleteSession(session.id);
    store.markRequestSeen(`${session.groupJid}:${session.number}`);
    const response = `Sesi #${session.id} dihapus dari bot. Permintaan join WhatsApp tidak otomatis disetujui atau ditolak.`;
    console.log(`[SESI] Owner membatalkan sesi #${session.id}; join request tetap di WhatsApp.`);
    await sock.sendMessage(ownerTargetJid(), { text: response });
    return true;
  }

  if (cmd === ".addgroup") {
    await handleAddGroup(sock, arg);
    return true;
  }

  if (cmd === ".delgroup") {
    await handleDelGroup(sock, arg);
    return true;
  }

  if (cmd === ".listgroup") {
    const groups = store.listGroups();
    if (groups.length === 0) {
      await sock.sendMessage(ownerTargetJid(), {
        text: "Belum ada grup terdaftar. Pakai .addgroup <link-undangan> dulu.",
      });
      return true;
    }
    const list = groups
      .map((g, i) => `${i + 1}. ${g.name}\n   ${g.jid}`)
      .join("\n");
    await sock.sendMessage(ownerTargetJid(), {
      text: `📋 *Grup terdaftar:*\n${list}`,
    });
    return true;
  }

  if (cmd === ".pending") {
    const list = store.getSessionsByStatus("menunggu_review");
    if (list.length === 0) {
      await sock.sendMessage(ownerTargetJid(), {
        text: "Tidak ada verifikasi yang menunggu review saat ini.",
      });
      return true;
    }
    const teks = list
      .map(
        (s) =>
          `#${s.id} — ${s.number} -> "${s.groupName}"`
      )
      .join("\n");
    await sock.sendMessage(ownerTargetJid(), {
      text: `📋 *Menunggu review:*\n${teks}`,
    });
    return true;
  }

  if (cmd === ".approve" || cmd === ".reject") {
    const id = Number(arg);
    if (!id) {
      await sock.sendMessage(ownerTargetJid(), {
        text: `Format: ${cmd} <id>. Cek ID lewat .pending`,
      });
      return true;
    }
    const session = store.getSession(id);
    if (!session || session.status !== "menunggu_review") {
      await sock.sendMessage(ownerTargetJid(), {
        text: `Tidak ada verifikasi #${id} yang sedang menunggu review.`,
      });
      return true;
    }
    const ok =
      cmd === ".approve" ? await approveSession(sock, session) : await rejectSession(sock, session);
    await sock.sendMessage(ownerTargetJid(), {
      text: ok
        ? `Beres, #${id} sudah di${cmd === ".approve" ? "setujui" : "tolak"}.`
        : `Gagal memproses #${id}, cek log terminal untuk detail errornya.`,
    });
    return true;
  }

  return false; // bukan command yang dikenali
}

async function handleAddGroup(sock, link) {
  const code = link ? extractWhatsAppInviteCode(link) : null;
  if (!code) {
    await sock.sendMessage(ownerTargetJid(), {
      text: "Format: .addgroup https://chat.whatsapp.com/xxxxxxxx",
    });
    return;
  }

  try {
    const info = await sock.groupGetInviteInfo(code);
    const jid = info.id;
    const name = info.subject || "(tanpa nama)";

    if (store.getGroup(jid)) {
      await sock.sendMessage(ownerTargetJid(), {
        text: `Grup "${name}" sudah terdaftar sebelumnya.`,
      });
      return;
    }

    if (cfg.DRY_RUN) {
      console.log(`[SIMULASI] Tidak bergabung otomatis ke grup "${name}".`);
    } else {
      try {
        await sock.groupAcceptInvite(code);
      } catch (joinErr) {
        console.log("Info join grup (mungkin sudah member):", joinErr?.message || joinErr);
      }
    }

    store.addGroup(jid, name);

    // Cek status admin bot di grup itu untuk kasih peringatan kalau perlu.
    let adminNote = "";
    try {
      const metadata = await sock.groupMetadata(jid);
      const ownJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const me = metadata.participants.find((p) => p.id === ownJid || p.id.startsWith(numberFromJid(ownJid)));
      const isAdmin = me && (me.admin === "admin" || me.admin === "superadmin");
      if (!isAdmin) {
        adminNote =
          "\n\n⚠️ Bot BELUM jadi admin di grup ini. Jadikan admin dulu lewat " +
          "Info Grup > Peserta > pilih nomor bot > Jadikan admin grup, kalau " +
          "tidak, bot tidak akan bisa melihat/approve permintaan join.";
      }
    } catch (metaErr) {
      console.log("Tidak bisa cek status admin:", metaErr?.message || metaErr);
    }

    await sock.sendMessage(ownerTargetJid(), {
      text:
        `${cfg.DRY_RUN ? "🧪 Grup" : "✅ Grup"} "${name}" berhasil didaftarkan` +
        `${cfg.DRY_RUN ? " untuk simulasi saja." : " dan akan dipantau."}\n\n` +
        `Pastikan juga fitur "Perlu disetujui admin" sudah aktif di Info Grup > ` +
        `Setelan Grup > Kelola persetujuan anggota — kalau belum, bot tidak akan ` +
        `melihat permintaan join siapa pun.${cfg.DRY_RUN ? " Dalam mode simulasi bot tidak bergabung otomatis; tambahkan bot ke grup dan jadikan admin setelah mode live diaktifkan." : adminNote}`,
    });
  } catch (err) {
    console.error("Gagal addgroup:", err?.message || err);
    await sock.sendMessage(ownerTargetJid(), {
      text: `Gagal memproses link itu. Pastikan link undangan masih berlaku. (${err?.message || err})`,
    });
  }
}

async function handleDelGroup(sock, arg) {
  const idx = Number(arg);
  const groups = store.listGroups();
  if (!idx || idx < 1 || idx > groups.length) {
    await sock.sendMessage(ownerTargetJid(), {
      text: "Format: .delgroup <nomor-urut>. Cek nomor urutnya lewat .listgroup",
    });
    return;
  }
  const target = groups[idx - 1];
  store.removeGroup(target.jid);
  await sock.sendMessage(ownerTargetJid(), {
    text: `Grup "${target.name}" sudah dihapus dari daftar pantauan.`,
  });
}

async function diagnoseRegisteredGroup(sock, arg) {
  const index = Number(arg);
  const groups = store.listGroups();
  if (!Number.isInteger(index) || index < 1 || index > groups.length) {
    await sock.sendMessage(ownerTargetJid(), {
      text: "Format: .testgroup <nomor .listgroup>",
    });
    return;
  }

  const group = groups[index - 1];
  let botAdminStatus = "Tidak dapat dipastikan";
  let metadataError = null;
  try {
    const metadata = await sock.groupMetadata(group.jid);
    const ownJids = [sock.user?.id, sock.user?.lid].filter(Boolean);
    const ownNumbers = new Set(ownJids.map(numberFromJid));
    const participant = metadata.participants.find((entry) =>
      [entry.id, entry.phoneNumber, entry.lid]
        .filter(Boolean)
        .some((jid) => ownJids.includes(jid) || ownNumbers.has(numberFromJid(jid)))
    );
    botAdminStatus = participant?.admin === "admin" || participant?.admin === "superadmin"
      ? "Ya"
      : participant
        ? "Tidak"
        : "Bot tidak ditemukan di daftar peserta";
  } catch (error) {
    metadataError = error?.message || "gagal membaca metadata";
  }

  let requestApiStatus;
  try {
    const pending = await sock.groupRequestParticipantsList(group.jid);
    requestApiStatus = `Bisa dibaca (${pending.length} permintaan sedang menunggu)`;
  } catch (error) {
    requestApiStatus = `Gagal: ${error?.message || "API tidak tersedia"}`;
  }

  const response =
    `🧪 *Diagnostik grup #${index}: ${group.name}*\n` +
    `Bot admin: ${botAdminStatus}\n` +
    `Metadata grup: ${metadataError ? `gagal dibaca (${metadataError})` : "berhasil dibaca"}\n` +
    `Daftar permintaan join: ${requestApiStatus}\n` +
    `Setelan “perlu persetujuan admin” tidak dapat dipastikan dari daftar kosong; cek setelan grup secara manual.`;
  console.log(`[DIAGNOSTIK GRUP]\n${response}`);
  await sock.sendMessage(ownerTargetJid(), { text: response });
}

if (require.main === module) {
  startBot().catch((err) => console.error("Gagal menjalankan bot:", err));
}

module.exports = {
  MENU_TEXT,
  buildQuestionSet,
  createGroupGame,
  handleGameAnswer,
  handleGroupMessage,
  handleGroupModerationCommand,
  handleAiChat,
  handleOllamaCommand,
  handleUserMessage,
  handleOwnerCommand,
  handlePrivateGroupFeedback,
  extractWhatsAppInviteCode,
  installMessageGuard,
  pollAllGroups,
  getModerationReason,
  privateSenderNumber,
  wasBotGeneratedMessage,
  searchJournalArticles,
  shouldIgnorePrivateMessage,
};
