const {
  GameType, GamePhase, SHRole, SHPower, SHSubPhase,
  ROLE_REVEAL_TIME_MS, VOTING_TIME_MS, RESULT_DISPLAY_TIME_MS,
  SH_POLICY_DECK_SIZE, SH_LIBERAL_POLICIES, SH_FASCIST_POLICIES,
  MAX_PLAYERS_PER_ROOM,
} = require('../config');

class SecretHitlerGame {
  constructor() { this.reset(); }

  reset() {
    this._players = null;
    this._count = 0;
    this._phase = GamePhase.WAITING;
    this._subPhase = SHSubPhase.NOMINATION;
    this._phaseStart = 0;
    this._finished = false;
    this._fascistsWon = false;
    this._winReason = '';
    this._liberalPolicies = 0;
    this._fascistPolicies = 0;
    this._electionTracker = 0;
    this._presidentIdx = 0;
    this._chancellorNominee = -1;
    this._lastPresident = -1;
    this._lastChancellor = -1;
    this._policyDeck = [];
    this._deckPos = 0;
    this._drawnPolicies = [];
    this._drawnCount = 0;
    this._chancellorChoices = [0, 0];
    this._vetoProposed = false;
    this._pendingPower = SHPower.NONE;
    this._investigatedPlayer = -1;
    this._investigateResult = false;
    this._assassinatedPlayer = -1;
  }

  start(players, count) {
    this._players = players;
    this._count = count;
    this._finished = false;
    this._fascistsWon = false;
    this._liberalPolicies = 0;
    this._fascistPolicies = 0;
    this._electionTracker = 0;
    this._pendingPower = SHPower.NONE;
    this._chancellorNominee = -1;
    this._lastPresident = -1;
    this._lastChancellor = -1;
    this._vetoProposed = false;
    this._assignRoles();
    this._shuffleDeck();
    this._presidentIdx = Math.floor(Math.random() * this._count);
    this._phase = GamePhase.ROLE_ASSIGNMENT;
    this._phaseStart = Date.now();
  }

  _assignRoles() {
    const fascistCount = (this._count >= 7) ? 2 : 1;
    const order = Array.from({ length: this._count }, (_, i) => i);
    for (let i = this._count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this._players[order[0]].role = SHRole.HITLER;
    for (let i = 1; i <= fascistCount; i++) {
      this._players[order[i]].role = SHRole.FASCIST;
    }
    for (let i = fascistCount + 1; i < this._count; i++) {
      this._players[order[i]].role = SHRole.LIBERAL;
    }
  }

  _shuffleDeck() {
    this._deckPos = 0;
    this._policyDeck = [];
    for (let i = 0; i < SH_LIBERAL_POLICIES; i++) this._policyDeck.push(0);
    for (let i = 0; i < SH_FASCIST_POLICIES; i++) this._policyDeck.push(1);
    for (let i = this._policyDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._policyDeck[i], this._policyDeck[j]] = [this._policyDeck[j], this._policyDeck[i]];
    }
  }

  _drawPolicies() {
    if (this._deckPos + 3 > this._policyDeck.length) this._shuffleDeck();
    this._drawnCount = 3;
    this._drawnPolicies = [];
    for (let i = 0; i < 3; i++) {
      this._drawnPolicies.push(this._policyDeck[this._deckPos++]);
    }
  }

  _enactPolicy(policy) {
    if (policy === 0) {
      this._liberalPolicies++;
    } else {
      this._fascistPolicies++;
      this._pendingPower = this._getPowerForFascistPolicy(this._fascistPolicies);
    }
    this._electionTracker = 0;
  }

  _getPowerForFascistPolicy(fascistCount) {
    if (this._count <= 6) {
      if (fascistCount === 3) return SHPower.PEEK;
      if (fascistCount >= 4) return SHPower.ASSASSINATE;
    } else {
      if (fascistCount <= 2) return SHPower.INVESTIGATE;
      if (fascistCount === 3) return SHPower.PICK_PRESIDENT;
      if (fascistCount >= 4) return SHPower.ASSASSINATE;
    }
    return SHPower.NONE;
  }

