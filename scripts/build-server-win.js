/**
 * Build Server for Windows
 * 
 * Creates SN1-Server.exe and the Windows installer.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const SERVER_DIST = path.join(DIST_DIR, 'server-win');
const SERVER_PACKAGE = path.join(__dirname, '..', 'server', 'package.json');

async function build() {
  console.log('=== Building SpeakNex Server for Windows ===\n');
  
  // Create output directories
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  if (!fs.existsSync(SERVER_DIST)) {
    fs.mkdirSync(SERVER_DIST, { recursive: true });
  }
  
  // Install server dependencies
  console.log('Installing server dependencies...');
  execSync('npm install', { cwd: path.join(__dirname, '..', 'server'), stdio: 'inherit' });
  
  // Copy server files
  console.log('Copying server files...');
  const serverFiles = ['server.js', 'package.json', 'service.js', 'SN1-Server.js', 'SN1-Server.bat', 'README.md'];
  for (const file of serverFiles) {
    const src = path.join(__dirname, '..', 'server', file);
    const dest = path.join(SERVER_DIST, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
  
  // Copy node_modules
  console.log('Copying node_modules...');
  const srcNodeModules = path.join(__dirname, '..', 'server', 'node_modules');
  const destNodeModules = path.join(SERVER_DIST, 'node_modules');
  if (fs.existsSync(srcNodeModules)) {
    copyDirectoryRecursive(srcNodeModules, destNodeModules);
  }
  
  // Create Windows batch file to run server
  const batchContent = `@echo off
echo Starting SpeakNex Server...
echo.
node server.js %*
`;
  fs.writeFileSync(path.join(SERVER_DIST, 'SN1-Server.bat'), batchContent);
  
  // Create Windows server wrapper using a simple Node.js script
  // Since we can't easily create a standalone .exe without pkg or similar,
  // we create a launcher that runs the Node.js server
  const launcherContent = `#!/usr/bin/env node
const path = require('path');
const serverPath = path.join(__dirname, 'server.js');
require(serverPath);
`;
  fs.writeFileSync(path.join(SERVER_DIST, 'SN1-Server.js'), launcherContent);
  
  // Create README for server
  const readmeContent = `# SpeakNex Server (Windows)

## Lancement

Double-cliquez sur SN1-Server.bat ou exécutez dans un terminal :

    node SN1-Server.js

## Options

    --port <port>       Port du serveur (défaut: 30000)
    --name <name>       Nom du serveur
    --password <pass>   Mot de passe du serveur
    --max-clients <n>   Nombre maximum de clients
    --data-dir <dir>    Répertoire de données
    --generate-key <g>  Générer une clé de privilèges
    --list-keys         Lister les clés de privilèges
    --reset-config      Réinitialiser la configuration

## Configuration

La configuration est sauvegardée automatiquement dans le dossier data/.

## Arrêt

Appuyez sur Ctrl+C pour arrêter le serveur.
`;
  fs.writeFileSync(path.join(SERVER_DIST, 'README.md'), readmeContent);
  
  // Copy logo
  const logoSrc = path.join(__dirname, '..', 'logo.png');
  if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, path.join(SERVER_DIST, 'logo.png'));
  }

  // Copy NSIS assets (icon + license)
  const icoSrc = path.join(__dirname, '..', 'logo.ico');
  if (fs.existsSync(icoSrc)) {
    fs.copyFileSync(icoSrc, path.join(SERVER_DIST, 'logo.ico'));
  }
  const licenseSrc = path.join(__dirname, '..', 'LICENSE');
  if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, path.join(SERVER_DIST, 'license.txt'));
  }

  // Create NSIS installer script
  createServerInstallerScript();

  console.log('\n=== Server build complete ===');
  console.log(`Output: ${SERVER_DIST}`);

  // Compile NSIS installer if makensis is available
  buildServerInstaller();
}

function buildServerInstaller() {
  const makensis = findMakensis();
  if (!makensis) {
    console.log('\nWARNING: makensis not found, skipping SN1-Server-Setup.exe');
    console.log('Install NSIS to build the Windows server installer.');
    return null;
  }

  const nsiPath = path.join(SERVER_DIST, 'installer.nsi');
  if (!fs.existsSync(nsiPath)) {
    console.log('\nWARNING: installer.nsi not found');
    return null;
  }

  console.log(`\nCompiling SN1-Server-Setup.exe with ${makensis}...`);

  try {
    execSync(`"${makensis}" "${nsiPath}"`, { stdio: 'inherit', cwd: SERVER_DIST });
  } catch (err) {
    console.error('NSIS compilation failed:', err.message);
    return null;
  }

  // NSIS writes the output relative to the .nsi location
  const builtExe = path.join(SERVER_DIST, 'SN1-Server-Setup.exe');
  const outExe = path.join(DIST_DIR, 'SN1-Server-Setup.exe');

  if (!fs.existsSync(builtExe)) {
    console.error('ERROR: SN1-Server-Setup.exe was not created');
    return null;
  }

  // Move it next to the other release artifacts
  if (fs.existsSync(outExe)) fs.rmSync(outExe);
  fs.renameSync(builtExe, outExe);

  const size = fs.statSync(outExe).size;
  console.log(`Server installer created: ${outExe} (${formatBytes(size)})`);
  return outExe;
}

function findMakensis() {
  const candidates = [];
  const cacheBase = path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder',
    'Cache',
    'nsis'
  );

  if (fs.existsSync(cacheBase)) {
    for (const entry of fs.readdirSync(cacheBase)) {
      candidates.push(path.join(cacheBase, entry, 'Bin', 'makensis.exe'));
    }
  }

  candidates.push('makensis.exe');
  candidates.push('makensis');

  for (const c of candidates) {
    try {
      execSync(`"${c}" /VERSION`, { stdio: 'pipe' });
      return c;
    } catch (e) {
      // not found / not runnable
    }
  }

  return null;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Skip large/binary files for performance
    if (entry.name === '.package-lock.json' || entry.name === '.bin') {
      continue;
    }
    
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createServerInstallerScript() {
  // Use the maintained NSIS script from server/installer.nsi
  const src = path.join(__dirname, '..', 'server', 'installer.nsi');
  const dest = path.join(SERVER_DIST, 'installer.nsi');

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('Copied server/installer.nsi');
  } else {
    console.warn('WARNING: server/installer.nsi not found, no installer will be built');
  }
}

// Run
build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
