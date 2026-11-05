param(
  [string]$OutputPath = "",
  [string]$JavaHome = $env:JAVA_HOME,
  [string]$AndroidSdk = $(if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $env:ANDROID_HOME }),
  [string]$KeystorePath = $env:SAKURA_ANDROID_KEYSTORE,
  [string]$KeyAlias = $env:SAKURA_ANDROID_KEY_ALIAS,
  [string]$StorePassword = $env:SAKURA_ANDROID_STORE_PASSWORD,
  [string]$KeyPassword = $env:SAKURA_ANDROID_KEY_PASSWORD
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $workspace "work\mobile-app-1.0.0"
$android = Join-Path $mobile "android"
if (-not $OutputPath) {
  $OutputPath = Join-Path $workspace "dist\Sakura-Mobile.apk"
}
if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\javac.exe"))) {
  throw "Set JAVA_HOME to a JDK 17 installation."
}
if (-not $AndroidSdk -or -not (Test-Path $AndroidSdk)) {
  throw "Set ANDROID_SDK_ROOT or ANDROID_HOME to an Android SDK installation."
}
$buildTools = Get-ChildItem (Join-Path $AndroidSdk "build-tools") -Directory |
  Sort-Object Name -Descending |
  Select-Object -First 1 -ExpandProperty FullName
$androidJar = Join-Path $AndroidSdk "platforms\android-35\android.jar"
if (-not $buildTools -or -not (Test-Path $androidJar)) {
  throw "Android SDK build-tools and platform android-35 are required."
}
$sevenZipCommand = Get-Command 7za.exe, 7z.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $sevenZipCommand) {
  throw "Install 7-Zip and add 7za.exe or 7z.exe to PATH."
}
$sevenZip = $sevenZipCommand.Source
if (-not $KeystorePath -or -not $KeyAlias -or -not $StorePassword -or -not $KeyPassword) {
  throw "Set SAKURA_ANDROID_KEYSTORE, SAKURA_ANDROID_KEY_ALIAS, SAKURA_ANDROID_STORE_PASSWORD and SAKURA_ANDROID_KEY_PASSWORD."
}
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$build = Join-Path $workspace ("build\mobile-build-" + $stamp)

$aapt2 = Join-Path $buildTools "aapt2.exe"
$zipalign = Join-Path $buildTools "zipalign.exe"
$apksigner = Join-Path $buildTools "apksigner.bat"
$d8 = Join-Path $buildTools "d8.bat"
$javac = Join-Path $javaHome "bin\javac.exe"
$jar = Join-Path $javaHome "bin\jar.exe"

$env:JAVA_HOME = $javaHome
$env:PATH = (Join-Path $javaHome "bin") + ";" + $env:PATH

$dirs = @(
  $build,
  (Join-Path $build "compiled-res"),
  (Join-Path $build "gen"),
  (Join-Path $build "classes"),
  (Join-Path $build "dex"),
  (Join-Path $build "assets"),
  (Join-Path $build "extract\vosk"),
  (Join-Path $build "extract\jna"),
  (Join-Path $build "apk-stage")
)
foreach ($dir in $dirs) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

Copy-Item -Path (Join-Path $android "assets\*") -Destination (Join-Path $build "assets") -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $build "assets\www") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $mobile "www\src") -Destination (Join-Path $build "assets\www\src") -Recurse -Force
foreach ($name in @(
  "activation.html",
  "activation.css",
  "activation.js",
  "license-config.json",
  "license-public-key.pem",
  "license-server-cert.pem"
)) {
  Remove-Item -LiteralPath (Join-Path $build "assets\www\src\$name") -Force -ErrorAction SilentlyContinue
}
Get-ChildItem -LiteralPath (Join-Path $build "assets\www\src\audio") -File |
  Where-Object { $_.Name -like "*.tmp*" -or $_.Name -like "*.hq-test*" } |
  Remove-Item -Force

& $aapt2 compile --dir (Join-Path $android "res") -o (Join-Path $build "compiled-res")
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

$flatFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $build "compiled-res") -Filter "*.flat" -File |
    ForEach-Object { $_.FullName }
)
$linkArgs = @(
  "link",
  "-o", (Join-Path $build "base.apk"),
  "-I", $androidJar,
  "--manifest", (Join-Path $android "AndroidManifest.xml"),
  "--java", (Join-Path $build "gen"),
  "-A", (Join-Path $build "assets"),
  "--min-sdk-version", "24",
  "--target-sdk-version", "35",
  "--version-code", "17009",
  "--version-name", "1.7.9"
)
foreach ($flat in $flatFiles) {
  $linkArgs += $flat
}
& $aapt2 @linkArgs
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$normalizedApk = Join-Path $build "base-normalized.apk"
$sourceArchive = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $build "base.apk"))
$targetArchive = [System.IO.Compression.ZipFile]::Open(
  $normalizedApk,
  [System.IO.Compression.ZipArchiveMode]::Create
)
try {
  foreach ($entry in $sourceArchive.Entries) {
    $entryName = $entry.FullName.Replace("\", "/")
    if ($entryName.EndsWith("/")) { continue }
    $compressionLevel =
      if ($entryName -eq "resources.arsc") {
        [System.IO.Compression.CompressionLevel]::NoCompression
      } else {
        [System.IO.Compression.CompressionLevel]::Optimal
      }
    $targetEntry = $targetArchive.CreateEntry(
      $entryName,
      $compressionLevel
    )
    $sourceStream = $entry.Open()
    $targetStream = $targetEntry.Open()
    try {
      $sourceStream.CopyTo($targetStream)
    } finally {
      $targetStream.Dispose()
      $sourceStream.Dispose()
    }
  }
} finally {
  $targetArchive.Dispose()
  $sourceArchive.Dispose()
}
Move-Item -LiteralPath $normalizedApk -Destination (Join-Path $build "base.apk") -Force

Push-Location (Join-Path $build "extract\vosk")
& $jar xf (Join-Path $android "vendor\vosk-android-0.3.47.aar")
if ($LASTEXITCODE -ne 0) { throw "Vosk AAR extraction failed" }
Pop-Location

Push-Location (Join-Path $build "extract\jna")
& $jar xf (Join-Path $android "vendor\jna-5.13.0.aar")
if ($LASTEXITCODE -ne 0) { throw "JNA AAR extraction failed" }
Pop-Location

$voskClasses = Join-Path $build "extract\vosk\classes.jar"
$jnaClasses = Join-Path $build "extract\jna\classes.jar"
$javaSources = @(
  Get-ChildItem -LiteralPath (Join-Path $android "src") -Filter "*.java" -File -Recurse |
    Where-Object { $_.Name -notin @('LicenseManager.java', 'LicenseBridge.java') } |
    ForEach-Object { $_.FullName }
) + @(
  Get-ChildItem -LiteralPath (Join-Path $build "gen") -Filter "*.java" -File -Recurse |
    ForEach-Object { $_.FullName }
)
& $javac -encoding UTF-8 -source 8 -target 8 -classpath "$androidJar;$voskClasses;$jnaClasses" -d (Join-Path $build "classes") $javaSources
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Push-Location (Join-Path $build "classes")
& $jar cf (Join-Path $build "app-classes.jar") .
if ($LASTEXITCODE -ne 0) { throw "App classes jar failed" }
Pop-Location

& $d8 --release --min-api 24 --lib $androidJar --output (Join-Path $build "dex") `
  (Join-Path $build "app-classes.jar") $voskClasses $jnaClasses
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

$stage = Join-Path $build "apk-stage"
Copy-Item -LiteralPath (Join-Path $build "base.apk") -Destination (Join-Path $stage "unsigned.apk") -Force
Copy-Item -LiteralPath (Join-Path $build "dex\classes.dex") -Destination (Join-Path $stage "classes.dex") -Force

Copy-Item -LiteralPath (Join-Path $build "extract\vosk\jni") -Destination (Join-Path $stage "lib") -Recurse -Force
Get-ChildItem -LiteralPath (Join-Path $build "extract\jna\jni") -Directory | ForEach-Object {
  $abi = $_.Name
  $targetDir = Join-Path $stage "lib\$abi"
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  Get-ChildItem -LiteralPath $_.FullName -Filter "*.so" -File | Copy-Item -Destination $targetDir -Force
}

Push-Location $stage
& $sevenZip a -tzip (Join-Path $stage "unsigned.apk") "classes.dex" "lib\*" -r
if ($LASTEXITCODE -ne 0) { throw "APK payload packaging failed" }
Pop-Location

& $zipalign -f 4 (Join-Path $stage "unsigned.apk") (Join-Path $stage "aligned.apk")
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

& $apksigner sign `
  --ks $KeystorePath `
  --ks-key-alias $KeyAlias `
  --ks-pass "pass:$StorePassword" `
  --key-pass "pass:$KeyPassword" `
  --out $OutputPath `
  (Join-Path $stage "aligned.apk")
if ($LASTEXITCODE -ne 0) { throw "APK signing failed" }

& $apksigner verify --verbose $OutputPath
if ($LASTEXITCODE -ne 0) { throw "APK verification failed" }

& $aapt2 dump badging $OutputPath
if ($LASTEXITCODE -ne 0) { throw "APK metadata verification failed" }

Write-Output ("APK=" + $OutputPath)
Write-Output ("BUILD_DIR=" + $build)
