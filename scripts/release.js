/**
 * SpeakNex Release Script
 * 
 * Builds every distributable, verifies the artifacts are real and
 * non-empty, then optionally publishes them to a GitHub Release.
 * 
 * Usage:
 *   node scripts/release.js                    build + verify only
 *   node scripts/release.js --release          build + verify + publish
 *   node scripts/release.js --release --dry-run  preview, no publish
 *   node scripts/release.js --publish-only     verify + publish (skip build)
 *   node scripts/release.js --version 26.0.1   override the version
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const REPO = 'toby30550/SpeakNex';

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);

// ============================================================
// Version
// ============================================================

function getVersion() {
  const idx = args.indexOf('--version');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];

  const versionFile = path.join(ROOT_DIR, 'VERSION');
  if (fs.existsSync(versionFile)) {
    const v = fs.readFileSync(versionFile, 'utf8').trim();
    if (v) return v;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  return pkg.version;
}

// ============================================================
// Artifact collection
// ============================================================

/**
 * The expected release artifacts and where the build puts them.
 * `minBytes` guards against empty / placeholder files.
 * `dir` + `pattern` locate the file by glob-like match (version may
 * be normalised to semver by electron-builder, e.g. 26.0 -> 26.0.0).
 */
function expectedArtifacts(version) {
  const semver = /^\d+\.\d+\.\d+$/.test(version) ? version : `${version}.0`;

  return [
    {
      name: 'SN1-Setup.exe',
      description: 'SpeakNex Client installer (Windows)',
      dirs: [path.join(DIST_DIR, 'client'), DIST_DIR],
      pattern: /^SN1-Setup-.*\.exe$/i,
      exactNames: [
        `SN1-Setup-${version}.exe`,
        `SN1-Setup-${semver}.exe`,
        'SN1-Setup.exe'
      ],
      minBytes: 10 * 1024 * 1024, // > 10 MB : a real Electron installer
      magic: 'MZ',                 // PE executable
      required: true
    },
    {
      name: 'SN1-Server-Setup.exe',
      description: 'SpeakNex Server installer (Windows)',
      dirs: [DIST_DIR, path.join(DIST_DIR, 'server-win')],
      pattern: /^SN1-Server-Setup.*\.exe$/i,
      exactNames: ['SN1-Server-Setup.exe'],
      minBytes: 50 * 1024,         // > 50 KB
      magic: 'MZ',
      required: true
    },
    {
      name: 'SN1-Server.tar.gz',
      description: 'SpeakNex Server (Linux archive)',
      dirs: [DIST_DIR],
      pattern: /^SN1-Server\.tar\.gz$/i,
      exactNames: ['SN1-Server.tar.gz'],
      minBytes: 20 * 1024,         // > 20 KB
      magic: 'GZIP',               // 1f 8b
      required: true
    }
  ];
}

/**
 * Locate an artifact: exact name first, then pattern match, newest wins.
 */
function locateArtifact(spec) {
  const searched = [];

  for (const dir of spec.dirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir);

    // 1. exact names
    for (const name of spec.exactNames || []) {
      if (files.includes(name)) {
        return path.join(dir, name);
      }
    }

    // 2. pattern matches, prefer the most recently modified
    const matches = files
      .filter((f) => spec.pattern && spec.pattern.test(f))
      .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (matches.length > 0) {
      return path.join(dir, matches[0].f);
    }

    searched.push(dir);
  }

  return null;
}