  tick(now) {
    const elapsed = now - this._phaseStart;
    switch (this._phase) {
      case GamePhase.ROLE_ASSIGNMENT:
        if (elapsed >= ROLE_REVEAL_TIME_MS) this._startNomination();
        break;
      case GamePhase.NIGHT:
        if (elapsed >= 60000) {
          this._advancePresident();
          this._startNomination();
        }
        break;
      case GamePhase.VOTING:
        if (elapsed >= VOTING_TIME_MS) {
          this._resolveElection();
        } else {
          const allVoted = this._players.slice(0, this._count).every(p => !p.alive || p.vote >= 0);
          if (allVoted) this._resolveElection();
        }
        break;
      case GamePhase.ACTION:
        if (elapsed >= 60000 && this._subPhase === SHSubPhase.EXECUTIVE) {
          this._pendingPower = SHPower.NONE;
          this._advancePresident();
          this._startNomination();
        }
        break;
      case GamePhase.RESULT:
        if (elapsed >= RESULT_DISPLAY_TIME_MS) {
          if (this._checkWinCondition()) {
            this._phase = GamePhase.GAME_OVER;
            this._phaseStart = now;
          } else if (this._pendingPower !== SHPower.NONE) {
            this._executePower();
          } else {
            this._advancePresident();
            this._startNomination();
          }
        }
        break;
    }
  }

  _startNomination() {
    this._phase = GamePhase.NIGHT;
    this._subPhase = SHSubPhase.NOMINATION;
    this._phaseStart = Date.now();
    this._chancellorNominee = -1;
    this._vetoProposed = false;
    for (let i = 0; i < this._count; i++) this._players[i].vote = -1;
  }

  _startElection() {
    this._phase = GamePhase.VOTING;
    this._subPhase = SHSubPhase.ELECTION;
    this._phaseStart = Date.now();
    for (let i = 0; i < this._count; i++) this._players[i].vote = -1;
  }

  _resolveElection() {
    let ja = 0, nein = 0;
    for (let i = 0; i < this._count; i++) {
      if (!this._players[i].alive) continue;
      if (this._players[i].vote === 1) ja++; else nein++;
    }
    if (ja > nein) {
      this._lastPresident = this._presidentIdx;
      this._lastChancellor = this._chancellorNominee;
      if (this._fascistPolicies >= 3 && this._players[this._chancellorNominee].role === SHRole.HITLER) {
        this._fascistsWon = true;
        this._winReason = 'Hitler elected Chancellor';
        this._finished = true;
        this._phase = GamePhase.GAME_OVER;
        this._phaseStart = Date.now();
        return;
      }
      this._electionTracker = 0;
      this._startLegislative();
    } else {
      this._electionTracker++;
      if (this._electionTracker >= 3) {
        if (this._deckPos >= this._policyDeck.length) this._shuffleDeck();
        this._enactPolicy(this._policyDeck[this._deckPos++]);
        this._electionTracker = 0;
        this._lastPresident = -1;
        this._lastChancellor = -1;
        if (this._checkWinCondition()) {
          this._phase = GamePhase.GAME_OVER;
          this._phaseStart = Date.now();
          return;
        }
      }
      this._advancePresident();
      this._startNomination();
    }
  }

  _startLegislative() {
    this._phase = GamePhase.ACTION;
    this._subPhase = SHSubPhase.LEGISLATIVE;
    this._phaseStart = Date.now();
    this._drawPolicies();
  }

  _advancePresident() {
    do {
      this._presidentIdx = (this._presidentIdx + 1) % this._count;
    } while (!this._players[this._presidentIdx].alive);
  }

  _executePower() {
    this._phase = GamePhase.ACTION;
    this._subPhase = SHSubPhase.EXECUTIVE;
    this._phaseStart = Date.now();
  }

  _checkWinCondition() {
    if (this._liberalPolicies >= 5) {
      this._fascistsWon = false; this._winReason = '5 Liberal policies enacted';
      this._finished = true; return true;
    }
    if (this._fascistPolicies >= 6) {
      this._fascistsWon = true; this._winReason = '6 Fascist policies enacted';
      this._finished = true; return true;
    }
    for (let i = 0; i < this._count; i++) {
      if (this._players[i].role === SHRole.HITLER && !this._players[i].alive) {
        this._fascistsWon = false; this._winReason = 'Hitler assassinated';
        this._finished = true; return true;
      }
    }
    return false;
  }

