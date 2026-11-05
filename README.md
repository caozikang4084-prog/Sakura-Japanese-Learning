![Sakura cover](work/installer-build/build/sakura-cover.webp)

# Sakura

**An offline-first Japanese learning desktop and Android app for JLPT
N5–N1 self-study.**

Sakura brings nearly 7,000 graded vocabulary entries, grammar, examples,
audio, shadowing, quizzes, mistake review, study planning, check-ins, and
course progress into one learning workspace.

The application opens directly without an account, activation code, or
license server.

## Highlights

- Nearly 7,000 JLPT N5–N1 vocabulary entries with kana, romaji, part of
  speech, Chinese definitions, and examples.
- Vocabulary, grammar, and mixed quizzes with configurable daily workload.
- Mistake tracking, spaced review, stage review, and adaptive planning.
- Real-study check-in calendar and local learning statistics.
- Clickable vocabulary cards inside examples.
- Local audio for vocabulary and examples, plus kana recordings using
  human voice samples.
- Local speech recognition and shadowing feedback. Microphone recordings
  are used for the current operation only and are not added to learning
  saves.
- Flexible Chinese–Japanese translation with linked vocabulary and grammar
  learning cards. Translation requires network access.
- DIY plans based on foundation, target level, deadline, daily time, and
  weekly study days.
- Course management that connects a learner's own courses to daily and
  weekly plans.
- Local save files with manual export/import and no automatic cross-device
  synchronization.

## Downloads

Use the repository's **Releases** page for:

- Windows installer
- Android APK
- Desktop content pack
- Desktop offline recognition model
- Android content pack

Source-only clones do not include the multi-gigabyte audio/model packs.

## Privacy

- No account is required.
- Learning progress stays in the local application data directory.
- Microphone recordings are processed locally and are not uploaded.
- Translation sends submitted text to the translation service.
- External course links may require network access.

## Project layout

```text
work/
  installer-build/       Electron desktop app
  mobile-app-1.0.0/      Android WebView app
  build-mobile-apk.ps1   Portable Android build script
  test-free-edition.js   No-gate build check
```

## Build

### Desktop

```powershell
cd work/installer-build
npm install
npm start
```

Extract the desktop content and ASR packs into their documented locations
before building a complete distribution.

### Android

Requirements:

- JDK 17
- Android SDK with platform 35 and build-tools
- 7-Zip available in `PATH`
- Your own Android signing keystore

Set:

```powershell
$env:JAVA_HOME = "C:\path\to\jdk-17"
$env:ANDROID_SDK_ROOT = "C:\path\to\android-sdk"
$env:SAKURA_ANDROID_KEYSTORE = "C:\path\to\your.keystore"
$env:SAKURA_ANDROID_KEY_ALIAS = "your-alias"
$env:SAKURA_ANDROID_STORE_PASSWORD = "your-store-password"
$env:SAKURA_ANDROID_KEY_PASSWORD = "your-key-password"
.\work\build-mobile-apk.ps1
```

## Scope and limitations

- JLPT organizers do not publish a complete current vocabulary or grammar
  list. Sakura is an independent study aid, not an official JLPT product.
- Translation recognition only covers entries present in Sakura's local
  content library. Unmatched text is marked as not yet indexed.
- The project does not bundle third-party paid courses.
- Core learning works offline. Translation and external course links need
  network access.

## License

- Source code: [MIT](LICENSE)
- Original learning content and documentation:
  [CC BY-SA 4.0](CONTENT-LICENSE.md)
- Third-party components and audio: see [NOTICE.md](NOTICE.md)

Contributions are welcome.
