#!/usr/bin/env node

/**
 * SpeakNex Server (SN1-Server)
 * Voice Communication Server
 * 
 * Handles client connections, channels, users, permissions,
 * text chat, voice relay, and privilege keys.
 *
 * Default port: 30000
 */

const http = require('http');
const { WebSocketServer, WebSocketServer: WSS } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Command, Option } = require('commander');
const speakeasy = require('speakeasy');

// ============================================================
// Configuration
// ============================================================

const DEFAULT_PORT = 30000;
const DEFAULT_SERVER_NAME = 'SpeakNex Server';
const DEFAULT_MAX_CLIENTS = 50;
const DEFAULT_CHANNEL = 'General';

let config = {
  port: DEFAULT_PORT,
  serverName: DEFAULT_SERVER_NAME,
  serverPassword: '',
  maxClients: DEFAULT_MAX_CLIENTS,
  privilegeKeys: {},
  channels: [
    { id: 'ch_default', name: DEFAULT_CHANNEL, password: '', parent: null, order: 0 }
  ],
  groups: {
    'guest': { id: 'guest', name: 'Guest', permissions: { canSpeak: false, canWrite: false, canJoinChannels: true } },
    'default': { id: 'default', name: 'Default', permissions: { canSpeak: true, canWrite: true, canJoinChannels: true } },
    'moderator': { id: 'moderator', name: 'Moderator', permissions: { canSpeak: true, canWrite: true, canJoinChannels: true, canKick: true, canBan: false, canManageChannels: false } },
    'admin': { id: 'admin', name: 'Administrator', permissions: { canSpeak: true, canWrite: true, canJoinChannels: true, canKick: true, canBan: true, canManageChannels: true, canManageUsers: true, canGeneratePrivilegeKeys: true, canChangeServerSettings: true } }
  },
  admins: [], // list of user IDs with admin group
  dataDir: path.join(__dirname, 'data'),
  logFile: null
};

// ============================================================
// Data Persistence
// ============================================================

function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function loadConfig() {
  const configPath = path.join(config.dataDir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...saved };
      log(`Configuration loaded from ${configPath}`);
    } catch (e) {
      log(`Warning: Could not load config file: ${e.message}`);
    }
  }
  ensureDataDir();
}

function saveConfig() {
  ensureDataDir();
  const configPath = path.join(config.dataDir, 'config.json');
  const toSave = {
    port: config.port,
    serverName: config.serverName,
    serverPassword: config.serverPassword,
    maxClients: config.maxClients,
    channels: config.channels,
    privilegeKeys: config.privilegeKeys,
    admins: config.admins
  };
  try {
    fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2));
  } catch (e) {
    log(`Warning: Could not save config: ${e.message}`);
  }
}

// ============================================================
// Logging
// ============================================================

function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  console.log(logLine);
  
  if (config.logFile) {
    try {
      fs.appendFileSync(config.logFile, logLine + '\n');
    } catch (e) {
      // ignore log write errors
    }
  }
}

// ============================================================
// Privilege Key System
// ============================================================

function generatePrivilegeKey(groupId, durationMinutes = 0) {
  const secret = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(secret).digest('hex');
  const key = hash.substring(0, 16).toUpperCase();
  
  const entry = {
    key: key,
    groupId: groupId,
    generatedAt: Date.now(),
    expiresAt: durationMinutes > 0 ? Date.now() + (durationMinutes * 60 * 1000) : null,
    used: false,
    usedBy: null
  };
  
  config.privilegeKeys[key] = entry;
  saveConfig();
  
  return { key: key, secret: secret, entry: entry };
}

function validatePrivilegeKey(key, userId) {
  const entry = config.privilegeKeys[key.toUpperCase()];
  if (!entry) return { valid: false, reason: 'Key not found' };
  if (entry.used) return { valid: false, reason: 'Key already used' };
  if (entry.expiresAt && entry.expiresAt < Date.now()) return { valid: false, reason: 'Key expired' };
  
  entry.used = true;
  entry.usedBy = userId;
  entry.usedAt = Date.now();
  saveConfig();
  
  return { valid: true, groupId: entry.groupId };
}

