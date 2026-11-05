# Ronan Calloway Bot

Bot WhatsApp untuk mengelola verifikasi calon anggota pada beberapa grup. Bot
mengirim pertanyaan melalui pesan pribadi dan meneruskan jawaban kepada pemilik
bot untuk ditinjau. Keputusan menerima atau menolak permintaan tetap dilakukan
oleh pemilik bot.

Bot menggunakan [Baileys](https://github.com/WhiskeySockets/Baileys) dan
berjalan dengan Node.js. Bot tidak memerlukan Chromium atau Puppeteer.

## Fitur

- Memantau permintaan bergabung pada beberapa grup terdaftar.
- Mengajukan pertanyaan mengenai identitas, motivasi, serta tujuan calon anggota.
- Mengantrekan sesi verifikasi agar jawaban dari beberapa grup tidak tercampur.
- Menyediakan keputusan penerimaan dan penolakan oleh pemilik bot.
- Menyediakan permainan tebak angka dan tebak kata dengan pencatatan skor per grup.
- Menyediakan jajak pendapat, pencarian metadata artikel jurnal, saran, laporan, dan moderasi otomatis.
- Menyediakan moderasi berbasis aturan lokal serta moderasi AI melalui Ollama.
- Menyediakan downloader audio MP3 publik melalui command `.mp3 <link YouTube>` dengan batas durasi, ukuran, dan cooldown.
- Menyediakan chatbot Ollama lokal serta provider cloud melalui Groq, Gemini, OpenRouter, dan Cerebras.
- Menyediakan pembuatan gambar AI dengan Cloudflare Workers AI melalui `.image <deskripsi>`.
- Menyediakan broadcast owner ke semua grup terdaftar, pemeriksaan status verifikasi, pembuatan sticker dari gambar/GIF, dan terjemahan teks.

## Persyaratan

- Node.js versi 18 atau lebih baru.
- npm.
- Akun WhatsApp untuk menjalankan bot.
- Hak administrator bot pada setiap grup yang dipantau.
- Ollama dan model `deepscaler` untuk `.mathai`; model `llama-guard3:1b`
  digunakan untuk moderasi AI.

## Instalasi dan Menjalankan Bot

Jalankan perintah berikut dari direktori proyek:

```bash
npm install
npm start
```

Pindai kode QR yang tampil pada terminal menggunakan menu Perangkat Tertaut di
WhatsApp. Gunakan akun yang akan menjadi akun bot. Setelah terhubung, sesi
autentikasi akan tersimpan secara lokal.

Atur nomor pemilik bot pada `OWNER_NUMBER` di `config.js`. Gunakan format
internasional tanpa tanda tambah, spasi, atau tanda hubung.

Unduh model matematika DeepScaleR yang digunakan `.mathai` dengan:

```bash
ollama pull deepscaler
```

Unduh model Llama Guard yang digunakan untuk moderasi AI:

```bash
ollama pull llama-guard3:1b
```

Untuk menggunakan provider AI cloud, buat file `.env` di folder proyek dan
masukkan nama variabel serta API key/token yang sesuai. Contoh isi:

```env
GROQ_API_KEY=isi_api_key_groq
GEMINI_API_KEY=isi_api_key_gemini
OPENROUTER_API_KEY=isi_api_key_openrouter
CEREBRAS_API_KEY=isi_api_key_cerebras

# Cloudflare Workers AI untuk command .image
CLOUDFLARE_ACCOUNT_ID=isi_account_id_cloudflare
CLOUDFLARE_API_TOKEN=isi_api_token_cloudflare
MENU_IMAGE_PATH=/path/ke/gambar-menu.png

# Opsional: ganti model default.
# GROQ_MODEL=qwen/qwen3.8-27b
# GEMINI_MODEL=gemini-3.8-flash
# OPENROUTER_MODEL=openai/gpt-4o-mini
# OPENROUTER_SOSHUM_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
# OPENROUTER_SOSHUM_TIMEOUT_MS=600000
# OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS=8192
# OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS=60000
# CEREBRAS_MODEL=llama-3.3-70b
# CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-1-schnell
```

Jangan tambahkan tanda kutip atau spasi di sekitar nilai API key. Setelah
membuat atau mengubah `.env`, mulai ulang bot agar konfigurasi baru dimuat.
File `.env` sudah diabaikan Git: jangan pernah memasukkan API key ke source
code, mengirimnya ke orang lain, atau commit file tersebut. Pada hosting, isi
key sebagai environment variables/secrets di pengaturan hosting. Perubahan kode
bisa di-push dan di-deploy tanpa mengirim atau memasukkan ulang key.

## Menyiapkan Grup

Untuk setiap grup yang akan dipantau:

1. Pastikan fitur persetujuan anggota aktif melalui pengaturan grup WhatsApp.
2. Pastikan akun bot telah menjadi administrator grup. WhatsApp tidak
   mengizinkan bot menaikkan hak akses akunnya sendiri.
3. Kirim perintah berikut kepada bot melalui pesan pribadi dari akun pemilik:

   ```text
   .addgroup https://chat.whatsapp.com/kode-undangan
   ```

Bot akan bergabung ke grup jika belum menjadi anggota, lalu mulai memantau
permintaan bergabung. Status pemantauan dapat diperiksa dengan `.status` dan
daftar grup dapat dilihat dengan `.listgroup`.

## Alur Verifikasi

1. Bot mendeteksi permintaan bergabung pada grup terdaftar.
2. Bot mengirim pertanyaan kepada calon anggota melalui pesan pribadi.
3. Pertanyaan mencakup identitas dan latar belakang yang relevan, motivasi,
   serta tujuan bergabung.
4. Setelah jawaban diterima, bot meneruskan ringkasan sesi kepada pemilik bot
   dengan ID unik.
5. Pemilik bot meninjau jawaban, lalu menggunakan `.approve <id>` atau
   `.reject <id>` untuk memutuskan permintaan.

Jika nomor yang sama memiliki permintaan pada beberapa grup dalam waktu
berdekatan, bot memproses sesi secara berurutan. Setelah anggota bergabung,
bot dapat mengirim pesan sambutan dan menampilkan foto profil jika tersedia.
Foto profil tidak disimpan oleh bot.
Anggota dapat memakai `.verifstatus` melalui DM bot untuk melihat status
verifikasi terakhir per grup.

## Perintah Pemilik

Kirim perintah berikut melalui pesan pribadi kepada bot. Perintah pemilik hanya
dapat digunakan oleh nomor yang terdaftar pada `OWNER_NUMBER` atau akun bot
sendiri melalui perangkat tertaut.

| Perintah | Keterangan |
|---|---|
| `.menu` | Menampilkan daftar perintah yang tersedia. Dapat digunakan oleh semua pengguna. |
| `.addgroup <tautan>` | Mendaftarkan grup untuk dipantau. |
| `.listgroup` | Menampilkan grup terdaftar beserta nomor urutnya. |
| `.delgroup <nomor>` | Menghapus grup dari daftar pemantauan. |
| `.broadcast <pesan>` | Mengirim pesan ke semua grup terdaftar secara berurutan. Gunakan melalui DM owner ke bot. |
| `.pending` | Menampilkan sesi verifikasi yang menunggu keputusan. |
| `.status` | Menampilkan status grup, sesi, antrean, dan pemantauan. |
| `.pause` / `.resume` | Menghentikan atau melanjutkan pemeriksaan permintaan bergabung. Sesi yang berjalan tetap menerima jawaban. |
| `.testgroup <nomor>` | Memeriksa informasi grup dan akses bot terhadap daftar permintaan. |
| `.banlist <nomor>` | Menampilkan daftar blokir pada grup. |
| `.review <id>` | Menampilkan jawaban sesi tanpa mengubah statusnya. |
| `.cancel <id>` | Menghapus sesi lokal. Status permintaan di WhatsApp tidak berubah. |
| `.approve <id>` | Menyetujui permintaan bergabung. |
| `.reject <id>` | Menolak permintaan bergabung. |
| `.ollama status` | Menampilkan status layanan dan model Ollama. |
| `.ollama on` / `.ollama off` | Mengaktifkan atau menonaktifkan penilaian moderasi AI. |
| `.ollama reset` | Mengatur ulang status pengelolaan moderasi Ollama. |
| `.ollama test` | Menguji klasifikasi moderasi melalui Ollama. |

## Perintah Grup

Perintah berikut tersedia pada grup terdaftar. Perintah `!about` juga dapat
digunakan melalui pesan pribadi. `.menu` menampilkan daftar perintah publik dan
perintah khusus pemilik.

| Perintah | Keterangan |
|---|---|
| `!about` | Menampilkan informasi pemilik, lisensi, repositori, dan fungsi bot. |
| `.tebakangka` lalu `.tebak <1-50>` | Memulai dan menjawab permainan tebak angka. |
| `.tebakkata` lalu `.jawabkata <kata>` | Memulai dan menjawab permainan tebak kata. |
| `.skor` | Menampilkan skor pengguna. |
| `.topskor` | Menampilkan lima skor tertinggi. |
| `.poll <pertanyaan> \| <opsi 1>; <opsi 2>` | Membuat jajak pendapat dengan dua sampai lima opsi. |
| `.vote <nomor>` | Memilih atau mengubah pilihan. |
| `.hasilpoll` | Menampilkan hasil jajak pendapat. |
| `.tutupoll` | Menutup jajak pendapat jika pengguna berwenang. |
| `.profil` | Menampilkan skor dan peringkat pengguna. |
| `.jurnal <topik>` | Mencari metadata artikel jurnal melalui Crossref. |
| `.mathai <soal>` | Menyelesaikan soal matematika menggunakan DeepScaleR lokal melalui Ollama. |
| `.image <deskripsi>` | Membuat gambar dari prompt menggunakan Cloudflare Workers AI. Memerlukan `CLOUDFLARE_ACCOUNT_ID` dan `CLOUDFLARE_API_TOKEN` di `.env`. |
| `.groq <pertanyaan>` | Mengirim pertanyaan ke Groq. Memerlukan `GROQ_API_KEY` di `.env`. |
| `.gemini <pertanyaan>` | Mengirim pertanyaan ke Gemini. Memerlukan `GEMINI_API_KEY` di `.env`. |
| `.openrouter <pertanyaan>` | Mengirim pertanyaan ke OpenRouter. Memerlukan `OPENROUTER_API_KEY` di `.env`. |
| `.soshumai <pertanyaan>` | Menjawab pertanyaan sosial-humaniora melalui model Nemotron di OpenRouter. Menggunakan `OPENROUTER_API_KEY` yang sama; model dapat diatur lewat `OPENROUTER_SOSHUM_MODEL`. |
| `.cerebras <pertanyaan>` | Mengirim pertanyaan ke Cerebras. Memerlukan `CEREBRAS_API_KEY` di `.env`. |
| `.mp3 <link YouTube>` | Mengunduh audio dari video YouTube dan mengirimkannya sebagai MP3. Dapat digunakan semua pengguna di DM atau grup terdaftar. |
| `.sticker` | Mengubah gambar atau GIF menjadi sticker. Kirim gambar/GIF dengan caption `.sticker`, atau balas gambar/GIF dengan command ini. |
| `.translate <kode-bahasa> <teks>` | Menerjemahkan teks, misalnya `.translate en Selamat pagi`. Tersedia di DM atau grup terdaftar. |
| `.saran <isi>` | Mengirim saran secara pribadi kepada pemilik bot. |
| `.lapor @anggota [alasan]` | Mengirim laporan secara pribadi kepada pemilik bot. |

Permainan berbagi satu sesi aktif pada setiap grup dan memiliki jeda 30 detik.
Jajak pendapat berlaku selama 24 jam, dengan jeda lima menit sebelum jajak
pendapat baru dapat dibuat pada grup yang sama. Pencarian jurnal menampilkan
maksimal 20 judul dan tautan DOI atau penerbit. Bot tidak mengambil abstrak
atau mengunduh berkas. Kata kunci pencarian dikirim ke layanan Crossref.

Saran dan laporan diteruskan melalui pesan pribadi kepada pemilik bot. Setiap
anggota memiliki jeda 60 detik untuk masing-masing jenis perintah pada setiap
grup.

### Downloader MP3

Perintah `.mp3 <link YouTube>` dapat digunakan oleh semua pengguna, baik melalui
DM maupun di grup yang sudah terdaftar. Bot hanya menerima URL YouTube, tidak
memproses playlist, membatasi durasi sesuai konfigurasi, dan mengirim audio
berkualitas 128 kbps jika ukuran file masih sesuai batas WhatsApp. Proses
membutuhkan `ffmpeg` yang disediakan oleh dependency `ffmpeg-static` serta
`yt-dlp` melalui `yt-dlp-exec`. Gunakan fitur ini hanya untuk konten yang kamu
miliki atau yang memang diizinkan untuk diunduh, dan tetap patuhi ketentuan
YouTube serta hak cipta.

Downloader menggunakan satu proses aktif pada satu waktu dan cooldown per
pengguna/chat untuk mengurangi beban server. File sementara dihapus setelah
pengiriman atau ketika proses gagal. Link video dinormalisasi agar parameter
playlist/radio tidak memicu pemrosesan playlist. Sebagian video tetap tidak
dapat diakses jika YouTube meminta login atau memblokir permintaan downloader;
dalam kondisi tersebut bot menampilkan pesan yang menjelaskan kendalanya.

### Sticker, Terjemahan, dan Status Verifikasi

Perintah `.sticker` menerima gambar atau GIF hingga 10 MB. GIF dikonversi
menjadi sticker animasi dengan durasi maksimal delapan detik; hasil sticker
dibatasi hingga 1 MB. Untuk gambar yang sudah terkirim, balas gambar tersebut
dengan `.sticker`.

Perintah `.translate <kode-bahasa> <teks>` mendeteksi bahasa sumber secara
otomatis dan meminta terjemahan ke layanan MyMemory. Teks yang diminta untuk
diterjemahkan dikirim ke layanan tersebut; jangan gunakan untuk teks sensitif.
Panjang teks dibatasi 1.000 karakter dan command memiliki cooldown 30 detik per
pengguna/chat.

Perintah `.verifstatus` hanya menampilkan status sesi verifikasi milik pengirim
yang menggunakannya lewat DM bot, termasuk menunggu dimulai, sedang berlangsung,
menunggu keputusan owner, diterima, ditolak, kedaluwarsa, atau dibatalkan.
Riwayat menyimpan status dan nama grup terakhir per grup, bukan jawaban
verifikasi.

### Provider AI

Perintah `.mathai <soal>` menggunakan model DeepScaleR-1.5B-Preview dengan tag
Ollama `deepscaler`, yang dioptimalkan untuk penalaran matematika. Model ini
memberikan langkah penyelesaian ringkas serta jawaban akhir. Jika output model
memuat blok penalaran internal `<think>`, bot hanya mengirim bagian jawaban
setelah blok tersebut. Jawaban dikirim sebagai gambar PNG putih dengan rumus
yang dirender secara visual; solusi panjang dibagi menjadi beberapa halaman.
Unduh model dengan `ollama pull deepscaler` sebelum menggunakan command. Model
ini mendukung konteks panjang, tetapi batas teks perintah di bot adalah 12.000 karakter.
Ollama diberi waktu maksimum lima menit untuk menghasilkan hingga 4.096 token;
RAM/kecepatan inferensi bergantung pada perangkat yang menjalankan Ollama.

Moderasi AI memakai model terpisah `llama-guard3:1b` melalui endpoint Ollama
lokal yang sama. Saat aktif, AI dapat memeriksa pesan grup terdaftar meskipun
pesan tersebut tidak cocok dengan kata kunci lokal. Kebijakan mencakup
ancaman/kekerasan, aktivitas berbahaya atau kriminal, ujaran kebencian dan
rasisme, pelecehan/penghinaan/kata kasar yang menyerang, eksploitasi seksual,
dorongan menyakiti diri, doxxing, serta penipuan atau spam berbahaya. Diskusi
netral, edukasi, dukungan, dan kutipan yang mengecam pelanggaran tidak
seharusnya ditandai. Kata kasar dinilai berdasarkan konteks, bukan daftar kata
semata. Jika Ollama tidak tersedia atau jawaban model tidak valid, moderasi
berbasis aturan lokal tetap menjadi fallback. Status model dan pengujian dapat
diperiksa lewat `.ollama status` dan `.ollama test`. Ketika inferensi sedang
berlangsung atau pesan mendapat skor aturan lokal yang tinggi, bot memakai
hasil aturan lokal langsung agar pesan tidak menunggu inferensi tambahan.

Alternatif provider cloud tersedia melalui `.groq`, `.gemini`, `.openrouter`,
`.soshumai`, dan `.cerebras`, masing-masing diikuti pertanyaan. `.openrouter`
menggunakan model dari `OPENROUTER_MODEL`, sedangkan `.soshumai` menggunakan
key `OPENROUTER_API_KEY` yang sama dengan model khusus dari
`OPENROUTER_SOSHUM_MODEL` (default `nvidia/nemotron-3-ultra-550b-a55b:free`)
dan instruksi yang difokuskan pada pertanyaan sosial-humaniora. Ganti nilai
default di `.env` bila model tersebut tidak tersedia di akun OpenRouter.
Timeout `.soshumai` adalah sepuluh menit secara default dan dapat diubah lewat
`OPENROUTER_SOSHUM_TIMEOUT_MS` (dalam milidetik); provider lain tetap
menggunakan `AI_PROVIDER_TIMEOUT_MS`. Jawaban `.soshumai` dapat menggunakan
hingga 8.192 token dan 60.000 karakter; jawaban panjang otomatis dikirim dalam
beberapa pesan. Batas tersebut dapat diubah lewat
`OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS` dan
`OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS`.
`.image <deskripsi>` membuat
gambar melalui Cloudflare Workers AI. Untuk mengaktifkannya:

1. Di Cloudflare Dashboard, buka akun yang akan menjalankan Workers AI dan
   salin **Account ID** dari halaman akun.
2. Buat API Token Cloudflare dengan izin Workers AI yang diperlukan untuk
   menjalankan model pada akun tersebut. Jangan gunakan atau bagikan Global API
   Key.
3. Tambahkan `CLOUDFLARE_ACCOUNT_ID` dan `CLOUDFLARE_API_TOKEN` ke `.env` di
   direktori proyek, mengganti nilai contoh dengan nilai akun/token milikmu.
4. Simpan file lalu mulai ulang bot. Uji dengan `.image kucing astronot`.

Model gambar default adalah `@cf/black-forest-labs/flux-1-schnell` dan dapat
diubah lewat `CLOUDFLARE_IMAGE_MODEL`. Prompt gambar dibatasi 1.000 karakter
dan ada jeda 60 detik per pengguna/chat. Pembuatan gambar menggunakan layanan
Cloudflare Workers AI dan dapat dikenai batas pemakaian atau biaya sesuai
ketentuan akun Cloudflare.

Model tiap provider chat dapat diubah lewat variabel `*_MODEL` di `.env`.
Prompt yang dikirim ke provider cloud akan diproses oleh layanan provider
tersebut; jangan kirim data sensitif.

Atur key provider di `.env` lokal seperti dijelaskan pada bagian instalasi.
Jangan bagikan atau commit file `.env`. Jika key pernah terpublikasi, cabut key
tersebut di dashboard provider dan gunakan key baru. Di server hosting, masukkan
key pada pengaturan environment variables atau secrets agar tetap tersimpan saat
kode diperbarui.

### Gambar Menu

Perintah `.menu` mengirim gambar lalu teks menu. Secara default bot membaca
`/home/ronancalloway/Downloads/furreh/afurrypfp1.png`. Jika gambar berada di
lokasi berbeda (misalnya setelah clone ke komputer/server lain), atur
`MENU_IMAGE_PATH` di `.env` ke path absolut gambar pada mesin yang menjalankan
bot. Gambar tidak perlu di-commit ke repo. Jika file tidak ditemukan, bot
mencatat error dan tetap mengirim teks menu.

### Moderasi Grup

Pemilik bot dapat menggunakan perintah moderasi berikut pada grup terdaftar:

| Perintah | Keterangan |
|---|---|
| `.warn @anggota [alasan]` | Memberikan peringatan kepada anggota. |
| `.warnings @anggota` | Menampilkan jumlah peringatan anggota pada grup tersebut. |
| `.kick @anggota [alasan]` | Mengeluarkan anggota tanpa memasukkannya ke daftar blokir. |
| `.ban @anggota [alasan]` | Mengeluarkan anggota dan menolak permintaan bergabung berikutnya. |
| `.unban @anggota` | Menghapus anggota dari daftar blokir dan mengatur ulang peringatannya. |

Moderasi otomatis mencocokkan kata dan frasa berdasarkan aturan lokal, termasuk
variasi ejaan, akronim terpisah, hinaan, serangan, dan ejekan. Pesan yang
terdeteksi dapat dihapus dan menghasilkan peringatan. Setelah tiga peringatan,
bot mencoba mengeluarkan anggota jika tindakan tersebut diaktifkan dan bot
memiliki hak administrator.

Secara default, pesan dari pemilik bot dikecualikan dari moderasi otomatis,
sedangkan pesan administrator grup tetap diperiksa. Nilai ini dapat diubah
melalui `MODERATION_OWNER_EXEMPT` dan `MODERATION_ADMIN_EXEMPT` di `config.js`.
Penyebutan identitas yang netral atau suportif tidak ditujukan untuk dikenai
tindakan, tetapi pencocokan berbasis kata kunci dapat menghasilkan positif
palsu. Moderasi AI melalui Ollama dapat membantu menilai pesan kandidat.
Apabila Ollama tidak tersedia, bot menggunakan hasil aturan lokal.

Fitur blokir mengeluarkan anggota dan menolak permintaan bergabung berikutnya.
Baileys tidak menyediakan daftar blokir permanen untuk anggota grup WhatsApp.
Bot memerlukan hak administrator untuk menghapus pesan dan mengeluarkan
anggota. Pemeriksaan `.testgroup` tidak dapat memastikan pengaturan persetujuan
anggota jika daftar permintaan sedang kosong. Periksa pengaturan tersebut
langsung di WhatsApp.

## Konfigurasi

Pengaturan bot berada di `config.js`. Nilai yang umum disesuaikan meliputi:

| Pengaturan | Fungsi |
|---|---|
| `OWNER_NUMBER` | Nomor pemilik bot dalam format internasional tanpa tanda tambah. |
| `DRY_RUN` | Mengaktifkan mode simulasi. Nilai bawaan proyek ini `false`, sehingga tindakan WhatsApp dijalankan secara langsung. |
| `POLL_INTERVAL_MS` | Jeda pemeriksaan permintaan bergabung. Nilai bawaan 30 detik. |
| `SESSION_TIMEOUT_MS` | Batas waktu sesi verifikasi. Nilai bawaan 24 jam. |
| `VERIFICATION_GLOBAL_COOLDOWN_MS` | Jeda pengiriman pesan pembuka verifikasi. Nilai bawaan lima menit. |
| `VERIFICATION_NUMBER_COOLDOWN_MS` | Jeda verifikasi ulang untuk nomor yang sama. Nilai bawaan 10 menit. |
| `OLLAMA_BASE_URL` | Alamat layanan Ollama. Nilai bawaan `http://127.0.0.1:11434`. |
| `OLLAMA_MODEL` | Model asisten matematika `.mathai`. Nilai bawaan `deepscaler`. |
| `OLLAMA_MODERATION_MODEL` | Model classifier moderasi Ollama. Nilai bawaan `llama-guard3:1b`. |
| `OLLAMA_MODERATION_ENABLED` | Mengaktifkan penilaian moderasi melalui Ollama. |
| `AUTO_MODERATION_ENABLED` | Mengaktifkan moderasi otomatis berbasis aturan lokal. |
| `MAX_WARNINGS_BEFORE_KICK` | Jumlah peringatan sebelum bot mencoba mengeluarkan anggota. Nilai bawaan tiga. |
| `MODERATION_OWNER_EXEMPT` | Mengecualikan pemilik bot dari moderasi otomatis. Nilai bawaan `true`. |
| `MODERATION_ADMIN_EXEMPT` | Mengecualikan administrator grup dari moderasi otomatis. Nilai bawaan `false`. |
| `JOURNAL_SEARCH_ENABLED` | Mengaktifkan pencarian metadata jurnal. |
| `CROSSREF_CONTACT_EMAIL` | Alamat email opsional untuk permintaan ke Crossref. |
| `MP3_DOWNLOADER_ENABLED` | Mengaktifkan downloader MP3 publik. |
| `MP3_COOLDOWN_MS` | Jeda penggunaan downloader per pengguna dan chat. |
| `MP3_MAX_DURATION_SECONDS` | Durasi maksimum video yang boleh diproses. |
| `MP3_MAX_FILE_SIZE_BYTES` | Ukuran maksimum file MP3 yang dikirim. |
| `MP3_DOWNLOAD_TIMEOUT_MS` | Batas waktu proses metadata dan download. |
| `MP3_OUTPUT_DIR` | Direktori sementara file MP3. |
| `CLOUDFLARE_IMAGE_MODEL` | Model Workers AI untuk `.image`. Nilai bawaan `@cf/black-forest-labs/flux-1-schnell`. |
| `CLOUDFLARE_IMAGE_TIMEOUT_MS` | Batas waktu pembuatan gambar. Nilai bawaan dua menit. |
| `CLOUDFLARE_IMAGE_COOLDOWN_MS` | Jeda pemakaian `.image` per pengguna/chat. Nilai bawaan 60 detik. |
| `OPENROUTER_SOSHUM_TIMEOUT_MS` | Batas waktu `.soshumai` dalam milidetik. Nilai bawaan sepuluh menit. |
| `OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS` | Batas token jawaban `.soshumai`. Nilai bawaan 8.192. |
| `OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS` | Batas karakter jawaban `.soshumai`. Nilai bawaan 60.000. |

Pengaturan tambahan untuk pertanyaan verifikasi, batas permainan, jajak
pendapat, pencocokan kata moderasi, dan templat pesan tersedia di `config.js`.

## Data dan Keamanan

Bot menyimpan data operasional pada `data.json` dan sesi autentikasi WhatsApp
pada direktori `auth_session/`. Kedua lokasi tersebut dapat berisi informasi
sensitif. Batasi aksesnya dan jangan mengunggahnya ke repositori publik.

Gunakan akun WhatsApp khusus untuk bot jika memungkinkan. Baileys merupakan
implementasi tidak resmi, sehingga penggunaan tetap harus mematuhi ketentuan
WhatsApp dan dilakukan secara wajar.

## Pengujian

Jalankan seluruh pengujian dengan perintah berikut:

```bash
npm test
```

## Lisensi dan Repositori

Proyek ini dilisensikan berdasarkan GNU Affero General Public License versi 3
atau versi yang lebih baru (AGPL-3.0-or-later).

Hak cipta (C) 2026 Ronan Calloway / Kaelan Silvercrest.

Repositori: <https://github.com/Kaelan-Silvercrest/progresif-islam-project>

## Pemecahan Masalah

**Permintaan bergabung tidak terdeteksi**

Pastikan persetujuan anggota aktif pada pengaturan grup dan akun bot merupakan
administrator. Gunakan `.testgroup <nomor>` untuk memeriksa akses bot terhadap
informasi grup dan daftar permintaan.

**Downloader MP3 gagal**

Pastikan dependency sudah terpasang dengan `npm install`, link yang diberikan
merupakan URL video YouTube (bukan playlist), video tidak melebihi batas durasi,
dan `yt-dlp` masih dapat mengakses video tersebut. Beberapa video dapat gagal
karena pembatasan wilayah, login, atau perubahan layanan YouTube.

**Ollama tidak tersedia**

Pastikan layanan Ollama berjalan, alamat `OLLAMA_BASE_URL` benar, dan model
`deepscaler` tersedia untuk `.mathai` dan `llama-guard3:1b` tersedia untuk
moderasi AI. Moderasi berbasis aturan lokal tetap berjalan saat Ollama tidak
dapat dijangkau atau penilaian AI gagal.

**Fungsi Baileys tidak ditemukan**

Pastikan dependensi Baileys telah terpasang sesuai versi dalam `package-lock.json`.
Periksa dokumentasi dan catatan rilis Baileys sebelum mengubah versinya karena
API pengelolaan permintaan anggota dapat berbeda antarversi.
