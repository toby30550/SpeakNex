/**
 * SpeakNex Client - Settings Dialog Renderer
 */

const { ipcRenderer } = require('electron');

// DOM Elements
const navItems = document.querySelectorAll('.settings-nav-item');
const panels = document.querySelectorAll('.settings-panel');

// Navigation
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const panelId = item.dataset.panel;
    
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    
    panels.forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${panelId}`).classList.add('active');
  });
});

// Volume sliders
document.querySelectorAll('input[type="range"]').forEach(slider => {
  const valueDisplay = document.getElementById(`${slider.id}-value`);
  if (valueDisplay) {
    slider.addEventListener('input', () => {
      valueDisplay.textContent = slider.value + (slider.id.includes('volume') ? '%' : '');
    });
  }
});

// Load audio devices
async function loadAudioDevices() {
  try {
    // Request permission first
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    const micSelect = document.getElementById('mic-device');
    const speakerSelect = document.getElementById('speaker-device');
    
    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `${device.kind} ${devices.indexOf(device) + 1}`;
      
      if (device.kind === 'audioinput') {
        micSelect.appendChild(option);
      } else if (device.kind === 'audiooutput') {
        speakerSelect.appendChild(option);
      }
    });
  } catch (err) {
    console.warn('Could not enumerate audio devices:', err);
  }
}

// Load settings
async function loadSettings() {
  try {
    const settings = await window.speaknexAPI.loadSettings();
    
    if (settings.audio) {
      document.getElementById('audio-quality').value = settings.audio.quality || 'normal';
      document.getElementById('voice-activation').checked = settings.audio.voiceActivation !== false;
      document.getElementById('voice-threshold').value = settings.audio.voiceThreshold || 50;
      document.getElementById('mic-volume').value = settings.audio.microphoneVolume || 100;
      document.getElementById('push-to-talk').checked = settings.audio.pushToTalk || false;
      document.getElementById('ptt-key').value = settings.audio.pushToTalkKey || 'ESPACE';
      document.getElementById('speaker-volume').value = settings.audio.volume || 100;
    }
    
    if (settings.interface) {
      document.getElementById('theme-select').value = settings.interface.theme || 'dark';
      document.getElementById('language-select').value = settings.interface.language || 'fr';
    }
    
    if (settings.connection) {
      document.getElementById('auto-connect').checked = settings.connection.autoConnect || false;
      document.getElementById('default-server').value = settings.connection.lastServer || '';
    }
    
    if (settings.notifications) {
      document.getElementById('enable-notifications').checked = settings.notifications.enable !== false;
      document.getElementById('notification-sound').checked = settings.notifications.sound !== false;
    }
    
    // Update value displays
    document.querySelectorAll('input[type="range"]').forEach(slider => {
      const valueDisplay = document.getElementById(`${slider.id}-value`);
      if (valueDisplay) {
        valueDisplay.textContent = slider.value + (slider.id.includes('volume') ? '%' : '');
      }
    });
  } catch (err) {
    console.warn('Could not load settings:', err);
  }
}

// Save settings
async function saveSettings() {
  try {
    const settings = await window.speaknexAPI.loadSettings();
    
    settings.audio = {
      quality: document.getElementById('audio-quality').value,
      voiceActivation: document.getElementById('voice-activation').checked,
      voiceThreshold: parseInt(document.getElementById('voice-threshold').value),
      microphoneVolume: parseInt(document.getElementById('mic-volume').value),
      pushToTalk: document.getElementById('push-to-talk').checked,
      pushToTalkKey: document.getElementById('ptt-key').value,
      volume: parseInt(document.getElementById('speaker-volume').value),
      inputDevice: document.getElementById('mic-device').value,
      outputDevice: document.getElementById('speaker-device').value
    };
    
    settings.interface = {
      theme: document.getElementById('theme-select').value,
      language: document.getElementById('language-select').value
    };
    
    settings.connection = {
      autoConnect: document.getElementById('auto-connect').checked,
      lastServer: document.getElementById('default-server').value,
      lastNickname: settings.connection?.lastNickname || ''
    };
    
    settings.notifications = {
      enable: document.getElementById('enable-notifications').checked,
      sound: document.getElementById('notification-sound').checked,
      notifySpeaking: document.getElementById('notify-speaking').checked
    };
    
    await window.speaknexAPI.saveSettings(settings);
  } catch (err) {
    console.error('Could not save settings:', err);
  }
}

// Save buttons
document.getElementById('save-mic-btn')?.addEventListener('click', async () => {
  await saveSettings();
});

document.getElementById('save-speaker-btn')?.addEventListener('click', async () => {
  await saveSettings();
});

document.getElementById('save-interface-btn')?.addEventListener('click', async () => {
  await saveSettings();
});

document.getElementById('save-connection-btn')?.addEventListener('click', async () => {
  await saveSettings();
});

document.getElementById('save-notifications-btn')?.addEventListener('click', async () => {
  await saveSettings();
});

document.getElementById('save-general-btn')?.addEventListener('click', () => {
  window.close();
});

// Test microphone
document.getElementById('test-mic-btn')?.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    
    source.connect(analyzer);
    analyzer.fftSize = 256;
    
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    
    let level = 0;
    const checkLevel = () => {
      analyzer.getByteFrequencyData(dataArray);
      level = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      
      if (level > 10) {
        console.log('Microphone active, level:', level);
      }
    };
    
    const interval = setInterval(checkLevel, 100);
    
    setTimeout(() => {
      clearInterval(interval);
      stream.getTracks().forEach(track => track.stop());
      audioContext.close();
    }, 3000);
    
  } catch (err) {
    console.error('Microphone test failed:', err);
  }
});

// Test speaker
document.getElementById('test-speaker-btn')?.addEventListener('click', async () => {
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440;
    gainNode.gain.value = 0.1;
    
    oscillator.start();
    
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 1000);
    
  } catch (err) {
    console.error('Speaker test failed:', err);
  }
});

// Initialize
loadSettings();
loadAudioDevices();
