/**
 * SpeakNex Client - Privilege Key Dialog Renderer
 */

const { ipcRenderer } = require('electron');

// DOM Elements
const privilegeKeyInput = document.getElementById('privilege-key');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const resultMessage = document.getElementById('result-message');

// Focus input on load
privilegeKeyInput.focus();

// Submit handler
submitBtn.addEventListener('click', () => {
  const key = privilegeKeyInput.value.trim().toUpperCase();
  
  if (!key) {
    showResult('Veuillez entrer une clé de privilèges.', 'error');
    return;
  }
  
  // Send to main window to forward to server
  window.parent.postMessage({
    type: 'privilege_key',
    data: { key }
  }, '*');
  
  showResult('Clé envoyée au serveur...', 'success');
  
  // Close after a delay
  setTimeout(() => {
    window.close();
  }, 1500);
});

// Cancel handler
cancelBtn.addEventListener('click', () => {
  window.close();
});

// Enter key to submit
privilegeKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    submitBtn.click();
  }
  if (e.key === 'Escape') {
    window.close();
  }
});

// Auto-uppercase
privilegeKeyInput.addEventListener('input', () => {
  privilegeKeyInput.value = privilegeKeyInput.value.toUpperCase();
});

function showResult(message, type) {
  resultMessage.textContent = message;
  resultMessage.className = `result-message ${type}`;
}
