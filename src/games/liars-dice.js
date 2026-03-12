const {
  GameType, GamePhase,
  ROLL_REVEAL_TIME_MS, CHALLENGE_REVEAL_TIME_MS,
  LIARS_DICE_STARTING_DICE,
} = require('../config');

class LiarsDiceGame {
  constructor() { this.reset(); }

  reset() {
    this._players = null;
    this._count = 0;
    this._phase = GamePhase.WAITING;
    this._phaseStart = 0;
    this._finished = false;
    this._dice = [[], []];
    this._diceCount = [LIARS_DICE_STARTING_DICE, LIARS_DICE_STARTING_DICE];
    this._bidQty = 0;
    this._bidFace = 0;
    this._bidder = 0;
    this._currentTurn = 0;
    this._roundLoser = -1;
    this._winnerIdx = 0;
  }

  start(players, count) {
    this._players = players;
    this._count = count;
    this._finished = false;
    this._diceCount = [LIARS_DICE_STARTING_DICE, LIARS_DICE_STARTING_DICE];
    this._currentTurn = 0;
    this._roundLoser = -1;
    this._rollDice();
    this._phase = GamePhase.ROLE_ASSIGNMENT;
    this._phaseStart = Date.now();
  }

  _rollDice() {
    for (let p = 0; p < 2; p++) {
      this._dice[p] = [];
      for (let d = 0; d < this._diceCount[p]; d++) {
        this._dice[p].push(Math.floor(Math.random() * 6) + 1);
      }
    }
  }

  _startBidding() {
    this._phase = GamePhase.DISCUSSION;
    this._phaseStart = Date.now();
    this._bidQty = 0;
    this._bidFace = 0;
  }

  tick(now) {
    const elapsed = now - this._phaseStart;
    switch (this._phase) {
      case GamePhase.ROLE_ASSIGNMENT:
        if (elapsed >= ROLL_REVEAL_TIME_MS) this._startBidding();
        break;
      case GamePhase.RESULT:
        if (elapsed >= CHALLENGE_REVEAL_TIME_MS) {
          if (this._diceCount[0] === 0 || this._diceCount[1] === 0) {
            this._winnerIdx = this._diceCount[0] > 0 ? 0 : 1;
            this._finished = true;
            this._phase = GamePhase.GAME_OVER;
            this._phaseStart = now;
          } else {
            this._rollDice();
            this._currentTurn = this._roundLoser;
            this._phase = GamePhase.ROLE_ASSIGNMENT;
            this._phaseStart = now;
          }
        }
        break;
    }
  }

  handleAction(playerIdx, action, data) {
    if (playerIdx >= 2) return;

    if (action === 'bid' && this._phase === GamePhase.DISCUSSION && playerIdx === this._currentTurn) {
      const qty = data.qty || 0;
      const face = data.face || 0;
      if (face < 1 || face > 6 || qty < 1) return;
      const totalDice = this._diceCount[0] + this._diceCount[1];
      if (qty > totalDice) return;

      if (this._bidQty > 0) {
        let valid = false;
        if (qty > this._bidQty) valid = true;
        else if (qty === this._bidQty && face > this._bidFace) valid = true;
        if (!valid) return;
      }

      this._bidQty = qty;
      this._bidFace = face;
      this._bidder = playerIdx;
      this._currentTurn = 1 - playerIdx;
    } else if (action === 'liar' && this._phase === GamePhase.DISCUSSION && playerIdx === this._currentTurn) {
      if (this._bidQty === 0) return;
      this._resolveChallenge(playerIdx);
    }
  }

  _countMatchingDice() {
    let count = 0;
    const wildOnes = this._bidFace !== 1;
    for (let p = 0; p < 2; p++) {
      for (let d = 0; d < this._diceCount[p]; d++) {
        if (this._dice[p][d] === this._bidFace) count++;
        else if (wildOnes && this._dice[p][d] === 1) count++;
      }
    }
    return count;
  }

  _resolveChallenge(callerIdx) {
    const actual = this._countMatchingDice();
    this._roundLoser = actual >= this._bidQty ? callerIdx : this._bidder;
    this._diceCount[this._roundLoser]--;
    this._phase = GamePhase.RESULT;
    this._phaseStart = Date.now();
  }

  serializeState(forPlayerIdx = -1) {
    const obj = {
      gt: GameType.LIARS_DICE,
      ph: this._phase,
      elapsed: Date.now() - this._phaseStart,
      dc0: this._diceCount[0],
      dc1: this._diceCount[1],
      turn: this._currentTurn,
    };

    if (this._bidQty > 0) {
      obj.bq = this._bidQty;
      obj.bf = this._bidFace;
      obj.bb = this._bidder;
    }

    switch (this._phase) {
      case GamePhase.ROLE_ASSIGNMENT: obj.tl = ROLL_REVEAL_TIME_MS; break;
      case GamePhase.RESULT: obj.tl = CHALLENGE_REVEAL_TIME_MS; break;
    }

    const revealAll = this._phase === GamePhase.RESULT || this._phase === GamePhase.GAME_OVER || forPlayerIdx === -1;
    for (let p = 0; p < 2; p++) {
      const key = `d${p}`;
      const canSee = revealAll || forPlayerIdx === p;
      obj[key] = [];
      for (let d = 0; d < this._diceCount[p]; d++) {
        obj[key].push(canSee ? this._dice[p][d] : 0);
      }
    }

    if (this._phase === GamePhase.RESULT && this._roundLoser >= 0) {
      obj.loser = this._roundLoser;
      obj.actual = this._countMatchingDice();
    }

    obj.pl = [];
    for (let i = 0; i < this._count; i++) {
      obj.pl.push({ u: this._players[i].username, a: this._players[i].alive });
    }

    if (this._phase === GamePhase.GAME_OVER) {
      obj.win = this._winnerIdx;
    }
    return obj;
  }

  getType() { return GameType.LIARS_DICE; }
  getPhase() { return this._phase; }
  isFinished() { return this._finished; }

  getPhaseName() {
    const names = {
      [GamePhase.ROLE_ASSIGNMENT]: 'Rolling', [GamePhase.DISCUSSION]: 'Bidding',
      [GamePhase.RESULT]: 'Challenge', [GamePhase.GAME_OVER]: 'Game Over',
    };
    return names[this._phase] || 'Waiting';
  }

  getWinners() {
    return Array.from({ length: this._count }, (_, i) => i === this._winnerIdx);
  }
}

module.exports = LiarsDiceGame;