// ============================================================
// Channel Management
// ============================================================

function getChannelById(id) {
  return config.channels.find(ch => ch.id === id);
}

function getChannelByName(name) {
  return config.channels.find(ch => ch.name.toLowerCase() === name.toLowerCase());
}

function createChannel(name, password = '', parentId = null) {
  const id = 'ch_' + crypto.randomBytes(8).toString('hex');
  const channel = { id, name, password, parent: parentId, order: config.channels.length };
  config.channels.push(channel);
  saveConfig();
  return channel;
}

function deleteChannel(id) {
  const idx = config.channels.findIndex(ch => ch.id === id);
  if (idx === -1 || id === 'ch_default') return false;
  config.channels.splice(idx, 1);
  saveConfig();
  return true;
}

function renameChannel(id, newName) {
  const ch = getChannelById(id);
  if (!ch) return false;
  ch.name = newName;
  saveConfig();
  return true;
}

// ============================================================
// Client Management
// ============================================================

const clients = new Map(); // clientId -> client data
let clientIdCounter = 0;

function createClient(ws, address) {
  const clientId = 'client_' + (++clientIdCounter) + '_' + crypto.randomBytes(4).toString('hex');
  const client = {
    id: clientId,
    ws: ws,
    address: address,
    nickname: '',
    connectedAt: Date.now(),
    channel: null,
    groupId: 'default',
    muted: false,
    deaf: false,
    isTalking: false,
    connected: true
  };
  clients.set(clientId, client);
  return client;
}

function removeClient(clientId) {
  const client = clients.get(clientId);
  if (!client) return;
  
  // Remove from channel
  if (client.channel) {
    broadcastChannelList(client.channel);
    broadcastUserList(client.channel);
  }
  
  // Notify others
  broadcastToAll({
    type: 'user_left',
    userId: clientId,
    nickname: client.nickname || 'Unknown',
    channelId: client.channel
  });
  
  clients.delete(clientId);
}

function getClientById(id) {
  return clients.get(id);
}

function getClientsInChannel(channelId) {
  return Array.from(clients.values()).filter(c => c.channel === channelId && c.connected);
}

function getUserCount() {
  return Array.from(clients.values()).filter(c => c.connected).length;
}

// ============================================================
// Broadcasting
// ============================================================

function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !client.ws || client.ws.readyState !== 1) return;
  client.ws.send(JSON.stringify(message));
}

function broadcastToAll(message, excludeClientId = null) {
  for (const [id, client] of clients) {
    if (id === excludeClientId) continue;
    if (!client.connected) continue;
    if (client.ws.readyState !== 1) continue;
    client.ws.send(JSON.stringify(message));
  }
}

function broadcastToChannel(channelId, message, excludeClientId = null) {
  const members = getClientsInChannel(channelId);
  for (const client of members) {
    if (client.id === excludeClientId) continue;
    if (client.ws.readyState !== 1) continue;
    client.ws.send(JSON.stringify(message));
  }
}

function broadcastChannelList(channelId) {
  const channel = getChannelById(channelId);
  if (!channel) return;
  
  const members = getClientsInChannel(channelId);
  const userList = members.map(c => ({
    id: c.id,
    nickname: c.nickname || 'Unknown',
    groupId: c.groupId,
    muted: c.muted,
    isTalking: c.isTalking
  }));
  
  broadcastToChannel(channelId, {
    type: 'user_list_update',
    channelId: channelId,
    users: userList
  });
}

function broadcastUserList(channelId) {
  broadcastChannelList(channelId);
}

// ============================================================
// Permission Checks
// ============================================================

function getGroupPermissions(groupId) {
  const group = config.groups[groupId];
  return group ? group.permissions : config.groups['default'].permissions;
}

function hasPermission(clientId, permission) {
  const client = clients.get(clientId);
  if (!client) return false;
  const perms = getGroupPermissions(client.groupId);
  return !!perms[permission];
}