  handleAction(playerIdx, action, data) {
    if (playerIdx >= this._count || !this._players[playerIdx].alive) return;

    if (action === 'nominate' && this._subPhase === SHSubPhase.NOMINATION && playerIdx === this._presidentIdx) {
      const target = data.target ?? -1;
      if (target < 0 || target >= this._count || target === this._presidentIdx) return;
      if (!this._players[target].alive) return;
      if (this._count > 5 && (target === this._lastPresident || target === this._lastChancellor)) return;
      if (this._count <= 5 && target === this._lastChancellor) return;
      this._chancellorNominee = target;
      this._startElection();

    } else if (action === 'vote' && this._subPhase === SHSubPhase.ELECTION) {
      this._players[playerIdx].vote = data.v ?? 0;

    } else if (action === 'discard' && this._subPhase === SHSubPhase.LEGISLATIVE) {
      const cardIdx = data.card;
      if (cardIdx === undefined) return;

      if (playerIdx === this._presidentIdx && this._drawnCount === 3 && cardIdx < 3) {
        this._chancellorChoices[0] = this._drawnPolicies[cardIdx === 0 ? 1 : 0];
        this._chancellorChoices[1] = this._drawnPolicies[cardIdx <= 1 ? 2 : 1];
        this._drawnCount = 2;
      } else if (playerIdx === this._chancellorNominee && this._drawnCount === 2 && cardIdx < 2) {
        const enacted = this._chancellorChoices[cardIdx === 0 ? 1 : 0];
        this._enactPolicy(enacted);
        this._phase = GamePhase.RESULT;
        this._phaseStart = Date.now();
      }

    } else if (action === 'veto' && this._subPhase === SHSubPhase.LEGISLATIVE && this._fascistPolicies >= 5) {
      if (playerIdx === this._chancellorNominee) {
        this._vetoProposed = true;
      } else if (playerIdx === this._presidentIdx && this._vetoProposed) {
        if (data.ok) {
          this._electionTracker++;
          if (this._electionTracker >= 3) {
            if (this._deckPos >= this._policyDeck.length) this._shuffleDeck();
            this._enactPolicy(this._policyDeck[this._deckPos++]);
            this._electionTracker = 0;
          }
          this._advancePresident();
          this._startNomination();
        } else {
          this._vetoProposed = false;
        }
      }

    } else if (action === 'power' && this._subPhase === SHSubPhase.EXECUTIVE && playerIdx === this._presidentIdx) {
      const target = data.target ?? -1;
      if (target < 0 || target >= this._count || !this._players[target].alive) return;

      switch (this._pendingPower) {
        case SHPower.INVESTIGATE:
          this._investigatedPlayer = target;
          this._investigateResult = this._players[target].role !== SHRole.LIBERAL;
          this._pendingPower = SHPower.NONE;
          this._advancePresident();
          this._startNomination();
          break;
        case SHPower.PICK_PRESIDENT:
          this._pendingPower = SHPower.NONE;
          this._presidentIdx = target;
          this._startNomination();
          break;
        case SHPower.ASSASSINATE:
          this._players[target].alive = false;
          this._assassinatedPlayer = target;
          this._pendingPower = SHPower.NONE;
          if (this._checkWinCondition()) {
            this._phase = GamePhase.GAME_OVER;
            this._phaseStart = Date.now();
          } else {
            this._advancePresident();
            this._startNomination();
          }
          break;
      }

    } else if (action === 'peek_ack' && this._subPhase === SHSubPhase.EXECUTIVE
               && this._pendingPower === SHPower.PEEK && playerIdx === this._presidentIdx) {
      this._pendingPower = SHPower.NONE;
      this._advancePresident();
      this._startNomination();
    }
  }

