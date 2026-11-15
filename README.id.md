<p align="center">
  <a href="https://github.com/gregnathanael/loloxcode/releases/latest">
    <picture>
      <source srcset=".github/assets/loloxcode-lockup-paper.svg" media="(prefers-color-scheme: dark)">
      <source srcset=".github/assets/loloxcode-lockup-ink.svg" media="(prefers-color-scheme: light)">
      <img src=".github/assets/loloxcode-lockup-ink.svg" alt="loloXcode" width="360">
    </picture>
  </a>
</p>

<p align="center">Build terarah dari agen coding AI open source.</p>

<p align="center">
  <a href="https://github.com/gregnathanael/loloxcode/releases/latest"><img alt="Rilis terbaru" src="https://img.shields.io/github/v/release/gregnathanael/loloxcode?style=flat-square&label=rilis"></a>
  <a href="./LICENSE"><img alt="MIT" src="https://img.shields.io/github/license/gregnathanael/loloxcode?style=flat-square"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/platform-windows%20x64-173A72?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.id.md">Bahasa Indonesia</a>
</p>

> [!NOTE]
> loloXcode adalah fork independen dari [opencode](https://github.com/anomalyco/opencode), bukan bagian dari, tidak didukung, dan tidak disponsori tim opencode. Karya upstream berlisensi MIT dan hak ciptanya tetap dipertahankan; lihat [Kredit dan lisensi](#kredit-dan-lisensi).

## Instalasi

Windows 10/11, x64. Unduh installer dari [rilis terbaru](https://github.com/gregnathanael/loloxcode/releases/latest):

| Berkas                          | Ukuran  | Catatan                       |
| ------------------------------- | ------- | ----------------------------- |
| `loloxcode-desktop-win-x64.exe` | ~252 MB | Instal per pengguna, tanpa admin |

Installer belum ditandatangani secara digital, jadi pertama kali dibuka Windows SmartScreen akan menampilkan "Windows protected your PC": pilih **More info → Run anyway**.

Aplikasi terpasang sebagai **loloXcode** di `%LOCALAPPDATA%\Programs\app.loloxcode.desktop`. Setelan, sesi, dan service lokal berada di lokasi yang sama dengan opencode (`%USERPROFILE%\.config\opencode`, `%USERPROFILE%\.local\share\opencode`, `%USERPROFILE%\.local\state\opencode`), jadi setelan opencode yang sudah ada ikut terbaca.

## Apa yang diubah build ini

Agen, provider, tool, format konfigurasi, dan CLI tetap opencode upstream. Fork ini mengubah lapisan di sekelilingnya:

| Bagian           | Perubahan                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Identitas        | Wordmark, ikon, dan app id loloXcode: `app.loloxcode.desktop`, `app.loloxcode.desktop.dev`, `app.loloxcode.desktop.beta`     |
| Channel          | Dev, Beta, dan Prod bisa terpasang berdampingan, masing-masing dengan app id, nama produk, dan service lokal sendiri          |
| Limit gratis     | Tombol **Limit** di composer memutar exit IP Cloudflare WARP lalu mencoba lagi, bukan menghentikan percakapan                 |
| Auto continue    | Opsional. Setelah rotasi, sesi mengirim `continue` sendiri, maksimal 5 kali per 30 menit, hanya untuk sesi top-level          |
| Updater desktop  | Sengaja dimatikan: build ini tidak akan menimpa dirinya dengan rilis opencode resmi                                          |
| Galeri tema      | Setelan tampilan menampilkan kisi contoh warna tema sebelum kamu memilih                                                     |

Yang sengaja dipertahankan dari upstream: nama paket, perintah CLI `opencode`, id provider, id model, key konfigurasi, dan channel service `opencode` yang dipakai CLI. Hanya aplikasi desktop yang berjalan di channel `loloxcode`.

## Limit gratis dan tombol Limit

Batas gratis dihitung per exit IP. Kalau kamu sudah memakai Cloudflare One Client (WARP) dalam mode proxy, loloXcode bisa mengarahkan service lokal ke proxy itu, memutar registrasi WARP, dan memverifikasi exit IP baru lewat `cloudflare.com/cdn-cgi/trace`.

Setelan sekali jalan:

1. Pasang Cloudflare One Client dan sambungkan dengan proxy lokal di `127.0.0.1:40000`.
2. Buka menu **Limit** di composer, tekan **New exit IP**. Service restart di belakang proxy dan toast menampilkan IP baru.
3. Agar pulih tanpa diawasi, nyalakan **Auto continue**. Saat muncul `provider.free-limit` atau `provider.go-limit`, desktop memutar IP, menunggu service tersambung lagi, lalu mengirim `continue`.

Rotasi tidak akan mengaku sudah mengeluarkan kredensial kalau memang tidak ada kredensial yang dihapus; **Reset free limit** adalah aksi terpisah yang membuang kredensial sekaligus IP.

## Prompt abliterated

Composer punya toggle **Abliterated** yang menambahkan prompt persona/gaya ke instruksi sesi, mati secara default. Letakkan `abliterated.md` milikmu di direktori data opencode untuk mengganti teks bawaan; toggle akan memakai berkas itu.

## Build dari source

Butuh Bun **1.4.4** atau lebih baru, sesuai `packageManager` di `package.json`.

```bash
bun install
bun run dev:desktop        # aplikasi desktop, hot reload
bun run dev                # CLI dan TUI
bun run typecheck          # turbo typecheck seluruh workspace
```

Untuk menghasilkan installer Windows, ikuti [RELEASING.md](./RELEASING.md). Packaging berjalan dua tahap `electron-builder`: aplikasi dipak sekali tanpa tanda tangan, lalu dipak lagi dengan `OPENCODE_DESKTOP_APP` menunjuk hasil pertama untuk dibungkus jadi installer NSIS.

## Lokasi kerja fork

| Path                                   | Isi                                                                 |
| -------------------------------------- | ------------------------------------------------------------------- |
| `packages/gui-plugins/src/lolox-kit/`  | Plugin desktop: pil limit, rotasi, auto continue, runner WARP        |
| `packages/core/src/lolox-kit/`         | Sumber instruksi sesi untuk prompt abliterated                       |
| `packages/schema/src/lolox-kit.ts`     | Key bersama dan channel service `loloxcode`                          |
| `packages/app/src/new-session/`        | Wordmark pin-grid, brick breaker, tampilan sesi baru                 |
| `packages/ui/src/typography/wordmark/` | Geometri huruf wordmark                                              |
| `packages/desktop/icons/`              | Ikon aplikasi untuk dev, beta, dan prod                              |

## Kredit dan lisensi

MIT, lihat [LICENSE](./LICENSE). Hak cipta upstream (`Copyright (c) 2025 opencode`) dipertahankan, dan seluruh riwayat commit upstream masih ada di repositori ini.

- Proyek upstream: [anomalyco/opencode](https://github.com/anomalyco/opencode)
- Dokumentasi upstream: [opencode.ai/docs](https://opencode.ai/docs)
- Geometri dan ekspor logo: digambar ulang untuk fork ini dari satu grid yang sama

## Merek dagang

`opencode` dan merek opencode milik proyek upstream. Fork ini mempertahankannya di tempat yang menentukan kompatibilitas — nama paket, id provider, perintah CLI, dan rujukan dokumentasi — lalu memakai `loloXcode` untuk semua yang dilihat pengguna. Kalau kamu membangun di atas opencode, tulis dengan jelas di README bahwa proyekmu tidak dibuat oleh tim opencode dan tidak berafiliasi dengannya.
