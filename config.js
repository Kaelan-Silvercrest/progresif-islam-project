/*
 * Progresif Islam Project - WhatsApp Verification & Moderation Bot
 * Copyright (C) 2026 Ronan Calloway / Kaelan Silvercrest
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * KONFIGURASI BOT VERIFIKASI UNIVERSAL - RONAN CALLOWAY BOT
 * -------------------------------------------------------------
 * Cukup isi OWNER_NUMBER (sudah diisi). Sisanya opsional untuk diedit.
 */

require("dotenv").config();

module.exports = {
  // Nomor pemilik bot (satu-satunya yang boleh pakai .menu, .addgroup, dst).
  // Format internasional tanpa "+" / spasi / strip.
  OWNER_NUMBER: "166726939455631",

  // Mode simulasi nonaktif agar bot dapat mengirim pesan dan memproses verifikasi.
  DRY_RUN: false,

  // Seberapa sering (ms) bot mengecek permintaan join di SEMUA grup terdaftar.
  POLL_INTERVAL_MS: 30_000,

  // Jeda minimum antar pesan pembuka verifikasi agar bot tidak mengirim massal.
  VERIFICATION_GLOBAL_COOLDOWN_MS: 5 * 60 * 1000,

  // Jeda minimum sebelum nomor yang sama mendapat sesi verifikasi baru.
  VERIFICATION_NUMBER_COOLDOWN_MS: 10 * 60 * 1000,

  WELCOME_SHOW_PROFILE_PICTURE: true,

  GROUP_GAME_COOLDOWN_MS: 30 * 1000,
  GROUP_MEMBER_COMMAND_COOLDOWN_MS: 60 * 1000,
  GROUP_POLL_COOLDOWN_MS: 5 * 60 * 1000,
  GROUP_POLL_DURATION_MS: 24 * 60 * 60 * 1000,
  GROUP_POLL_MIN_OPTIONS: 2,
  GROUP_POLL_MAX_OPTIONS: 5,

  JOURNAL_SEARCH_ENABLED: true,
  JOURNAL_SEARCH_COOLDOWN_MS: 30 * 1000,
  JOURNAL_SEARCH_TIMEOUT_MS: 8 * 1000,
  JOURNAL_SEARCH_MAX_QUERY_LENGTH: 180,
  JOURNAL_SEARCH_MAX_RESULTS: 20,
  JOURNAL_SEARCH_OUTPUT_CHUNK_CHARS: 3000,
  CROSSREF_CONTACT_EMAIL: process.env.CROSSREF_CONTACT_EMAIL || "",

  // Downloader MP3 publik melalui command .mp3 <URL YouTube>.
  MP3_DOWNLOADER_ENABLED: true,
  MP3_COOLDOWN_MS: 60 * 1000,
  MP3_MAX_DURATION_SECONDS: 15 * 60,
  MP3_MAX_FILE_SIZE_BYTES: 16 * 1024 * 1024,
  MP3_DOWNLOAD_TIMEOUT_MS: 120 * 1000,
  MP3_OUTPUT_DIR: process.env.MP3_OUTPUT_DIR || "./tmp/mp3",

  MENU_IMAGE_PATH: process.env.MENU_IMAGE_PATH || "/home/ronancalloway/Downloads/furreh/afurrypfp1.png",

  TRANSLATE_API_URL: process.env.TRANSLATE_API_URL || "https://api.mymemory.translated.net/get",
  TRANSLATE_MAX_CHARS: 1000,
  TRANSLATE_TIMEOUT_MS: 10 * 1000,
  TRANSLATE_COOLDOWN_MS: 30 * 1000,

  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "deepscaler",
  OLLAMA_MODERATION_MODEL: process.env.OLLAMA_MODERATION_MODEL || "qwen2.5:3b",
  OLLAMA_MODERATION_ENABLED: true,
  OLLAMA_MODERATION_CONFIDENCE_THRESHOLD: 0.8,
  OLLAMA_TIMEOUT_MS: 7000,
  OLLAMA_RULE_OVERRIDE_SCORE: 5,
  OLLAMA_CHAT_ENABLED: true,
  OLLAMA_MATHAI_TIMEOUT_MS: 5 * 60 * 1000,
  OLLAMA_MATHAI_MAX_PROMPT_CHARS: 12000,
  OLLAMA_MATHAI_MAX_RESPONSE_CHARS: 16000,
  OLLAMA_MATHAI_MAX_OUTPUT_TOKENS: 4096,
  OLLAMA_MATHAI_COOLDOWN_MS: 10 * 1000,
  OLLAMA_CHAT_COOLDOWN_MS: 10 * 1000,
  OLLAMA_CHAT_MAX_PROMPT_CHARS: 1200,
  OLLAMA_CHAT_MAX_RESPONSE_CHARS: 1800,

  AI_PROVIDER_TIMEOUT_MS: Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 20 * 1000,
  AI_PROVIDER_MAX_OUTPUT_TOKENS: Number(process.env.AI_PROVIDER_MAX_OUTPUT_TOKENS) || 384,
  AI_PROVIDER_CHAT_ENABLED: process.env.AI_PROVIDER_CHAT_ENABLED !== "false",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_MODEL: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY || "",
  CEREBRAS_MODEL: process.env.CEREBRAS_MODEL || "llama-3.3-70b",

  AUTO_MODERATION_ENABLED: true,
  MAX_WARNINGS_BEFORE_KICK: 3,
  MODERATION_OWNER_EXEMPT: true,
  MODERATION_ADMIN_EXEMPT: false,
  MODERATION_DELETE_MATCHED_MESSAGES: true,
  MODERATION_WARN_ON_MATCH: true,
  MODERATION_KICK_ON_THRESHOLD: true,
  MODERATION_MATCH_THRESHOLD: 3,
  MODERATION_BLOCKED_PHRASE_SCORE: 3,
  MODERATION_SCORE_IDENTITY: 1,
  MODERATION_SCORE_FUZZY_IDENTITY: 1,
  MODERATION_SCORE_SEPARATED_ACRONYM: 1,
  MODERATION_SCORE_INSULT: 2,
  MODERATION_SCORE_ATTACK: 2,
  MODERATION_SCORE_MOCKERY: 1,
  MODERATION_SCORE_DIRECT_SLUR: 1,
  MODERATION_SCORE_FUZZY_INSULT: 1,
  MODERATION_SCORE_FUZZY_ATTACK: 1,
  MODERATION_SCORE_FUZZY_MOCKERY: 1,
  MODERATION_NORMALIZE_UNICODE: true,
  MODERATION_STRIP_ZERO_WIDTH: true,
  MODERATION_MAP_LEETSPEAK: true,
  MODERATION_LEETSPEAK_MAP: {
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
    "7": "t", "8": "b", "9": "g", "@": "a", "$": "s",
  },
  MODERATION_COLLAPSE_REPEATED_CHARS: true,
  MODERATION_REPEAT_CHAR_LIMIT: 1,
  MODERATION_MATCH_SEPARATED_ACRONYMS: true,
  MODERATION_FUZZY_IDENTITY_MATCHING: true,
  MODERATION_FUZZY_IDENTITY_KEYWORDS: [
    "gay", "homo", "lesbian", "lesbi", "biseksual", "bisexual", "transgender",
    "lgbt", "lgbtq", "lgbtqia", "queer", "nonbiner", "waria", "banci", "bencong",
  ],
  MODERATION_FUZZY_INSULT_MATCHING: true,
  MODERATION_FUZZY_ATTACK_MATCHING: true,
  MODERATION_FUZZY_MOCKERY_MATCHING: true,
  MODERATION_FUZZY_MAX_EDIT_DISTANCE: 1,
  MODERATION_FUZZY_MIN_TOKEN_LENGTH: 6,
  MODERATION_PREFIX_VARIANT_MAX_EXTRA: 2,
  MODERATION_MATCH_PREFIX_VARIANTS: true,
  MODERATION_MAX_SIGNALS_PER_CATEGORY: 1,
  MODERATION_ACCENT_FOLDING: true,
  MODERATION_PUNCTUATION_AS_SEPARATOR: true,
  MODERATION_MATCH_MOCKERY_EMOJI: false,
  MODERATION_MOCKERY_EMOJIS: ["😂", "🤣", "😆", "😅", "😹", "🙄", "😜", "🤪"],
  MODERATION_LOG_MATCH_SCORE: true,
  MODERATION_IDENTITY_KEYWORDS: [
    "islam", "muslim", "kristen", "katolik", "protestan", "hindu",
    "buddha", "yahudi", "gay", "homo", "lesbian", "lesbi", "biseksual", "bisexual",
    "transgender", "lgbt", "lgbtq", "lgbtqia", "queer", "nonbiner", "waria", "banci", "bencong",
    "cino", "aseng", "kadrun", "cebong", "kafir", "murtad", "onta", "ontah",
    "bancet", "wandu", "wanduk", "shemale", "pedofil", "pedo", "sodomi"
  ],
  MODERATION_INSULT_KEYWORDS: [
    "bodoh", "tolol", "goblok", "goblog", "bego", "dungu", "dongo",
    "bangsat", "bajingan", "brengsek", "keparat", "kampret", "anjing", "asu",
    "babi", "monyet", "kontol", "memek", "tai", "sampah", "gila", "sinting",
    "jijik", "menjijikkan", "tidak normal",
    "tak normal", "tidak pantas", "tidak layak", "abnormal",
    "penyakit", "kelainan", "menyimpang", "tidak bermoral", "menjijikan",
    "pantek", "kimak", "peler", "jancok", "jancuk", "cok", "itil", "jembut", "pepek", 
    "pantat", "setan", "iblis", "dajjal", "lacur", "perek", "lonte", "banci", "bencong",
    "anj", "anjingg", "anjir", "anjrit", "bgst", "bjgn", "kntl", "mmk", "goblx", "goblog", "tolool", "bego",
  ],
  MODERATION_ATTACK_KEYWORDS: [
    "harus diusir", "harus dibunuh", "tidak pantas hidup", "tidak layak hidup",
    "harus dihancurkan", "harus dilenyapkan", "basmi semua", "usir mereka",
    "jangan beri tempat", "tidak boleh hidup", "hapuskan mereka",
  ],
  MODERATION_MOCKERY_KEYWORDS: [
    "pelesetan", "plesetan", "dipelesetkan", "bahan lelucon",
    "bahan tertawaan", "bahan lawakan", "olok olok", "olok-olok",
    "mengejek", "diejek", "ngeledek", "wkwk", "hahaha",
    "sok tau", "sok iye", "sok ganteng", "sok cantik", "sok pintar",
    "caper", "pansos", "lebay", "norak", "kampungan", "udeso", "halu",
  ],
  MODERATION_DIRECT_IDENTITY_SLURS: ["banci", "bencong"],
  MODERATION_BLOCKED_PHRASES: ["dasar bodoh", "dasar tolol"],

  // Sesi verifikasi yang tidak direspon selama ini (ms) otomatis dianggap
  // kedaluwarsa, supaya antrean orang lain (kalau ada) bisa jalan lagi.
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 jam

  // Satu varian acak dari tiap bagian ditanyakan ke semua calon anggota.
  OPEN_QUESTION_POOL: {
    identitas: [
      { text: "Boleh kenalan? Sebutkan nama dan latar belakang yang relevan dengan grup *{groupName}* (misalnya pekerjaan, studi, minat, atau pengalaman).", minLength: 15 },
      { text: "Siapa nama kamu, dan pengalaman atau ketertarikan apa yang membuatmu relevan dengan grup *{groupName}*?", minLength: 15 },
    ],
    motivasi: [
      { text: "Apa motivasi spesifik kamu ingin bergabung ke grup *{groupName}*?", minLength: 15 },
      { text: "Kenapa kamu tertarik menjadi bagian dari grup *{groupName}*? Ceritakan alasanmu.", minLength: 15 },
    ],
    tujuan: [
      { text: "Apa tujuanmu bergabung dengan grup *{groupName}*, dan apa yang ingin kamu pelajari atau kontribusikan?", minLength: 20 },
      { text: "Bagaimana grup *{groupName}* relevan dengan tujuanmu, dan hal apa yang ingin kamu bagikan kepada anggotanya?", minLength: 20 },
    ],
  },

  WORD_GAME_BANK: [
    { word: "atom", hint: "Unit dasar penyusun unsur kimia." },
    { word: "kompas", hint: "Alat navigasi yang menunjukkan arah mata angin." },
    { word: "arsip", hint: "Kumpulan dokumen yang disimpan sebagai sumber informasi." },
    { word: "orbit", hint: "Lintasan benda langit saat bergerak mengelilingi benda lain." },
    { word: "norma", hint: "Aturan atau pedoman perilaku yang berlaku dalam masyarakat." },
    { word: "kalender", hint: "Sistem untuk mengatur hari, minggu, bulan, dan tahun." },
    { word: "gravitasi", hint: "Gaya tarik-menarik antara benda yang memiliki massa." },
    { word: "budaya", hint: "Cara hidup yang berkembang dan diwariskan dalam suatu kelompok." },
  ],

  MSG_SUBMITTED:
    "Terima kasih sudah menjawab! ✅ Jawaban kamu sudah kami terima dan akan " +
    "diperiksa oleh pengurus. Kamu akan diberi tahu di sini begitu ada keputusan ya.",

  MSG_APPROVED_TEMPLATE: (groupName) =>
    `Selamat! 🎉 Kamu sudah diverifikasi dan diterima ke grup *${groupName}*. Sampai jumpa di grup!`,

  MSG_REJECTED:
    "Mohon maaf, untuk saat ini permintaan join kamu belum kami setujui. " +
    "Kalau ada pertanyaan, boleh balas chat ini.",

  WELCOME_TEMPLATE: (groupName) =>
    `Halo! 👋 Kami melihat kamu mengajukan permintaan untuk join ke grup *${groupName}*.\n\n` +
    `Sebelum diterima, mohon jawab beberapa pertanyaan singkat berikut ya, biar kita saling kenal dan grup tetap sehat isinya 🙏\n\n` +
    `Ketik *.mulai* untuk memulai proses verifikasi (sekitar 2 menit saja).`,

  GROUP_WELCOME_TEMPLATE: (groupName, mention) =>
    `👋 Selamat datang ${mention} di grup *${groupName}*! Semoga betah dan nyaman berdiskusi.`,

  QUEUE_NOTICE_TEMPLATE: (groupName) =>
    `Btw, kamu juga baru saja mengajukan join ke grup *${groupName}*. ` +
    `Kita selesaikan verifikasi yang sedang berjalan dulu ya, nanti otomatis lanjut ke grup ini.`,
};
