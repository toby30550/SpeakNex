/**
 * SpeakNex Client 1 - Main Renderer
 * 
 * Handles WebSocket connection, audio capture/playback,
 * UI rendering, chat, and all client-side logic.
 */

// ============================================================
// State
// ============================================================

const state = {
  connected: false,
  ws: null,
  clientId: null,
  nickname: '',
  groupId: 'default',
  currentChannel: null,
  serverName: '',
  serverAddress: '',
  channels: [],
  users: {},
  groups: {},
  chatHistory: [],
  audio: {
    micActive: true,
    speakerActive: true,
    micVolume: 1.0,
    speakerVolume: 1.0,
    isTalking: false,
    audioContext: null,
    micStream: null,
    micSource: null,
    micGain: null,
    analyser: null,
    outputGain: null,
    userAudioMap: new Map(), // userId -> { gain, source, stream }
    voiceDetection: true,
    voiceThreshold: 50,
    pushToTalk: false,
    pushToTalkKey: 'Space',
    pttActive: false
  },
  pingInterval: null,
  lastPing: 0,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5
};

// ============================================================
// DOM Elements
// ============================================================

const connectionIndicator = document.getElementById('connection-indicator');
const connectionStatus = document.getElementById('connection-status');
const serverInfo = document.getElementById('server-info');
const channelInfo = document.getElementById('channel-info');
const userCount = document.getElementById('user-count');
const treeServerName = document.getElementById('tree-server-name');
const treeServerAddress = document.getElementById('tree-server-address');
const serverTreeContainer = document.getElementById('server-tree-container');
const welcomeScreen = document.getElementById('welcome-screen');
const chatMessages = document.getElementById('chat-messages');
const chatInputArea = document.getElementById('chat-input-area');
const chatTargetSelect = document.getElementById('chat-target-select');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const bottomNickname = document.getElementById('bottom-nickname');
const bottomGroup = document.getElementById('bottom-group');
const bottomPing = document.getElementById('bottom-ping');
const micBtn = document.getElementById('mic-btn');
const speakerBtn = document.getElementById('speaker-btn');
const micVolumeSlider = document.getElementById('mic-volume');
const speakerVolumeSlider = document.getElementById('speaker-volume');
const welcomeConnectBtn = document.getElementById('welcome-connect-btn');
const contextMenu = document.getElementById('context-menu');

// ============================================================
// Connection
// ============================================================

/**
 * Establish WebSocket connection to SpeakNex server
 */
function connectToServer(address, port, nickname, password = '') {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const serverUrl = `${protocol}://${address}:${port}`;
  
  logSystem(`Connexion à ${serverUrl}...`);
  setConnectionState('connecting');
  
  try {
    state.ws = new WebSocket(serverUrl);
    
    state.ws.onopen = () => {
      logSystem('Connecté au serveur. Envoi des informations...');
      
      // Send connect message
      sendToServer({
        type: 'connect',
        nickname: nickname,
        password: password
      });
    };
    
    state.ws.onmessage = (event) => {
      handleServerMessage(event.data);
    };
    
    state.ws.onclose = (event) => {
      logSystem(`Déconnecté du serveur (code: ${event.code})`);
      setConnectionState('disconnected');
      state.connected = false;
      
      // Attempt reconnection
      if (state.reconnectAttempts < state.maxReconnectAttempts && state.serverAddress) {
        state.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
        logSystem(`Tentative de reconnexion ${state.reconnectAttempts}/${state.maxReconnectAttempts} dans ${delay/1000}s...`);
        
        setTimeout(() => {
          if (!state.connected) {
            connectToServer(
              state.serverAddress,
              parseInt(state.serverUrl?.split(':')[2] || '30000'),
              state.nickname
            );
          }
        }, delay);
      }
    };
    
    state.ws.onerror = (error) => {
      logSystem('Erreur de connexion au serveur.');
      setConnectionState('disconnected');
    };
    
  } catch (err) {
    logSystem(`Erreur: ${err.message}`);
    setConnectionState('disconnected');
  }
}

