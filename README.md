# Ronan Collaway Bot — Verifikasi Anggota Universal

Bot WhatsApp untuk memverifikasi calon anggota yang meminta join ke grup(-grup)
yang kamu daftarkan. Owner-only, pertanyaan dinamis, tanpa auto-approve.

Dibangun pakai [Baileys](https://github.com/WhiskeySockets/Baileys) — tidak
perlu Chromium/Puppeteer, ringan dijalankan di laptop biasa.

## Cara kerja singkat

1. Owner (nomor di `OWNER_NUMBER` pada `config.js`) kirim `.addgroup <link-undangan>` ke
   chat pribadi bot. Bot otomatis join grup itu (kalau belum member) dan
   mulai memantaunya. Bisa daftarkan banyak grup, tidak dibatasi satu.
2. Kalau ada yang minta join ke salah satu grup terdaftar, bot langsung DM
   orang itu dan menjalankan sesi tanya-jawab:
   - identitas dan latar belakang yang relevan dengan grup
   - motivasi bergabung
   - tujuan atau kontribusi yang ingin diberikan
3. Ketiga jawaban direkap kepada owner (`menunggu review`) dengan ID unik.
   Tidak ada kuis atau keputusan otomatis; owner memutuskan sendiri lewat
   `.approve <id>` atau `.reject <id>`.
4. Kalau satu nomor kebetulan minta join ke 2 grup terdaftar dalam waktu
   berdekatan, bot mengantre — selesaikan sesi pertama dulu, baru lanjut
   otomatis ke sesi berikutnya. Jawaban tidak akan tercampur.
5. Setelah anggota benar-benar masuk ke grup terdaftar, bot mengirim sambutan
   dan mencoba menampilkan foto profil jika dapat diakses. Foto tidak disimpan.
6. Anggota grup bisa bermain tebak angka dan tebak kata; poin disimpan per grup.
   Polling, jurnal, saran, laporan, dan moderasi juga tersedia.

**Catatan soal fitur download musik/video:** sengaja tidak saya sertakan.
Fitur semacam itu pada dasarnya mengunduh konten berhak cipta dari platform
lain tanpa izin, jadi di luar yang bisa dibuatkan di sini — bukan soal
ringan/beratnya sistem.

---

## ⚠️ Yang wajib disiapkan manual di WhatsApp (tidak bisa lewat kode)

Untuk **setiap** grup yang kamu daftarkan lewat `.addgroup`:

1. Aktifkan mode approval: `Info Grup → Setelan Grup → Kelola persetujuan
   anggota → aktifkan "Perlu disetujui admin"`.
2. Pastikan nomor bot jadi **admin** grup itu (bot akan otomatis join saat
   `.addgroup`, tapi WhatsApp tidak mengizinkan bot mempromosikan dirinya
   sendiri — kamu perlu jadikan admin manual lewat Info Grup → Peserta).

Tanpa dua hal ini, bot tidak akan bisa melihat maupun approve/reject
permintaan join siapa pun di grup tersebut, walau sudah terdaftar di bot.

**Saran keamanan:** pakai nomor WA khusus untuk bot (bukan nomor pribadi
utamamu). Ini automasi tidak resmi WhatsApp, ada risiko kena batasan kalau
dipakai sembarangan (spam, chat massal, dll) — pemakaian wajar seperti di
sini (DM satu-satu untuk verifikasi) risikonya jauh lebih kecil.

---

## 🚀 Cara jalanin

1. Pastikan sudah ada Node.js v18+.
2. Ekstrak zip ini, lalu di terminal:
   ```
   cd epistemeus-wa-verifikator
   npm install
   npm start
   ```
3. Scan QR yang muncul di terminal pakai nomor yang mau jadi bot (menu
   *Perangkat Tertaut* / *Linked Devices* di WhatsApp).
4. Setelah tersambung, dari chat pribadi ke **nomor bot itu sendiri**
   (kirim dari nomor owner `081252867337`), kirim:
   ```
   .addgroup https://chat.whatsapp.com/xxxxxxxx
   ```
5. Ikuti instruksi balasan bot (aktifkan approval + jadikan admin kalau
   belum). Setelah itu grup otomatis dipantau, tidak perlu diulang lagi
   kecuali bot di-restart dari awal dengan data.json yang dihapus.

`DRY_RUN` di `config.js` mengontrol mode simulasi. Jika `true`, bot tidak
mengirim pesan, menyetujui/menolak permintaan, atau bergabung otomatis ke grup;
polling join hanya membaca permintaan dan menulis preview di terminal. Untuk
mengaktifkan aksi WhatsApp sungguhan, set `DRY_RUN` ke `false` lalu restart bot.
Konfigurasi saat ini memakai mode live. Grup yang didaftarkan ketika simulasi
aktif belum diikuti bot; tambahkan bot ke grup dan jadikan admin sebelum
mengandalkan pemantauan live.

Nomor owner diatur lewat `OWNER_NUMBER` pada `config.js`.

---

## 💬 Perintah Owner (kirim lewat chat pribadi ke bot)

`.menu` dapat digunakan semua orang lewat DM atau di grup terdaftar. Daftar di
bawah ini khusus owner dan tetap memerlukan verifikasi nomor owner.

| Perintah | Fungsi |
|---|---|
| `.addgroup <link>` | Daftarkan grup baru untuk dipantau |
| `.listgroup` | Lihat semua grup yang terdaftar + nomor urutnya |
| `.delgroup <nomor-urut>` | Hapus grup dari pantauan (pakai nomor dari `.listgroup`) |
| `.pending` | Lihat semua verifikasi yang menunggu keputusan |
| `.status` | Ringkasan grup, sesi, antrean, mode, dan status polling |
| `.ollama status\|on\|off\|reset\|test` | Status, toggle, dan uji moderasi AI lokal |
| `.testgroup <nomor>` | Diagnostik baca-saja untuk grup dari `.listgroup` |
| `.pause` / `.resume` | Jeda/lanjutkan polling permintaan join; sesi berjalan tetap menerima jawaban |
| `.banlist <nomor>` | Lihat daftar ban grup dari `.listgroup` |
| `.review <id>` | Baca jawaban sesi tanpa memutuskan hasil |
| `.cancel <id>` | Hapus sesi lokal; permintaan WhatsApp tidak otomatis di-approve/reject |
| `.approve <id>` | Setujui orang itu masuk grup |
| `.reject <id>` | Tolak |

Perintah-perintah ini **hanya berfungsi kalau dikirim dari nomor owner**
(`6281252867337`) atau dari akun bot itu sendiri (mis. lewat linked device).
Pengguna lain yang chat ke bot tidak akan bisa mengakses perintah ini sama
sekali — mereka hanya akan menjalani alur verifikasi universal (`.mulai`, lalu
menjawab pertanyaan identitas, motivasi, dan tujuan).

Di grup terdaftar, `.menu` tersedia untuk semua anggota dan menampilkan command
publik serta command owner yang diberi label batas akses. Kuis, fakta, dan
pemantik diskusi sedang dinonaktifkan. Anggota dapat bermain `.tebakangka`
dengan `.tebak <1-50>` atau `.tebakkata` dengan `.jawabkata <kata>`. Kedua game
berbagi satu ronde aktif dan jeda 30 detik per grup. `.skor` melihat poin sendiri
dan `.topskor` menampilkan lima skor tertinggi.

`.jurnal <topik>` mencari metadata artikel jurnal melalui Crossref dan
menampilkan hingga 20 judul beserta tautan DOI/halaman penerbit dalam beberapa
pesan bila diperlukan. Bot tidak mengambil abstrak atau mengunduh berkas. Kata
kunci pencarian dikirim ke Crossref; cooldown per anggota tetap 30 detik.

`.ai <pertanyaan>` menjalankan chatbot lokal `qwen2.5:3b` di grup terdaftar atau
lewat DM bot. Chat tidak menyimpan riwayat; ada cooldown per pengguna dan batas
panjang prompt. Owner dapat mengelola moderasi AI dengan `.ollama status|on|off|reset|test`.

Moderasi AI lokal memakai Ollama pada `OLLAMA_BASE_URL` dan model
`qwen2.5:3b`. `.ollama status` memeriksa service/model, `.ollama test` menjalankan
uji lokal, dan `.ollama on|off` mengaktifkan atau menonaktifkan penilaian AI.
Keputusan AI hanya berjalan pada pesan kandidat; jika Ollama tidak tersedia,
matcher lokal tetap menjadi fallback.

Anggota juga dapat membuat polling dengan `.poll <pertanyaan> | opsi 1; opsi 2`
(2-5 opsi), memilih atau mengubah suara dengan `.vote <nomor>`, melihat hasil
sementara/final dengan `.hasilpoll`, dan menutup polling lewat `.tutupoll` jika
merupakan pembuat polling, admin grup, atau owner. Polling kedaluwarsa setelah 24 jam;
polling baru memiliki jeda 5 menit per grup. `.profil` menampilkan poin dan posisi
peringkat anggota tanpa membeberkan data moderasi.

`.saran <isi>` dan `.lapor @anggota [alasan]` hanya meneruskan isi ke DM owner,
bukan menampilkannya di grup. Tiap anggota dibatasi satu saran dan satu laporan
per menit per grup.

Owner dapat menjalankan perintah moderasi berikut langsung di grup terdaftar:

| Perintah | Fungsi |
|---|---|
| `.warn @anggota [alasan]` | Beri peringatan; peringatan ke-3 mencoba mengeluarkan anggota |
| `.warnings @anggota` | Lihat jumlah peringatan anggota di grup itu |
| `.kick @anggota [alasan]` | Keluarkan anggota tanpa memasukkannya ke daftar blokir |
| `.ban @anggota [alasan]` | Blokir dan keluarkan anggota; permintaan join berikutnya ditolak |
| `.unban @anggota` | Cabut blokir dan reset peringatannya |

Sensor otomatis berlaku untuk anggota, admin grup, dan owner. Pesan yang cocok
akan dihapus dan diberi warning; warning ketiga mencoba mengeluarkan pengirim.
Echo pesan keluaran bot sendiri dikecualikan agar tidak memicu loop moderasi.
Sensor mencocokkan variasi ejaan, leetspeak, akronim berhuruf terpisah, hinaan,
serangan, dan ejekan. Penyebutan identitas yang netral atau suportif tidak
otomatis ditindak, tetapi konteks tetap berbasis kata kunci dan false positive
mungkin terjadi. Bot memerlukan izin admin untuk menghapus pesan atau
mengeluarkan anggota.
Ban di sini berarti mengeluarkan anggota dan menolak permintaan join berikutnya;
WhatsApp tidak menyediakan daftar blokir permanen anggota grup lewat Baileys.
`.testgroup` dapat memeriksa metadata, admin bot, dan akses daftar permintaan,
tetapi tidak dapat membuktikan mode persetujuan aktif jika daftar permintaannya
kosong; pengaturan itu tetap perlu diperiksa langsung di WhatsApp.

---

## ⚙️ Yang bisa diedit di `config.js` (opsional)

| Bagian | Fungsi |
|---|---|
| `OPEN_QUESTION_POOL` | Variasi pertanyaan universal untuk identitas, motivasi, dan tujuan bergabung |
| `SESSION_TIMEOUT_MS` | Berapa lama sesi dianggap kedaluwarsa kalau tidak dijawab (default 24 jam) |
| `POLL_INTERVAL_MS` | Seberapa sering cek permintaan join baru (default 30 detik) |
| `VERIFICATION_GLOBAL_COOLDOWN_MS` | Jeda antar pesan pembuka verifikasi (default 5 menit; permintaan lain tetap menunggu) |
| `VERIFICATION_NUMBER_COOLDOWN_MS` | Jeda sebelum nomor yang sama mendapat verifikasi baru (default 10 menit) |
| `DRY_RUN` | Jika `true`, pesan, sensor, penghapusan, warning, kick, ban, join/approve/reject disimulasikan |
| `GROUP_GAME_COOLDOWN_MS` | Jeda antar game netral pada grup yang sama (default 30 detik) |
| `GROUP_MEMBER_COMMAND_COOLDOWN_MS` | Jeda saran/laporan per anggota per grup (default 60 detik) |
| `GROUP_POLL_COOLDOWN_MS`, `GROUP_POLL_DURATION_MS` | Jeda polling baru (5 menit) dan lama polling aktif (24 jam) |
| `GROUP_POLL_MIN_OPTIONS`, `GROUP_POLL_MAX_OPTIONS` | Batas jumlah opsi polling (default 2-5) |
| `JOURNAL_SEARCH_ENABLED` | Aktif/nonaktifkan pencarian metadata jurnal |
| `JOURNAL_SEARCH_COOLDOWN_MS`, `JOURNAL_SEARCH_TIMEOUT_MS` | Cooldown per anggota (30 detik) dan timeout Crossref (8 detik) |
| `JOURNAL_SEARCH_MAX_RESULTS`, `JOURNAL_SEARCH_OUTPUT_CHUNK_CHARS` | Maksimal hasil (default 20) dan ukuran chunk pesan |
| `CROSSREF_CONTACT_EMAIL` | Email kontak opsional untuk identifikasi sopan pada Crossref |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Endpoint Ollama lokal dan model moderasi (`qwen2.5:3b`) |
| `OLLAMA_MODERATION_ENABLED`, `OLLAMA_MODERATION_CONFIDENCE_THRESHOLD` | Default AI dan confidence minimum |
| `OLLAMA_TIMEOUT_MS`, `OLLAMA_RULE_OVERRIDE_SCORE` | Timeout model dan skor rule lokal yang langsung dipercaya |
| `OLLAMA_CHAT_ENABLED`, `OLLAMA_CHAT_TIMEOUT_MS` | Aktif/nonaktif chatbot dan timeout jawaban |
| `OLLAMA_CHAT_COOLDOWN_MS`, `OLLAMA_CHAT_MAX_PROMPT_CHARS`, `OLLAMA_CHAT_MAX_RESPONSE_CHARS` | Batas laju dan panjang input/output `.ai` |
| `WORD_GAME_BANK` | Bank kata universal untuk permainan tebak kata |
| `AUTO_MODERATION_ENABLED` | Aktif/nonaktifkan sensor otomatis berbasis kata kunci |
| `MAX_WARNINGS_BEFORE_KICK` | Jumlah warning sebelum bot mencoba mengeluarkan anggota (default 3) |
| `MODERATION_OWNER_EXEMPT`, `MODERATION_ADMIN_EXEMPT` | Pengecualian owner/admin; default keduanya `false` |
| `MODERATION_DELETE_MATCHED_MESSAGES`, `MODERATION_WARN_ON_MATCH`, `MODERATION_KICK_ON_THRESHOLD` | Aktif/nonaktifkan tiap tindakan moderasi |
| `MODERATION_MATCH_THRESHOLD`, `MODERATION_BLOCKED_PHRASE_SCORE` | Ambang skor total dan bobot frasa blokir |
| `MODERATION_SCORE_IDENTITY`, `MODERATION_SCORE_FUZZY_IDENTITY`, `MODERATION_SCORE_SEPARATED_ACRONYM` | Bobot kata identitas exact, fuzzy, dan akronim terpisah |
| `MODERATION_SCORE_INSULT`, `MODERATION_SCORE_ATTACK`, `MODERATION_SCORE_MOCKERY`, `MODERATION_SCORE_DIRECT_SLUR` | Bobot kategori sinyal moderasi |
| `MODERATION_SCORE_FUZZY_INSULT`, `MODERATION_SCORE_FUZZY_ATTACK`, `MODERATION_SCORE_FUZZY_MOCKERY` | Bobot tambahan untuk sinyal yang cocok secara fuzzy |
| `MODERATION_IDENTITY_KEYWORDS`, `MODERATION_FUZZY_IDENTITY_KEYWORDS` | Kata identitas exact dan subset yang boleh dicocokkan secara fuzzy |
| `MODERATION_INSULT_KEYWORDS`, `MODERATION_ATTACK_KEYWORDS`, `MODERATION_DIRECT_IDENTITY_SLURS` | Kata hinaan, serangan, dan slur yang dikenali |
| `MODERATION_MOCKERY_KEYWORDS`, `MODERATION_MOCKERY_EMOJIS` | Ejaan ejekan, tawa, dan emoji mockery |
| `MODERATION_FUZZY_MAX_EDIT_DISTANCE`, `MODERATION_FUZZY_MIN_TOKEN_LENGTH` | Toleransi typo dan panjang minimum token fuzzy |
| `MODERATION_PREFIX_VARIANT_MAX_EXTRA`, `MODERATION_MATCH_PREFIX_VARIANTS` | Toleransi akhiran/panjang kata tambahan |
| `MODERATION_MAX_SIGNALS_PER_CATEGORY` | Batas kontribusi skor per kategori agar alias tak dihitung berulang |
| `MODERATION_NORMALIZE_UNICODE`, `MODERATION_ACCENT_FOLDING`, `MODERATION_STRIP_ZERO_WIDTH` | Normalisasi Unicode, aksen, dan karakter zero-width |
| `MODERATION_MAP_LEETSPEAK`, `MODERATION_LEETSPEAK_MAP` | Penggantian angka/simbol dengan huruf |
| `MODERATION_COLLAPSE_REPEATED_CHARS`, `MODERATION_REPEAT_CHAR_LIMIT` | Normalisasi huruf yang dipanjangkan |
| `MODERATION_MATCH_SEPARATED_ACRONYMS`, `MODERATION_MATCH_MOCKERY_EMOJI`, `MODERATION_LOG_MATCH_SCORE` | Deteksi akronim, emoji, dan pencatatan skor |
| `MODERATION_BLOCKED_PHRASES` | Frasa spesifik yang akan terdeteksi langsung |
| `WELCOME_TEMPLATE`, `MSG_APPROVED_TEMPLATE`, dst | Teks-teks pesan ke calon anggota |

---

## 📁 Struktur file

```
epistemeus-wa-verifikator/
├── index.js       ← logika utama (baileys, multi-grup, state machine verifikasi, command owner)
├── config.js      ← owner number, aturan moderasi, dan bank pertanyaan (opsional diedit)
├── moderation.js  ← matcher moderasi lokal berbobot
├── ollama.js      ← client Ollama lokal untuk klasifikasi moderasi
├── store.js       ← penyimpanan (file data.json, dibuat & dikelola otomatis)
├── package.json
└── README.md      ← file ini
```

`data.json` dan folder `auth_session/` dibuat otomatis saat pertama jalan.
Jangan dibagikan ke siapa pun — isinya kredensial WA dan data verifikasi.

---

## 🔧 Troubleshooting

**Error `groupRequestParticipantsList is not a function` /
`groupGetInviteInfo is not a function`**
→ Versi Baileys yang terpasang belum punya fitur ini. Update:
```
npm install @whiskeysockets/baileys@latest
```
Fitur *membership approval requests* relatif baru di ekosistem Baileys
(API tidak resmi WhatsApp), jadi kalau masih ada kendala setelah update,
cek issue/dokumentasi terbaru di repo GitHub-nya.

**Bot bilang grup berhasil didaftarkan tapi tidak pernah mendeteksi
permintaan join** → cek dua hal di bagian "Yang wajib disiapkan manual"
di atas: mode approval aktif, dan bot sudah jadi admin grup.
