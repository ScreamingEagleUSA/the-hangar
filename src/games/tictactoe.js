const { GamePhase, TICTACTOE_TURN_TIME_MS, RESULT_DISPLAY_TIME_MS } = require('../config');

const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

class TicTacToeGame {
  constructor() { this.reset(); }

  reset() {
    this._board = Array(9).fill(-1);
    this._turn = 0;
    this._phase = GamePhase.WAITING;
    this._players = [];
    this._playerCount = 0;
    this._winner = -1;
    this._winLine = null;
    this._phaseStart = 0;
    this._scores = [0, 0];
    this._round = 0;
    this._finished = false;
  }

  start(players, count) {
    this._players = players;
    this._playerCount = count;
    this._startRound();
  }

  _startRound() {
    this._board = Array(9).fill(-1);
    this._turn = this._round % 2;
    this._winner = -1;
    this._winLine = null;
    this._phase = GamePhase.ACTION;
    this._phaseStart = Date.now();
    this._finished = false;
  }

  tick(now) {
    if (this._phase === GamePhase.ACTION) {
      if (now - this._phaseStart > TICTACTOE_TURN_TIME_MS) {
        this._turn = 1 - this._turn;
        this._phaseStart = now;
      }
    } else if (this._phase === GamePhase.RESULT) {
      if (now - this._phaseStart > RESULT_DISPLAY_TIME_MS) {
        if (this._scores[0] >= 3 || this._scores[1] >= 3) {
          this._phase = GamePhase.GAME_OVER;
          this._finished = true;
        } else {
          this._round++;
          this._startRound();
        }
      }
    }
  }

  getPhase() { return this._phase; }
  isFinished() { return this._finished; }

  getWinners() {
    const w = [];
    for (let i = 0; i < this._playerCount; i++) {
      w.push(this._scores[i] > this._scores[1 - i]);
    }
    return w;
  }

  handleAction(playerIdx, action, msg) {
    if (action === 'move' && this._phase === GamePhase.ACTION) {
      if (playerIdx !== this._turn) return;
      const cell = msg.cell;
      if (cell === undefined || cell < 0 || cell > 8) return;
      if (this._board[cell] !== -1) return;

      this._board[cell] = playerIdx;

      const result = this._checkWin();
      if (result >= 0) {
        this._winner = result;
        this._winLine = this._getWinLine();
        this._scores[result]++;
        this._phase = GamePhase.RESULT;
        this._phaseStart = Date.now();
      } else if (this._board.every(c => c !== -1)) {
        this._winner = -2; // draw
        this._phase = GamePhase.RESULT;
        this._phaseStart = Date.now();
      } else {
        this._turn = 1 - this._turn;
        this._phaseStart = Date.now();
      }
    }
  }

  _checkWin() {
    for (const [a, b, c] of LINES) {
      if (this._board[a] !== -1 && this._board[a] === this._board[b] && this._board[b] === this._board[c]) {
        return this._board[a];
      }
    }
    return -1;
  }

  _getWinLine() {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (this._board[a] !== -1 && this._board[a] === this._board[b] && this._board[b] === this._board[c]) {
        return line;
      }
    }
    return null;
  }

  serializeState(forPlayerIdx) {
    const elapsed = Date.now() - this._phaseStart;
    const tl = this._phase === GamePhase.ACTION ? TICTACTOE_TURN_TIME_MS :
               this._phase === GamePhase.RESULT ? RESULT_DISPLAY_TIME_MS : 0;
    return {
      gt: 5,
      ph: this._phase,
      board: this._board,
      turn: this._turn,
      winner: this._winner,
      winLine: this._winLine,
      scores: this._scores,
      round: this._round,
      elapsed,
      tl,
      pl: this._players.slice(0, this._playerCount).map(p => ({
        u: p.username, a: p.alive, r: p.ready,
      })),
    };
  }
}

module.exports = TicTacToeGame;