/**
 * Disconnect from server
 */
function disconnect() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  
  cleanupAudio();
  setConnectionState('disconnected');
  state.connected = false;
  state.reconnectAttempts = 0;
}

/**
 * Send message to server
 */
function sendToServer(message) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(message));
  }
}

/**
 * Handle incoming server message
 */
function handleServerMessage(data) {
  let message;
  
  try {
    if (typeof data === 'string') {
      message = JSON.parse(data);
    } else {
      // Binary audio data
      handleAudioData(data);
      return;
    }
  } catch (e) {
    console.error('Failed to parse message:', e);
    return;
  }
  
  switch (message.type) {
    case 'server_info':
      handleServerInfo(message);
      break;
    case 'channel_list':
      handleChannelList(message);
      break;
    case 'group_list':
      handleGroupList(message);
      break;
    case 'joined_channel':
      handleJoinedChannel(message);
      break;
    case 'user_list_update':
      handleUserListUpdate(message);
      break;
    case 'user_joined':
      handleUserJoined(message);
      break;
    case 'user_left':
      handleUserLeft(message);
      break;
    case 'chat_message':
      handleChatMessage(message);
      break;
    case 'privilege_key_accepted':
      handlePrivilegeKeyAccepted(message);
      break;
    case 'privilege_key_rejected':
      handlePrivilegeKeyRejected(message);
      break;
    case 'connect_rejected':
      handleConnectRejected(message);
      break;
    case 'kicked':
      handleKicked(message);
      break;
    case 'banned':
      handleBanned(message);
      break;
    case 'error':
      handleError(message);
      break;
    case 'pong':
      handlePong(message);
      break;
    case 'channel_created':
      handleChannelCreated(message);
      break;
    case 'channel_deleted':
      handleChannelDeleted(message);
      break;
    case 'channel_renamed':
      handleChannelRenamed(message);
      break;
    case 'user_group_changed':
      handleUserGroupChanged(message);
      break;
    case 'talking_status':
      handleTalkingStatus(message);
      break;
    default:
      console.log('Unknown message type:', message.type);
  }
}

// ============================================================
// Message Handlers
// ============================================================

function handleServerInfo(msg) {
  state.clientId = msg.clientId;
  state.serverName = msg.serverName;
  state.connected = true;
  state.reconnectAttempts = 0;
  
  setConnectionState('connected');
  serverInfo.textContent = msg.serverName;
  treeServerName.textContent = msg.serverName;
  
  // Start ping
  startPing();
}

function handleChannelList(msg) {
  state.channels = msg.channels.sort((a, b) => a.order - b.order);
  renderServerTree();
}

function handleGroupList(msg) {
  state.groups = {};
  msg.groups.forEach(g => {
    state.groups[g.id] = g;
  });
}

function handleJoinedChannel(msg) {
  state.currentChannel = msg.channelId;
  updateChannelInfo(msg.channelName);
  renderServerTree();
}

function handleUserListUpdate(msg) {
  if (msg.channelId === state.currentChannel) {
    state.users = {};
    msg.users.forEach(u => {
      state.users[u.id] = u;
    });
    renderServerTree();
    updateUserCount();
  }
}

function handleUserJoined(msg) {
  logSystem(`${msg.nickname} a rejoint le canal`);
  if (msg.channelId === state.currentChannel) {
    state.users[msg.userId] = {
      id: msg.userId,
      nickname: msg.nickname,
      groupId: msg.groupId,
      muted: false,
      isTalking: false
    };
    renderServerTree();
    updateUserCount();
  }
}

function handleUserLeft(msg) {
  logSystem(`${msg.nickname} a quitté le canal`);
  if (msg.channelId === state.currentChannel) {
    delete state.users[msg.userId];
    renderServerTree();
    updateUserCount();
  }
}

