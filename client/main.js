/**
 * SpeakNex Client 1 (SN1) - Main Process
 * 
 * Electron main process for the SpeakNex voice communication client.
 * Handles window creation, IPC communication, and audio device management.
 */

const { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
// Configuration
// ============================================================

const APP_NAME = 'SN1 - SpeakNex Client 1';
const APP_VERSION = '26.0';
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

// ============================================================
// Window Management
// ============================================================

let mainWindow = null;
let connectWindow = null;
let settingsWindow = null;
let privilegeKeyWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'logo.png'),
    show: false,
    frame: true,
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableWebSQL: false
    }
  });

  // Load the HTML file
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Set up the menu
  createMenu();

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createConnectWindow() {
  if (connectWindow && !connectWindow.isDestroyed()) {
    connectWindow.focus();
    return connectWindow;
  }

  connectWindow = new BrowserWindow({
    width: 450,
    height: 350,
    resizable: false,
    title: 'Se connecter - SpeakNex',
    icon: path.join(__dirname, '..', 'logo.png'),
    modal: true,
    parent: mainWindow,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  connectWindow.loadFile(path.join(__dirname, 'connect.html'));

  connectWindow.once('ready-to-show', () => {
    connectWindow.show();
  });

  connectWindow.on('closed', () => {
    connectWindow = null;
  });

  return connectWindow;
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 600,
    resizable: true,
    title: 'Paramètres - SpeakNex',
    icon: path.join(__dirname, '..', 'logo.png'),
    modal: true,
    parent: mainWindow,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function createPrivilegeKeyWindow() {
  if (privilegeKeyWindow && !privilegeKeyWindow.isDestroyed()) {
    privilegeKeyWindow.focus();
    return privilegeKeyWindow;
  }

  privilegeKeyWindow = new BrowserWindow({
    width: 400,
    height: 250,
    resizable: false,
    title: 'Clé de privilèges - SpeakNex',
    icon: path.join(__dirname, '..', 'logo.png'),
    modal: true,
    parent: mainWindow,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  privilegeKeyWindow.loadFile(path.join(__dirname, 'privilege-key.html'));

  privilegeKeyWindow.once('ready-to-show', () => {
    privilegeKeyWindow.show();
  });

  privilegeKeyWindow.on('closed', () => {
    privilegeKeyWindow = null;
  });

  return privilegeKeyWindow;
}

// ============================================================
// Menu
// ============================================================

function createMenu() {
  const template = [
    {
      label: 'Connexions',
      submenu: [
        {
          label: 'Se connecter',
          accelerator: 'Ctrl+O',
          click: () => {
            createConnectWindow();
          }
        },
        {
          label: 'Déconnecter',
          accelerator: 'Ctrl+D',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('app-disconnect');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Outils',
      submenu: [
        {
          label: 'Utiliser une clé de privilèges',
          accelerator: 'Ctrl+K',
          click: () => {
            createPrivilegeKeyWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Paramètres',
          accelerator: 'Ctrl+,',
          click: () => {
            createSettingsWindow();
          }
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Actualiser',
          accelerator: 'Ctrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Plein écran',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Ouvrir les outils de développement',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'À propos de SpeakNex',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'À propos de SpeakNex',
              message: `SN1 - SpeakNex Client 1`,
              detail: `Version ${APP_VERSION}\n\nLogiciel de communication vocale SpeakNex.\n\n© 2024 SpeakNex`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================
// IPC Handlers
// ============================================================

// Get audio input devices
ipcMain.handle('get-audio-input-devices', async () => {
  // This will be handled by the renderer process via navigator.mediaDevices
  return [];
});

// Get audio output devices
ipcMain.handle('get-audio-output-devices', async () => {
  return [];
});

// Save settings
ipcMain.handle('save-settings', async (event, settings) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Load settings
ipcMain.handle('load-settings', async () => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (err) {
    // ignore
  }
  
  // Default settings
  return {
    audio: {
      inputDevice: '',
      outputDevice: '',
      volume: 100,
      microphoneVolume: 100,
      pushToTalk: false,
      pushToTalkKey: 'SPACE'
    },
    interface: {
      theme: 'dark',
      language: 'fr'
    },
    connection: {
      autoConnect: false,
      lastServer: '',
      lastNickname: ''
    },
    notifications: {
      enable: true,
      sound: true
    }
  };
});

// ============================================================
// App Lifecycle
// ============================================================

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean disconnect
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-shutdown');
  }
});
