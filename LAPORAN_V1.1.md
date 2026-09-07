# Laporan Sprout Valley V1.1

Audit dilakukan pada ZIP asli sebelum perubahan kode. Fokus pekerjaan: movement, animasi, pemotongan texture, collision/camera, orientasi landscape, dan keterpakaian touch UI. Posisi/ukuran map, area air, area kebun, serta lokasi portal dipertahankan.

## Audit struktur

ZIP awal berisi 430 file: 47 di `src`, 20 di `public`, 234 di `ASSET_PACKS`, 102 di `android`, dan 19 file tes, selain konfigurasi root. Inventaris lengkap file awal dan ukuran PNG ada di `qa/project-inventory.json`.

Scene aktif: `BootScene → PreloadScene → MainMenuScene → FarmScene ↔ LakeScene`. `ForestScene` dan `UIScene` masih stub dan tidak terdaftar dalam game. Farm dan Lake dibangun dari array tile 30×20 pada scene; tiga JSON map di `public/assets/images/maps` masih kosong dan tidak menjadi sumber rendering.

Sistem yang sudah berisi implementasi: Farming, Fishing, Inventory, Item, Save, Time, Economy, Decoration, NPC, Quest, Achievement, serta utility SaveManager. HUD digambar langsung oleh FarmScene/LakeScene, bukan StatusUI.

Bagian belum selesai sejak ZIP awal: `Animal.js`, `NPC.js` pada folder entities, `WeatherSystem.js`, `ForestScene.js`, `UIScene.js`, `BuildUI.js`, `StatusUI.js`, `EventBus.js`, dan `Helpers.js` hanya komentar stub; `decorations.json` dan `upgrades.json` kosong. NPC yang berjalan menggunakan `NPCSystem`. Stub tersebut tidak diimplementasikan pada perbaikan ini.

Tiga pack tersedia: Sprout Lands Tilemap 0.2.0 (57 file, termasuk sumber Godot/contoh tileset), Sprout Lands UI Basic (47 file), dan Sprout Sorry (130 file). Isinya antara lain tanah, air, rumah, tanaman, karakter, furniture, pagar, ikan, serta UI. Konten lain seperti biome, hewan, dan audio tetap sebagai asset pack yang tidak diaktifkan.

## 1. Penyebab player tidak bergerak

VirtualPad mengirim `{x, y}`, sedangkan Player lama membaca `up/down/left/right`. Akibatnya semua arah touch dianggap false. Reproduksi browser pada kode awal: pad `{x:1,y:0}` menghasilkan velocity `[0,0]`; sesudah perbaikan menghasilkan `[80,0]` dan posisi benar-benar berubah melalui physics step.

Ada masalah hitbox kedua: container UI memakai scroll factor 0 tetapi objek interaktif anak masih 1. Phaser menghitung hit test pada objek anak, sehingga area sentuh bergeser ketika kamera mengikuti player. Semua hit target sekarang tetap berada di koordinat layar.

Body player lama memakai offset `(11,24)` pada frame sumber 16×16 sehingga keluar dari gambar. Body sekarang 8×4 dengan offset `(4,12)` dalam piksel sumber; pada display 2× menjadi 16×8 tepat di kaki. Velocity diagonal dinormalisasi. Keyboard dan joystick memakai perhitungan gerak yang sama; update Player dijalankan pada kedua scene, dengan gerakan dihentikan saat panel/dialog terbuka, blur, pause, dan pembatalan sentuhan.

## 2. Penyebab tilemap rusak

Grass, dirt, water, dan house dimuat sebagai `image` utuh. Scene lalu mengecilkan seluruh atlas menjadi ukuran satu tile. Ini yang membuat tampilan seperti potongan texture/noise. Loader sekarang memotong spritesheet; renderer selalu memilih frame eksplisit berukuran 16×16.

Farm tetap memakai matriks dan koordinat map yang ada. Grass memilih tiga tile pusat yang penuh; dirt memakai tile pusat penuh; water memakai satu frame utuh dari strip air. Rumah dirakit dari modul atlas dengan susunan atap/dinding pada contoh Godot bawaan, tetap pada footprint 7×5 dan lokasi semula.

FarmingSystem sebelumnya dibuat sebelum groundLayer sehingga soil/crop array tidak terikat ke map. Urutan inisialisasi diperbaiki. Tanah berubah texture dan tint ketika dicangkul/disiram, dan crop sprite mengacu pada frame pertumbuhan yang valid.