function handleChatMessage(msg) {
  const isPrivate = msg.target === 'private';
  const isServer = msg.target === 'server';
  const channelTag = isServer ? '[Serveur]' : (isPrivate ? '[Privé]' : `[${getChannelName(msg.channelId)}]`);
  
  addChatMessage(msg.nickname, msg.message, msg.timestamp, isServer ? 'server' : (isPrivate ? 'private' : ''), channelTag);
  
  // Play notification sound if enabled
  if (msg.userId !== state.clientId) {
    playNotificationSound();
  }
}

function handlePrivilegeKeyAccepted(msg) {
  state.groupId = msg.groupId;
  bottomGroup.textContent = msg.groupName;
  logSystem(`Clé de privilèges acceptée. Nouveau groupe: ${msg.groupName}`);
  renderServerTree();
}

function handlePrivilegeKeyRejected(msg) {
  logSystem(`Clé de privilèges rejetée: ${msg.reason}`);
}

function handleConnectRejected(msg) {
  logSystem(`Connexion rejetée: ${msg.reason}`);
  setConnectionState('disconnected');
  state.connected = false;
}

function handleKicked(msg) {
  logSystem(`Vous avez été expulsé par ${msg.kicker}: ${msg.reason}`);
  disconnect();
}

function handleBanned(msg) {
  logSystem(`Vous avez été banni par ${msg.banner}: ${msg.reason}`);
  disconnect();
}

function handleError(msg) {
  logSystem(`Erreur: ${msg.message}`);
}

function handlePong(msg) {
  state.lastPing = Date.now() - state.lastPing;
  bottomPing.textContent = `${state.lastPing}ms`;
}

function handleChannelCreated(msg) {
  state.channels.push(msg.channel);
  state.channels.sort((a, b) => a.order - b.order);
  renderServerTree();
}

function handleChannelDeleted(msg) {
  state.channels = state.channels.filter(ch => ch.id !== msg.channelId);
  if (state.currentChannel === msg.channelId) {
    state.currentChannel = null;
    updateChannelInfo('');
  }
  renderServerTree();
}

function handleChannelRenamed(msg) {
  const channel = state.channels.find(ch => ch.id === msg.channelId);
  if (channel) {
    channel.name = msg.newName;
    renderServerTree();
  }
}

function handleUserGroupChanged(msg) {
  const user = state.users[msg.userId];
  if (user) {
    user.groupId = msg.groupId;
    renderServerTree();
  }
}

function handleTalkingStatus(msg) {
  const user = state.users[msg.userId];
  if (user) {
    user.isTalking = msg.isTalking;
    updateSpeakingIndicator(msg.userId, msg.isTalking);
  }
}

// ============================================================
// Audio System
// ============================================================

/**
 * Initialize audio system
 */
async function initAudio() {
  try {
    // Create audio context
    state.audio.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Get microphone stream
    state.audio.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1
      }
    });
    
    // Create audio nodes
    state.audio.micSource = state.audio.audioContext.createMediaStreamSource(state.audio.micStream);
    state.audio.micGain = state.audio.audioContext.createGain();
    state.audio.analyser = state.audio.audioContext.createAnalyser();
    state.audio.outputGain = state.audio.audioContext.createGain();
    
    // Configure analyser
    state.audio.analyser.fftSize = 256;
    state.audio.analyser.smoothingTimeConstant = 0.3;
    
    // Set volumes
    state.audio.micGain.gain.value = state.audio.micVolume;
    state.audio.outputGain.gain.value = state.audio.speakerVolume;
    
    // Connect: mic -> gain -> analyser (not to destination to avoid echo)
    state.audio.micSource.connect(state.audio.micGain);
    state.audio.micGain.connect(state.audio.analyser);
    
    // Start audio capture loop
    startAudioCapture();
    
    // Start voice detection
    if (state.audio.voiceDetection) {
      startVoiceDetection();
    }
    
    logSystem('Système audio initialisé.');
    
  } catch (err) {
    console.error('Failed to initialize audio:', err);
    logSystem(`Erreur audio: ${err.message}`);
  }
}

/**
 * Capture and send audio data
 */
