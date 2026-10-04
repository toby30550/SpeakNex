/**
 * Build Server for Linux
 * 
 * Creates SN1-Server.tar.gz for Linux distribution.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const os = require('os');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const SERVER_SRC = path.join(__dirname, '..', 'server');
const TEMP_DIR = path.join(os.tmpdir(), 'speaknex-server-linux');

async function build() {
  console.log('=== Building SpeakNex Server for Linux ===\n');
  
  // Create output directory
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  
  // Clean temp directory
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  
  const SERVER_DIST = path.join(TEMP_DIR, 'SN1-Server');
  fs.mkdirSync(SERVER_DIST, { recursive: true });
  
  // Copy server files
  console.log('Copying server files...');
  const serverFiles = ['server.js', 'package.json'];
  for (const file of serverFiles) {
    const src = path.join(SERVER_SRC, file);
    const dest = path.join(SERVER_DIST, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
  
  // Install dependencies for Linux
  console.log('Installing dependencies...');
  execSync('npm install --production', { cwd: SERVER_DIST, stdio: 'inherit' });
  
  // Create start script
  const startScript = [
    '#!/bin/bash',
    '',
    '# SpeakNex Server - Linux Start Script',
    '',
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'NODE_CMD="node"',
    '',
    '# Check if Node.js is installed',
    'if ! command -v node &> /dev/null; then',
    '    echo "Error: Node.js is not installed."',
    '    echo "Please install Node.js 18 or later."',
    '    echo "Visit: https://nodejs.org/"',
    '    exit 1',
    'fi',
    '',
    '# Check Node.js version',
    'NODE_VERSION=$(node -v | cut -d"v" -f2 | cut -d"." -f1)',
    'if [ "$NODE_VERSION" -lt 18 ]; then',
    '    echo "Error: Node.js 18 or later is required."',
    '    echo "Current version: $(node -v)"',
    '    exit 1',
    'fi',
    '',
    '# Default configuration',
    'PORT=30000',
    'NAME="SpeakNex Server"',
    'DATA_DIR="$SCRIPT_DIR/data"',
    'LOG_FILE="$SCRIPT_DIR/speaknex.log"',
    '',
    '# Parse arguments',
    'while getopts "p:n:d:l:h" opt; do',
    '    case $opt in',
    '        p) PORT=$OPTARG ;;',
    '        n) NAME=$OPTARG ;;',
    '        d) DATA_DIR=$OPTARG ;;',
    '        l) LOG_FILE=$OPTARG ;;',
    '        h)',
    '            echo "Usage: $0 [options]"',
    '            echo ""',
    '            echo "Options:"',
    '            echo "  -p PORT    Server port (default: 30000)"',
    '            echo "  -n NAME    Server name"',
    '            echo "  -d DIR     Data directory"',
    '            echo "  -l FILE    Log file path"',
    '            echo "  -h         Show this help"',
    '            exit 0',
    '            ;;',
    '        *) echo "Invalid option: -$opt" ;;',
    '    esac',
    'done',
    '',
    '# Create data directory if it does not exist',
    'mkdir -p "$DATA_DIR"',
    '',
    '# Start server',
    'echo "Starting SpeakNex Server..."',
    'echo "Port: $PORT"',
    'echo "Name: $NAME"',
    'echo "Data: $DATA_DIR"',
    'echo ""',
    '',
    'exec "$NODE_CMD" "$SCRIPT_DIR/server.js" \\\\ ',
    '    --port "$PORT" \\\\ ',
    '    --name "$NAME" \\\\ ',
    '    --data-dir "$DATA_DIR" \\\\ ',
    '    --log-file "$LOG_FILE"',
  ].join('\n');
  
  fs.writeFileSync(path.join(SERVER_DIST, 'start-server.sh'), startScript);
  try { fs.chmodSync(path.join(SERVER_DIST, 'start-server.sh'), 0o755); } catch(e) {}
  
  // Create systemd service file
  const systemdService = `[Unit]
Description=SpeakNex Server
After=network.target

[Service]
Type=simple
User=speaknex
Group=speaknex
WorkingDirectory=/opt/speaknex-server
ExecStart=/opt/speaknex-server/start-server.sh -p 30000 -n "SpeakNex Server" -d /opt/speaknex-server/data -l /var/log/speaknex.log
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;
  
  fs.writeFileSync(path.join(SERVER_DIST, 'speaknex-server.service'), systemdService);
  
  // Create install script
  const installScript = [
    '#!/bin/bash',
    '',
    '# SpeakNex Server - Linux Installation Script',
    '',
    'set -e',
    '',
    'INSTALL_DIR="/opt/speaknex-server"',
    'SERVICE_USER="speaknex"',
    'SERVICE_GROUP="speaknex"',
    'PORT=30000',
    '',
    'echo "============================================"',
    'echo "  SpeakNex Server - Installation"',
    'echo "============================================"',
    'echo ""',
    '',
    '# Check root',
    'if [ "$EUID" -ne 0 ]; then',
    '    echo "Error: This script must be run as root (use sudo)"',
    '    exit 1',
    'fi',
    '',
    '# Check Node.js',
    'if ! command -v node &> /dev/null; then',
    '    echo "Error: Node.js is not installed."',
    '    echo "Please install Node.js 18 or later first."',
    '    exit 1',
    'fi',
    '',
    'echo "Node.js version: $(node -v)"',
    'echo ""',
    '',
    '# Read configuration',
    'echo "Configuration:"',
    'echo ""',
    'read -p "  Installation directory [$INSTALL_DIR]: " input_dir',
    'INSTALL_DIR="${input_dir:-$INSTALL_DIR}"',
    '',
    'read -p "  Server port [$PORT]: " input_port',
    'PORT="${input_port:-$PORT}"',
    '',
    'read -p "  Server name [SpeakNex Server]: " input_name',
    'SERVER_NAME="${input_name:-SpeakNex Server}"',
    '',
    'read -p "  Service user [$SERVICE_USER]: " input_user',
    'SERVICE_USER="${input_user:-$SERVICE_USER}"',
    '',
    'echo ""',
    'echo "Installing..."',
    'echo ""',
    '',
    '# Create service user if not exists',
    'if ! id "$SERVICE_USER" &>/dev/null; then',
    '    useradd -r -s /bin/false "$SERVICE_USER"',
    '    echo "Created user: $SERVICE_USER"',
    'fi',
    '',
    '# Create installation directory',
    'mkdir -p "$INSTALL_DIR"',
    '',
    '# Copy files',
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"',
    '',
    '# Set permissions',
    'chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR" 2>/dev/null || \\\\ ',
    'chown -R "$SERVICE_USER" "$INSTALL_DIR"',
    '',
    '# Create data directory',
    'mkdir -p "$INSTALL_DIR/data"',
    'chown -R "$SERVICE_USER" "$INSTALL_DIR/data"',
    '',
    '# Install systemd service',
    'SERVICE_FILE="$INSTALL_DIR/speaknex-server.service"',
    'sed -i "s|/opt/speaknex-server|$INSTALL_DIR|g" "$SERVICE_FILE"',
    '',
    'if command -v systemctl &> /dev/null; then',
    '    cp "$SERVICE_FILE" /etc/systemd/system/speaknex-server.service',
    '    systemctl daemon-reload',
    '    systemctl enable speaknex-server',
    '    echo "Systemd service installed and enabled."',
    'fi',
    '',
    'echo ""',
    'echo "============================================"',
    'echo "  Installation complete!"',
    'echo "============================================"',
    'echo ""',
    'echo "Server installed at: $INSTALL_DIR"',
    'echo "Port: $PORT"',
    'echo ""',
    'echo "To start the server:"',
    'echo "  sudo systemctl start speaknex-server"',
    'echo ""',
    'echo "To stop the server:"',
    'echo "  sudo systemctl stop speaknex-server"',
    'echo ""',
    'echo "To check status:"',
    'echo "  sudo systemctl status speaknex-server"',
    'echo ""',
    'echo "Or run manually:"',
    'echo "  cd $INSTALL_DIR && ./start-server.sh"',
  ].join('\n');
  
  fs.writeFileSync(path.join(SERVER_DIST, 'install.sh'), installScript);
  try { fs.chmodSync(path.join(SERVER_DIST, 'install.sh'), 0o755); } catch(e) {}
  
  // Create uninstall script
  const uninstallScript = [
    '#!/bin/bash',
    '',
    '# SpeakNex Server - Linux Uninstallation Script',
    '',
    'set -e',
    '',
    'echo "============================================"',
    'echo "  SpeakNex Server - Uninstallation"',
    'echo "============================================"',
    'echo ""',
    '',
    'if [ "$EUID" -ne 0 ]; then',
    '    echo "Error: This script must be run as root (use sudo)"',
    '    exit 1',
    'fi',
    '',
    'INSTALL_DIR="/opt/speaknex-server"',
    '',
    '# Stop service',
    'if command -v systemctl &> /dev/null; then',
    '    systemctl stop speaknex-server 2>/dev/null || true',
    '    systemctl disable speaknex-server 2>/dev/null || true',
    '    rm -f /etc/systemd/system/speaknex-server.service',
    '    systemctl daemon-reload',
    '    echo "Systemd service removed."',
    'fi',
    '',
    '# Remove installation',
    'rm -rf "$INSTALL_DIR"',
    'echo "Installation directory removed."',
    '',
    '# Remove user (optional)',
    'read -p "Remove speaknex user? [y/N]: " remove_user',
    'if [ "$remove_user" = "y" ] || [ "$remove_user" = "Y" ]; then',
    '    userdel speaknex 2>/dev/null || true',
    '    echo "User removed."',
    'fi',
    '',
    'echo ""',
    'echo "Uninstallation complete."',
  ].join('\n');
  
  fs.writeFileSync(path.join(SERVER_DIST, 'uninstall.sh'), uninstallScript);
  try { fs.chmodSync(path.join(SERVER_DIST, 'uninstall.sh'), 0o755); } catch(e) {}
  
  // Copy logo
  const logoSrc = path.join(__dirname, '..', 'logo.png');
  if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, path.join(SERVER_DIST, 'logo.png'));
  }
  
  // Create README
  const readmeContent = `# SpeakNex Server (Linux)

## Requirements

- Node.js 18 or later
- Linux (Ubuntu, Debian, CentOS, etc.)

## Installation

### Automatic Installation (Recommended)

\`\`\`bash
sudo ./install.sh
\`\`\`

The installer will guide you through the configuration.

### Manual Installation

1. Extract the archive:

\`\`\`bash
tar -xzf SN1-Server.tar.gz
cd SN1-Server
\`\`\`

2. Install dependencies:

\`\`\`bash
npm install --production
\`\`\`

3. Start the server:

\`\`\`bash
./start-server.sh
\`\`\`

## Options

\`\`\`bash
./start-server.sh -p 30000 -n "My Server"
\`\`\`

| Option | Description | Default |
|--------|-------------|---------|
| -p | Port | 30000 |
| -n | Server name | SpeakNex Server |
| -d | Data directory | ./data |
| -l | Log file | ./speaknex.log |
| -h | Help | - |

## Systemd Service

After installation with install.sh, the server runs as a systemd service:

\`\`\`bash
sudo systemctl start speaknex-server
sudo systemctl stop speaknex-server
sudo systemctl restart speaknex-server
sudo systemctl status speaknex-server
\`\`\`

## Uninstallation

\`\`\`bash
sudo ./uninstall.sh
\`\`\`
`;
  fs.writeFileSync(path.join(SERVER_DIST, 'README.md'), readmeContent);
  
  // Create tar.gz archive
  console.log('\nCreating SN1-Server.tar.gz...');
  
  const archivePath = path.join(DIST_DIR, 'SN1-Server.tar.gz');
  
  await tar.create({
    gzip: true,
    cwd: TEMP_DIR,
    file: archivePath
  }, ['SN1-Server']);
  
  // Cleanup
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  
  console.log(`\n=== Linux server build complete ===`);
  console.log(`Archive: ${archivePath}`);
  console.log(`Size: ${formatFileSize(fs.statSync(archivePath).size)}`);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run
build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