Collider statis sebelumnya memakai gambar tanpa texture: `updateFromGameObject()` mengganti ukuran body yang diminta dengan dimensi texture default. Collider sekarang menggunakan Zone dengan ukuran eksplisit. Collision rumah, batas dunia, dan air sudah diuji melalui gerakan player sebenarnya. Perilaku API juga diperiksa pada [dokumentasi Phaser StaticBody](https://docs.phaser.io/api-documentation/class/physics-arcade-staticbody).

## 3. Asset/frame yang salah

Semua indeks frame berikut mulai dari 0. Slicing sekarang disatukan di `src/config/assetFrames.js` dan dipakai loader, animasi, item, serta rendering.

| Texture | Ukuran PNG | Ukuran frame | Grid/jumlah |
| --- | --- | --- | --- |
| player | 128×48 | 16×16 | 8×3 / 24 |
| tileset_grass | 160×128 | 16×16 | 10×8 / 80 |
| tileset_dirt | 128×128 | 16×16 | 8×8 / 64 |
| tileset_water | 64×16 | 16×16 | 4×1 / 4 |
| object_house | 112×80 | 16×16 | 7×5 / 35 |
| plants_dry / plants_watered | 112×528 | 16×16 | 7×33 / 231 masing-masing |
| crop_items | 80×224 | 16×16 | 5×14 / 70 |
| ui_emoji_sheet | 160×608 | 32×32 | 5×19 / 95 |
| ui_inventory_blocks | 144×144 | 48×48 | 3×3 / 9 |
| fish_sheet | 160×80 | 16×16 | 10×5 / 50 |
| object_fences | 64×64 | 16×16 | 4×4 / 16 |
| object_furniture | 144×96 | 16×16 | 9×6 / 54 |

Emoji sebelumnya dipotong 16×16, padahal satu ikon penuh 32×32. Pemetaan NPC/ikon tidak lagi memakai potongan seperempat gambar. Inventori mempertahankan ukuran display ikon meskipun berpindah antara sheet 16px dan 32px.

Crop lama memilih row carrot 0 yang tidak berisi tahap tumbuh carrot, tomato 7, dan strawberry 21. Sekarang carrot row 2, tomato row 4, dan berry merah row 11, kolom tahap `[1,2,3,5]`. Pack tidak menyertakan label spesies untuk setiap sel tanaman; row berry dipilih dari visual berry merah yang tersedia, bukan klaim bahwa atlas menyediakan rangkaian strawberry bernama. Ikon seed/harvest memakai frame carrot 5/6, tomato 15/16, strawberry 52/53 dari crop_items.

Tiga PNG yang ditambahkan ke public merupakan salinan byte-identik dari pack yang sudah tersedia: `Farming Plants items v2.png`, `Fences.png`, dan `Basic Furniture.png`. Tidak ada gambar pengganti buatan. Rod, fish sheet, dan inventory-block sheet sudah memiliki ukuran frame yang sesuai; ukuran tersebut dipertahankan.

## 4. File yang diubah

Daftar lengkap dan status perubahan relatif terhadap ZIP awal ada di `qa/changed-files.json`, termasuk asset Android hasil sync. Perubahan utama meliputi Player; Preload/Farm/Lake/MainMenu; konfigurasi frame, layout, game; VirtualPad/TouchButtons/ActionButtons; panel inventori/toko/quest/achievement dan dialog; binding visual Farming/Item/Decoration/NPC; HTML/entry point; Android manifest/MainActivity/version; dan tes regresi.

`capacitor.config.json` diaudit dan dipertahankan: appId `com.sproutvalley.app`, webDir `dist`, tidak ada server URL eksternal. VersionCode Android menjadi 2 dan versionName 1.1. Workflow Android yang sudah ada ditambahkan gerbang tes dan memakai `npm ci`.

## 5. Perbaikan animasi player

PNG player publik sama dengan `Sprout Sorry pack/Tests/teemo 8 directions.png`. Layout diperiksa langsung: kolom up 0, left 2, down 4, right 6; kolom lainnya diagonal. Baris pertama langkah A, baris kedua posisi kaki istirahat, baris ketiga langkah B.

| Arah | Idle | Walk, 8 fps |
| --- | --- | --- |
| down | 12 | 4, 12, 20, 12 |
| up | 8 | 0, 8, 16, 8 |
| left | 10 | 2, 10, 18, 10 |
| right | 14 | 6, 14, 22, 14 |

Delapan state idle/walk empat arah berfungsi. Idle menggunakan satu pose yang tersedia; sheet ini tidak menyediakan animasi bernapas terpisah. Uji runtime mengambil beberapa frame selama gerakan untuk memastikan kedua langkah muncul dan arah tidak bercampur.

## 6. Perbaikan landscape dan camera

Phaser tetap menggunakan FIT + CENTER_BOTH, pixelArt true, antialias false, serta roundPixels. Resolusi logis mengikuti rasio landscape tanpa membesarkan viewport melebihi dunia 480×320: contoh 960×540 memakai 480×270, 800×360 memakai 480×216, dan 1024×768 memakai 360×270. Rentang rasio ditangani 4:3–2.4:1; rasio di luar rentang tetap FIT dan dapat memiliki letterbox, tanpa stretch. Safe-area layar dihormati.

Kamera mengikuti body player dan dibatasi pada world. Pada tampilan yang sama lebarnya dengan world, horizontal scroll memang tidak diperlukan. Posisi save yang menabrak collider, keluar world, atau berada di portal dipulihkan ke spawn aman. Body disinkronkan dengan offset kaki sebelum pemeriksaan posisi agar tidak memicu portal bolak-balik.

Android MainActivity memakai `sensorLandscape` dan immersive system bars. Application ditandai sebagai game. Pilihan ini mengikuti [panduan immersive Android](https://developer.android.com/develop/ui/views/layout/immersive) dan pengecualian aplikasi game pada [aturan orientasi Android 16](https://developer.android.com/about/versions/16/behavior-changes-16). Pada browser portrait, overlay meminta rotasi dan input/game loop dihentikan sampai kembali landscape.

## 7. Perbaikan touch dan HUD

Joystick kiri memiliki dead zone, gerakan analog, normalisasi diagonal, serta kepemilikan satu pointer. Jari kedua dapat menekan aksi tanpa mengambil alih joystick. Release, release di luar target, cancel, blur, pause, dan hide menghapus arah agar tidak tersangkut.

Tombol aksi kanan memakai asset panel yang ada dengan hit area 32×32 piksel logis (64×64 CSS pada 960×540, sekitar 53×53 pada 800×360). Menu berada di kanan atas. Objek interaktif mempunyai scroll factor 0 dan menghentikan propagasi sentuhan ke aksi dunia/build. HUD dipersingkat menjadi gold/tool, seed, hari/jam; teks bantuan debug disembunyikan. Panel lama mendapat kontrol touch dan tombol X agar bisa dipakai tanpa keyboard. Ini tidak menambah sistem permainan.

## 8. Hasil npm test

**352 tes lulus, 0 gagal, 0 skip.** Tes baru menjalankan callback joystick dan menghitung velocity, menguji kepemilikan pointer/reset, memeriksa layout hit target, membaca dimensi PNG sebenarnya, menjalankan definisi loader, memvalidasi mapping animasi, membaca konfigurasi Phaser, serta mem-parse launcher Android dan konfigurasi Capacitor.

Baseline ZIP awal: 356 tes, 353 lulus, 3 gagal karena `dist` belum tersedia. Beberapa tes lama yang hanya memeriksa keberadaan teks diganti dengan tes perilaku; jumlah total bukan sekadar penambahan. Tes build kini membuat output Vite sementara, sehingga `npm test` dapat dijalankan sebelum `npm run build` pada ekstraksi baru. Log final ada di `qa/npm-test.log`.

Delapan skenario browser pada Phaser sebenarnya juga lulus, termasuk pengulangan pada build produksi dengan request di luar server lokal diblokir: boot/slicing/body/soil; keyboard dan animasi; touch/multitouch/cancel; menu setelah camera scroll dan lock movement; tanam–siram–tumbuh–panen; collision rumah/air/world; resize landscape dan pause portrait; serta portal, fishing yang sudah ada, dan save setelah reload. Bukti screenshot dan hasil JSON ada di `qa/browser/`. Ini merupakan pengujian browser, bukan device test Android.

Chromium mencatat diagnostic `preventDefault` pada event touchcancel yang non-cancelable dari handler bawaan Phaser 3.90. Diagnostic tersebut disimpan terpisah dari exception; pelepasan velocity tetap diuji dan lulus. Tidak ada exception JavaScript pada skenario yang lulus.

## 9. Hasil npm run build

**Berhasil.** Vite 5.4.21 mentransformasi 48 modul. Bundle JS `index-D0WYgJ9k.js` sebesar 1.623,18 kB, gzip 375,26 kB. Log ada di `qa/npm-build.log`. **`npx cap sync android` juga berhasil**, dan asset di `android/app/src/main/assets/public` diperbarui dari hasil build ini. Tidak ada dependency baru untuk runtime game.

## 10. Kesiapan APK V1.1

Source siap masuk proses build APK V1.1 dan pengujian ulang di HP. Sesi ini tidak menjalankan Gradle/instalasi APK karena lingkungan tidak menyediakan Android SDK dan hanya memiliki Java 17, sedangkan konfigurasi Android project memerlukan Java 21. Keberhasilan APK V1 sebelumnya berasal dari laporan pengguna; tidak dianggap sebagai hasil pengujian APK V1.1.

Gunakan urutan di README pada lingkungan build Android yang sudah berhasil sebelumnya atau workflow Android yang disertakan. Setelah APK dibuat, periksa langsung landscape, gerakan/animasi empat arah, joystick sambil menekan aksi, collision, tanam–siram–panen, keluar/masuk scene, reopen save, dan bermain dalam mode pesawat. Perbaikan berhenti pada lingkup V1.1 ini untuk menunggu review pengguna.
