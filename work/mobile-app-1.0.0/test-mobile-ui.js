const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const css = fs.readFileSync(
  path.join(ROOT, 'www', 'src', 'mobile-overrides.css'),
  'utf8',
);
const sharedCss = fs.readFileSync(
  path.join(ROOT, 'www', 'src', 'styles.css'),
  'utf8',
);
const html = fs.readFileSync(
  path.join(ROOT, 'www', 'src', 'index.html'),
  'utf8',
);
const app = fs.readFileSync(
  path.join(ROOT, 'www', 'src', 'app.js'),
  'utf8',
);

assert.match(
  html,
  /viewport-fit=cover,\s*interactive-widget=resizes-content/,
);
assert.match(css, /Mobile V4: consistent readable density/);
assert.match(css, /--mobile-gutter:\s*clamp\(10px,\s*3\.2vw,\s*14px\)/);
assert.match(css, /--mobile-nav-height:\s*64px/);
assert.match(css, /--mobile-control-height:\s*44px/);
assert.match(css, /env\(safe-area-inset-top\)/);
assert.match(css, /env\(safe-area-inset-right\)/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /\.nav-label\s*\{[^}]*font-size:\s*8\.5px/s);
assert.match(css, /\.page-title\s*\{[^}]*font-size:\s*clamp\(19px/s);
assert.match(css, /\.primary-button,[\s\S]*?min-height:\s*var\(--mobile-control-height\)/);
assert.match(css, /\.pagination-actions\s*\{[^}]*overflow-x:\s*auto/s);
assert.match(css, /\.weekly-task-copy strong,[\s\S]*?white-space:\s*normal/);
assert.match(css, /\.practice-round-copy small,[\s\S]*?white-space:\s*normal/);
assert.match(css, /\.lesson-detail \.structure-line\s*\{[^}]*overflow-wrap:\s*anywhere/s);
assert.match(css, /\.translation-history-list\s*\{[^}]*max-height:\s*none/s);
assert.match(css, /\.modal \.shadow-footer-actions\s*\{[^}]*safe-area-inset-bottom/s);
assert.match(css, /#shadow-status\s*\{[^}]*min-height:\s*42px/s);
assert.match(
  css,
  /@media \(min-width: 681px\) and \(max-width: 960px\) and \(max-height: 520px\) and \(orientation: landscape\)/,
);
assert.match(app, /class="mobile-quick-grid"/);
assert.match(app, /id="mobile-backup-info"/);
assert.doesNotMatch(app, /Windows/);
assert.match(app, /function openStudyPlanEditor\(mode = 'edit'\)/);
assert.match(app, /class="study-roadmap"/);
assert.match(app, /class="study-review-summary"/);
assert.match(app, /data-mode="spaced"/);
assert.match(app, /data-mode="stage-test"/);
assert.match(app, /data-action="\$\{onboarding \? 'study-plan-skip' : 'modal-cancel'\}"/);
assert.match(css, /\.modal\.onboarding-modal\s*\{[^}]*safe-area-inset-right/s);
assert.match(css, /\.modal\.onboarding-modal \.modal-actions\s*\{[^}]*position:\s*sticky/s);
assert.match(css, /\.study-roadmap\s*\{[^}]*scroll-snap-type:\s*x proximity/s);
assert.match(sharedCss, /\.study-review-summary\s*\{[^}]*grid-template-columns:/s);
assert.match(css, /\.word-detail\s*\{\s*display:\s*none/s);
assert.match(css, /\.mobile-quick-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);

const openBraces = (css.match(/\{/g) || []).length;
const closeBraces = (css.match(/\}/g) || []).length;
assert.equal(openBraces, closeBraces, 'mobile CSS braces must balance');

console.log('mobile responsive UI tests passed');