  serializeState(forPlayerIdx = -1) {
    const obj = {
      gt: GameType.SECRET_HITLER,
      ph: this._phase,
      sph: this._subPhase,
      elapsed: Date.now() - this._phaseStart,
      lp: this._liberalPolicies,
      fp: this._fascistPolicies,
      et: this._electionTracker,
      pres: this._presidentIdx,
    };

    if (this._chancellorNominee >= 0) obj.chan = this._chancellorNominee;
    if (this._lastPresident >= 0) obj.lpres = this._lastPresident;
    if (this._lastChancellor >= 0) obj.lchan = this._lastChancellor;

    switch (this._phase) {
      case GamePhase.ROLE_ASSIGNMENT: obj.tl = ROLE_REVEAL_TIME_MS; break;
      case GamePhase.VOTING: obj.tl = VOTING_TIME_MS; break;
      case GamePhase.NIGHT: obj.tl = 60000; break;
      case GamePhase.ACTION: obj.tl = 60000; break;
      case GamePhase.RESULT: obj.tl = RESULT_DISPLAY_TIME_MS; break;
    }

    if (this._subPhase === SHSubPhase.LEGISLATIVE && this._phase === GamePhase.ACTION) {
      if (forPlayerIdx === this._presidentIdx && this._drawnCount === 3) {
        obj.cards = [...this._drawnPolicies];
        obj.presDiscard = 1;
      } else if (forPlayerIdx === this._chancellorNominee && this._drawnCount === 2) {
        obj.cards = [this._chancellorChoices[0], this._chancellorChoices[1]];
        obj.chanPick = 1;
      }
      if (this._vetoProposed) obj.veto = 1;
    }

    if (this._subPhase === SHSubPhase.EXECUTIVE && this._phase === GamePhase.ACTION) {
      obj.power = this._pendingPower;
      if (this._pendingPower === SHPower.PEEK && forPlayerIdx === this._presidentIdx) {
        obj.peek = [];
        for (let i = 0; i < 3 && (this._deckPos + i) < this._policyDeck.length; i++) {
          obj.peek.push(this._policyDeck[this._deckPos + i]);
        }
      }
    }

    if (forPlayerIdx === this._presidentIdx && this._investigatedPlayer >= 0) {
      obj.invP = this._investigatedPlayer;
      obj.invR = this._investigateResult ? 1 : 0;
    }

    obj.pl = [];
    for (let i = 0; i < this._count; i++) {
      const p = { u: this._players[i].username, a: this._players[i].alive };
      if (forPlayerIdx === i) p.rl = this._players[i].role;
      if (forPlayerIdx >= 0 && this._players[forPlayerIdx].role === SHRole.FASCIST) p.rl = this._players[i].role;
      if (forPlayerIdx >= 0 && this._players[forPlayerIdx].role === SHRole.HITLER && this._count <= 6) p.rl = this._players[i].role;
      if (this._phase === GamePhase.GAME_OVER) p.rl = this._players[i].role;
      if (this._phase === GamePhase.VOTING) p.v = this._players[i].vote;
      obj.pl.push(p);
    }

    if (this._phase === GamePhase.GAME_OVER) {
      obj.win = this._fascistsWon ? 'fascist' : 'liberal';
      obj.reason = this._winReason;
    }
    return obj;
  }

  getType() { return GameType.SECRET_HITLER; }
  getPhase() { return this._phase; }
  isFinished() { return this._finished; }

  getPhaseName() {
    if (this._phase === GamePhase.ACTION) {
      return this._subPhase === SHSubPhase.LEGISLATIVE ? 'Legislative' : 'Executive Action';
    }
    const names = {
      [GamePhase.ROLE_ASSIGNMENT]: 'Role Reveal', [GamePhase.NIGHT]: 'Nomination',
      [GamePhase.VOTING]: 'Election', [GamePhase.RESULT]: 'Result',
      [GamePhase.GAME_OVER]: 'Game Over',
    };
    return names[this._phase] || 'Waiting';
  }

  getWinners() {
    return Array.from({ length: this._count }, (_, i) =>
      this._fascistsWon ? this._players[i].role !== SHRole.LIBERAL : this._players[i].role === SHRole.LIBERAL
    );
  }
}

module.exports = SecretHitlerGame;
