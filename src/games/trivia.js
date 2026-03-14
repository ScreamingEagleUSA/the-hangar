const { GamePhase, TRIVIA_QUESTION_TIME_MS, TRIVIA_RESULT_TIME_MS, TRIVIA_TOTAL_QUESTIONS } = require('../config');

const QUESTIONS = [
  { q: "What planet is known as the Red Planet?", o: ["Mars", "Venus", "Jupiter", "Saturn"], a: 0 },
  { q: "What is the hardest natural substance on Earth?", o: ["Gold", "Iron", "Diamond", "Platinum"], a: 2 },
  { q: "How many continents are there?", o: ["5", "6", "7", "8"], a: 2 },
  { q: "What gas do plants absorb from the atmosphere?", o: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Helium"], a: 1 },
  { q: "What is the largest ocean on Earth?", o: ["Atlantic", "Indian", "Arctic", "Pacific"], a: 3 },
  { q: "Who painted the Mona Lisa?", o: ["Michelangelo", "Da Vinci", "Picasso", "Van Gogh"], a: 1 },
  { q: "What is the smallest prime number?", o: ["0", "1", "2", "3"], a: 2 },
  { q: "How many bones are in the human body?", o: ["186", "206", "226", "256"], a: 1 },
  { q: "What element does 'O' represent on the periodic table?", o: ["Osmium", "Oxygen", "Gold", "Oganesson"], a: 1 },
  { q: "In what year did the Titanic sink?", o: ["1905", "1912", "1918", "1920"], a: 1 },
  { q: "What is the capital of Japan?", o: ["Seoul", "Beijing", "Tokyo", "Osaka"], a: 2 },
  { q: "How many Harry Potter books are there?", o: ["5", "6", "7", "8"], a: 2 },
  { q: "What is the speed of light (approx)?", o: ["300 km/s", "300,000 km/s", "30,000 km/s", "3,000,000 km/s"], a: 1 },
  { q: "What is the largest mammal?", o: ["Elephant", "Blue Whale", "Giraffe", "Hippopotamus"], a: 1 },
  { q: "What year was the first iPhone released?", o: ["2005", "2006", "2007", "2008"], a: 2 },
  { q: "What is the chemical symbol for water?", o: ["H2O", "CO2", "NaCl", "O2"], a: 0 },
  { q: "How many sides does a hexagon have?", o: ["5", "6", "7", "8"], a: 1 },
  { q: "What is the tallest mountain in the world?", o: ["K2", "Kangchenjunga", "Everest", "Lhotse"], a: 2 },
  { q: "Which planet has the most moons?", o: ["Jupiter", "Saturn", "Uranus", "Neptune"], a: 1 },
  { q: "What is the currency of the UK?", o: ["Euro", "Dollar", "Pound", "Franc"], a: 2 },
  { q: "What animal is the fastest on land?", o: ["Lion", "Cheetah", "Horse", "Gazelle"], a: 1 },
  { q: "What is the boiling point of water in Fahrenheit?", o: ["100", "200", "212", "220"], a: 2 },
  { q: "How many strings does a standard guitar have?", o: ["4", "5", "6", "8"], a: 2 },
  { q: "What is the longest river in the world?", o: ["Amazon", "Mississippi", "Nile", "Yangtze"], a: 2 },
  { q: "Who wrote Romeo and Juliet?", o: ["Dickens", "Shakespeare", "Austen", "Hemingway"], a: 1 },
  { q: "What is the atomic number of Carbon?", o: ["4", "6", "8", "12"], a: 1 },
  { q: "How many planets are in our solar system?", o: ["7", "8", "9", "10"], a: 1 },
  { q: "What company created the PlayStation?", o: ["Nintendo", "Microsoft", "Sony", "Sega"], a: 2 },
  { q: "What is the square root of 144?", o: ["10", "11", "12", "14"], a: 2 },
  { q: "Which country invented pizza?", o: ["France", "Greece", "Italy", "Spain"], a: 2 },
  { q: "What does 'HTTP' stand for?", o: ["HyperText Transfer Protocol", "High Tech Transfer Protocol", "HyperText Transmission Program", "High Transfer Text Protocol"], a: 0 },
  { q: "What is the most spoken language in the world?", o: ["English", "Spanish", "Mandarin", "Hindi"], a: 2 },
  { q: "What year did World War II end?", o: ["1943", "1944", "1945", "1946"], a: 2 },
  { q: "What is the main ingredient in guacamole?", o: ["Tomato", "Avocado", "Lime", "Onion"], a: 1 },
  { q: "How many teeth does an adult human have?", o: ["28", "30", "32", "34"], a: 2 },
  { q: "What is the largest desert in the world?", o: ["Sahara", "Gobi", "Antarctic", "Arabian"], a: 2 },
  { q: "Who discovered gravity?", o: ["Einstein", "Newton", "Galileo", "Copernicus"], a: 1 },
  { q: "What is the rarest blood type?", o: ["A-", "O-", "AB-", "B-"], a: 2 },
  { q: "How many keys are on a standard piano?", o: ["76", "82", "88", "92"], a: 2 },
  { q: "What is Bitcoin?", o: ["A social media", "A cryptocurrency", "A video game", "An operating system"], a: 1 },
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class TriviaGame {
  constructor() { this.reset(); }

  reset() {
    this._phase = GamePhase.WAITING;
    this._players = [];
    this._playerCount = 0;
    this._scores = [];
    this._questions = [];
    this._qIdx = 0;
    this._subPhase = 'question'; // 'question' | 'result'
    this._phaseStart = 0;
    this._answers = [];
    this._finished = false;
  }

  start(players, count) {
    this._players = players;
    this._playerCount = count;
    this._scores = Array(count).fill(0);
    this._questions = shuffle([...QUESTIONS]).slice(0, TRIVIA_TOTAL_QUESTIONS);
    this._qIdx = 0;
    this._subPhase = 'question';
    this._answers = Array(count).fill(-1);
    this._answerTimes = Array(count).fill(0);
    this._phase = GamePhase.ACTION;
    this._phaseStart = Date.now();
    this._finished = false;
  }

  tick(now) {
    if (this._phase !== GamePhase.ACTION) return;

    if (this._subPhase === 'question') {
      const allAnswered = this._answers.every(a => a !== -1);
      if (allAnswered || (now - this._phaseStart > TRIVIA_QUESTION_TIME_MS)) {
        this._resolveQuestion();
        this._subPhase = 'result';
        this._phaseStart = now;
      }
    } else if (this._subPhase === 'result') {
      if (now - this._phaseStart > TRIVIA_RESULT_TIME_MS) {
        this._qIdx++;
        if (this._qIdx >= this._questions.length) {
          this._phase = GamePhase.GAME_OVER;
          this._finished = true;
        } else {
          this._answers = Array(this._playerCount).fill(-1);
          this._answerTimes = Array(this._playerCount).fill(0);
          this._subPhase = 'question';
          this._phaseStart = Date.now();
        }
      }
    }
  }

  _resolveQuestion() {
    const correct = this._questions[this._qIdx].a;
    for (let i = 0; i < this._playerCount; i++) {
      if (this._answers[i] === correct) {
        const timeBonus = Math.max(0, TRIVIA_QUESTION_TIME_MS - this._answerTimes[i]);
        const bonus = Math.round(100 + (timeBonus / TRIVIA_QUESTION_TIME_MS) * 100);
        this._scores[i] += bonus;
      }
    }
  }

  getPhase() { return this._phase; }
  isFinished() { return this._finished; }

  getWinners() {
    const maxScore = Math.max(...this._scores);
    return this._scores.map(s => s === maxScore && maxScore > 0);
  }

  handleAction(playerIdx, action, msg) {
    if (action === 'answer' && this._phase === GamePhase.ACTION && this._subPhase === 'question') {
      if (playerIdx < 0 || playerIdx >= this._playerCount) return;
      if (this._answers[playerIdx] !== -1) return;
      const choice = msg.choice;
      if (choice === undefined || choice < 0 || choice > 3) return;
      this._answers[playerIdx] = choice;
      this._answerTimes[playerIdx] = Date.now() - this._phaseStart;
    }
  }

  serializeState(forPlayerIdx) {
    const elapsed = Date.now() - this._phaseStart;
    const tl = this._subPhase === 'question' ? TRIVIA_QUESTION_TIME_MS : TRIVIA_RESULT_TIME_MS;
    const q = this._questions[this._qIdx];

    const obj = {
      gt: 6,
      ph: this._phase,
      subPh: this._subPhase,
      qIdx: this._qIdx,
      qTotal: this._questions.length,
      scores: this._scores,
      elapsed, tl,
      pl: this._players.slice(0, this._playerCount).map((p, i) => ({
        u: p.username, a: p.alive, r: p.ready,
        answered: this._answers[i] !== -1,
      })),
    };

    if (q) {
      obj.question = q.q;
      obj.options = q.o;
    }

    if (this._subPhase === 'result' || this._phase === GamePhase.GAME_OVER) {
      obj.correct = q ? q.a : -1;
      obj.answers = this._answers;
    } else {
      if (forPlayerIdx >= 0 && forPlayerIdx < this._playerCount) {
        obj.myAnswer = this._answers[forPlayerIdx];
      }
    }

    if (this._phase === GamePhase.GAME_OVER) {
      const maxScore = Math.max(...this._scores);
      obj.win = this._scores.indexOf(maxScore);
    }

    return obj;
  }
}

module.exports = TriviaGame;
