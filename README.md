# Sprout Valley V1.1

Perbaikan core visual, gerakan, animasi, touch control, dan landscape untuk project Phaser 3 + Vite + Capacitor Android yang sudah ada. Detail audit, perubahan file, dan hasil pengujian ada di `LAPORAN_V1.1.md` dan `qa/`.

Gunakan Node.js 22 atau lebih baru. Build Android menggunakan JDK 21 dan Android SDK 36, sesuai konfigurasi Capacitor 8 dalam project.

```bash
npm ci
npm test
npm run build
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
```

APK debug: `android/app/build/outputs/apk/debug/app-debug.apk`. Atur `ANDROID_HOME` ke SDK pada lingkungan build, atau buat `android/local.properties` dengan `sdk.dir` yang sesuai. Path SDK mesin lama tidak dimasukkan ke ZIP hasil perbaikan.

Workflow GitHub Actions yang sudah ada, **Build Android APK**, tetap tersedia untuk proses build dari HP: jalankan workflow pada repository project dan unduh artifact `SproutValley-V1.1-debug-apk`. Workflow menjalankan `npm ci`, tes, build web, sync, dan Gradle. Workflow belum dijalankan dari sesi perbaikan ini.

Untuk testing web: `npm run dev`. Keyboard: panah/WASD untuk bergerak, Q mencangkul, T menyiram, E menanam/interaksi, Space memanen, I membuka tas, P membuka toko, B membuka build mode. Tombol W hanya untuk bergerak. Pada HP gunakan joystick kiri, tombol aksi kanan, Seed untuk mengganti bibit, dan X untuk menutup panel.

Tes browser tambahan memakai Playwright secara opsional, terpisah dari dependency game:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
SMOKE_PRODUCTION=1 node tests/browser/mobile.smoke.cjs
```

Hasil tes browser tersimpan di `qa/browser/`. Tes memakai save browser terisolasi; fixture tanam dan perpindahan posisi tidak mengubah map/data yang dikirim. Script juga menerima `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, `CHROMIUM_ARGS_JSON`, dan `SMOKE_OUTPUT` untuk lingkungan pengujian lain.

Asset tetap berasal dari `public/assets` dan tiga pack yang disertakan di `ASSET_PACKS`. Tidak ada asset game baru yang digambar. Lisensi dan kredit bawaan pack tetap disertakan.