function setClientGroup(clientId, groupId) {
  const client = clients.get(clientId);
  if (!client) return false;
  if (!config.groups[groupId]) return false;
  client.groupId = groupId;
  return true;
}

// ============================================================
// Audio Relay
// ============================================================

function relayAudio(channelId, senderId, audioData) {
  const sender = clients.get(senderId);
  if (!sender || sender.channel !== channelId) return;
  if (sender.muted) return;
  if (!hasPermission(senderId, 'canSpeak')) return;
  
  // Mark sender as talking
  sender.isTalking = true;
  
  // Send audio to all other clients in the channel
  const members = getClientsInChannel(channelId);
  for (const client of members) {
    if (client.id === senderId) continue;
    if (!client.connected) continue;
    if (client.ws.readyState !== 1) continue;
    
    // Send binary audio data with header
    const header = Buffer.from(JSON.stringify({
      type: 'audio',
      userId: senderId,
      nickname: sender.nickname || 'Unknown',
      sampleRate: 16000,
      channels: 1,
      format: 'int16'
    }));
    
    // Combine header and audio data
    const separator = Buffer.from('\n');
    const packet = Buffer.concat([header, separator, audioData]);
    client.ws.send(packet);
  }
  
  // Reset talking flag after a delay
  clearTimeout(sender.talkingTimeout);
  sender.talkingTimeout = setTimeout(() => {
    sender.isTalking = false;
    broadcastToChannel(channelId, {
      type: 'talking_status',
      userId: senderId,
      isTalking: false
    });
  }, 500);
}

// ============================================================
// WebSocket Server
// ============================================================

let wss;
let httpServer;

