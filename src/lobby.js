const {
  MAX_ROOMS, MAX_PLAYERS, MAX_PLAYERS_PER_ROOM,
  GameType, GamePhase, IDLE_TIMEOUT_MS,
  MIN_PLAYERS_MAFIA, MIN_PLAYERS_SPYFALL, MIN_PLAYERS_SECRETH,
  MIN_PLAYERS_LIARS_DICE, MAX_PLAYERS_LIARS_DICE,
  MIN_PLAYERS_TICTACTOE, MAX_PLAYERS_TICTACTOE,
  MIN_PLAYERS_TRIVIA, MAX_PLAYERS_TRIVIA,
  CHAT_USERNAME_MAX_LEN,
} = require('./config');
const { GameRoom } = require('./game-engine');
const Chat = require('./chat');
const Leaderboard = require('./leaderboard');
const MafiaGame = require('./games/mafia');
const SpyfallGame = require('./games/spyfall');
const SecretHitlerGame = require('./games/secret-hitler');
const LiarsDiceGame = require('./games/liars-dice');
const TicTacToeGame = require('./games/tictactoe');
const TriviaGame = require('./games/trivia');

const _rooms = [];
const _users = [];

let _broadcastFn = null;
let _sendFn = null;
let _disconnectFn = null;

const Lobby = {
  init(broadcastAll, sendToClient, disconnectClient) {
    _broadcastFn = broadcastAll;
    _sendFn = sendToClient;
    _disconnectFn = disconnectClient;
    _rooms.length = 0;
    _users.length = 0;
    for (let i = 0; i < MAX_ROOMS; i++) {
      _rooms.push(new GameRoom(i));
    }
  },

  tick() {
    const now = Date.now();

    for (let i = 0; i < MAX_ROOMS; i++) {
      const room = _rooms[i];
      if (!room.active || !room.engine) continue;
      if (room.phase === GamePhase.WAITING || room.phase === GamePhase.GAME_OVER) continue;

      const prevPhase = room.phase;
      room.engine.tick(now);
      const newPhase = room.engine.getPhase();

      if (newPhase !== prevPhase) {
        room.phase = newPhase;
        this.broadcastRoomUpdate(i);

        if (room.engine.isFinished()) {
          const winners = room.engine.getWinners();
          for (let p = 0; p < room.playerCount; p++) {
            if (winners[p]) Leaderboard.recordWin(room.players[p].username);
            else Leaderboard.recordLoss(room.players[p].username);
          }
          Leaderboard.save();
        }
      }
    }

    // Idle timeout
    for (let i = _users.length - 1; i >= 0; i--) {
      if (_users[i].connected && (now - _users[i].lastActive) > IDLE_TIMEOUT_MS) {
        const cid = _users[i].clientId;
        console.log(`[IDLE] Timing out user ${_users[i].username}`);
        if (_disconnectFn) _disconnectFn(cid);
        this.removeUser(cid);
      }
    }
  },

  addUser(username, clientId, color) {
    if (_users.length >= MAX_PLAYERS) return -1;
    if (!username || username.length === 0) return -1;
    if (username.length > CHAT_USERNAME_MAX_LEN) return -1;

    if (_users.some(u => u.connected && u.username === username)) return -1;

    const user = {
      username,
      color: (color && color.length < 8) ? color : '',
      clientId,
      roomIdx: -1,
      lastActive: Date.now(),
      connected: true,
    };
    _users.push(user);

    Chat.addSystemMessage(`${username} joined the lobby`);
    return _users.length - 1;
  },

  removeUser(clientId) {
    const idx = _users.findIndex(u => u.clientId === clientId && u.connected);
    if (idx < 0) return;

    if (_users[idx].roomIdx >= 0) this.leaveRoom(clientId);

    Chat.addSystemMessage(`${_users[idx].username} left`);
    _users.splice(idx, 1);
    this.broadcastLobbyUpdate();
  },

  findUser(clientId) {
    const u = _users.find(u => u.clientId === clientId && u.connected);
    if (u) u.lastActive = Date.now();
    return u || null;
  },

  findUserByName(username) {
    return _users.find(u => u.connected && u.username === username) || null;
  },

  getConnectedCount() {
    return _users.filter(u => u.connected).length;
  },

  createRoom(name, type, clientId) {
    const user = this.findUser(clientId);
    if (!user || user.roomIdx >= 0) return -1;

    for (let i = 0; i < MAX_ROOMS; i++) {
      if (_rooms[i].active) continue;

      _rooms[i].init(i);
      _rooms[i].name = name.substring(0, 19);
      _rooms[i].gameType = type;
      _rooms[i].active = true;
      _rooms[i].phase = GamePhase.WAITING;
      if (type === GameType.LIARS_DICE || type === GameType.TICTACTOE) {
        _rooms[i].maxPlayers = 2;
      } else if (type === GameType.TRIVIA) {
        _rooms[i].maxPlayers = MAX_PLAYERS_TRIVIA;
      } else {
        _rooms[i].maxPlayers = MAX_PLAYERS_PER_ROOM;
      }

      switch (type) {
        case GameType.MAFIA: _rooms[i].engine = new MafiaGame(); break;
        case GameType.SPYFALL: _rooms[i].engine = new SpyfallGame(); break;
        case GameType.SECRET_HITLER: _rooms[i].engine = new SecretHitlerGame(); break;
        case GameType.LIARS_DICE: _rooms[i].engine = new LiarsDiceGame(); break;
        case GameType.TICTACTOE: _rooms[i].engine = new TicTacToeGame(); break;
        case GameType.TRIVIA: _rooms[i].engine = new TriviaGame(); break;
        default: return -1;
      }

      _rooms[i].addPlayer(user.username, clientId);
      user.roomIdx = i;

      this.broadcastLobbyUpdate();
      return i;
    }
    return -1;
  },

  joinRoom(clientId, roomIdx) {
    if (roomIdx >= MAX_ROOMS || !_rooms[roomIdx].active) return false;
    if (_rooms[roomIdx].phase !== GamePhase.WAITING) return false;

    const user = this.findUser(clientId);
    if (!user || user.roomIdx >= 0) return false;

    const pIdx = _rooms[roomIdx].addPlayer(user.username, clientId);
    if (pIdx < 0) return false;

    user.roomIdx = roomIdx;
    Chat.addSystemMessage(`${user.username} joined Room ${roomIdx}`);
    this.broadcastLobbyUpdate();
    this.broadcastRoomUpdate(roomIdx);
    return true;
  },

  leaveRoom(clientId) {
    const user = this.findUser(clientId);
    if (!user || user.roomIdx < 0) return;

    const roomIdx = user.roomIdx;
    const removedIdx = _rooms[roomIdx].findPlayerByClientId(clientId);
    _rooms[roomIdx].removePlayer(clientId);
    user.roomIdx = -1;

    const room = _rooms[roomIdx];

    if (removedIdx >= 0 && room.hostPlayerIdx === removedIdx && room.playerCount > 0) {
      room.hostPlayerIdx = 0;
      for (let i = 0; i < room.playerCount; i++) {
        if (room.players[i].connected) { room.hostPlayerIdx = i; break; }
      }
    }

    if (room.phase === GamePhase.WAITING && room.playerCount === 0) {
      room.active = false;
      if (room.engine) room.engine.reset();
    } else if (room.phase !== GamePhase.WAITING) {
      const anyConnected = room.players.some(p => p.connected);
      if (!anyConnected) {
        room.active = false;
        room.phase = GamePhase.WAITING;
        room.players.length = 0;
        if (room.engine) room.engine.reset();
      } else if (room.gameType === GameType.LIARS_DICE || room.gameType === GameType.TICTACTOE) {
        for (const p of room.players) {
          if (p.connected) Leaderboard.recordWin(p.username);
          else Leaderboard.recordLoss(p.username);
        }
        Leaderboard.save();
        room.active = false;
        room.phase = GamePhase.WAITING;
        room.players.length = 0;
        if (room.engine) room.engine.reset();
      }
    }

    this.broadcastLobbyUpdate();
    this.broadcastRoomUpdate(roomIdx);
  },

  setReady(clientId, ready) {
    const user = this.findUser(clientId);
    if (!user || user.roomIdx < 0) return false;

    const room = _rooms[user.roomIdx];
    const pIdx = room.findPlayerByClientId(clientId);
    if (pIdx < 0) return false;

    room.players[pIdx].ready = ready;
    this.broadcastRoomUpdate(user.roomIdx);

    if (room.allReady()) this.startGame(user.roomIdx);
    return true;
  },

  startGame(roomIdx) {
    if (roomIdx >= MAX_ROOMS || !_rooms[roomIdx].active) return false;
    const room = _rooms[roomIdx];
    if (!room.engine) return false;

    const minMap = {
      [GameType.MAFIA]: MIN_PLAYERS_MAFIA,
      [GameType.SPYFALL]: MIN_PLAYERS_SPYFALL,
      [GameType.SECRET_HITLER]: MIN_PLAYERS_SECRETH,
      [GameType.LIARS_DICE]: MIN_PLAYERS_LIARS_DICE,
      [GameType.TICTACTOE]: MIN_PLAYERS_TICTACTOE,
      [GameType.TRIVIA]: MIN_PLAYERS_TRIVIA,
    };
    const minPlayers = minMap[room.gameType] || 2;
    if (room.playerCount < minPlayers) return false;

    room.engine.start(room.players, room.playerCount);
    room.phase = GamePhase.ROLE_ASSIGNMENT;
    room.phaseStartTime = Date.now();

    Chat.addSystemMessage(`Game started in Room ${roomIdx}!`);
    this.broadcastRoomUpdate(roomIdx);
    this.broadcastLobbyUpdate();
    return true;
  },

  getRoom(idx) {
    return (idx < MAX_ROOMS) ? _rooms[idx] : null;
  },

  serializeRooms() {
    return _rooms.filter(r => r.active).map(r => r.serializeInfo());
  },

  serializeRoomState(roomIdx, forPlayerIdx = -1) {
    if (roomIdx >= MAX_ROOMS || !_rooms[roomIdx].active) return {};
    const room = _rooms[roomIdx];

    const obj = {
      id: room.roomId,
      n: room.name,
      gt: room.gameType,
      ph: room.phase,
    };

    if (room.engine && room.phase !== GamePhase.WAITING) {
      obj.gs = room.engine.serializeState(forPlayerIdx);
    } else {
      obj.pl = room.players.map(p => ({ u: p.username, r: p.ready }));
    }
    return obj;
  },

  rematch(clientId) {
    const user = this.findUser(clientId);
    if (!user || user.roomIdx < 0) return;
    const room = _rooms[user.roomIdx];
    if (room.phase !== GamePhase.GAME_OVER || !room.engine) return;
    room.engine.reset();
    room.phase = GamePhase.WAITING;
    room.resetPlayers();
    this.broadcastRoomUpdate(user.roomIdx);
    this.broadcastLobbyUpdate();
  },

  kickPlayer(hostClientId, targetIdx) {
    const host = this.findUser(hostClientId);
    if (!host || host.roomIdx < 0) return;
    const room = _rooms[host.roomIdx];
    if (room.findPlayerByClientId(hostClientId) !== room.hostPlayerIdx) return;
    if (targetIdx >= room.playerCount) return;

    const targetCid = room.players[targetIdx].clientId;
    if (_sendFn) _sendFn(targetCid, JSON.stringify({ t: 'kicked', m: 'Kicked by host' }));
    this.leaveRoom(targetCid);
  },

  broadcastEmote(clientId, emoteIdx) {
    const user = this.findUser(clientId);
    if (!user || user.roomIdx < 0 || emoteIdx > 7) return;
    const room = _rooms[user.roomIdx];
    const msg = JSON.stringify({ t: 'emote', u: user.username, e: emoteIdx });
    for (const p of room.players) {
      if (p.connected && _sendFn) _sendFn(p.clientId, msg);
    }
  },

  broadcastLobbyUpdate() {
    const msg = JSON.stringify({
      t: 'lobby',
      pc: this.getConnectedCount(),
      rooms: this.serializeRooms(),
    });
    if (_broadcastFn) _broadcastFn(msg);
  },

  broadcastRoomUpdate(roomIdx) {
    if (roomIdx >= MAX_ROOMS || !_rooms[roomIdx].active) return;
    const room = _rooms[roomIdx];
    for (let i = 0; i < room.playerCount; i++) {
      const state = this.serializeRoomState(roomIdx, i);
      const msg = JSON.stringify({ t: 'room', state });
      if (_sendFn) _sendFn(room.players[i].clientId, msg);
    }
  },

  sendToClient(clientId, msg) {
    if (_sendFn) _sendFn(clientId, msg);
  },
};

module.exports = Lobby;
