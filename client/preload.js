/**
 * SpeakNex Client 1 - Preload Script
 * 
 * Exposes safe IPC channels to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('speaknexAPI', {
  // Settings
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  
  // Audio devices
  getAudioInputDevices: () => ipcRenderer.invoke('get-audio-input-devices'),
  getAudioOutputDevices: () => ipcRenderer.invoke('get-audio-output-devices'),
  
  // App events
  onDisconnect: (callback) => {
    ipcRenderer.on('app-disconnect', callback);
  },
  onShutdown: (callback) => {
    ipcRenderer.on('app-shutdown', callback);
  },
  
  // Window communication
  sendToConnectWindow: (channel, data) => {
    // Will be handled through main process relay
  },
  sendToPrivilegeKeyWindow: (channel, data) => {
    // Will be handled through main process relay
  }
});
