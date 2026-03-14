const { CHAT_USERNAME_MAX_LEN, CHAT_RATE_LIMIT_MS } = require('./config');
const Lobby = require('./lobby');
const Chat = require('./chat');
const ChatRooms = require('./chat-rooms');

const _lastMsgTime = new Map();

async function handleMessage(clientId, data) {
  let msg;
  try { msg = JSON.parse(data); } catch { return; }
  const type = msg.t;
  if (!type) return;

  const user = Lobby.findUser(clientId);

  // Join
  if (type === 'join') {
    if (user) return;
    const username = msg.u;
    const color = msg.c;
    if (!username || username.length === 0 || username.length > CHAT_USERNAME_MAX_LEN) {
      Lobby.sendToClient(clientId, JSON.stringify({ t: 'err', m: 'Invalid username' }));
      return;
    }
    const idx = Lobby.addUser(username, clientId, color);
    if (idx < 0) {
      Lobby.sendToClient(clientId, JSON.stringify({ t: 'err', m: 'Username taken or server full' }));
      return;
    }
    Lobby.sendToClient(clientId, JSON.stringify({ t: 'welcome', u: username }));
    Lobby.broadcastLobbyUpdate();
    const chatHistory = Chat.serializeRecent(20);
    Lobby.sendToClient(clientId, JSON.stringify({ t: 'chatHistory', msgs: chatHistory }));
    return;
  }

  // Ping
  if (type === 'ping') {
    if (user) user.lastActive = Date.now();
    Lobby.sendToClient(clientId, JSON.stringify({ t: 'pong' }));
    return;
  }

  if (!user) {
    Lobby.sendToClient(clientId, JSON.stringify({ t: 'err', m: 'Not logged in' }));
    return;
  }

  // Chat
  if (type === 'chat') {
    const m = msg.m;
    if (!m || m.length === 0) return;
    const now = Date.now();
    const last = _lastMsgTime.get(clientId) || 0;
    if (now - last < CHAT_RATE_LIMIT_MS) return;
    _lastMsgTime.set(clientId, now);

    if (!Chat.addMessage(user.username, m)) return;
    Lobby.sendToClient(null, JSON.stringify({
      t: 'chat', u: user.username, m, ts: Math.floor(now / 1000),
    }));
  }

  // Create Room
  else if (type === 'createRoom') {
    const name = msg.n;
    const gt = msg.gt || 0;
    if (!name || gt === 0 || gt > 5) {
      Lobby.sendToClient(clientId, JSON.stringify({ t: 'err', m: 'Invalid room params' }));
      return;
    }
    const roomIdx = Lobby.createRoom(name, gt, clientId);
    if (roomIdx < 0) {
      Lobby.sendToClient(clientId, JSON.stringify({ t: 'err', m: 'Cannot create room' }));
      return;
    }
    Lobby.broadcastRoomUpdate(roomIdx);
  }

  // Join Room
  else if (type === 'joinRoom') {
    const roomId = msg.id;
    if (roomId === undefined) return;
    if (!Lobby.joinRoom(clientId, roomId)) {
      Lobby.sendToClient(clientId, JSON.stringify({ t: 'err', m: 'Cannot join room' }));
    }
  }

  // Leave Room
  else if (type === 'leaveRoom') {
    Lobby.leaveRoom(clientId);
  }

  // Ready
  else if (type === 'ready') {
    Lobby.setReady(clientId, msg.r !== false);
  }

  // Game Action
  else if (type === 'action') {
    if (user.roomIdx < 0) return;
    const room = Lobby.getRoom(user.roomIdx);
    if (!room || !room.engine) return;
    const pIdx = room.findPlayerByClientId(clientId);
    if (pIdx < 0) return;

    const action = msg.a;
    if (!action) return;
    room.engine.handleAction(pIdx, action, msg);
    Lobby.broadcastRoomUpdate(user.roomIdx);
  }

  // Back to Lobby
  else if (type === 'backToLobby') {
    if (user.roomIdx < 0) return;
    Lobby.leaveRoom(clientId);
  }

  // Rematch
  else if (type === 'rematch') {
    Lobby.rematch(clientId);
  }

  // Emote
  else if (type === 'emote') {
    const e = msg.e;
    if (e !== undefined && e <= 7) Lobby.broadcastEmote(clientId, e);
  }

  // Kick
  else if (type === 'kick') {
    const target = msg.target;
    if (target !== undefined) Lobby.kickPlayer(clientId, target);
  }

  // Chat Room: Join
  else if (type === 'joinChatRoom') {
    const roomId = msg.roomId;
    const pw = msg.pw;
    if (!roomId) return;
    const result = await ChatRooms.joinRoom(roomId, pw, clientId, user.username);
    Lobby.sendToClient(clientId, JSON.stringify({
      t: 'chatRoomJoined', ...result,
    }));
  }

  // Chat Room: Leave
  else if (type === 'leaveChatRoom') {
    ChatRooms.leaveRoom(clientId, user.username);
    Lobby.sendToClient(clientId, JSON.stringify({ t: 'chatRoomLeft' }));
  }

  // Chat Room: Message
  else if (type === 'chatRoomMsg') {
    const m = msg.m;
    if (!m || m.length === 0) return;
    const now = Date.now();
    const last = _lastMsgTime.get(clientId) || 0;
    if (now - last < CHAT_RATE_LIMIT_MS) return;
    _lastMsgTime.set(clientId, now);
    ChatRooms.sendMessage(clientId, user.username, m);
  }
}

function handleDisconnect(clientId) {
  const user = Lobby.findUser(clientId);
  const uname = user ? user.username : null;
  ChatRooms.leaveRoom(clientId, uname);
  Lobby.removeUser(clientId);
  _lastMsgTime.delete(clientId);
}

module.exports = { handleMessage, handleDisconnect };