function startAudioCapture() {
  if (!state.audio.audioContext || !state.audio.analyser) return;
  
  const sampleRate = 16000;
  const bufferSize = 1600; // 100ms of audio at 16kHz
  
  // Create a ScriptProcessorNode to capture audio data
  // Note: ScriptProcessorNode is deprecated but widely supported
  const scriptProcessor = state.audio.audioContext.createScriptProcessor(bufferSize, 1, 1);
  
  scriptProcessor.onaudioprocess = (event) => {
    if (!state.connected || !state.currentChannel) return;
    if (!state.audio.micActive) return;
    if (state.audio.pushToTalk && !state.audio.pttActive) return;
    
    const inputBuffer = event.inputBuffer;
    const inputData = inputBuffer.getChannelData(0);
    
    // Convert float32 to int16
    const int16Data = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Send binary audio data to server
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(int16Data.buffer);
    }
  };
  
  // Connect mic to script processor
  if (state.audio.micGain) {
    state.audio.micGain.connect(scriptProcessor);
  }
  scriptProcessor.connect(state.audio.audioContext.destination);
  
  state.audio.scriptProcessor = scriptProcessor;
}

/**
 * Voice activity detection
 */
function startVoiceDetection() {
  if (!state.audio.analyser) return;
  
  const dataArray = new Uint8Array(state.audio.analyser.frequencyBinCount);
  
  const checkVoice = () => {
    if (!state.audio.voiceDetection || !state.audio.micActive) {
      requestAnimationFrame(checkVoice);
      return;
    }
    
    state.audio.analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    // Check if above threshold
    const wasTalking = state.audio.isTalking;
    state.audio.isTalking = average > (state.audio.voiceThreshold / 100) * 255;
    
    // Notify server of talking status change
    if (wasTalking !== state.audio.isTalking && state.connected) {
      // Visual feedback
      updateLocalSpeakingIndicator(state.audio.isTalking);
    }
    
    requestAnimationFrame(checkVoice);
  };
  
  requestAnimationFrame(checkVoice);
}

/**
 * Play received audio from another user
 */
function playUserAudio(userId, audioData) {
  if (!state.audio.audioContext || !state.audio.speakerActive) return;
  
  const ctx = state.audio.audioContext;
  
  // Get or create user audio node
  if (!state.audio.userAudioMap.has(userId)) {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = state.audio.speakerVolume;
    
    source.connect(gain);
    gain.connect(ctx.destination);
    
    state.audio.userAudioMap.set(userId, { source, gain });
  }
  
  const { gain } = state.audio.userAudioMap.get(userId);
  
  try {
    // Decode and play audio data
    const int16Data = new Int16Array(audioData);
    const float32Data = new Float32Array(int16Data.length);
    
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768;
    }
    
    const audioBuffer = ctx.createBuffer(1, float32Data.length, 16000);
    audioBuffer.getChannelData(0).set(float32Data);
    
    const bufferSource = ctx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(gain);
    bufferSource.start();
    
  } catch (err) {
    console.error('Failed to play audio:', err);
  }
}

/**
 * Handle incoming audio data
 */
function handleAudioData(data) {
  // Parse the audio packet
  if (typeof data === 'string') {
    // JSON header
    try {
      const header = JSON.parse(data);
      // Audio header received, wait for binary data
    } catch (e) {
      // Not a valid header
    }
    return;
  }
  
  // Binary audio data - play it
  if (data instanceof ArrayBuffer) {
    // We need to track which user this audio is from
    // For simplicity, play all received audio
    // In production, you'd parse the header to get the userId
    
    // Find the last known talking user
    for (const [userId, user] of Object.entries(state.users)) {
      if (user.isTalking) {
        playUserAudio(userId, data);
        break;
      }
    }
  }
}

/**
 * Cleanup audio resources
 */
