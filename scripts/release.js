/**
 * SpeakNex Release Script
 * 
 * Prepares build artifacts and publishes to GitHub Releases.
 * 
 * Usage:
 *   node scripts/release.js [--dry-run] [--version <version>]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// ============================================================
// Version
// ============================================================

function getVersion() {
  // Check command line args
  const args = process.argv;
  const versionIdx = args.indexOf('--version');
  if (versionIdx !== -1 && args[versionIdx + 1]) {
    return args[versionIdx + 1];
  }
  
  // Read from VERSION file
  const versionFile = path.join(ROOT_DIR, 'VERSION');
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, 'utf8').trim();
  }
  
  // Read from package.json
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  return packageJson.version;
}

// ============================================================
// Build
// ============================================================

function build() {
  console.log('=== Building SpeakNex ===\n');
  
  const version = getVersion();
  console.log(`Version: ${version}\n`);
  
  // Install root dependencies
  console.log('Installing dependencies...');
  execSync('npm install', { cwd: ROOT_DIR, stdio: 'inherit' });
  
  // Build client
  console.log('\n--- Building Client ---');
  try {
    execSync('npm run build:client:setup', { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (err) {
    console.error('Client build failed:', err.message);
    // Continue with server builds
  }
  
  // Build Windows server
  console.log('\n--- Building Windows Server ---');
  try {
    execSync('node scripts/build-server-win.js', { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (err) {
    console.error('Windows server build failed:', err.message);
  }
  
  // Build Linux server
  console.log('\n--- Building Linux Server ---');
  try {
    execSync('node scripts/build-server-linux.js', { cwd: ROOT_DIR, stdio: 'inherit' });
  } catch (err) {
    console.error('Linux server build failed:', err.message);
  }
  
  console.log('\n=== Build Complete ===\n');
}

// ============================================================
// Verify Artifacts
// ============================================================

function verifyArtifacts() {
  console.log('=== Verifying Artifacts ===\n');
  
  const requiredFiles = [
    { pattern: 'SN1*', name: 'Client Installer', required: false },
    { pattern: 'SN1-Server.tar.gz', name: 'Linux Server Archive', required: true }
  ];
  
  let allGood = true;
  
  if (!fs.existsSync(DIST_DIR)) {
    console.error('ERROR: dist directory does not exist');
    return false;
  }
  
  const distFiles = fs.readdirSync(DIST_DIR);
  console.log('Files in dist/:');
  distFiles.forEach(f => {
    const filePath = path.join(DIST_DIR, f);
    const stat = fs.statSync(filePath);
    const size = formatFileSize(stat.size);
    console.log(`  ${f} (${size})`);
  });
  
  // Check required files
  for (const req of requiredFiles) {
    const found = distFiles.some(f => f.includes(req.pattern.replace('*', '')));
    if (req.required && !found) {
      console.error(`ERROR: Required file missing: ${req.name} (${req.pattern})`);
      allGood = false;
    } else if (!found) {
      console.warn(`WARNING: Optional file missing: ${req.name} (${req.pattern})`);
    } else {
      console.log(`OK: ${req.name} found`);
    }
  }
  
  return allGood;
}

// ============================================================
// GitHub Release
// ============================================================

function createGitHubRelease(version, dryRun = false) {
  console.log(`\n=== GitHub Release: v${version} ===\n`);
  
  if (dryRun) {
    console.log('DRY RUN - No changes will be made\n');
  }
  
  // Check if gh CLI is available
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch (err) {
    console.error('GitHub CLI (gh) is not installed.');
    console.error('Install it from: https://cli.github.com/');
    console.error('Or manually upload the files to GitHub Releases.');
    return;
  }
  
  // Check if authenticated
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch (err) {
    console.error('Not authenticated with GitHub CLI.');
    console.error('Run: gh auth login');
    return;
  }
  
  const tag = `v${version}`;
  const name = `SpeakNex ${version}`;
  const body = generateReleaseNotes(version);
  
  // Collect files to upload
  const files = [];
  const distFiles = fs.readdirSync(DIST_DIR);
  
  for (const file of distFiles) {
    const filePath = path.join(DIST_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      files.push(filePath);
    }
  }
  
  if (files.length === 0) {
    console.error('No files to upload.');
    return;
  }
  
  console.log(`Tag: ${tag}`);
  console.log(`Name: ${name}`);
  console.log(`Files: ${files.length}`);
  console.log('');
  
  if (dryRun) {
    console.log('Would create release with the following files:');
    files.forEach(f => console.log(`  - ${path.basename(f)}`));
    return;
  }
  
  // Create release
  console.log('Creating release...');
  const releaseCmd = `gh release create ${tag} --title "${name}" --notes "${body}"`;
  
  try {
    execSync(releaseCmd, { stdio: 'inherit' });
    console.log('Release created successfully.');
  } catch (err) {
    console.error('Failed to create release:', err.message);
    return;
  }
  
  // Upload files
  console.log('\nUploading files...');
  for (const file of files) {
    const fileName = path.basename(file);
    console.log(`Uploading ${fileName}...`);
    
    try {
      execSync(`gh release upload ${tag} "${file}"`, { stdio: 'inherit' });
      console.log(`  Uploaded: ${fileName}`);
    } catch (err) {
      console.error(`  Failed to upload ${fileName}:`, err.message);
    }
  }
  
  console.log('\n=== Release Complete ===');
  console.log(`View release: https://github.com/toby30550/SpeakNex/releases/tag/${tag}`);
}

// ============================================================
// Release Notes
// ============================================================

function generateReleaseNotes(version) {
  return `# SpeakNex ${version}

## What's New

- Initial release of SpeakNex voice communication software
- Client application (SN1) for Windows
- Server application for Windows and Linux
- Real-time voice communication
- Text chat (channel, server, private)
- Channel management
- User permissions and privilege keys
- Audio settings (microphone, speakers, volume)
- Push-to-talk support

## Included Files

- **SN1-Setup.exe** - Windows client installer
- **SN1-Server-Setup.exe** - Windows server installer  
- **SN1-Server.tar.gz** - Linux server archive

## Requirements

### Client
- Windows 7 or later
- Node.js runtime (bundled with Electron)

### Server
- Node.js 18 or later
- Windows 7+ or Linux (Ubuntu 20.04+, Debian 11+, etc.)

## Quick Start

1. Install the server using the installer or extract the Linux archive
2. Start the server (default port: 30000)
3. Install and launch the client
4. Connect to the server using Connexions > Se connecter

## Documentation

See README.md for full documentation.
`;
}

// ============================================================
// Utility
// ============================================================

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================
// Main
// ============================================================

function main() {
  const args = process.argv;
  const dryRun = args.includes('--dry-run');
  const version = getVersion();
  
  console.log('SpeakNex Release Tool');
  console.log(`Version: ${version}`);
  console.log('');
  
  // Step 1: Build
  build();
  
  // Step 2: Verify
  if (!verifyArtifacts()) {
    console.error('\nERROR: Some required artifacts are missing.');
    console.error('Please fix the build issues before creating a release.');
    process.exit(1);
  }
  
  // Step 3: Release
  if (args.includes('--release') || args.includes('--publish')) {
    createGitHubRelease(version, dryRun);
  } else {
    console.log('\nTo publish to GitHub Releases, run:');
    console.log(`  node scripts/release.js --release`);
    console.log(`  node scripts/release.js --release --dry-run  (preview only)`);
  }
}

main();
