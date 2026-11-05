# Content Packs

The source repository keeps code and content metadata small. Large media
files are published through GitHub Releases.

## Desktop

Extract the desktop content pack into:

```text
work/installer-build/src/audio/
```

Extract the offline ASR pack into:

```text
work/installer-build/asr/
```

## Android

Extract the mobile content pack so these paths exist:

```text
work/mobile-app-1.0.0/www/src/audio/
work/mobile-app-1.0.0/android/assets/
```

Do not commit extracted media into Git. The included `.gitattributes`
marks WAV and MP3 files for Git LFS if a contributor stores them
intentionally.
