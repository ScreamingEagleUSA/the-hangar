const {
  GameType, GamePhase, MafiaRole,
  ROLE_REVEAL_TIME_MS, NIGHT_PHASE_TIME_MS,
  DISCUSSION_TIME_MS, VOTING_TIME_MS, RESULT_DISPLAY_TIME_MS,
  MAX_PLAYERS_PER_ROOM,
} = require('../config');

class MafiaGame {
  constructor() { this.reset(); }

  reset() {
    this._players = null;
    this._count = 0;
    this._phase = GamePhase.WAITING;
    this._phaseStart = 0;
    this._finished = false;
    this._mafiaWon = false;
    this._mafiaTarget = -1;
    this._doctorTarget = -1;
    this._detectiveTarget = -1;
    this._lastKilled = -1;
    this._lastSaved = -1;
    this._lastInvestigated = -1;
    this._investigateResult = false;
  }

  start(players, count) {
    this._players = players;
    this._count = count;
    this._finished = false;
    this._mafiaWon = false;
    this._assignRoles();
    this._phase = GamePhase.ROLE_ASSIGNMENT;
    this._phaseStart = Date.now();
  }

  _assignRoles() {
    const mafiaCount = (this._count >= 7) ? 2 : 1;
    const hasDoctor = this._count >= 5;
    const hasDetective = this._count >= 6;

    const order = Array.from({ length: this._count }, (_, i) => i);
    for (let i = this._count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let assigned = 0;
    for (let i = 0; i < mafiaCount && assigned < this._count; i++) {
      this._players[order[assigned++]].role = MafiaRole.MAFIA;
    }
    if (hasDoctor && assigned < this._count) {
      this._players[order[assigned++]].role = MafiaRole.DOCTOR;
    }
    if (hasDetective && assigned < this._count) {
      this._players[order[assigned++]].role = MafiaRole.DETECTIVE;
    }
    for (; assigned < this._count; assigned++) {
      this._players[order[assigned]].role = MafiaRole.VILLAGER;
    }
  }

  tick(now) {
    const elapsed = now - this._phaseStart;
    switch (this._phase) {
      case GamePhase.ROLE_ASSIGNMENT:
        if (elapsed >= ROLE_REVEAL_TIME_MS) this._startNight();
        break;
      case GamePhase.NIGHT:
        if (elapsed >= NIGHT_PHASE_TIME_MS || this._allNightActionsIn()) this._resolveNight();
        break;
      case GamePhase.DISCUSSION:
        if (elapsed >= DISCUSSION_TIME_MS) this._startVoting();
        break;
      case GamePhase.VOTING:
        if (elapsed >= VOTING_TIME_MS) {
          this._resolveVotes();
        } else {
          const allVoted = this._players.slice(0, this._count).every(p => !p.alive || p.vote >= 0);
          if (allVoted) this._resolveVotes();
        }
        break;
      case GamePhase.RESULT:
        if (elapsed >= RESULT_DISPLAY_TIME_MS) {
          if (this._checkWinCondition()) {
            this._phase = GamePhase.GAME_OVER;
            this._phaseStart = now;
          } else {
            this._startNight();
          }
        }
        break;
    }
  }

  _startNight() {
    this._phase = GamePhase.NIGHT;
    this._phaseStart = Date.now();
    this._mafiaTarget = this._doctorTarget = this._detectiveTarget = -1;
    for (let i = 0; i < this._count; i++) {
      this._players[i].actionTarget = 0xFF;
    }
  }

  _allNightActionsIn() {
    let mafiaActed = false, doctorActed = true, detectiveActed = true;
    for (let i = 0; i < this._count; i++) {
      if (!this._players[i].alive) continue;
      if (this._players[i].role === MafiaRole.MAFIA) mafiaActed = this._mafiaTarget >= 0;
      if (this._players[i].role === MafiaRole.DOCTOR) doctorActed = this._doctorTarget >= 0;
      if (this._players[i].role === MafiaRole.DETECTIVE) detectiveActed = this._detectiveTarget >= 0;
    }
    return mafiaActed && doctorActed && detectiveActed;
  }

  _resolveNight() {
    this._lastKilled = -1;
    this._lastSaved = -1;
    if (this._mafiaTarget >= 0 && this._mafiaTarget < this._count) {
      if (this._doctorTarget === this._mafiaTarget) {
        this._lastSaved = this._mafiaTarget;
      } else {
        this._players[this._mafiaTarget].alive = false;
        this._lastKilled = this._mafiaTarget;
      }
    }
    this._phase = GamePhase.RESULT;
    this._phaseStart = Date.now();
  }

  _startDiscussion() {
    this._phase = GamePhase.DISCUSSION;
    this._phaseStart = Date.now();
    for (let i = 0; i < this._count; i++) this._players[i].vote = -1;
  }

  _startVoting() {
    this._phase = GamePhase.VOTING;
    this._phaseStart = Date.now();
    for (let i = 0; i < this._count; i++) this._players[i].vote = -1;
  }

  _resolveVotes() {
    const voteCounts = new Array(this._count).fill(0);
    let skipVotes = 0;
    for (let i = 0; i < this._count; i++) {
      if (!this._players[i].alive) continue;
      if (this._players[i].vote >= 0 && this._players[i].vote < this._count) {
        voteCounts[this._players[i].vote]++;
      } else {
        skipVotes++;
      }
    }
    let maxIdx = -1, maxVotes = 0, tie = false;
    for (let i = 0; i < this._count; i++) {
      if (voteCounts[i] > maxVotes) {
        maxVotes = voteCounts[i]; maxIdx = i; tie = false;
      } else if (voteCounts[i] === maxVotes && maxVotes > 0) {
        tie = true;
      }
    }
    this._lastKilled = -1;
    if (!tie && maxVotes > skipVotes && maxIdx >= 0) {
      this._players[maxIdx].alive = false;
      this._lastKilled = maxIdx;
    }
    this._phase = GamePhase.RESULT;
    this._phaseStart = Date.now();
  }

  _checkWinCondition() {
    const mafiaAlive = this._countAlive(MafiaRole.MAFIA);
    const totalAlive = this._countAliveTotal();
    const townAlive = totalAlive - mafiaAlive;
    if (mafiaAlive === 0) { this._mafiaWon = false; this._finished = true; return true; }
    if (mafiaAlive >= townAlive) { this._mafiaWon = true; this._finished = true; return true; }
    return false;
  }

  _countAlive(role) {
    let c = 0;
    for (let i = 0; i < this._count; i++) {
      if (this._players[i].alive && this._players[i].role === role) c++;
    }
    return c;
  }

  _countAliveTotal() {
    let c = 0;
    for (let i = 0; i < this._count; i++) {
      if (this._players[i].alive) c++;
    }
    return c;
  }

  handleAction(playerIdx, action, data) {
    if (playerIdx >= this._count || !this._players[playerIdx].alive) return;

    if (action === 'night' && this._phase === GamePhase.NIGHT) {
      const target = data.target ?? -1;
      if (target < 0 || target >= this._count || !this._players[target].alive) return;
      const role = this._players[playerIdx].role;
      if (role === MafiaRole.MAFIA) this._mafiaTarget = target;
      else if (role === MafiaRole.DOCTOR) this._doctorTarget = target;
      else if (role === MafiaRole.DETECTIVE) {
        this._detectiveTarget = target;
        this._lastInvestigated = target;
        this._investigateResult = this._players[target].role === MafiaRole.MAFIA;
      }
    } else if (action === 'vote' && this._phase === GamePhase.VOTING) {
      this._players[playerIdx].vote = data.target ?? -1;
    }
  }

  serializeState(forPlayerIdx = -1) {
    const obj = {
      gt: GameType.MAFIA,
      ph: this._phase,
      elapsed: Date.now() - this._phaseStart,
    };

    switch (this._phase) {
      case GamePhase.NIGHT: obj.tl = NIGHT_PHASE_TIME_MS; break;
      case GamePhase.DISCUSSION: obj.tl = DISCUSSION_TIME_MS; break;
      case GamePhase.VOTING: obj.tl = VOTING_TIME_MS; break;
      case GamePhase.ROLE_ASSIGNMENT: obj.tl = ROLE_REVEAL_TIME_MS; break;
      case GamePhase.RESULT: obj.tl = RESULT_DISPLAY_TIME_MS; break;
    }

    obj.pl = [];
    for (let i = 0; i < this._count; i++) {
      const p = { u: this._players[i].username, a: this._players[i].alive };
      if (forPlayerIdx === i || this._phase === GamePhase.GAME_OVER) {
        p.rl = this._players[i].role;
      }
      if ([GamePhase.VOTING, GamePhase.RESULT, GamePhase.GAME_OVER].includes(this._phase)) {
        p.v = this._players[i].vote;
      }
      obj.pl.push(p);
    }

    if (this._phase === GamePhase.RESULT || this._phase === GamePhase.GAME_OVER) {
      if (this._lastKilled >= 0) {
        obj.killed = this._lastKilled;
        obj.killedRole = this._players[this._lastKilled].role;
      }
      if (this._lastSaved >= 0) obj.saved = 1;
    }

    if (forPlayerIdx >= 0 && this._players[forPlayerIdx].role === MafiaRole.DETECTIVE && this._lastInvestigated >= 0) {
      obj.inv = this._lastInvestigated;
      obj.invR = this._investigateResult ? 1 : 0;
    }

    if (this._phase === GamePhase.GAME_OVER) {
      obj.win = this._mafiaWon ? 'mafia' : 'town';
    }
    return obj;
  }

  getType() { return GameType.MAFIA; }
  getPhase() { return this._phase; }
  isFinished() { return this._finished; }

  getPhaseName() {
    const names = {
      [GamePhase.ROLE_ASSIGNMENT]: 'Role Reveal', [GamePhase.NIGHT]: 'Night',
      [GamePhase.DISCUSSION]: 'Discussion', [GamePhase.VOTING]: 'Voting',
      [GamePhase.RESULT]: 'Result', [GamePhase.GAME_OVER]: 'Game Over',
    };
    return names[this._phase] || 'Waiting';
  }

  getWinners() {
    return Array.from({ length: this._count }, (_, i) =>
      this._mafiaWon ? this._players[i].role === MafiaRole.MAFIA : this._players[i].role !== MafiaRole.MAFIA
    );
  }
}

module.exports = MafiaGame;
