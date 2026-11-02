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

## Persyaratan

- Node.js versi 18 atau lebih baru.
- npm.
- Akun WhatsApp untuk menjalankan bot.
- Hak administrator bot pada setiap grup yang dipantau.
- Ollama dan model `qwen2.5:3b` untuk menggunakan chatbot `.ai` dan penilaian moderasi AI. Aturan moderasi lokal tetap tersedia jika Ollama tidak dapat diakses.

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
| `.ai <pertanyaan>` | Mengirim pertanyaan kepada chatbot lokal berbasis Ollama. |
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
| `OLLAMA_MODEL` | Model untuk chatbot dan moderasi AI. Nilai bawaan `qwen2.5:3b`. |
| `OLLAMA_MODERATION_ENABLED` | Mengaktifkan penilaian moderasi melalui Ollama. |
| `AUTO_MODERATION_ENABLED` | Mengaktifkan moderasi otomatis berbasis aturan lokal. |
| `MAX_WARNINGS_BEFORE_KICK` | Jumlah peringatan sebelum bot mencoba mengeluarkan anggota. Nilai bawaan tiga. |
| `MODERATION_OWNER_EXEMPT` | Mengecualikan pemilik bot dari moderasi otomatis. Nilai bawaan `true`. |
| `MODERATION_ADMIN_EXEMPT` | Mengecualikan administrator grup dari moderasi otomatis. Nilai bawaan `false`. |
| `JOURNAL_SEARCH_ENABLED` | Mengaktifkan pencarian metadata jurnal. |
| `CROSSREF_CONTACT_EMAIL` | Alamat email opsional untuk permintaan ke Crossref. |

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

**Ollama tidak tersedia**

Pastikan layanan Ollama berjalan, alamat `OLLAMA_BASE_URL` benar, dan model
`qwen2.5:3b` tersedia. Moderasi berbasis aturan lokal tetap berjalan saat
penilaian AI tidak dapat digunakan. Perintah `.ai` memerlukan layanan Ollama.

**Fungsi Baileys tidak ditemukan**

Pastikan dependensi Baileys telah terpasang sesuai versi dalam `package-lock.json`.
Periksa dokumentasi dan catatan rilis Baileys sebelum mengubah versinya karena
API pengelolaan permintaan anggota dapat berbeda antarversi.
