/**
 * SpeakNex Client - Connect Dialog Renderer
 * 
 * Handles the connection dialog UI and WebSocket connection to server.
 */

const { ipcRenderer } = require('electron');

// DOM Elements
const nicknameInput = document.getElementById('nickname');
const serverAddressInput = document.getElementById('server-address');
const serverPortInput = document.getElementById('server-port');
const serverPasswordInput = document.getElementById('server-password');
const rememberServerCheckbox = document.getElementById('remember-server');
const connectBtn = document.getElementById('connect-btn');
const cancelBtn = document.getElementById('cancel-btn');
const connectingIndicator = document.getElementById('connecting-indicator');
const errorMessage = document.getElementById('error-message');

// State
let connecting = false;

// Load saved settings
(async () => {
  try {
    const settings = await window.speaknexAPI.loadSettings();
    if (settings.connection) {
      if (settings.connection.lastNickname) {
        nicknameInput.value = settings.connection.lastNickname;
      }
      if (settings.connection.lastServer) {
        const parts = settings.connection.lastServer.split(':');
        serverAddressInput.value = parts[0];
        if (parts[1]) {
          serverPortInput.value = parts[1];
        }
      }
    }
  } catch (e) {
    // Use defaults
  }
})();

// Focus nickname on load
nicknameInput.focus();

// Connect button handler
connectBtn.addEventListener('click', async () => {
  if (connecting) return;
  
  const nickname = nicknameInput.value.trim();
  const address = serverAddressInput.value.trim();
  const port = serverPortInput.value.trim() || '30000';
  const password = serverPasswordInput.value;
  
  // Validate
  if (!nickname) {
    showError('Veuillez entrer un pseudo.');
    nicknameInput.focus();
    return;
  }
  
  if (!address) {
    showError('Veuillez entrer l\'adresse du serveur.');
    serverAddressInput.focus();
    return;
  }
  
  // Start connecting
  connecting = true;
  connectBtn.disabled = true;
  cancelBtn.disabled = true;
  connectingIndicator.style.display = 'block';
  errorMessage.style.display = 'none';
  
  try {
    // Save settings
    const settings = await window.speaknexAPI.loadSettings();
    settings.connection.lastNickname = nickname;
    settings.connection.lastServer = `${address}:${port}`;
    await window.speaknexAPI.saveSettings(settings);
    
    // Send connection info to main window
    const connectionInfo = {
      nickname,
      address,
      port: parseInt(port),
      password
    };
    
    // Notify main window to establish connection
    window.parent.postMessage({
      type: 'connect',
      data: connectionInfo
    }, '*');
    
    // Close dialog
    window.close();
    
  } catch (err) {
    showError(`Erreur: ${err.message}`);
    connecting = false;
    connectBtn.disabled = false;
    cancelBtn.disabled = false;
    connectingIndicator.style.display = 'none';
  }
});

// Cancel button handler
cancelBtn.addEventListener('click', () => {
  window.close();
});

// Enter key to connect
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !connecting) {
    connectBtn.click();
  }
  if (e.key === 'Escape') {
    window.close();
  }
});

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}