function cleanupAudio() {
  if (state.audio.micStream) {
    state.audio.micStream.getTracks().forEach(track => track.stop());
    state.audio.micStream = null;
  }
  
  if (state.audio.audioContext) {
    state.audio.audioContext.close();
    state.audio.audioContext = null;
  }
  
  state.audio.userAudioMap.forEach(({ source, gain }) => {
    try { source.disconnect(); } catch (e) {}
    try { gain.disconnect(); } catch (e) {}
  });
  state.audio.userAudioMap.clear();
  
  state.audio.micActive = true;
  state.audio.speakerActive = true;
  state.audio.isTalking = false;
}

// ============================================================
// UI Rendering
// ============================================================

/**
 * Set connection state and update UI
 */
function setConnectionState(state_name) {
  connectionIndicator.className = 'status-indicator';
  
  switch (state_name) {
    case 'connecting':
      connectionStatus.textContent = 'Connexion...';
      break;
    case 'connected':
      connectionIndicator.classList.add('connected');
      connectionStatus.textContent = 'Connecté';
      welcomeScreen.style.display = 'none';
      chatMessages.style.display = 'block';
      chatInputArea.style.display = 'flex';
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      break;
    case 'disconnected':
      connectionIndicator.classList.add('disconnected');
      connectionStatus.textContent = 'Déconnecté';
      serverInfo.textContent = 'Aucun serveur';
      channelInfo.textContent = '';
      userCount.textContent = '';
      treeServerName.textContent = 'SpeakNex';
      treeServerAddress.textContent = '';
      serverTreeContainer.innerHTML = '';
      welcomeScreen.style.display = 'flex';
      chatMessages.style.display = 'none';
      chatInputArea.style.display = 'none';
      bottomNickname.textContent = '-';
      bottomGroup.textContent = '-';
      bottomPing.textContent = '-';
      break;
  }
}

/**
 * Update channel info display
 */
function updateChannelInfo(channelName) {
  channelInfo.textContent = channelName ? `Canal: ${channelName}` : '';
}

/**
 * Update user count display
 */
function updateUserCount() {
  const count = Object.keys(state.users).length;
  userCount.textContent = `${count} utilisateur${count !== 1 ? 's' : ''}`;
}

/**
 * Render the server tree (channels and users)
 */
function renderServerTree() {
  serverTreeContainer.innerHTML = '';
  
  if (!state.connected) return;
  
  // Render channels
  state.channels.forEach(channel => {
    const channelEl = document.createElement('div');
    channelEl.className = `tree-channel ${channel.id === state.currentChannel ? 'active' : ''}`;
    channelEl.dataset.channelId = channel.id;
    
    const userCount = channel.userCount || Object.values(state.users).filter(u => true).length;
    
    channelEl.innerHTML = `
      <span class="icon">📁</span>
      <span class="name">${escapeHtml(channel.name)}</span>
      ${channel.password ? '<span style="color: var(--text-muted); font-size: 10px;">🔒</span>' : ''}
      <span class="user-count">${channel.userCount || 0}</span>
    `;
    
    // Click to join channel
    channelEl.addEventListener('click', () => {
      joinChannel(channel.id);
    });
    
    // Right-click context menu
    channelEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showChannelContextMenu(e, channel);
    });
    
    serverTreeContainer.appendChild(channelEl);
    
    // Render users in this channel (only for current channel)
    if (channel.id === state.currentChannel) {
      Object.values(state.users).forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'tree-user';
        userEl.dataset.userId = user.id;
        
        const isSelf = user.id === state.clientId;
        const groupClass = user.groupId === 'admin' ? 'admin' : (user.groupId === 'moderator' ? 'moderator' : '');
        const groupName = state.groups[user.groupId]?.name || user.groupId;
        
        userEl.innerHTML = `
          <span class="icon">${isSelf ? '👤' : '👥'}</span>
          <span class="speaking-indicator ${user.isTalking ? 'speaking' : ''}" data-user-id="${user.id}"></span>
          <span class="name">${escapeHtml(user.nickname)}${isSelf ? ' (vous)' : ''}</span>
          <span class="group-badge ${groupClass}">${escapeHtml(groupName)}</span>
        `;
        
        // Right-click context menu
        userEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showUserContextMenu(e, user);
        });
        
        // Double-click for private message
        userEl.addEventListener('dblclick', () => {
          if (!isSelf) {
            openPrivateMessage(user);
          }
        });
        
        serverTreeContainer.appendChild(userEl);
      });
    }
  });
}

