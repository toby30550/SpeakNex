/**
 * Sync official logo to build locations and generate logo.ico
 * 
 * Source of truth: repository root logo.png (the official SpeakNex logo)
 * 
 * Outputs:
 *   - client/logo.png  (bundled into the app)
 *   - logo.ico         (multi-resolution Windows icon for NSIS/installer)
 * 
 * Usage: node scripts/sync-logo.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_PNG = path.join(ROOT, 'logo.png');
const CLIENT_PNG = path.join(ROOT, 'client', 'logo.png');
const ICO = path.join(ROOT, 'logo.ico');

function main() {
  if (!fs.existsSync(SRC_PNG)) {
    console.error('ERROR: logo.png not found at repository root.');
    console.error('logo.png is the official SpeakNex logo and is required.');
    process.exit(1);
  }

  const stat = fs.statSync(SRC_PNG);
  if (stat.size < 1000) {
    console.error(`ERROR: logo.png appears to be a placeholder (${stat.size} bytes).`);
    console.error('The real SpeakNex logo.png must be provided.');
    process.exit(1);
  }

  // 1. Copy official logo into the client directory
  fs.copyFileSync(SRC_PNG, CLIENT_PNG);
  console.log(`OK: synced logo.png -> client/logo.png (${stat.size} bytes)`);

  // 2. Generate logo.ico (skip if up to date)
  const icoNeedsRebuild =
    !fs.existsSync(ICO) ||
    fs.statSync(ICO).mtimeMs < stat.mtimeMs;

  if (icoNeedsRebuild) {
    execFileSync(process.execPath, [path.join(__dirname, 'make-ico.js'), SRC_PNG, ICO], {
      stdio: 'inherit',
      cwd: ROOT
    });
  } else {
    console.log(`OK: logo.ico is up to date (${fs.statSync(ICO).size} bytes)`);
  }
}

main();
