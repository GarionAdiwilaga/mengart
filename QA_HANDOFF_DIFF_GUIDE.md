# Panduan Handoff QA & Dokumen Applicable Diff

Dokumen ini menyertakan berkas diff yang dapat langsung diterapkan (*applicable git diff*) untuk peninjauan dan verifikasi QA independen atas **Frontend UI/UX Overhaul (Blueprint v0.3)** serta **Remediasi QA Round 2** (`mengart-remediation-qa-review.md`).

---

## 1. Daftar Berkas Diff Tersedia

Tersedia dua berkas patch biner yang siap dieksekusi dengan perintah `git apply`:

| Nama Berkas | Basis Target (*Apply Target*) | Cakupan Perubahan | Ukuran / Statistik |
|---|---|---|---|
| **[`qa-handoff-remediation-round2.patch`](file:///home/garion/Projects/Mengart/qa-handoff-remediation-round2.patch)** | Commit `9e80422` *(State saat audit Round 2)* | Khusus seluruh perbaikan untuk temuan QA Review Round 2 (Amandemen 1–6) | 31 berkas diubah, +1.505 baris, -281 baris |
| **[`qa-handoff-complete-overhaul.patch`](file:///home/garion/Projects/Mengart/qa-handoff-complete-overhaul.patch)** | Branch `feat/frontend-overhaul` (`70415a5`) | Seluruh Frontend UI/UX Overhaul v0.3 + R01–R12 + Round 2 Remediasi | 98 berkas diubah, +10.759 baris, -2.864 baris |

*Lokasi berkas: Tersedia di direktori root `/home/garion/Projects/Mengart/` dan worktree branch `overhaul_frontend_atomic_design`.*

---

## 2. Cara Menerapkan Patch (*How to Apply*)

### Opsi A: Menerapkan Perbaikan Round 2 Saja (pada commit `9e80422`)
Gunakan opsi ini jika lingkungan QA sudah berada pada commit sebelum perbaikan Round 2 (`9e80422`):
```bash
# 1. Pastikan working tree bersih
git status

# 2. Uji kesesuaian patch (dry-run)
git apply --check qa-handoff-remediation-round2.patch

# 3. Terapkan perubahan
git apply qa-handoff-remediation-round2.patch
```

### Opsi B: Menerapkan Seluruh Overhaul + Remediasi (pada `feat/frontend-overhaul` `70415a5`)
Gunakan opsi ini pada repositori utama `/home/garion/Projects/Mengart`:
```bash
# 1. Pastikan berada di branch feat/frontend-overhaul
git checkout feat/frontend-overhaul

# 2. Uji kesesuaian patch (dry-run terverifikasi 100% cocok)
git apply --check qa-handoff-complete-overhaul.patch

# 3. Terapkan patch
git apply qa-handoff-complete-overhaul.patch
```

### Opsi C: Menggunakan Branch Git Langsung (Rekomendasi Tanpa Patch)
Semua perubahan telah di-commit dan di-push ke remote repository:
```bash
git fetch origin overhaul_frontend_atomic_design
git checkout overhaul_frontend_atomic_design
```

---

## 3. Rincian Perubahan dalam `qa-handoff-remediation-round2.patch`

### A. Voting Lifecycle, Queue & Uncertainty (R02, R03, R12)
- **`src/components/voting/VotingWorkspace.tsx`:**
  - Pelacakan generasi eksplisit `currentGen = "${userId || 'anon'}:${votingRoundId}"` untuk membatalkan antrean lama saat ganti akun/round.
  - *Uncertainty lock barrier* saat error jaringan/500/timeout; menangguhkan mutasi hingga rekonsiliasi berhasil.
  - *Buffered server refresh* (`busyPendingRefreshRef`) saat antrean sibuk, mencegah snapshot server lama menimpa mutasi lokal baru.
  - Layout stepper kartu kandidat pada 320px diubah ke 2 baris (Baris 1: Bintang; Baris 2: tombol `[-]` dan `[+]` berukuran $\ge 50 \times 44$px).
  - Tombol tutup pesan error memenuhi tap target $\ge 44 \times 44$px.
- **`src/components/ui/molecules/ArtworkMediaFrame.tsx`:**
  - Menambahkan `e.stopPropagation()` pada tombol spoiler untuk mencegah gelembung klik/keyboard ke kartu induk.

### B. Moderasi, Transisi Status & Staff Action (R05)
- **`src/lib/services/challengeService.ts` (`disqualifyChallengeCandidateService`):**
  - Mengikutsertakan round pending (`inArray(challengeVotingRounds.status, ["open", "pending"])`) dengan validasi ulang status pasca penguncian berjenjang monotonik ($1 \rightarrow 2 \rightarrow 3 \rightarrow 4$).
  - Menghapus submisi dari round pending kandidat saat fase `submission_locked`. Round closed tidak pernah dimutasi.
  - Menyelesaikan seri secara otomatis dari *authoritative tied set* awal pada `tiebreak_open` dan `tie_pending` saat tersisa 1 kandidat menjadi `community_vote_winner`.
  - Mencatat audit snapshot `jury_award.revoked_by_disqualification` dan `challenge_result.revoked_by_disqualification`.
- **`src/components/challenges/CandidateStaffDisqualifyButton.tsx` (BARU):**
  - Tombol aksi moderasi staf langsung pada setiap kartu kandidat di halaman tantangan aktif dan arsip.
- **`src/app/challenges/[slug]/page.tsx` & `src/lib/challenges.ts`:**
  - Memilih `artworks.slug` pada `getChallengeCandidates` dan menautkan karya kandidat dengan parameter `from`.

### C. Sentralisasi Provenance & Proteksi Beranda (R07)
- **`src/lib/presentation/provenance.ts` (BARU):**
  - Helper terpusat `projectPublicArtworkProvenance` dan `sanitizeSystemCaption` untuk `/api/artworks` dan `src/app/page.tsx`.
  - Menyensor caption sistem yang mengekspos judul challenge privat menjadi teks netral (*"Peserta Challenge"*, *"Juara Favorit Komunitas"*, *"Penghargaan Juri: [Kategori]"*) tanpa menghapus `origin: "challenge"` dan `customCaption` artist.
- **`src/app/page.tsx`:**
  - Menambahkan filter `eq(challenges.isVisible, true)` pada query challenge aktif dan Hall of Fame.

### D. Hardening Draft Storage & Batas Waktu (R04)
- **`src/lib/utils/draftStorage.ts`:**
  - Membungkus `localStorage` dalam `getLocalStorage()` yang menangkap exception `SecurityError`.
- **`src/components/challenges/ChallengeSubmissionModal.tsx`:**
  - Menambahkan properti `submissionDeadline`; langsung menghapus dan mengabaikan draft lokal jika batas waktu telah terlewati.
  - Membatalkan timer autosave saat unmount, discard, atau pergantian akun.

### E. Validasi Return URL & Navigasi Berkelanjutan (R09, R10)
- **`src/lib/navigation/returnUrl.ts`:**
  - Menggunakan `hasControlChars` untuk memeriksa karakter kontrol tanpa memicu peringatan regex linter.
  - Menolak backslash, protocol-relative paths (`//`, `/\`), dan auth loops.
- **Propagasi Context:**
  - `ArtworkCard.tsx`, `GalleryGrid.tsx`, `artists/[slug]/page.tsx`, `challenges/[slug]/page.tsx` meneruskan query `from` sehingga tombol "Kembali" membawa pengguna ke filter/pencarian awal.
  - Penyelarasan salinan natural Atelier (*"galeri karya seni visual"*, *"portofolio anggota"*, *"Kirim Karya"*, *"Kirim Revisi Karya"*).

### F. Authentic Verification Gate (R11)
- **`src/lib/__tests__/testPhase2SecurityAndContracts.ts`:**
  - **Scenario 5:** Menguji boundary reader `getChallengeVotingData` dengan isolasi ballot antar pengguna.
  - **Scenario 6:** Menguji Server Action boundary `importHistoricalChallengeAction` langsung (tanpa session) dengan pembuktian nol baris tertulis di DB saat gagal.
  - **Scenario 7:** Menguji matriks fase diskualifikasi lengkap (pending round removal di `submission_locked`, otomatisasi pemenang seri di `tiebreak_open`, dan audit log).

---

## 4. Perintah Verifikasi Ulang (*Verification Commands*)

Setelah menerapkan patch, jalankan perintah pengujian berikut:

```bash
# 1. Jalankan Verification Gate Keamanan & Kontrak (Scenarios 1-8)
npx tsx src/lib/__tests__/testPhase2SecurityAndContracts.ts

# 2. Jalankan Seluruh Suite Backend & Invarian (20 Suites)
npm run test:all

# 3. Jalankan Linter (0 errors, 0 warnings)
npm run lint

# 4. Jalankan Production Build (Next.js Turbopack)
npm run build

# 5. Jalankan Playwright E2E Multi-Viewport (Desktop & Mobile Chrome)
npx playwright test --project="Desktop Chrome" --project="Mobile Chrome"
```
