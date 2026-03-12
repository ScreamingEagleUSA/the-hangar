const {
  GameType, GamePhase,
  ROLE_REVEAL_TIME_MS, SPYFALL_ROUND_TIME_MS,
  VOTING_TIME_MS, RESULT_DISPLAY_TIME_MS,
} = require('../config');

const LOCATIONS = [
  'School', 'Hospital', 'Space Station', 'Pirate Ship',
  'Movie Studio', 'Casino', 'Submarine', 'Bank',
  'Beach Resort', 'Circus', 'Police Station', 'Airport',
  'Supermarket', 'Museum', 'Restaurant', 'Library',
  'Cruise Ship', 'Amusement Park', 'Theater', 'Office',
];

class SpyfallGame {
  constructor() { this.reset(); }

  reset() {
    this._players = null;
    this._count = 0;
    this._phase = GamePhase.WAITING;
    this._phaseStart = 0;
    this._finished = false;
    this._spyWon = false;
    this._spyIdx = 0;
    this._locationIdx = 0;
    this._currentQuestioner = 0;
    this._spyGuessLocation = -1;
    this._accusedSpy = -1;
    this._spyGuessedCorrectly = false;
  }

  start(players, count) {
    this._players = players;
    this._count = count;
    this._finished = false;
    this._spyWon = false;
    this._spyGuessLocation = -1;
    this._accusedSpy = -1;
    this._assignSpy();
    this._phase = GamePhase.ROLE_ASSIGNMENT;
    this._phaseStart = Date.now();
  }

  _assignSpy() {
    this._spyIdx = Math.floor(Math.random() * this._count);
    this._locationIdx = Math.floor(Math.random() * LOCATIONS.length);
    this._currentQuestioner = Math.floor(Math.random() * this._count);
    for (let i = 0; i < this._count; i++) {
      this._players[i].role = (i === this._spyIdx) ? 1 : 0;
    }
  }

  tick(now) {
    const elapsed = now - this._phaseStart;
    switch (this._phase) {
      case GamePhase.ROLE_ASSIGNMENT:
        if (elapsed >= ROLE_REVEAL_TIME_MS) this._startDiscussion();
        break;
      case GamePhase.DISCUSSION:
        if (elapsed >= SPYFALL_ROUND_TIME_MS) {
          this._spyWon = true;
          this._finished = true;
          this._phase = GamePhase.GAME_OVER;
          this._phaseStart = now;
        }
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
          this._phase = GamePhase.GAME_OVER;
          this._phaseStart = now;
        }
        break;
    }
  }

  _startDiscussion() {
    this._phase = GamePhase.DISCUSSION;
    this._phaseStart = Date.now();
  }

  _startVoting() {
    this._phase = GamePhase.VOTING;
    this._phaseStart = Date.now();
    for (let i = 0; i < this._count; i++) this._players[i].vote = -1;
  }

  _resolveVotes() {
    let yesVotes = 0, totalVoters = 0;
    for (let i = 0; i < this._count; i++) {
      if (!this._players[i].alive) continue;
      totalVoters++;
      if (this._players[i].vote === 1) yesVotes++;
    }
    if (yesVotes > totalVoters / 2 && this._accusedSpy >= 0) {
      this._spyWon = this._accusedSpy !== this._spyIdx;
      this._finished = true;
    }
    this._phase = this._finished ? GamePhase.RESULT : GamePhase.DISCUSSION;
    this._phaseStart = Date.now();
  }

  handleAction(playerIdx, action, data) {
    if (playerIdx >= this._count || !this._players[playerIdx].alive) return;

    if (action === 'accuse' && this._phase === GamePhase.DISCUSSION) {
      const target = data.target ?? -1;
      if (target < 0 || target >= this._count || target === playerIdx) return;
      this._accusedSpy = target;
      this._startVoting();
    } else if (action === 'vote' && this._phase === GamePhase.VOTING) {
      this._players[playerIdx].vote = data.v ?? 0;
    } else if (action === 'guess' && this._phase === GamePhase.DISCUSSION && playerIdx === this._spyIdx) {
      const loc = data.loc ?? -1;
      this._spyGuessLocation = loc;
      this._spyGuessedCorrectly = (loc === this._locationIdx);
      this._spyWon = this._spyGuessedCorrectly;
      this._finished = true;
      this._phase = GamePhase.RESULT;
      this._phaseStart = Date.now();
    } else if (action === 'next' && this._phase === GamePhase.DISCUSSION) {
      do {
        this._currentQuestioner = (this._currentQuestioner + 1) % this._count;
      } while (!this._players[this._currentQuestioner].alive);
    }
  }

  serializeState(forPlayerIdx = -1) {
    const obj = {
      gt: GameType.SPYFALL,
      ph: this._phase,
      elapsed: Date.now() - this._phaseStart,
    };

    switch (this._phase) {
      case GamePhase.ROLE_ASSIGNMENT: obj.tl = ROLE_REVEAL_TIME_MS; break;
      case GamePhase.DISCUSSION:
        obj.tl = SPYFALL_ROUND_TIME_MS;
        obj.qr = this._currentQuestioner;
        break;
      case GamePhase.VOTING:
        obj.tl = VOTING_TIME_MS;
        if (this._accusedSpy >= 0) obj.acc = this._accusedSpy;
        break;
      case GamePhase.RESULT: obj.tl = RESULT_DISPLAY_TIME_MS; break;
    }

    if (forPlayerIdx >= 0) {
      if (forPlayerIdx !== this._spyIdx) {
        obj.loc = LOCATIONS[this._locationIdx];
      } else {
        obj.spy = 1;
      }
    }

    if (forPlayerIdx === this._spyIdx && this._phase === GamePhase.DISCUSSION) {
      obj.locs = [...LOCATIONS];
    }

    if (this._phase === GamePhase.GAME_OVER || this._phase === GamePhase.RESULT) {
      obj.loc = LOCATIONS[this._locationIdx];
      obj.spyIdx = this._spyIdx;
      if (this._spyGuessLocation >= 0) {
        obj.spyGuess = LOCATIONS[this._spyGuessLocation];
        obj.guessOk = this._spyGuessedCorrectly ? 1 : 0;
      }
    }

    obj.pl = [];
    for (let i = 0; i < this._count; i++) {
      const p = { u: this._players[i].username, a: this._players[i].alive };
      if ((this._phase === GamePhase.GAME_OVER || this._phase === GamePhase.RESULT) && i === this._spyIdx) {
        p.spy = 1;
      }
      obj.pl.push(p);
    }

    if (this._phase === GamePhase.GAME_OVER || this._finished) {
      obj.win = this._spyWon ? 'spy' : 'town';
    }
    return obj;
  }

  getType() { return GameType.SPYFALL; }
  getPhase() { return this._phase; }
  isFinished() { return this._finished; }

  getPhaseName() {
    const names = {
      [GamePhase.ROLE_ASSIGNMENT]: 'Role Reveal', [GamePhase.DISCUSSION]: 'Questioning',
      [GamePhase.VOTING]: 'Accusation Vote', [GamePhase.RESULT]: 'Result',
      [GamePhase.GAME_OVER]: 'Game Over',
    };
    return names[this._phase] || 'Waiting';
  }

  getWinners() {
    return Array.from({ length: this._count }, (_, i) =>
      this._spyWon ? (i === this._spyIdx) : (i !== this._spyIdx)
    );
  }
}

module.exports = SpyfallGame;