/**
 * Update speaking indicator for a user
 */
function updateSpeakingIndicator(userId, isTalking) {
  const indicator = document.querySelector(`.speaking-indicator[data-user-id="${userId}"]`);
  if (indicator) {
    indicator.classList.toggle('speaking', isTalking);
  }
}

/**
 * Update local speaking indicator
 */
function updateLocalSpeakingIndicator(isTalking) {
  const indicator = document.querySelector(`.speaking-indicator[data-user-id="${state.clientId}"]`);
  if (indicator) {
    indicator.classList.toggle('speaking', isTalking);
  }
}

// ============================================================
// Channel Operations
// ============================================================

/**
 * Join a channel
 */
function joinChannel(channelId, password = '') {
  if (channelId === state.currentChannel) return;
  
  sendToServer({
    type: 'join_channel',
    channelId: channelId,
    password: password
  });
}

/**
 * Leave current channel
 */
function leaveChannel() {
  if (!state.currentChannel) return;
  
  sendToServer({
    type: 'leave_channel',
    channelId: state.currentChannel
  });
}

/**
 * Get channel name by ID
 */
function getChannelName(channelId) {
  const channel = state.channels.find(ch => ch.id === channelId);
  return channel ? channel.name : 'Inconnu';
}

// ============================================================
// Chat
// ============================================================

/**
 * Add a message to the chat
 */
function addChatMessage(sender, message, timestamp, type = '', channelTag = '') {
  const time = new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
  const msgEl = document.createElement('div');
  msgEl.className = `chat-message ${type}`;
  
  if (type === 'system') {
    msgEl.innerHTML = `<span class="timestamp">[${time}]</span> ${escapeHtml(message)}`;
  } else {
    msgEl.innerHTML = `
      <span class="timestamp">[${time}]</span>
      ${channelTag ? `<span class="channel-tag">${escapeHtml(channelTag)}</span>` : ''}
      <span class="sender" style="color: var(--accent-primary)">${escapeHtml(sender)}</span>
      <span class="message-text">${escapeHtml(message)}</span>
    `;
  }
  
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Limit chat history
  while (chatMessages.children.length > 500) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

/**
 * System log message
 */
function logSystem(message) {
  addChatMessage('', message, Date.now(), 'system');
}

/**
 * Send chat message
 */
function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message || !state.connected) return;
  
  const target = chatTargetSelect.value;
  
  sendToServer({
    type: 'chat_message',
    message: message,
    target: target
  });
  
  chatInput.value = '';
  chatInput.focus();
}

/**
 * Open private message with user
 */
function openPrivateMessage(user) {
  chatTargetSelect.value = 'private';
  chatInput.placeholder = `Message privé à ${user.nickname}...`;
  chatInput.dataset.targetUserId = user.id;
  chatInput.focus();
}

/**
 * Play notification sound
 */
function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.05;
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    // Ignore audio errors
  }
}

// ============================================================
// Context Menus
// ============================================================

/**
 * Show channel context menu
 */
function showChannelContextMenu(event, channel) {
  const canManage = hasPermission('canManageChannels');
  
  const items = [
    { label: `Rejoindre ${channel.name}`, action: () => joinChannel(channel.id) },
    { separator: true },
    { label: 'Copier le nom', action: () => copyToClipboard(channel.name) },
  ];
  
  if (canManage) {
    items.push({ separator: true });
    items.push({ label: 'Renommer', action: () => renameChannel(channel.id) });
    if (channel.id !== 'ch_default') {
      items.push({ label: 'Supprimer', action: () => deleteChannel(channel.id), danger: true });
    }
  }
  
  showContextMenu(event, items);
}

/**
 * Show user context menu
 */
