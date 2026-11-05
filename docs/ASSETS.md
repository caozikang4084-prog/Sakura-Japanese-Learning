# Content Packs

The source repository keeps code and content metadata small. The complete
offline media is included in the official Windows and Android packages.

## Extract from the Windows package

1. Download `Sakura Setup 1.7.4.exe` from Releases.
2. Extract the installer payload with 7-Zip.
3. Extract `resources/app.asar` with `@electron/asar`.
4. Copy `src/audio` from the extracted application into
   `work/installer-build/src/audio`.
5. Copy `resources/app.asar.unpacked/asr` into
   `work/installer-build/asr`.

## Extract from the Android package

The APK is a standard ZIP archive. Extract:

```text
assets/www/src/audio/    -> work/mobile-app-1.0.0/www/src/audio/
assets/                   -> work/mobile-app-1.0.0/android/assets/
```

Do not commit extracted media into Git. The included `.gitattributes`
marks WAV and MP3 files for Git LFS if a contributor stores them
intentionally.
