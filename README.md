# FinSight – Personal Finance Analyzer Dashboard

> Dashboard analisis keuangan pribadi berbasis web untuk memvisualisasikan arus kas, mendeteksi pengeluaran anomali, dan menemukan strategi penghematan.

![FinSight Dashboard Preview](preview.png)

---

## Daftar Isi

- [Tentang Proyek](#tentang-proyek)
- [Fitur](#fitur)
- [Tampilan Dashboard](#tampilan-dashboard)
- [Dataset](#dataset)
- [Struktur Proyek](#struktur-proyek)
- [Teknologi](#teknologi)
- [Cara Menjalankan](#cara-menjalankan)
- [Metode Deteksi Anomali](#metode-deteksi-anomali)
- [Strategi Penghematan](#strategi-penghematan)

---

## Tentang Proyek

**FinSight** adalah dashboard analisis keuangan pribadi yang sepenuhnya berjalan di sisi klien (*client-side*) tanpa backend. Aplikasi membaca data transaksi dari file `dataset.csv`, memproses statistik secara lokal di browser, lalu menyajikan visualisasi interaktif, deteksi anomali berbasis statistik, dan rekomendasi strategi penghematan.

---

## Fitur

### Tab Overview
| Komponen | Deskripsi |
|---|---|
| **Total Expenses** | Total keseluruhan pengeluaran dari semua transaksi |
| **Avg. Monthly Spend** | Rata-rata pengeluaran per bulan |
| **Avg. Transaction** | Rata-rata nilai per transaksi |
| **Anomalies Detected** | Jumlah transaksi yang terdeteksi sebagai anomali |
| **Monthly Spending** | Grafik batang pengeluaran bulanan dengan garis rata-rata (*By month*) |
| **Category Breakdown** | Grafik donat proporsi pengeluaran per kategori (*All time*) |
| **Category Frequency** | Grafik batang horizontal jumlah transaksi per kategori (*Transaction count*) |
| **Average Expense by Category** | Grafik batang rata-rata nilai pengeluaran per kategori (*Mean spend*) |
| **Transaction Timeline** | Scatter plot semua transaksi dari waktu ke waktu — anomali ditandai sebagai segitiga amber (*Amount · anomalies highlighted*) |

### Tab Analysis
| Komponen | Deskripsi |
|---|---|
| **Anomaly Expenses** | Daftar transaksi anomali lengkap dengan metode deteksi (IQR fence, Z-score) |
| **Saving Strategy** | Rekomendasi penghematan berbasis aturan dengan estimasi potensi tabungan |
| **Expenses Summary** | Tabel ringkasan per kategori: jumlah transaksi, total, rata-rata, minimum, maksimum, dan share |

### Tab Transactions
| Komponen | Deskripsi |
|---|---|
| **Search** | Cari berdasarkan deskripsi, kategori, atau nominal |
| **Category filter** | Filter transaksi berdasarkan kategori |
| **Month filter** | Filter transaksi berdasarkan bulan |
| **Anomalies only** | Toggle untuk menampilkan hanya transaksi anomali |
| **Sortable columns** | Klik header kolom (Date, Description, Category, Amount) untuk mengurutkan |
| **Configurable pagination** | Pilihan jumlah baris per halaman: 10 / 20 / 50 / 100 |
| **Anomaly indicator** | Baris dengan ikon ⚠ dan latar amber menandai transaksi anomali |

---

## Tampilan Dashboard

Berikut tampilan dashboard FinSight pada tab **Overview**:

![FinSight Overview Tab](preview.png)

Komponen yang terlihat pada screenshot:

- **Navbar** — logo *FinSight*, navigasi tab (Overview · Analysis · Transactions), dan badge status data di kanan atas (*100 transactions loaded*)
- **KPI Row** — empat kartu metrik utama: *Total Expenses* ($38,140.53), *Avg. Monthly Spend* ($7,628.11), *Avg. Transaction* ($381.41), dan *Anomalies Detected* (16 — ditampilkan dalam warna amber)
- **Monthly Spending** — batang merah muda untuk Januari 2023 yang jauh melampaui rata-rata ($7,628.11), ditunjukkan oleh garis putus-putus amber horizontal
- **Category Breakdown** — donat dengan 12 segmen warna; kategori dominan adalah *Rent* (teal) dan *Construction* (oranye)
- **Category Frequency** — *Utilities* memimpin frekuensi transaksi (~25), diikuti *Subscriptions* (~21) dan *Food* (~20)
- **Average Expense by Category** — *Construction* memiliki rata-rata tertinggi (~$8,000), jauh melampaui kategori lain
- **Transaction Timeline** — titik teal = normal; segitiga amber = anomali; garis putus-putus amber menunjukkan batas IQR fence ($440.00)

---

## Dataset

Dataset yang digunakan adalah **ExpensePredict** dari Infinite Dataset Hub.

- **Sumber:** https://huggingface.co/datasets/infinite-dataset-hub/ExpensePredict
- **Lisensi:** MIT
- **Ukuran:** 100 baris (split train)
- **Kolom:** idx, date, description, amount, category, label

File disimpan secara lokal sebagai `dataset.csv` di root proyek. Aplikasi mengambilnya via `fetch()` relatif dari `index.html`.

### Skema Kolom

| Kolom | Tipe | Deskripsi |
|---|---|---|
| `idx` | integer | Indeks baris asli dari CSV |
| `date` | string (YYYY-MM-DD) | Tanggal transaksi |
| `description` | string | Deskripsi pengeluaran |
| `amount` | float | Nominal pengeluaran dalam USD |
| `category` | string | Kategori pengeluaran |
| `label` | string | Label lengkap (mis. *Food Expenses*) |

### Kategori yang Ada

`Construction` · `Education` · `Entertainment` · `Equipment` · `Food` · `Insurance` · `Legal` · `Maintenance` · `Other` · `Rent` · `Subscriptions` · `Utilities`

### Statistik Dataset

| Metrik | Nilai |
|---|---|
| Total transaksi | 100 |
| Rentang waktu | 2023-01-01 → 2023-05-20 |
| Total pengeluaran | $38,140.53 |
| Rata-rata per bulan | $7,628.11 |
| Rata-rata per transaksi | $381.41 |
| Rentang nilai | $0.99 – $8,000.00 |
| Transaksi anomali (IQR) | 16 |

---

## Struktur Proyek

```
finsight/
├── index.html          # Shell HTML utama — struktur dashboard, navigasi, semua section
├── style.css           # Kelas komponen kustom (panel, KPI, tabel, toggle, paginasi)
├── dataset.csv         # Sumber data transaksi
└── js/
    ├── data.js         # Parser CSV, model Transaction, singleton AppData
    ├── analytics.js    # Deteksi anomali (IQR + Z-score), statistik, strategi penghematan
    ├── charts.js       # Lima renderer Chart.js (bar, donat, scatter, horizontal bar)
    ├── table.js        # Tabel transaksi: filter, sort, paginasi, indikator anomali
    ├── ui.js           # Orkestrasi UI: tab, KPI cards, panel analisis, ringkasan
    └── main.js         # Bootstrap: load → analyze → render
```

### Alur Data

```
dataset.csv
    │
    ▼
data.js  ──────────────────────────────► AppData (singleton)
    (fetch + parse CSV)                  .transactions[]
                                         .byMonth Map
                                         .byCategory Map
                                         │
                                         ▼
                                    analytics.js
                                    (IQR + Z-score)
                                         │
                                         ▼
                                    Analytics (singleton)
                                    .anomalies[]
                                    .categoryStats[]
                                    .monthlyStats[]
                                    .savingStrategy[]
                                         │
                              ┌──────────┼──────────┐
                              ▼          ▼          ▼
                           charts.js  table.js   ui.js
                           (5 grafik) (tabel)   (panel)
```

---

## Teknologi

| Teknologi | Versi | Kegunaan |
|---|---|---|
| **HTML5** | — | Struktur semantik, ARIA, aksesibilitas |
| **Tailwind CSS** | CDN Play | Utilitas layout, spacing, warna |
| **style.css** | — | Komponen kustom (panel, toggle, pagination) |
| **Vanilla JS** | ES2020 | Logika aplikasi tanpa framework |
| **Chart.js** | 4.4.3 | Lima visualisasi grafik interaktif |
| **chartjs-plugin-annotation** | 3.0.1 | Garis threshold IQR dan rata-rata pada grafik |

> Tidak ada dependensi Node.js, build tool, atau backend. Cukup buka `index.html` di browser.

---

## Cara Menjalankan

### Prasyarat

Browser modern (Chrome 90+, Firefox 88+, Edge 90+, Safari 14+). Koneksi internet diperlukan untuk memuat CDN Tailwind dan Chart.js.

### Langkah

1. **Clone atau unduh** repositori ini:
   ```bash
   git clone <url-repositori>
   cd finsight
   ```

2. **Pastikan `dataset.csv` ada** di root proyek (sudah disertakan).

3. **Jalankan via server lokal** (wajib — `fetch()` tidak bisa digunakan dari `file://`):

   ```bash
   # Menggunakan Python 3 (paling mudah)
   python3 -m http.server 8000

   # Atau menggunakan Node.js (npx)
   npx serve .

   # Atau ekstensi VS Code: Live Server (klik kanan index.html → Open with Live Server)
   ```

4. **Buka browser** dan navigasi ke:
   ```
   http://localhost:8000
   ```

5. Dashboard akan memuat otomatis dan menampilkan badge **"100 transactions loaded"** di pojok kanan atas navbar.

---

## Metode Deteksi Anomali

Implementasi ada di [`js/analytics.js`](js/analytics.js), fungsi `detectAnomalies()`.

Digunakan pendekatan **dual-method**: sebuah transaksi ditandai anomali jika **salah satu atau kedua** metode terpicu.

### Metode 1 — IQR Fencing

```
Upper fence = Q3 + (1.5 × IQR)
Lower fence = Q1 − (1.5 × IQR)
```

Jika `amount > upper fence` atau `amount < lower fence`, transaksi ditandai anomali.  
Pada dataset ini: **upper fence ≈ $440.00** (terlihat sebagai garis putus-putus pada Transaction Timeline).

### Metode 2 — Z-Score

```
Z = |amount − mean| / stdDev
```

Jika `Z > 2.5`, transaksi ditandai anomali. Threshold 2.5σ dipilih karena lebih sensitif untuk sampel kecil (n=100).

### Contoh Anomali Terdeteksi

| Transaksi | Nominal | Alasan |
|---|---|---|
| Building renovation costs | $8,000.00 | IQR fence + Z-score |
| Office rent payment | $3,000.00 | IQR fence |
| Lease payment – Midtown | $3,200.00 | IQR fence |
| Disneyland trip | $750.00 | IQR fence |
| Annual Adobe CC renewal | $499.99 | IQR fence |

---

## Strategi Penghematan

Tab **Analysis → Saving Strategy** menampilkan rekomendasi berbasis aturan yang dihasilkan oleh fungsi `generateSavingStrategy()` di [`js/analytics.js`](js/analytics.js).

Setiap rekomendasi memiliki:
- **Prioritas** — `high` (merah) · `medium` (amber) · `low` (teal)
- **Estimasi potensi tabungan** — dihitung dari pola data aktual
- **Penjelasan detail** — merujuk pada persentase dan nominal nyata dari dataset

Contoh rekomendasi yang dihasilkan:

| Judul | Prioritas | Dasar Logika |
|---|---|---|
| Reduce Rent spending | High | Rent > 15% total pengeluaran |
| Investigate anomalous transactions | High | 16 transaksi outlier terdeteksi |
| Audit recurring subscriptions | Medium | 21 entri langganan ditemukan |
| Cap discretionary entertainment | Medium | Entertainment > 5% total |
| Shift from dining out to home cooking | Low | >30% food spend = makan di luar |
| Build a 3-month emergency fund | Low | Cadangan darurat 3× rata-rata bulanan |

---

## Aksesibilitas

Dashboard mematuhi pedoman **WCAG AA**:

- Skip navigation link (`Skip to main content`) untuk pengguna keyboard
- Semua kontrol interaktif memiliki atribut `aria-label`
- Toggle switch menggunakan `role="switch"` dengan `aria-checked`
- Tabel menggunakan `scope="col"`, `aria-label`, dan `aria-live` untuk pembaruan dinamis
- Kontras warna teks ≥ 4.5:1 pada semua elemen body, ≥ 3:1 pada teks besar
- Focus ring konsisten (`2px solid #2dd4bf`) di seluruh elemen

---

## Lisensi

Proyek ini dibuat untuk keperluan pembelajaran. Dataset bersumber dari Hugging Face (lisensi mengikuti repositori sumber).

---

*FinSight · Personal Finance Analyzer · Data sourced from dataset.csv*  
*Built with Chart.js · Tailwind CSS · Vanilla JS*
