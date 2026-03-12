const { MAX_PLAYERS_PER_ROOM, GamePhase, GameType } = require('./config');

class Player {
  constructor(username = '', clientId = null) {
    this.username = username;
    this.clientId = clientId;
    this.ready = false;
    this.alive = true;
    this.role = 0;
    this.vote = -1;
    this.actionTarget = 0xFF;
    this.connected = true;
  }
}

class GameRoom {
  constructor(id) {
    this.init(id);
  }

  init(id) {
    this.roomId = id;
    this.name = '';
    this.password = '';
    this.gameType = GameType.NONE;
    this.phase = GamePhase.WAITING;
    this.players = [];
    this.maxPlayers = MAX_PLAYERS_PER_ROOM;
    this.hostPlayerIdx = 0;
    this.engine = null;
    this.phaseStartTime = 0;
    this.phaseTimeLimit = 0;
    this.active = false;
  }

  get playerCount() { return this.players.length; }

  addPlayer(username, clientId) {
    if (this.players.length >= this.maxPlayers) return -1;
    if (this.phase !== GamePhase.WAITING) return -1;
    if (this.players.some(p => p.username === username)) return -1;

    const p = new Player(username, clientId);
    this.players.push(p);
    return this.players.length - 1;
  }

  removePlayer(clientId) {
    const idx = this.findPlayerByClientId(clientId);
    if (idx < 0) return;

    if (this.phase === GamePhase.WAITING) {
      this.players.splice(idx, 1);
    } else {
      this.players[idx].connected = false;
      this.players[idx].alive = false;
    }
  }

  findPlayerByClientId(clientId) {
    return this.players.findIndex(p => p.clientId === clientId);
  }

  findPlayerByName(username) {
    return this.players.findIndex(p => p.username === username);
  }

  allReady() {
    if (this.players.length < 2) return false;
    return this.players.every(p => p.ready);
  }

  resetPlayers() {
    for (const p of this.players) {
      p.ready = false;
      p.alive = true;
      p.role = 0;
      p.vote = -1;
      p.actionTarget = 0xFF;
    }
  }

  serializeInfo() {
    const obj = {
      id: this.roomId,
      n: this.name,
      gt: this.gameType,
      ph: this.phase,
      pc: this.players.length,
      mx: this.maxPlayers,
      host: this.hostPlayerIdx,
      pl: this.players.map(p => ({ u: p.username, r: p.ready, a: p.alive })),
    };
    if (this.password) obj.lk = true;
    return obj;
  }
}

module.exports = { Player, GameRoom };