function showUserContextMenu(event, user) {
  const isSelf = user.id === state.clientId;
  const canKick = hasPermission('canKick');
  
  const items = [
    { label: `Message privé à ${user.nickname}`, action: () => openPrivateMessage(user) },
    { label: 'Copier le pseudo', action: () => copyToClipboard(user.nickname) },
  ];
  
  if (!isSelf && canKick) {
    items.push({ separator: true });
    items.push({ label: 'Expulser', action: () => kickUser(user.id), danger: true });
  }
  
  showContextMenu(event, items);
}

/**
 * Show context menu
 */
function showContextMenu(event, items) {
  contextMenu.innerHTML = '';
  
  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      contextMenu.appendChild(sep);
      return;
    }
    
    const el = document.createElement('div');
    el.className = `menu-item ${item.danger ? 'danger' : ''}`;
    el.textContent = item.label;
    el.addEventListener('click', () => {
      item.action();
      hideContextMenu();
    });
    contextMenu.appendChild(el);
  });
  
  contextMenu.style.display = 'block';
  contextMenu.style.left = `${event.pageX}px`;
  contextMenu.style.top = `${event.pageY}px`;
}

/**
 * Hide context menu
 */
function hideContextMenu() {
  contextMenu.style.display = 'none';
}

// ============================================================
// Admin Operations
// ============================================================

/**
 * Check if current user has a permission
 */
function hasPermission(permission) {
  const group = state.groups[state.groupId];
  return group && group.permissions && group.permissions[permission];
}

/**
 * Rename channel
 */
function renameChannel(channelId) {
  const channel = state.channels.find(ch => ch.id === channelId);
  if (!channel) return;
  
  const newName = prompt('Nouveau nom du canal:', channel.name);
  if (newName && newName.trim()) {
    sendToServer({
      type: 'rename_channel',
      channelId: channelId,
      newName: newName.trim()
    });
  }
}

/**
 * Delete channel
 */
function deleteChannel(channelId) {
  const channel = state.channels.find(ch => ch.id === channelId);
  if (!channel) return;
  
  if (confirm(`Supprimer le canal "${channel.name}" ?`)) {
    sendToServer({
      type: 'delete_channel',
      channelId: channelId
    });
  }
}

/**
 * Kick user
 */
function kickUser(userId) {
  const user = state.users[userId];
  if (!user) return;
  
  const reason = prompt(`Expulser ${user.nickname}? (raison):`, '');
  if (reason !== null) {
    sendToServer({
      type: 'kick_user',
      userId: userId,
      reason: reason
    });
  }
}

// ============================================================
// Ping System
// ============================================================

/**
 * Start ping monitoring
 */
function startPing() {
  if (state.pingInterval) {
    clearInterval(state.pingInterval);
  }
  
  state.pingInterval = setInterval(() => {
    state.lastPing = Date.now();
    sendToServer({ type: 'ping' });
  }, 5000);
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    logSystem('Copié dans le presse-papier.');
  }).catch(() => {
    logSystem('Erreur lors de la copie.');
  });
}

// ============================================================
// Event Listeners
// ============================================================

// Welcome connect button
welcomeConnectBtn.addEventListener('click', () => {
  // Trigger the main window to open connect dialog
  window.parent.postMessage({ type: 'open_connect_dialog' }, '*');
});

// Chat input
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Chat send button
chatSendBtn.addEventListener('click', sendChatMessage);

// Microphone toggle
micBtn.addEventListener('click', () => {
  state.audio.micActive = !state.audio.micActive;
  micBtn.classList.toggle('active', state.audio.micActive);
  micBtn.classList.toggle('muted', !state.audio.micActive);
  
  if (state.connected) {
    sendToServer({
      type: 'mute',
      muted: !state.audio.micActive
    });
  }
});

// Speaker toggle
speakerBtn.addEventListener('click', () => {
  state.audio.speakerActive = !state.audio.speakerActive;
  speakerBtn.classList.toggle('active', state.audio.speakerActive);
  speakerBtn.classList.toggle('muted', !state.audio.speakerActive);
  
  if (state.audio.outputGain) {
    state.audio.outputGain.gain.value = state.audio.speakerActive ? state.audio.speakerVolume : 0;
  }
});

