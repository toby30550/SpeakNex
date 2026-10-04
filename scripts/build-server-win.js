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
  const serverFiles = ['server.js', 'package.json'];
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
  
  // Create NSIS installer script
  createServerInstallerScript();
  
  console.log('\n=== Server build complete ===');
  console.log(`Output: ${SERVER_DIST}`);
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
  const installerScript = `; SpeakNex Server Installer
; Generated NSIS script for SN1-Server

!include MUI2.nsh

Name "SN1-Server"
OutFile "..\\SN1-Server-Setup.exe"
InstallDir $PROGRAMFILES\\SpeakNex\\Server
RequestExecutionLevel admin

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath $INSTDIR
  
  ; Copy all files
  File /r "*.*)"
  
  ; Create shortcuts
  CreateDirectory "$SMPROGRAMS\\SpeakNex"
  CreateShortCut "$SMPROGRAMS\\SpeakNex\\SN1-Server.lnk" "$INSTDIR\\SN1-Server.bat"
  CreateShortCut "$SMPROGRAMS\\SpeakNex\\Désinstaller.lnk" "$INSTDIR\\uninst.exe"
  
  ; Desktop shortcut
  CreateShortCut "$DESKTOP\\SN1-Server.lnk" "$INSTDIR\\SN1-Server.bat"
  
  ; Uninstaller
  WriteUninstaller "$INSTDIR\\uninst.exe"
  
  ; Registry
  WriteRegStr HKLM "Software\\SpeakNex\\Server" "InstallDir" "$INSTDIR"
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\\SpeakNex\\SN1-Server.lnk"
  Delete "$SMPROGRAMS\\SpeakNex\\Désinstaller.lnk"
  RMDir "$SMPROGRAMS\\SpeakNex"
  Delete "$DESKTOP\\SN1-Server.lnk"
  DeleteRegKey HKLM "Software\\SpeakNex\\Server"
SectionEnd
`;
  
  fs.writeFileSync(path.join(SERVER_DIST, 'installer.nsi'), installerScript);
}

// Run
build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
