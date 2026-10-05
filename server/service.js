#!/usr/bin/env node

/**
 * SN1-Server - Windows Service Manager
 * 
 * Installs / starts / stops / uninstalls SpeakNex Server as a real
 * Windows service using node-windows.
 * 
 * Usage:
 *   node service.js install
 *   node service.js uninstall
 *   node service.js start
 *   node service.js stop
 *   node service.js status
 */

const path = require('path');
const fs = require('fs');

const SERVICE_NAME = 'SpeakNexServer';
const SERVICE_DISPLAY = 'SpeakNex Server';
const SERVICE_DESCRIPTION = 'SpeakNex Voice Communication Server (default port 30000)';

function loadConfig() {
  const configPath = path.join(__dirname, 'data', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
  return { port: 30000, serverName: 'SpeakNex Server' };
}

function getAction() {
  return (process.argv[2] || '').toLowerCase();
}

function requireWindows() {
  if (process.platform !== 'win32') {
    console.error('Error: the Windows service manager only works on Windows.');
    console.error('On Linux, use the systemd service instead (see README.md).');
    process.exit(1);
  }
}

function loadNodeWindows() {
  try {
    return require('node-windows');
  } catch (e) {
    console.error('Error: node-windows is not installed.');
    console.error('Run: npm install --production');
    process.exit(1);
  }
}

function createService(ServiceClass) {
  const config = loadConfig();
  const port = config.port || 30000;

  const svc = new ServiceClass({
    name: SERVICE_NAME,
    description: `${SERVICE_DESCRIPTION} - port ${port}`,
    script: path.join(__dirname, 'server.js'),
    nodeOptions: [],
    env: [
      { name: 'SNEX_PORT', value: String(port) }
    ],
    workingDirectory: __dirname
  });

  return svc;
}

function install() {
  requireWindows();
  const { Service } = loadNodeWindows();
  const svc = createService(Service);

  svc.on('install', () => {
    console.log(`Service "${SERVICE_NAME}" installed successfully.`);
    svc.start();
  });

  svc.on('start', () => {
    console.log(`Service "${SERVICE_NAME}" started.`);
    console.log(`SpeakNex Server is listening on port ${loadConfig().port || 30000}.`);
    process.exit(0);
  });

  svc.on('error', (err) => {
    console.error('Service error:', err.message || err);
    process.exit(1);
  });

  console.log(`Installing service "${SERVICE_NAME}"...`);
  svc.install();
}

function uninstall() {
  requireWindows();
  const { Service } = loadNodeWindows();
  const svc = createService(Service);

  svc.on('uninstall', () => {
    console.log(`Service "${SERVICE_NAME}" uninstalled.`);
    process.exit(0);
  });

  svc.on('error', (err) => {
    console.error('Service error:', err.message || err);
    process.exit(1);
  });

  console.log(`Uninstalling service "${SERVICE_NAME}"...`);
  svc.uninstall();
}

function start() {
  requireWindows();
  const { Service } = loadNodeWindows();
  const svc = createService(Service);

  svc.on('start', () => {
    console.log(`Service "${SERVICE_NAME}" started.`);
    process.exit(0);
  });

  svc.on('error', (err) => {
    console.error('Could not start service:', err.message || err);
    process.exit(1);
  });

  svc.start();
}

function stop() {
  requireWindows();
  const { Service } = loadNodeWindows();
  const svc = createService(Service);

  svc.on('stop', () => {
    console.log(`Service "${SERVICE_NAME}" stopped.`);
    process.exit(0);
  });

  svc.on('error', (err) => {
    console.error('Could not stop service:', err.message || err);
    process.exit(1);
  });

  svc.stop();
}

function status() {
  requireWindows();
  const { exec } = require('child_process');
  exec(`sc query ${SERVICE_NAME}`, (err, stdout) => {
    if (err) {
      console.log(`Service "${SERVICE_NAME}" is not installed.`);
      process.exit(1);
    }
    console.log(stdout);
    process.exit(0);
  });
}

function usage() {
  console.log('SN1-Server Windows Service Manager');
  console.log('');
  console.log('Usage: node service.js <command>');
  console.log('');
  console.log('Commands:');
  console.log('  install    Install the service (requires administrator)');
  console.log('  uninstall  Remove the service (requires administrator)');
  console.log('  start      Start the service');
  console.log('  stop       Stop the service');
  console.log('  status     Show service status');
  process.exit(0);
}

const action = getAction();

switch (action) {
  case 'install':
    install();
    break;
  case 'uninstall':
    uninstall();
    break;
  case 'start':
    start();
    break;
  case 'stop':
    stop();
    break;
  case 'status':
    status();
    break;
  default:
    usage();
}