// Microphone volume
micVolumeSlider.addEventListener('input', () => {
  state.audio.micVolume = micVolumeSlider.value / 100;
  if (state.audio.micGain) {
    state.audio.micGain.gain.value = state.audio.micVolume;
  }
});

// Speaker volume
speakerVolumeSlider.addEventListener('input', () => {
  state.audio.speakerVolume = speakerVolumeSlider.value / 100;
  if (state.audio.outputGain) {
    state.audio.outputGain.gain.value = state.audio.speakerActive ? state.audio.speakerVolume : 0;
  }
  // Update all user gains
  state.audio.userAudioMap.forEach(({ gain }) => {
    gain.gain.value = state.audio.speakerVolume;
  });
});

// Push-to-talk key handling
document.addEventListener('keydown', (e) => {
  if (state.audio.pushToTalk && !state.audio.pttActive) {
    const keyMap = {
      'Space': ' ',
      'Ctrl': 'Control',
      'Shift': 'Shift',
      'Alt': 'Alt'
    };
    
    const pttKey = state.audio.pushToTalkKey.toLowerCase();
    const pressedKey = e.key.toLowerCase();
    
    if (pressedKey === pttKey || e.code.toLowerCase().replace(' ', '').replace('right', '').replace('left', '') === pttKey) {
      e.preventDefault();
      state.audio.pttActive = true;
      state.audio.micActive = true;
      micBtn.classList.add('active');
      micBtn.classList.remove('muted');
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (state.audio.pushToTalk && state.audio.pttActive) {
    state.audio.pttActive = false;
    state.audio.micActive = false;
    micBtn.classList.remove('active');
    micBtn.classList.add('muted');
  }
});

// Close context menu on click outside
document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// IPC events from main process
window.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'connect':
      // Connection requested from connect dialog
      connectToServer(data.address, data.port, data.nickname, data.password);
      state.serverAddress = data.address;
      state.nickname = data.nickname;
      break;
    
    case 'privilege_key':
      // Privilege key submitted
      if (state.connected) {
        sendToServer({
          type: 'privilege_key',
          key: data.key
        });
      }
      break;
    
    case 'open_connect_dialog':
      // Request to open connect dialog (handled by main process)
      break;
  }
});

// App disconnect from main process menu
if (window.speaknexAPI) {
  window.speaknexAPI.onDisconnect(() => {
    disconnect();
  });
  
  window.speaknexAPI.onShutdown(() => {
    disconnect();
  });
}

// ============================================================
// Initialization
// ============================================================

(async () => {
  // Load settings
  try {
    const settings = await window.speaknexAPI.loadSettings();
    
    if (settings.audio) {
      state.audio.pushToTalk = settings.audio.pushToTalk || false;
      state.audio.pushToTalkKey = settings.audio.pushToTalkKey || 'ESPACE';
      state.audio.micVolume = (settings.audio.microphoneVolume || 100) / 100;
      state.audio.speakerVolume = (settings.audio.volume || 100) / 100;
      state.audio.voiceDetection = settings.audio.voiceActivation !== false;
      state.audio.voiceThreshold = settings.audio.voiceThreshold || 50;
    }
    
    // Apply volume settings
    micVolumeSlider.value = state.audio.micVolume * 100;
    speakerVolumeSlider.value = state.audio.speakerVolume * 100;
    
    // Auto-connect if configured
    if (settings.connection?.autoConnect && settings.connection?.lastServer) {
      const parts = settings.connection.lastServer.split(':');
      const nickname = settings.connection.lastNickname || 'Utilisateur';
      connectToServer(parts[0], parseInt(parts[1] || '30000'), nickname);
      state.serverAddress = parts[0];
      state.nickname = nickname;
    }
  } catch (e) {
    console.warn('Could not load settings:', e);
  }
  
  // Set initial UI state
  setConnectionState('disconnected');
  micBtn.classList.add('active');
  speakerBtn.classList.add('active');
})();
