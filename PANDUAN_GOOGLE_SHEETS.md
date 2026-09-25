# Panduan Integrasi Google Sheets ke SIM-Guru Bahasa Indonesia

Dokumen ini menjelaskan cara menghubungkan aplikasi web **SIM-Guru Bahasa Indonesia SMA** dengan **Google Sheets**, sehingga seluruh data presensi, absensi harian, daftar siswa, kelas, dan butir soal langsung tersimpan secara otomatis di cloud Google Sheets Anda, bukan hanya di browser lokal.

---

## Langkah 1: Buat Spreadsheet Baru di Google Sheets
1. Buka browser dan kunjungi [Google Sheets](https://sheets.google.com).
2. Buat dokumen baru (Blank Spreadsheet).
3. Beri nama file spreadsheet, misalnya: **`SIM-Guru Bahasa Indonesia 2026`**.

---

## Langkah 2: Buka Apps Script
1. Di bilah menu Google Sheets, klik menu **Ekstensi** (*Extensions*) > **Apps Script**.
2. Jendela editor skrip Google Apps Script akan terbuka di tab baru.

---

## Langkah 3: Pasang Kode Skrip
1. Hapus seluruh baris teks bawaan (`function myFunction() { ... }`) yang ada di editor.
2. Buka file [`google_apps_script.js`](file:///c:/Users/Lenovo/Documents/index.html/sim/google_apps_script.js) di folder ini, lalu salin (*copy*) seluruh isinya.
   *(Atau klik tombol "Salin Seluruh Kode" di dalam jendela popup Google Sheets pada aplikasi web).*
3. Tempel (*paste*) ke dalam editor Apps Script.
4. Klik tombol **Simpan** (ikon disket) atau tekan tombol `Ctrl + S`.

---

## Langkah 4: Terapkan Sebagai Aplikasi Web (Deploy as Web App)
> [!IMPORTANT]
> Pastikan pengaturan hak akses disetel ke **Siapa saja (Anyone)** agar aplikasi web SIM-Guru dapat mengirimkan data presensi dan siswa tanpa kendala otorisasi berulang.

1. Di pojok kanan atas editor Apps Script, klik tombol biru **Terapkan** (*Deploy*) > pilih **Kelola Penyiapan** (*New deployment*).
2. Di panel sebelah kiri, klik ikon gerigi ⚙️ di sebelah *Select type*, lalu pilih **Aplikasi Web** (*Web app*).
3. Isi konfigurasi sebagai berikut:
   - **Deskripsi**: `SIM-Guru Backend API`
   - **Jalankan sebagai** (*Execute as*): `Saya (email Anda)`
   - **Siapa yang memiliki akses** (*Who has access*): **Siapa saja** (*Anyone*)
4. Klik tombol **Terapkan** (*Deploy*).
5. Jika Google meminta persetujuan izin (*Authorization required*):
   - Klik **Tinjau Izin** (*Review Permissions*).
   - Pilih akun Google Anda.
   - Klik **Lanjutan** (*Advanced*) di bagian kiri bawah, lalu klik **Buka SIM-Guru Backend API (tidak aman)** (*Go to SIM-Guru Backend API*).
   - Klik **Izinkan** (*Allow*).
6. Setelah selesai, Google akan menampilkan **URL Aplikasi Web** (berakhiran `/exec`).
7. Klik **Salin** (*Copy*) pada URL Aplikasi Web tersebut.

---

## Langkah 5: Hubungkan ke Aplikasi SIM-Guru
1. Buka aplikasi web [`sim_guru_bahasa_indonesia.html`](file:///c:/Users/Lenovo/Documents/index.html/sim/sim_guru_bahasa_indonesia.html).
2. Di pojok kanan atas navigasi, klik tombol **Google Sheets** (ikon spreadsheet).
3. Tempelkan URL yang sudah disalin ke kolom **URL Web App Google Apps Script**.
4. Klik tombol **Tes Koneksi & Simpan**.
5. Jika berhasil, status akan berubah menjadi hijau: **Google Sheets: Terhubung**.
6. Klik tombol **Kirim Semua Data ke Google Sheets** untuk inisialisasi sheet secara otomatis.

---

## Struktur Sheet yang Otomatis Dibuat di Google Sheets:
1. **`Presensi`**: Menyimpan riwayat kehadiran setiap siswa (Waktu, Tanggal, Kelas, NIS, Nama, Status Kehadiran H/S/I/A, Catatan Keaktifan).
2. **`Data_Siswa`**: Menyimpan basis data siswa per kelas (ID Kelas, NIS, NISN, Nama, Jenis Kelamin).
3. **`Data_Kelas`**: Menyimpan daftar rombel kelas dan fasenya.
4. **`Bank_Soal`**: Menyimpan butir soal evaluasi (Formatif, Sumatif, stimulus, rubrik jawaban).
5. **`_APP_STATE`**: Cadangan status instan untuk sinkronisasi cepat antar perangkat/gadget.