function checkMagic(filePath, magic) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);

    switch (magic) {
      case 'MZ':
        return buf[0] === 0x4d && buf[1] === 0x5a;
      case 'GZIP':
        return buf[0] === 0x1f && buf[1] === 0x8b;
      default:
        return true;
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Finds and validates every expected artifact.
 * Returns { ok, artifacts } where artifacts are resolved absolute paths.
 */
function collectArtifacts(version) {
  console.log('=== Verifying Artifacts ===\n');

  const artifacts = [];
  let ok = true;

  for (const spec of expectedArtifacts(version)) {
    const found = locateArtifact(spec);

    if (!found) {
      if (spec.required) {
        console.error(`MISSING : ${spec.name}  (${spec.description})`);
        console.error(`          looked in:\n            ${spec.dirs.join('\n            ')}`);
        ok = false;
      } else {
        console.warn(`optional: ${spec.name} not found`);
      }
      continue;
    }

    const stat = fs.statSync(found);
    const problems = [];

    if (stat.size < spec.minBytes) {
      problems.push(`too small (${stat.size} B < ${spec.minBytes} B min)`);
    }
    if (!checkMagic(found, spec.magic)) {
      problems.push(`invalid file signature (expected ${spec.magic})`);
    }

    if (problems.length > 0) {
      console.error(`INVALID  : ${spec.name}`);
      problems.forEach((p) => console.error(`           - ${p}`));
      ok = false;
      continue;
    }

    console.log(`OK       : ${spec.name}  ${formatFileSize(stat.size)}  <- ${path.relative(ROOT_DIR, found)}`);
    artifacts.push({ name: spec.name, path: found, size: stat.size });
  }

  // Stage everything into dist/ root under the canonical release names,
  // so the uploaded assets are flat and consistently named.
  console.log('\nStaging artifacts into dist/ ...');
  for (const a of artifacts) {
    const dest = path.join(DIST_DIR, a.name);
    if (path.resolve(a.path) !== path.resolve(dest)) {
      fs.copyFileSync(a.path, dest);
      console.log(`  staged ${a.name}`);
    }
    // Upload the staged copy so the asset keeps the canonical name
    a.path = dest;
  }

  console.log(ok ? '\nAll required artifacts verified.\n' : '\nERROR: artifact verification failed.\n');
  return { ok, artifacts };
}

// ============================================================
// Build
// ============================================================

function build(version) {
  console.log('=== Building SpeakNex ===\n');
  console.log(`Version: ${version}\n`);

  const steps = [
    { name: 'Dependencies', cmd: 'npm.cmd install --no-audit --no-fund' },
    { name: 'Client installer (Windows)', cmd: 'npm.cmd run build:client:setup' },
    { name: 'Server installer (Windows)', cmd: 'node scripts/build-server-win.js' },
    { name: 'Server archive (Linux)', cmd: 'node scripts/build-server-linux.js' }
  ];

  const failures = [];

  for (const step of steps) {
    console.log(`\n--- ${step.name} ---`);
    try {
      execSync(step.cmd, { cwd: ROOT_DIR, stdio: 'inherit', shell: true });
    } catch (err) {
      console.error(`${step.name} FAILED: ${err.message}`);
      failures.push(step.name);
    }
  }

  if (failures.length > 0) {
    console.warn(`\nWARNING: ${failures.length} build step(s) failed:`);
    failures.forEach((f) => console.warn(`  - ${f}`));
    console.warn('Continuing to verification...\n');
  }

  console.log('\n=== Build Complete ===\n');
}

// ============================================================
// GitHub release
// ============================================================

function release(version, artifacts, dryRun) {
  console.log(`=== GitHub Release v${version} ===\n`);

  if (dryRun) console.log('DRY RUN - nothing will be published\n');

  // Preconditions
  try {
    execSync('gh --version', { stdio: 'pipe', shell: true });
  } catch (e) {
    console.error('GitHub CLI (gh) is not installed: https://cli.github.com/');
    return false;
  }

  try {
    execSync('gh auth status', { stdio: 'pipe', shell: true });
  } catch (e) {
    console.error('Not authenticated. Run: gh auth login');
    return false;
  }

  const tag = `v${version}`;
  const title = `SpeakNex ${version}`;
  const notesFile = path.join(DIST_DIR, 'RELEASE_NOTES.md');
  fs.writeFileSync(notesFile, generateReleaseNotes(version, artifacts));

  console.log(`Repository : ${REPO}`);
  console.log(`Tag        : ${tag}`);
  console.log(`Title      : ${title}`);
  console.log('Files      :');
  artifacts.forEach((a) => console.log(`  - ${a.name} (${formatFileSize(a.size)})`));

  if (dryRun) {
    console.log('\nDry run complete. No changes were made.');
    return true;
  }

  // Check if the tag/release already exists
  let releaseExists = false;
  try {
    execSync(`gh release view ${tag} --repo ${REPO}`, { stdio: 'pipe', shell: true });
    releaseExists = true;
  } catch (e) {
    releaseExists = false;
  }

  if (!releaseExists) {
    console.log(`\nCreating release ${tag}...`);
    try {
      execSync(
        `gh release create ${tag} --repo ${REPO} --title "${title}" --notes-file "${notesFile}"`,
        { stdio: 'inherit', shell: true }
      );
    } catch (err) {
      console.error('Failed to create release:', err.message);
      return false;
    }
  } else {
    console.log(`\nRelease ${tag} already exists, uploading assets...`);
  }

  // Upload each artifact
  let uploaded = 0;
  for (const a of artifacts) {
    console.log(`Uploading ${a.name}...`);
    try {
      execSync(`gh release upload ${tag} "${a.path}" --repo ${REPO} --clobber`, {
        stdio: 'inherit',
        shell: true
      });
      uploaded++;
    } catch (err) {
      console.error(`  FAILED: ${a.name}: ${err.message}`);
    }
  }

  console.log(`\nUploaded ${uploaded}/${artifacts.length} assets.`);
  console.log(`Release: https://github.com/${REPO}/releases/tag/${tag}`);

  return uploaded === artifacts.length;
}

// ============================================================
// Release notes
// ============================================================

function generateReleaseNotes(version, artifacts) {
  const fileList = artifacts
    .map((a) => `| \`${a.name}\` | ${formatFileSize(a.size)} |`)
    .join('\n');

  return `# SpeakNex ${version}

Logiciel de communication vocale client/serveur.

## Fichiers

| Fichier | Taille |
|---------|--------|
${fileList}

## Installation

### Client Windows (SN1)
Téléchargez \`SN1-Setup.exe\` et suivez l'assistant d'installation.

### Serveur Windows
Téléchargez \`SN1-Server-Setup.exe\` et suivez l'assistant.
Vous pouvez installer le serveur comme service Windows (démarrage automatique).

### Serveur Linux
\`\`\`bash
tar -xzf SN1-Server.tar.gz
cd SN1-Server
sudo ./install.sh
\`\`\`

## Utilisation rapide

1. Démarrer le serveur (port par défaut **30000**)
2. Lancer le client SN1
3. **Connexions > Se connecter**, saisir l'adresse (\`192.168.1.50:30000\`)
4. Rejoindre un canal, discuter en texte et en voix

## Principales fonctionnalités

- Communication vocale temps réel (capture, encodage, relay serveur, lecture)
- Arborescence serveur / canaux / utilisateurs
- Chat texte : canal, serveur, messages privés
- Permissions et groupes (Guest, Default, Moderator, Admin)
- Clés de privilèges vérifiées côté serveur
- Paramètres audio : microphone, haut-parleurs, volume, push-to-talk
- Gestion des canaux (création, renommage, suppression)
- Serveur Windows + Linux, port configurable
- Installation en tant que service Windows / systemd Linux

## Compatibilité

- Client : Windows 7 et plus récent
- Serveur : Windows 7+ / Linux (Node.js 18+)

---
SpeakNex v${version} — https://github.com/${REPO}
`;
}

// ============================================================
// Utility
// ============================================================

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============================================================
// Main
// ============================================================

function main() {
  const version = getVersion();

  console.log('SpeakNex Release Tool');
  console.log(`Version : ${version}`);
  console.log(`Flags   : ${args.join(' ') || '(none)'}\n`);

  if (!hasFlag('--publish-only')) {
    build(version);
  }

  const { ok, artifacts } = collectArtifacts(version);

  if (!ok) {
    console.error('\nAborting: required artifacts are missing or invalid.');
    console.error('Nothing will be published.');
    process.exit(1);
  }

  if (hasFlag('--release') || hasFlag('--publish')) {
    const success = release(version, artifacts, hasFlag('--dry-run'));
    if (!success) process.exit(1);
  } else {
    console.log('Artifacts are ready in dist/.');
    console.log('To publish:  node scripts/release.js --release');
    console.log('Preview:     node scripts/release.js --release --dry-run');
  }
}

main();
