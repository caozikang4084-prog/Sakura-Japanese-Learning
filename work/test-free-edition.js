const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = __dirname;
const desktop = path.join(workspace, 'installer-build');
const mobile = path.join(workspace, 'mobile-app-1.0.0');

const desktopMain = fs.readFileSync(path.join(desktop, 'main.js'), 'utf8');
const desktopPackage = JSON.parse(
  fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'),
);
const mobileActivity = fs.readFileSync(
  path.join(
    mobile,
    'android',
    'src',
    'com',
    'sakura',
    'mobile',
    'MainActivity.java',
  ),
  'utf8',
);
const mobileManifest = fs.readFileSync(
  path.join(mobile, 'android', 'AndroidManifest.xml'),
  'utf8',
);
const mobileBuild = fs.readFileSync(
  path.join(workspace, 'build-mobile-apk.ps1'),
  'utf8',
);

assert.match(desktopMain, /app\.whenReady\(\)\.then\(async \(\) => \{/);
assert.match(desktopMain, /\n  createWindow\(\);\n  app\.on\('activate'/);
assert.doesNotMatch(
  desktopMain,
  /license-core|license:|activationWindow|createActivationWindow|safeStorage/,
);
assert.equal(desktopPackage.build.files.some((item) => /activation|license/i.test(item)), false);
assert.equal(desktopPackage.version, '1.7.4');

assert.match(mobileActivity, /webView\.loadUrl\(MAIN_APP_URL\)/);
assert.doesNotMatch(
  mobileActivity,
  /ACTIVATION_URL|LicenseManager|LicenseBridge|mainAppUnlocked|SakuraLicense/,
);
assert.match(mobileManifest, /android:versionCode="17009"/);
assert.match(mobileManifest, /android:versionName="1\.7\.9"/);
assert.match(
  mobileBuild,
  /LicenseManager\.java', 'LicenseBridge\.java/,
);
assert.match(mobileBuild, /activation\.html/);

console.log('free edition tests passed');