function startServer() {
  httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`${config.serverName} - SpeakNex Server\n`);
  });
  
  wss = new WSS({ server: httpServer });
  
  wss.on('connection', handleConnection);
  
  httpServer.listen(config.port, () => {
    log(`SpeakNex Server started on port ${config.port}`);
    log(`Server name: ${config.serverName}`);
    log(`Max clients: ${config.maxClients}`);
    log(`Channels: ${config.channels.map(c => c.name).join(', ')}`);
  });
  
  httpServer.on('error', (err) => {
    log(`Server error: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      log(`Port ${config.port} is already in use.`);
      process.exit(1);
    }
  });
}

function handleConnection(ws, req) {
  const address = req.socket.remoteAddress || 'unknown';
  log(`Connection attempt from ${address}`);
  
  const client = createClient(ws, address);
  
  // Send server info
  sendToClient(client.id, {
    type: 'server_info',
    clientId: client.id,
    serverName: config.serverName,
    version: '26.0',
    maxClients: config.maxClients,
    currentClients: getUserCount()
  });
  
  ws.on('message', (data) => {
    try {
      // Check if data is binary (audio)
      if (data instanceof Buffer || data instanceof ArrayBuffer) {
        handleAudioData(client, data);
        return;
      }
      
      // Parse JSON message
      let message;
      if (typeof data === 'string') {
        message = JSON.parse(data);
      } else {
        message = JSON.parse(data.toString());
      }
      
      handleMessage(client, message);
    } catch (e) {
      log(`Error processing message from ${client.id}: ${e.message}`);
      sendToClient(client.id, { type: 'error', message: 'Invalid message format' });
    }
  });
  
  ws.on('close', () => {
    log(`Client ${client.id} disconnected`);
    client.connected = false;
    removeClient(client.id);
  });
  
  ws.on('error', (err) => {
    log(`WebSocket error for client ${client.id}: ${err.message}`);
    client.connected = false;
    removeClient(client.id);
  });
}

function handleAudioData(client, data) {
  if (!client.channel) {
    // Client not in a channel, drop audio
    return;
  }
  
  // Ensure data is a Buffer
  if (data instanceof ArrayBuffer) {
    data = Buffer.from(data);
  }
  
  relayAudio(client.channel, client.id, data);
}

// ============================================================
// Message Handler
// ============================================================

function handleMessage(client, message) {
  const { type, ...payload } = message;
  
  switch (type) {
    case 'connect':
      handleConnect(client, payload);
      break;
    
    case 'set_nickname':
      handleSetNickname(client, payload);
      break;
    
    case 'join_channel':
      handleJoinChannel(client, payload);
      break;
    
    case 'leave_channel':
      handleLeaveChannel(client, payload);
      break;
    
    case 'chat_message':
      handleChatMessage(client, payload);
      break;
    
    case 'privilege_key':
      handlePrivilegeKey(client, payload);
      break;
    
    case 'mute':
      handleMute(client, payload);
      break;
    
    case 'deaf':
      handleDeaf(client, payload);
      break;
    
    case 'kick_user':
      handleKickUser(client, payload);
      break;
    
    case 'ban_user':
      handleBanUser(client, payload);
      break;
    
    case 'create_channel':
      handleCreateChannel(client, payload);
      break;
    
    case 'delete_channel':
      handleDeleteChannel(client, payload);
      break;
    
    case 'rename_channel':
      handleRenameChannel(client, payload);
      break;
    
    case 'generate_privilege_key':
      handleGeneratePrivilegeKey(client, payload);
      break;
    
    case 'set_user_group':
      handleSetUserGroup(client, payload);
      break;
    
    case 'get_server_config':
      handleGetServerConfig(client);
      break;
    
    case 'set_server_config':
      handleSetServerConfig(client, payload);
      break;
    
    case 'ping':
      sendToClient(client.id, { type: 'pong', timestamp: Date.now() });
      break;
    
    default:
      sendToClient(client.id, { type: 'error', message: `Unknown message type: ${type}` });
  }
}

function handleConnect(client, payload) {
  const { nickname, password } = payload;
  
  // Check server password
  if (config.serverPassword && password !== config.serverPassword) {
    sendToClient(client.id, { type: 'connect_rejected', reason: 'Invalid password' });
    client.connected = false;
    removeClient(client.id);
    client.ws.close();
    return;
  }
  
  // Check max clients
  if (getUserCount() >= config.maxClients) {
    sendToClient(client.id, { type: 'connect_rejected', reason: 'Server is full' });
    client.connected = false;
    removeClient(client.id);
    client.ws.close();
    return;
  }
  
  // Set nickname
  client.nickname = nickname || `User_${client.id.substring(7, 11)}`;
  
  // Send channel list
  sendToClient(client.id, {
    type: 'channel_list',
    channels: config.channels.map(ch => ({
      id: ch.id,
      name: ch.name,
      password: ch.password ? '***' : '',
      parent: ch.parent,
      order: ch.order,
      userCount: getClientsInChannel(ch.id).length
    }))
  });
  
  // Send group list
  sendToClient(client.id, {
    type: 'group_list',
    groups: Object.values(config.groups).map(g => ({
      id: g.id,
      name: g.name,
      permissions: g.permissions
    }))
  });
  
  // Auto-join default channel
  client.channel = 'ch_default';
  
  // Notify client
  sendToClient(client.id, {
    type: 'joined_channel',
    channelId: 'ch_default',
    channelName: DEFAULT_CHANNEL
  });
  
  // Broadcast to channel
  broadcastToChannel('ch_default', {
    type: 'user_joined',
    userId: client.id,
    nickname: client.nickname,
    groupId: client.groupId,
    channelId: 'ch_default'
  });
  
  broadcastChannelList('ch_default');
  
  log(`${client.nickname} connected and joined ${DEFAULT_CHANNEL}`);
  
  // Notify all clients about new user
  broadcastToAll({
    type: 'user_joined',
    userId: client.id,
    nickname: client.nickname,
    groupId: client.groupId,
    channelId: 'ch_default'
  }, client.id);
}

function handleSetNickname(client, payload) {
  const oldNickname = client.nickname;
  client.nickname = payload.nickname || client.nickname;
  
  sendToClient(client.id, {
    type: 'nickname_set',
    nickname: client.nickname
  });
  
  if (client.channel) {
    broadcastToChannel(client.channel, {
      type: 'nickname_changed',
      userId: client.id,
      oldNickname: oldNickname,
      newNickname: client.nickname
    });
    broadcastChannelList(client.channel);
  }
}

function handleJoinChannel(client, payload) {
  const { channelId, password } = payload;
  
  // Check permission
  if (!hasPermission(client.id, 'canJoinChannels')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to join channels' });
    return;
  }
  
  const channel = getChannelById(channelId);
  if (!channel) {
    sendToClient(client.id, { type: 'error', message: 'Channel not found' });
    return;
  }
  
  // Check channel password
  if (channel.password && password !== channel.password) {
    sendToClient(client.id, { type: 'error', message: 'Invalid channel password' });
    return;
  }
  
  // Leave current channel
  if (client.channel) {
    broadcastToChannel(client.channel, {
      type: 'user_left',
      userId: client.id,
      nickname: client.nickname,
      channelId: client.channel
    });
    broadcastChannelList(client.channel);
  }
  
  // Join new channel
  client.channel = channelId;
  
  sendToClient(client.id, {
    type: 'joined_channel',
    channelId: channelId,
    channelName: channel.name
  });
  
  // Send user list for new channel
  const members = getClientsInChannel(channelId);
  const userList = members.map(c => ({
    id: c.id,
    nickname: c.nickname || 'Unknown',
    groupId: c.groupId,
    muted: c.muted,
    isTalking: c.isTalking
  }));
  
  sendToClient(client.id, {
    type: 'user_list_update',
    channelId: channelId,
    users: userList
  });
  
  // Notify channel
  broadcastToChannel(channelId, {
    type: 'user_joined',
    userId: client.id,
    nickname: client.nickname,
    groupId: client.groupId,
    channelId: channelId
  }, client.id);
  
  broadcastChannelList(channelId);
  
  log(`${client.nickname} joined ${channel.name}`);
}

function handleLeaveChannel(client, payload) {
  if (!client.channel) return;
  
  const channelName = getChannelById(client.channel)?.name || 'unknown';
  
  broadcastToChannel(client.channel, {
    type: 'user_left',
    userId: client.id,
    nickname: client.nickname,
    channelId: client.channel
  });
  
  broadcastChannelList(client.channel);
  
  client.channel = null;
  
  sendToClient(client.id, {
    type: 'left_channel',
    channelId: payload.channelId || null
  });
  
  log(`${client.nickname} left ${channelName}`);
}

function handleChatMessage(client, payload) {
  const { message, target } = payload;
  
  if (!message || !message.trim()) return;
  
  // Check permission
  if (!hasPermission(client.id, 'canWrite')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to send messages' });
    return;
  }
  
  const chatMsg = {
    type: 'chat_message',
    userId: client.id,
    nickname: client.nickname,
    groupId: client.groupId,
    message: message.trim(),
    timestamp: Date.now(),
    target: target // 'server', 'channel', or 'private'
  };
  
  if (target === 'private' && payload.targetUserId) {
    // Private message
    chatMsg.targetUserId = payload.targetUserId;
    sendToClient(payload.targetUserId, chatMsg);
    sendToClient(client.id, { ...chatMsg, targetUserId: client.id });
  } else if (target === 'server') {
    // Server-wide message
    broadcastToAll(chatMsg, client.id);
    sendToClient(client.id, chatMsg);
  } else {
    // Channel message
    if (!client.channel) {
      sendToClient(client.id, { type: 'error', message: 'You are not in a channel' });
      return;
    }
    chatMsg.channelId = client.channel;
    broadcastToChannel(client.channel, chatMsg, client.id);
    sendToClient(client.id, chatMsg);
  }
}

function handlePrivilegeKey(client, payload) {
  const { key } = payload;
  
  if (!key) {
    sendToClient(client.id, { type: 'error', message: 'No privilege key provided' });
    return;
  }
  
  const result = validatePrivilegeKey(key, client.id);
  
  if (result.valid) {
    setClientGroup(client.id, result.groupId);
    
    sendToClient(client.id, {
      type: 'privilege_key_accepted',
      groupId: result.groupId,
      groupName: config.groups[result.groupId]?.name || result.groupId
    });
    
    log(`${client.nickname} used privilege key for ${result.groupId} group`);
    
    // Broadcast group change
    if (client.channel) {
      broadcastToChannel(client.channel, {
        type: 'user_group_changed',
        userId: client.id,
        nickname: client.nickname,
        groupId: result.groupId
      });
      broadcastChannelList(client.channel);
    }
  } else {
    sendToClient(client.id, {
      type: 'privilege_key_rejected',
      reason: result.reason
    });
  }
}

function handleMute(client, payload) {
  const { userId, muted } = payload;
  
  // Check if client has permission to mute others
  if (userId && userId !== client.id) {
    if (!hasPermission(client.id, 'canKick')) {
      sendToClient(client.id, { type: 'error', message: 'You do not have permission to mute other users' });
      return;
    }
    
    const target = clients.get(userId);
    if (!target) {
      sendToClient(client.id, { type: 'error', message: 'User not found' });
      return;
    }
    
    target.muted = muted;
    
    sendToClient(userId, {
      type: 'muted_by_server',
      muted: muted
    });
    
    if (target.channel) {
      broadcastToChannel(target.channel, {
        type: 'user_muted',
        userId: userId,
        nickname: target.nickname,
        muted: muted
      });
    }
  } else {
    // Self mute
    client.muted = muted;
    sendToClient(client.id, {
      type: 'muted',
      muted: muted
    });
    
    if (client.channel) {
      broadcastToChannel(client.channel, {
        type: 'user_muted',
        userId: client.id,
        nickname: client.nickname,
        muted: muted
      });
    }
  }
}

function handleDeaf(client, payload) {
  const { deaf } = payload;
  client.deaf = deaf;
  sendToClient(client.id, {
    type: 'deafened',
    deaf: deaf
  });
}

function handleKickUser(adminClient, payload) {
  const { userId, reason } = payload;
  
  if (!hasPermission(adminClient.id, 'canKick')) {
    sendToClient(adminClient.id, { type: 'error', message: 'You do not have permission to kick users' });
    return;
  }
  
  const target = clients.get(userId);
  if (!target) {
    sendToClient(adminClient.id, { type: 'error', message: 'User not found' });
    return;
  }
  
  sendToClient(userId, {
    type: 'kicked',
    reason: reason || 'No reason provided',
    kicker: adminClient.nickname
  });
  
  target.ws.close();
  log(`${adminClient.nickname} kicked ${target.nickname}: ${reason || 'No reason'}`);
}

function handleBanUser(adminClient, payload) {
  const { userId, reason } = payload;
  
  if (!hasPermission(adminClient.id, 'canBan')) {
    sendToClient(adminClient.id, { type: 'error', message: 'You do not have permission to ban users' });
    return;
  }
  
  const target = clients.get(userId);
  if (!target) {
    sendToClient(adminClient.id, { type: 'error', message: 'User not found' });
    return;
  }
  
  sendToClient(userId, {
    type: 'banned',
    reason: reason || 'No reason provided',
    banner: adminClient.nickname
  });
  
  target.ws.close();
  log(`${adminClient.nickname} banned ${target.nickname}: ${reason || 'No reason'}`);
}

function handleCreateChannel(client, payload) {
  const { name, password, parentId } = payload;
  
  if (!hasPermission(client.id, 'canManageChannels')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to create channels' });
    return;
  }
  
  if (!name || !name.trim()) {
    sendToClient(client.id, { type: 'error', message: 'Channel name is required' });
    return;
  }
  
  const channel = createChannel(name.trim(), password || '', parentId || null);
  
  sendToClient(client.id, {
    type: 'channel_created',
    channel: channel
  });
  
  broadcastToAll({
    type: 'channel_created',
    channel: channel
  }, client.id);
  
  log(`${client.nickname} created channel ${channel.name}`);
}

function handleDeleteChannel(client, payload) {
  const { channelId } = payload;
  
  if (!hasPermission(client.id, 'canManageChannels')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to delete channels' });
    return;
  }
  
  if (!deleteChannel(channelId)) {
    sendToClient(client.id, { type: 'error', message: 'Could not delete channel' });
    return;
  }
  
  // Move users from deleted channel to default
  for (const [, c] of clients) {
    if (c.channel === channelId) {
      c.channel = 'ch_default';
      sendToClient(c.id, {
        type: 'joined_channel',
        channelId: 'ch_default',
        channelName: DEFAULT_CHANNEL
      });
    }
  }
  
  broadcastToAll({
    type: 'channel_deleted',
    channelId: channelId
  });
}

function handleRenameChannel(client, payload) {
  const { channelId, newName } = payload;
  
  if (!hasPermission(client.id, 'canManageChannels')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to rename channels' });
    return;
  }
  
  if (!renameChannel(channelId, newName)) {
    sendToClient(client.id, { type: 'error', message: 'Could not rename channel' });
    return;
  }
  
  broadcastToAll({
    type: 'channel_renamed',
    channelId: channelId,
    newName: newName
  });
}

function handleGeneratePrivilegeKey(client, payload) {
  const { groupId, durationMinutes } = payload;
  
  if (!hasPermission(client.id, 'canGeneratePrivilegeKeys')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to generate privilege keys' });
    return;
  }
  
  if (!config.groups[groupId]) {
    sendToClient(client.id, { type: 'error', message: 'Invalid group ID' });
    return;
  }
  
  const result = generatePrivilegeKey(groupId, durationMinutes || 0);
  
  sendToClient(client.id, {
    type: 'privilege_key_generated',
    key: result.key,
    groupId: groupId,
    groupName: config.groups[groupId].name,
    expiresAt: result.entry.expiresAt
  });
  
  log(`${client.nickname} generated privilege key ${result.key} for ${groupId}`);
}

function handleSetUserGroup(client, payload) {
  const { userId, groupId } = payload;
  
  if (!hasPermission(client.id, 'canManageUsers')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to manage user groups' });
    return;
  }
  
  if (!setClientGroup(userId, groupId)) {
    sendToClient(client.id, { type: 'error', message: 'Could not set user group' });
    return;
  }
  
  const target = clients.get(userId);
  if (target) {
    sendToClient(userId, {
      type: 'group_changed',
      groupId: groupId
    });
    
    if (target.channel) {
      broadcastToChannel(target.channel, {
        type: 'user_group_changed',
        userId: userId,
        nickname: target.nickname,
        groupId: groupId
      });
      broadcastChannelList(target.channel);
    }
  }
}

function handleGetServerConfig(client) {
  if (!hasPermission(client.id, 'canChangeServerSettings')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to view server config' });
    return;
  }
  
  sendToClient(client.id, {
    type: 'server_config',
    config: {
      serverName: config.serverName,
      port: config.port,
      maxClients: config.maxClients,
      hasPassword: !!config.serverPassword,
      channels: config.channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        hasPassword: !!ch.password,
        parent: ch.parent,
        order: ch.order
      })),
      groups: Object.values(config.groups).map(g => ({
        id: g.id,
        name: g.name,
        permissions: g.permissions
      }))
    }
  });
}

function handleSetServerConfig(client, payload) {
  if (!hasPermission(client.id, 'canChangeServerSettings')) {
    sendToClient(client.id, { type: 'error', message: 'You do not have permission to change server config' });
    return;
  }
  
  if (payload.serverName !== undefined) config.serverName = payload.serverName;
  if (payload.maxClients !== undefined) config.maxClients = payload.maxClients;
  if (payload.serverPassword !== undefined) config.serverPassword = payload.serverPassword;
  
  saveConfig();
  
  sendToClient(client.id, {
    type: 'server_config_updated',
    config: {
      serverName: config.serverName,
      port: config.port,
      maxClients: config.maxClients,
      hasPassword: !!config.serverPassword
    }
  });
  
  log(`${client.nickname} updated server configuration`);
}

// ============================================================
// CLI
// ============================================================

function parseArgs() {
  const program = new Command();
  
  program
    .name('speaknex-server')
    .description('SpeakNex Voice Communication Server')
    .version('26.0')
    .option('-p, --port <port>', `Server port (default: ${DEFAULT_PORT})`, String)
    .option('-n, --name <name>', 'Server name', String)
    .option('-d, --data-dir <dir>', 'Data directory', String)
    .option('--password <password>', 'Server password', String)
    .option('--max-clients <count>', 'Maximum number of clients', String)
    .option('--log-file <path>', 'Log file path', String)
    .option('--dev', 'Development mode', false)
    .option('--generate-key <groupId>', 'Generate a privilege key for the specified group', String)
    .option('--list-keys', 'List all privilege keys', false)
    .option('--reset-config', 'Reset configuration to defaults', false);
  
  program.parse(process.argv);
  return program.opts();
}

function main() {
  const opts = parseArgs();
  
  // Apply CLI options
  if (opts.port) config.port = parseInt(opts.port);
  if (opts.name) config.serverName = opts.name;
  if (opts.dataDir) config.dataDir = opts.dataDir;
  if (opts.password) config.serverPassword = opts.password;
  if (opts.maxClients) config.maxClients = parseInt(opts.maxClients);
  if (opts.logFile) config.logFile = opts.logFile;
  
  // Load saved configuration
  loadConfig();
  
  // Override with CLI options if provided
  if (opts.port) config.port = parseInt(opts.port);
  if (opts.name) config.serverName = opts.name;
  
  // Handle special commands
  if (opts.generateKey) {
    const result = generatePrivilegeKey(opts.generateKey);
    console.log(`Privilege key: ${result.key}`);
    console.log(`Group: ${opts.generateKey}`);
    console.log(`Secret: ${result.secret}`);
    return;
  }
  
  if (opts.listKeys) {
    console.log('Privilege Keys:');
    for (const [key, entry] of Object.entries(config.privilegeKeys)) {
      const status = entry.used ? `USED by ${entry.usedBy}` : 'ACTIVE';
      const expires = entry.expiresAt ? `expires ${new Date(entry.expiresAt).toISOString()}` : 'never expires';
      console.log(`  ${key} -> ${entry.groupId} (${status}, ${expires})`);
    }
    return;
  }
  
  if (opts.resetConfig) {
    const configPath = path.join(config.dataDir, 'config.json');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log('Configuration reset to defaults.');
    }
    return;
  }
  
  // Start server
  log('Starting SpeakNex Server v26.0');
  startServer();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    log('Shutting down...');
    saveConfig();
    
    // Disconnect all clients
    for (const [, client] of clients) {
      if (client.ws.readyState === 1) {
        client.ws.close();
      }
    }
    
    if (httpServer) {
      httpServer.close(() => {
        log('Server stopped.');
        process.exit(0);
      });
    }
    
    setTimeout(() => process.exit(0), 5000);
  });
  
  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down...');
    process.emit('SIGINT');
  });
  
  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    log(`Uncaught exception: ${err.message}`);
    log(err.stack);
  });
  
  process.on('unhandledRejection', (reason) => {
    log(`Unhandled rejection: ${reason}`);
  });
}

// ============================================================
// Entry Point
// ============================================================

if (require.main === module) {
  main();
}

module.exports = {
  config,
  generatePrivilegeKey,
  validatePrivilegeKey,
  createChannel,
  deleteChannel,
  getChannelById,
  getChannelByName,
  clients,
  createClient,
  removeClient,
  getClientById,
  getClientsInChannel,
  getUserCount,
  hasPermission,
  setClientGroup,
  relayAudio,
  sendToClient,
  broadcastToAll,
  broadcastToChannel,
  handleMessage
};
