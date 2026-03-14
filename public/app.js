(function() {
'use strict';

// ── State ────────────────────────────────────────────────────────
let ws = null;
let username = '';
let currentRoom = -1;
let rooms = [];
let gameState = null;
let selectedGameType = 1;
const GAME_NAMES = ['', 'Mafia', 'Spyfall', 'Secret Hitler', "Liar's Dice"];
const GAME_ICONS = ['', '🐺', '🕵️', '🏛️', '🎲'];
const GAME_CLASSES = ['', 'mafia', 'spyfall', 'secrethitler', 'liarsdice'];
const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const PHASE_NAMES = ['Waiting', 'Roles', 'Discussion', 'Night', 'Action', 'Voting', 'Result', 'Game Over'];
const MAFIA_ROLES = ['Villager', 'Mafia', 'Doctor', 'Detective'];
const MAFIA_ROLE_EMOJI = ['👤', '🐺', '💊', '🔍'];
const MAFIA_ROLE_DESC = [
  'Find and eliminate the Mafia.',
  'Eliminate villagers without being caught.',
  'Protect one player each night.',
  'Investigate one player each night.'
];
const SH_ROLES = ['Liberal', 'Fascist', 'Hitler'];
const SH_ROLE_EMOJI = ['🕊️', '🦅', '💀'];

// ── DOM Refs ─────────────────────────────────────────────────────
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => (p || document).querySelectorAll(s);

const views = { join: $('#joinView'), lobby: $('#lobbyView'), game: $('#gameView'), tower: $('#towerView'), magic8: $('#magic8View'), reaction: $('#reactionView'), arcade: $('#arcadeView') };
const modals = {
  leaderboard: $('#leaderboardModal'), rules: $('#rulesModal'), createRoom: $('#createRoomModal'), password: $('#passwordModal')
};

// ── Utility ──────────────────────────────────────────────────────
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const colors = ['#5b7fff','#f87171','#4ade80','#fbbf24','#a78bfa','#fb923c','#38bdf8','#f472b6','#34d399','#e879f9'];
  return colors[Math.abs(h) % colors.length];
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

let playerColors = {};
function getPlayerColor(name) {
  return playerColors[name] || hashColor(name);
}
function avatarHTML(name, size) {
  size = size || 28;
  return `<div class="avatar-dot" style="width:${size}px;height:${size}px;background:${getPlayerColor(name)};font-size:${size*0.42}px">${initials(name)}</div>`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 200); }, 3000);
}

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
}
window.showView = showView;

function showModal(name) { modals[name].classList.add('active'); }
function hideModal(name) { modals[name].classList.remove('active'); }

function timerRingHTML(elapsed, total) {
  const remaining = Math.max(0, total - elapsed);
  const secs = Math.ceil(remaining / 1000);
  const pct = total > 0 ? remaining / total : 0;
  const r = 42, c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  let cls = '';
  if (pct < 0.2) cls = 'danger';
  else if (pct < 0.5) cls = 'warn';
  return `<div class="timer-ring">
    <svg viewBox="0 0 100 100">
      <circle class="timer-ring-bg" cx="50" cy="50" r="${r}"/>
      <circle class="timer-ring-fg ${cls}" cx="50" cy="50" r="${r}"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
    </svg>
    <div class="timer-text">${formatTime(secs)}</div>
  </div>`;
}

// ── Sound Effects (Web Audio API) ────────────────────────────────
const SFX = {
  _ctx: null, _muted: localStorage.getItem('muted') === '1',
  _init() { if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)(); return this._ctx; },
  _tone(freq, dur, type) {
    if (this._muted) return;
    try {
      const ctx = this._init();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + dur);
    } catch(e) {}
  },
  _noise(dur) {
    if (this._muted) return;
    try {
      const ctx = this._init();
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(g); g.connect(ctx.destination);
      src.start(); src.stop(ctx.currentTime + dur);
    } catch(e) {}
  },
  yourTurn() { this._tone(440, 0.15); setTimeout(() => this._tone(660, 0.2), 160); },
  win() { this._tone(523, 0.15); setTimeout(() => this._tone(659, 0.15), 150); setTimeout(() => this._tone(784, 0.3), 300); },
  lose() { this._tone(440, 0.2); setTimeout(() => this._tone(330, 0.3), 200); },
  tick(high) { this._tone(high ? 880 : 440, 0.05, 'square'); },
  diceRoll() { this._noise(0.35); },
  liar() { this._tone(300, 0.1, 'sawtooth'); setTimeout(() => this._tone(200, 0.3, 'sawtooth'), 100); },
  chat() { this._tone(800, 0.06); },
  emote() { this._tone(600, 0.08); },
  success() { this._tone(660, 0.1); setTimeout(() => this._tone(880, 0.15), 100); },
  toggleMute() {
    this._muted = !this._muted;
    localStorage.setItem('muted', this._muted ? '1' : '0');
    $$('.mute-btn-ref').forEach(b => b.textContent = this._muted ? '🔇' : '🔊');
  }
};

// ── Theme Toggle ─────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  updateThemeBtn();
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  updateThemeBtn();
}
function updateThemeBtn() {
  const isDark = document.documentElement.dataset.theme !== 'light';
  const btn = $('#themeBtn');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}

// ── Color Picker ─────────────────────────────────────────────────
const COLOR_CHOICES = ['#5b7fff','#f87171','#4ade80','#fbbf24','#a78bfa','#fb923c','#38bdf8','#f472b6','#34d399','#e879f9'];
let selectedColor = localStorage.getItem('playerColor') || COLOR_CHOICES[0];
function initColorPicker() {
  const el = $('#colorPicker');
  if (!el) return;
  let html = '';
  COLOR_CHOICES.forEach(c => {
    html += `<span class="color-swatch${c === selectedColor ? ' selected' : ''}" style="background:${c}" data-color="${c}"></span>`;
  });
  el.innerHTML = html;
  $$('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      selectedColor = sw.dataset.color;
      localStorage.setItem('playerColor', selectedColor);
      $$('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === selectedColor));
    });
  });
}

// ── Notifications ────────────────────────────────────────────────
let notifPermission = false;
function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(p => { notifPermission = p === 'granted'; });
  } else if ('Notification' in window) {
    notifPermission = Notification.permission === 'granted';
  }
}
function sendNotif(title, body) {
  if (!notifPermission || !document.hidden) return;
  try { new Notification(title, { body, icon: '🎮' }); } catch(e) {}
}

// ── VS Banner ────────────────────────────────────────────────────
let lastPhase = -1;
function showVSBanner(players) {
  const overlay = document.createElement('div');
  overlay.className = 'vs-overlay';
  let html = '<div class="vs-content">';
  if (players.length === 2) {
    html += `<div class="vs-player vs-left">${avatarHTML(players[0].u, 48)}<span>${esc(players[0].u)}</span></div>`;
    html += '<div class="vs-text">VS</div>';
    html += `<div class="vs-player vs-right">${avatarHTML(players[1].u, 48)}<span>${esc(players[1].u)}</span></div>`;
  } else {
    html += '<div class="vs-text">GAME ON!</div><div class="vs-players-row">';
    players.forEach(p => { html += `<div class="vs-player">${avatarHTML(p.u, 36)}<span>${esc(p.u)}</span></div>`; });
    html += '</div>';
  }
  html += '</div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  SFX.yourTurn();
  setTimeout(() => { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 500); }, 3000);
}

// ── Emotes ───────────────────────────────────────────────────────
const EMOTES = ['👍','😂','😱','💀','🔥','🤔','👏','😈'];
let lastEmoteTime = 0;
function initEmoteBar() {
  const bar = $('#emoteBar');
  if (!bar) return;
  let html = '';
  EMOTES.forEach((e, i) => {
    html += `<button class="emote-btn" onclick="sendEmote(${i})">${e}</button>`;
  });
  bar.innerHTML = html;
}
window.sendEmote = function(idx) {
  if (Date.now() - lastEmoteTime < 2000) return;
  lastEmoteTime = Date.now();
  send({ t: 'emote', e: idx });
};
function showEmoteBubble(uname, emoteIdx) {
  SFX.emote();
  const container = $('#gameContent') || document.body;
  const bubble = document.createElement('div');
  bubble.className = 'emote-bubble';
  const offsetX = Math.round((Math.random() - 0.5) * 120);
  bubble.style.left = `calc(50% + ${offsetX}px)`;
  bubble.innerHTML = `<span class="emote-bubble-emoji">${EMOTES[emoteIdx] || '?'}</span><span class="emote-bubble-name">${esc(uname)}</span>`;
  container.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2500);
}

// ── Timer Countdown Audio ────────────────────────────────────────
let lastTickSec = -1;
function checkTimerAudio(elapsed, total) {
  if (!total) return;
  const remaining = Math.max(0, total - elapsed);
  const secs = Math.ceil(remaining / 1000);
  if (secs <= 10 && secs > 0 && secs !== lastTickSec) {
    lastTickSec = secs;
    SFX.tick(secs <= 3);
  }
  if (secs > 10) lastTickSec = -1;
}

// ── Player Titles ────────────────────────────────────────────────
function getTitle(entry) {
  if (entry.r === 1) return 'Champion';
  if (entry.r <= 3) return 'Veteran';
  if ((entry.cs || 0) >= 5) return 'On Fire';
  if (entry.w >= 10) return 'Legend';
  if (entry.w === 0) return 'Rookie';
  return '';
}

// ── WebSocket ────────────────────────────────────────────────────
let pingInterval = null;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    $('#connDot').classList.add('online');
    if (username) ws.send(JSON.stringify({ t: 'join', u: username, c: selectedColor }));
    startPing();
  };

  ws.onclose = () => {
    $('#connDot').classList.remove('online');
    stopPing();
    setTimeout(connect, 2000);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (e) => {
    let data;
    try { data = JSON.parse(e.data); } catch { return; }
    handleMessage(data);
  };
}

function startPing() {
  stopPing();
  pingInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('{"t":"ping"}');
    }
  }, 20000);
}

function stopPing() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ── Message Handler ──────────────────────────────────────────────
function handleMessage(data) {
  switch (data.t) {
    case 'welcome':
      localStorage.setItem('username', username);
      requestNotifPermission();
      showView('lobby');
      break;
    case 'err':
      toast(data.m, true);
      if (data.m === 'Not logged in' && username) {
        send({ t: 'join', u: username, c: selectedColor });
      }
      break;
    case 'pong':
      break;
    case 'kicked':
      toast('Disconnected: ' + (data.m || 'idle timeout'), true);
      currentRoom = -1;
      gameState = null;
      localStorage.removeItem('username');
      showView('join');
      break;
    case 'lobby':
      rooms = data.rooms || [];
      if (data.colors) playerColors = data.colors;
      $('#lobbyPlayerCount').textContent = data.pc || 0;
      $('#joinPlayerCount').textContent = `Online — ${data.pc || 0} players`;
      renderRooms();
      break;
    case 'chat':
      appendChat(data);
      SFX.chat();
      sendNotif('New message', `${data.u}: ${data.m}`);
      break;
    case 'emote':
      showEmoteBubble(data.u, data.e);
      break;
    case 'chatHistory':
      if (data.msgs) data.msgs.forEach(m => appendChat(m, true));
      scrollChat();
      break;
    case 'room':
      if (data.state && data.state.colors) {
        Object.assign(playerColors, data.state.colors);
      }
      const prevPhase = gameState ? gameState.ph : 0;
      gameState = data.state;
      if (gameState && currentRoom >= 0) {
        const newPhase = gameState.ph;
        if (prevPhase === 0 && newPhase === 1) {
          const pl = (gameState.gs && gameState.gs.pl) || gameState.pl || [];
          showVSBanner(pl);
          sendNotif('Game Starting!', 'Get ready!');
        }
        renderGame();
        if (gameState.gs && gameState.gs.elapsed !== undefined && gameState.gs.tl) {
          checkTimerAudio(gameState.gs.elapsed, gameState.gs.tl);
        }
      }
      break;
  }
}

// ── Chat ─────────────────────────────────────────────────────────
function appendChat(msg, noScroll) {
  const containers = [$('#chatMessages'), $('#gameChatMessages')];
  containers.forEach(el => {
    if (!el) return;
    const div = document.createElement('div');
    if (msg.s) {
      div.className = 'chat-msg system' + (msg.m.includes('joined') ? ' join' : msg.m.includes('left') ? ' leave' : '');
      div.textContent = msg.m;
    } else {
      div.className = 'chat-msg';
      div.innerHTML = `<span class="chat-user" style="color:${hashColor(msg.u)}">${esc(msg.u)}</span>${esc(msg.m)}`;
    }
    el.appendChild(div);
    // Keep max 100 DOM nodes
    while (el.children.length > 100) el.removeChild(el.firstChild);
  });
  if (!noScroll) scrollChat();
}

function scrollChat() {
  [$('#chatMessages'), $('#gameChatMessages')].forEach(el => {
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function sendChat() {
  const input = currentRoom >= 0 ? $('#gameChatInput') : $('#chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  send({ t: 'chat', m: msg });
  input.value = '';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Rooms Rendering ──────────────────────────────────────────────
function renderRooms() {
  const grid = $('#roomsGrid');
  let html = '';

  rooms.forEach(r => {
    const cls = GAME_CLASSES[r.gt] || '';
    const isLive = r.ph > 0 && r.ph < 7;
    html += `<div class="room-card" data-id="${r.id}">
      <div class="room-card-header">
        <span class="room-card-name">${esc(r.n)}</span>
        <span class="room-card-type ${cls}">${GAME_ICONS[r.gt]} ${GAME_NAMES[r.gt]}</span>
      </div>
      <div class="room-card-players">`;
    for (let i = 0; i < r.mx; i++) {
      if (i < r.pl.length) {
        html += avatarHTML(r.pl[i].u);
      } else {
        html += '<div class="avatar-dot empty"></div>';
      }
    }
    html += `<span class="player-count-text">${r.pc}/${r.mx}</span></div>
      <div class="room-card-footer">
        <span>${isLive ? '<span class="live-badge">LIVE</span>' : '<span class="phase-badge">Waiting</span>'}</span>
        ${r.ph === 0 ? `<button class="room-join-btn" onclick="tryJoinRoom(${r.id},${r.lk ? 'true' : 'false'})">Join</button>` : ''}
        ${r.lk ? '<span style="font-size:.8rem" title="Password required">🔒</span>' : ''}
      </div>
    </div>`;
  });

  html += `<div class="create-room-card" id="createRoomCard">
    <span class="plus">+</span><span>Create Room</span>
  </div>`;

  grid.innerHTML = html;
  $('#createRoomCard').addEventListener('click', () => showModal('createRoom'));
}

// ── Game Rendering ───────────────────────────────────────────────
function renderGame() {
  if (!gameState) return;
  const gs = gameState.gs;
  const phase = gameState.ph;

  $('#gameRoomName').textContent = gameState.n;
  const gt = gameState.gt;
  const badge = $('#gameTypeBadge');
  badge.textContent = GAME_NAMES[gt];
  badge.className = 'game-type-badge ' + GAME_CLASSES[gt];

  renderPhaseStepper(phase, gt);
  renderSidebar();

  const content = $('#gameContent');

  if (phase === 0) {
    renderWaiting(content);
  } else if (gs) {
    if (gs.gt === 4) {
      renderLiarsDice(content, gs);
    } else {
      switch (gs.ph) {
        case 1: renderRoleReveal(content, gs); break;
        case 2: // discussion
        case 3: // night
          renderDiscussion(content, gs); break;
        case 4: // action
          renderAction(content, gs); break;
        case 5: renderVoting(content, gs); break;
        case 6: renderResult(content, gs); break;
        case 7: renderGameOver(content, gs); break;
        default: renderWaiting(content);
      }
    }
  }
}

function renderPhaseStepper(phase, gt) {
  const phases = gt === 4
    ? ['Waiting', 'Roll', 'Bid', 'Challenge', 'End']
    : gt === 2
    ? ['Waiting', 'Roles', 'Questions', 'Vote', 'Result', 'End']
    : gt === 3
    ? ['Waiting', 'Roles', 'Nominate', 'Election', 'Legislative', 'Result', 'End']
    : ['Waiting', 'Roles', 'Night', 'Discussion', 'Vote', 'Result', 'End'];

  let html = '';
  for (let i = 0; i < phases.length; i++) {
    if (i > 0) html += `<div class="phase-line${i <= phase ? ' done' : ''}"></div>`;
    const cls = i < phase ? 'done' : i === phase ? 'current' : '';
    html += `<div class="phase-step-wrap"><div class="phase-dot ${cls}"></div></div>`;
  }
  $('#phaseStepper').innerHTML = html;
}

function renderWaiting(el) {
  const pl = gameState.pl || [];
  let html = '<div class="game-card"><h2>Waiting for Players</h2>';
  const maxPl = gameState.gt === 4 ? 2 : 8;
  html += `<p>${GAME_ICONS[gameState.gt]} ${GAME_NAMES[gameState.gt]} — ${pl.length}/${maxPl} players</p>`;
  html += '<div class="waiting-players">';
  pl.forEach(p => {
    html += `<div class="waiting-player">
      ${avatarHTML(p.u, 36)}
      <span style="font-size:.8rem">${esc(p.u)}</span>
      <span class="check">${p.r ? '✅' : '⬜'}</span>
    </div>`;
  });
  html += '</div>';

  const me = pl.find(p => p.u === username);
  if (me) {
    html += me.r
      ? '<button class="btn-secondary" onclick="toggleReady(false)">Unready</button>'
      : '<button class="btn-primary btn-lg" onclick="toggleReady(true)">Ready Up</button>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderRoleReveal(el, gs) {
  const me = gs.pl ? gs.pl.find(p => p.u === username) : null;
  if (!me) { el.innerHTML = '<div class="game-card"><h2>Assigning Roles...</h2></div>'; return; }

  let roleName = '', roleEmoji = '', roleDesc = '';
  if (gs.gt === 1) { // Mafia
    roleName = MAFIA_ROLES[me.rl] || 'Unknown';
    roleEmoji = MAFIA_ROLE_EMOJI[me.rl] || '❓';
    roleDesc = MAFIA_ROLE_DESC[me.rl] || '';
  } else if (gs.gt === 2) { // Spyfall
    if (gs.spy) { roleName = 'The Spy'; roleEmoji = '🕵️'; roleDesc = 'Figure out the location!'; }
    else { roleName = 'Citizen'; roleEmoji = '👤'; roleDesc = `Location: ${gs.loc}`; }
  } else if (gs.gt === 3) { // SH
    roleName = SH_ROLES[me.rl] || 'Unknown';
    roleEmoji = SH_ROLE_EMOJI[me.rl] || '❓';
    roleDesc = me.rl === 0 ? 'Enact liberal policies.' : me.rl === 2 ? 'Stay hidden. Get elected.' : 'Help Hitler. Enact fascist policies.';
  }

  el.innerHTML = `<div class="game-card">
    <h2>Your Role</h2>
    <div class="role-card"><div class="role-card-inner">
      <div class="role-card-face role-card-front">
        <div class="role-emoji">${roleEmoji}</div>
        <div class="role-name">${roleName}</div>
        <div class="role-desc">${roleDesc}</div>
      </div>
    </div></div>
    ${timerRingHTML(gs.elapsed, gs.tl)}
  </div>`;
}

function renderDiscussion(el, gs) {
  let html = '<div class="game-card">';

  if (gs.gt === 1 && gs.ph === 3) {
    // Mafia night phase
    const me = gs.pl.find(p => p.u === username);
    html += '<h2>Night Phase</h2><p>Close your eyes...</p>';
    html += timerRingHTML(gs.elapsed, gs.tl);
    if (me && me.a) {
      if (me.rl === 1) { // Mafia
        html += '<p style="color:var(--red)">Choose someone to eliminate:</p>';
        html += '<div class="vote-grid">';
        gs.pl.forEach((p, i) => {
          if (p.a && p.u !== username) {
            html += `<button class="vote-btn" onclick="gameAction('night',{target:${i}})">${avatarHTML(p.u, 32)}<span style="font-size:.75rem">${esc(p.u)}</span></button>`;
          }
        });
        html += '</div>';
      } else if (me.rl === 2) { // Doctor
        html += '<p style="color:var(--green)">Choose someone to protect:</p>';
        html += '<div class="vote-grid">';
        gs.pl.forEach((p, i) => {
          if (p.a) {
            html += `<button class="vote-btn" onclick="gameAction('night',{target:${i}})">${avatarHTML(p.u, 32)}<span style="font-size:.75rem">${esc(p.u)}</span></button>`;
          }
        });
        html += '</div>';
      } else if (me.rl === 3) { // Detective
        html += '<p style="color:var(--accent)">Choose someone to investigate:</p>';
        html += '<div class="vote-grid">';
        gs.pl.forEach((p, i) => {
          if (p.a && p.u !== username) {
            html += `<button class="vote-btn" onclick="gameAction('night',{target:${i}})">${avatarHTML(p.u, 32)}<span style="font-size:.75rem">${esc(p.u)}</span></button>`;
          }
        });
        html += '</div>';
      } else {
        html += '<p>Wait for night actions to complete...</p>';
      }
      if (me.rl === 3 && gs.inv !== undefined) {
        const invName = gs.pl[gs.inv] ? gs.pl[gs.inv].u : '?';
        html += `<p style="margin-top:12px">Investigation: <strong>${esc(invName)}</strong> is ${gs.invR ? '<span style="color:var(--red)">MAFIA</span>' : '<span style="color:var(--green)">NOT Mafia</span>'}</p>`;
      }
    }
  } else if (gs.gt === 2) {
    // Spyfall discussion
    html += '<h2>Questioning Round</h2>';
    if (gs.loc) html += `<p>Location: <strong>${gs.loc}</strong></p>`;
    else if (gs.spy) html += '<p style="color:var(--amber)">You are the Spy! Figure out the location.</p>';
    html += timerRingHTML(gs.elapsed, gs.tl);
    if (gs.qr !== undefined) {
      const qName = gs.pl[gs.qr] ? gs.pl[gs.qr].u : '?';
      html += `<p>Current questioner: <strong>${esc(qName)}</strong></p>`;
    }
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px">';
    html += '<button class="btn-secondary" onclick="gameAction(\'next\',{})">Next Questioner</button>';
    const meIdx = gs.pl.findIndex(p => p.u === username);
    if (meIdx >= 0) {
      html += `<button class="btn-secondary" onclick="showAccuseUI()">Accuse Spy</button>`;
    }
    if (gs.spy) {
      html += '<button class="btn-primary" onclick="showSpyGuessUI()">Guess Location</button>';
    }
    html += '</div>';
    html += '<div id="accuseUI"></div>';
  } else if (gs.gt === 3 && gs.ph === 3) {
    // Secret Hitler nomination
    html += renderSHNomination(gs);
  } else {
    html += '<h2>Discussion</h2><p>Talk it out!</p>';
    html += timerRingHTML(gs.elapsed, gs.tl);
  }

  html += '</div>';
  el.innerHTML = html;
}

function renderSHNomination(gs) {
  let html = '<h2>Presidential Nomination</h2>';
  html += renderSHPolicyTrack(gs);
  const presName = gs.pl[gs.pres] ? gs.pl[gs.pres].u : '?';
  html += `<p>President: <strong>${esc(presName)}</strong></p>`;
  html += `<p>Election tracker: ${gs.et}/3</p>`;
  html += timerRingHTML(gs.elapsed, gs.tl);

  if (gs.pl[gs.pres] && gs.pl[gs.pres].u === username) {
    html += '<p style="margin-top:12px">Nominate a Chancellor:</p>';
    html += '<div class="vote-grid">';
    gs.pl.forEach((p, i) => {
      if (p.a && i !== gs.pres && i !== gs.lchan && (gs.pl.length <= 5 || i !== gs.lpres)) {
        html += `<button class="vote-btn" onclick="gameAction('nominate',{target:${i}})">${avatarHTML(p.u, 32)}<span style="font-size:.75rem">${esc(p.u)}</span></button>`;
      }
    });
    html += '</div>';
  } else {
    html += '<p>Waiting for President to nominate...</p>';
  }
  return html;
}

function renderSHPolicyTrack(gs) {
  let html = '<div style="display:flex;gap:16px;justify-content:center;margin:12px 0">';
  html += '<div><div style="font-size:.7rem;color:var(--accent);text-align:center;margin-bottom:4px">Liberal</div><div class="policy-track">';
  for (let i = 0; i < 5; i++) html += `<div class="policy-slot liberal${i < gs.lp ? ' enacted' : ''}">${i < gs.lp ? '✓' : ''}</div>`;
  html += '</div></div>';
  html += '<div><div style="font-size:.7rem;color:var(--orange);text-align:center;margin-bottom:4px">Fascist</div><div class="policy-track">';
  for (let i = 0; i < 6; i++) html += `<div class="policy-slot fascist${i < gs.fp ? ' enacted' : ''}">${i < gs.fp ? '✓' : ''}</div>`;
  html += '</div></div></div>';
  return html;
}

function renderAction(el, gs) {
  let html = '<div class="game-card">';

  if (gs.gt === 3) {
    if (gs.sph === 2) { // Legislative
      html += '<h2>Legislative Session</h2>';
      html += renderSHPolicyTrack(gs);
      if (gs.presDiscard && gs.cards) {
        html += '<p>President: Discard one policy</p>';
        html += '<div style="display:flex;justify-content:center;gap:8px;margin:12px 0">';
        gs.cards.forEach((c, i) => {
          const cls = c === 0 ? 'liberal' : 'fascist';
          html += `<div class="policy-card ${cls}" onclick="gameAction('discard',{card:${i}})">${c === 0 ? '🕊️' : '🦅'}</div>`;
        });
        html += '</div>';
      } else if (gs.chanPick && gs.cards) {
        html += '<p>Chancellor: Pick a policy to enact</p>';
        html += '<div style="display:flex;justify-content:center;gap:8px;margin:12px 0">';
        gs.cards.forEach((c, i) => {
          const cls = c === 0 ? 'liberal' : 'fascist';
          html += `<div class="policy-card ${cls}" onclick="gameAction('discard',{card:${i}})">${c === 0 ? '🕊️' : '🦅'}</div>`;
        });
        html += '</div>';
        if (gs.fp >= 5) html += '<button class="btn-danger" onclick="gameAction(\'veto\',{})">Propose Veto</button>';
      } else {
        html += '<p>Government is deciding on policy...</p>';
      }
      if (gs.veto) html += '<p style="color:var(--amber)">Veto proposed!</p>';
    } else if (gs.sph === 3) { // Executive
      html += '<h2>Executive Action</h2>';
      const powers = ['', 'Investigate', 'Pick President', 'Peek at Deck', 'Assassinate'];
      html += `<p>Power: <strong>${powers[gs.power] || '?'}</strong></p>`;
      const presName = gs.pl[gs.pres] ? gs.pl[gs.pres].u : '?';

      if (gs.pl[gs.pres] && gs.pl[gs.pres].u === username) {
        if (gs.power === 3 && gs.peek) {
          html += '<p>Top 3 cards:</p><div style="display:flex;justify-content:center;gap:8px;margin:12px 0">';
          gs.peek.forEach(c => {
            html += `<div class="policy-card ${c === 0 ? 'liberal' : 'fascist'}" style="cursor:default">${c === 0 ? '🕊️' : '🦅'}</div>`;
          });
          html += '</div><button class="btn-primary" onclick="gameAction(\'peek_ack\',{})">Acknowledge</button>';
        } else if (gs.power === 1 || gs.power === 2 || gs.power === 4) {
          html += '<p>Choose a player:</p><div class="vote-grid">';
          gs.pl.forEach((p, i) => {
            if (p.a && i !== gs.pres) {
              html += `<button class="vote-btn" onclick="gameAction('power',{target:${i}})">${avatarHTML(p.u, 32)}<span style="font-size:.75rem">${esc(p.u)}</span></button>`;
            }
          });
          html += '</div>';
        }
      } else {
        html += `<p>Waiting for President ${esc(presName)}...</p>`;
      }
    }
  } else {
    html += '<h2>Action Phase</h2>';
    html += timerRingHTML(gs.elapsed, gs.tl);
  }

  html += '</div>';
  el.innerHTML = html;
}

function renderVoting(el, gs) {
  let html = '<div class="game-card"><h2>Vote</h2>';
  html += timerRingHTML(gs.elapsed, gs.tl);

  if (gs.gt === 3) {
    // SH election vote
    const chanName = gs.pl[gs.chan] ? gs.pl[gs.chan].u : '?';
    const presName = gs.pl[gs.pres] ? gs.pl[gs.pres].u : '?';
    html += `<p>President: <strong>${esc(presName)}</strong> → Chancellor: <strong>${esc(chanName)}</strong></p>`;
    html += '<div style="display:flex;gap:12px;justify-content:center;margin:12px 0">';
    html += '<button class="vote-btn" style="min-width:80px" onclick="gameAction(\'vote\',{v:1})">Ja! ✅</button>';
    html += '<button class="vote-btn" style="min-width:80px" onclick="gameAction(\'vote\',{v:0})">Nein ❌</button>';
    html += '</div>';
  } else if (gs.gt === 2) {
    // Spyfall accusation vote
    if (gs.acc !== undefined) {
      const accName = gs.pl[gs.acc] ? gs.pl[gs.acc].u : '?';
      html += `<p>Is <strong>${esc(accName)}</strong> the spy?</p>`;
      html += '<div style="display:flex;gap:12px;justify-content:center;margin:12px 0">';
      html += '<button class="vote-btn" style="min-width:80px" onclick="gameAction(\'vote\',{v:1})">Yes 👍</button>';
      html += '<button class="vote-btn" style="min-width:80px" onclick="gameAction(\'vote\',{v:0})">No 👎</button>';
      html += '</div>';
    }
  } else {
    // Mafia day vote
    html += '<p>Vote to eliminate:</p>';
    html += '<div class="vote-grid">';
    gs.pl.forEach((p, i) => {
      if (p.a) {
        html += `<button class="vote-btn" onclick="gameAction('vote',{target:${i}})">${avatarHTML(p.u, 32)}<span style="font-size:.75rem">${esc(p.u)}</span></button>`;
      }
    });
    html += '<button class="vote-btn" onclick="gameAction(\'vote\',{target:-1})"><span style="font-size:1.5rem">🚫</span><span style="font-size:.75rem">Skip</span></button>';
    html += '</div>';
  }

  // Show who has voted
  html += '<div style="margin-top:12px;font-size:.8rem;color:var(--text-secondary)">';
  let voted = 0, total = 0;
  gs.pl.forEach(p => {
    if (!p.a) return;
    total++;
    if (p.v !== undefined && p.v !== -1 && p.v !== null) voted++;
  });
  html += `Votes: ${voted}/${total}`;
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
}

function renderResult(el, gs) {
  let html = '<div class="game-card"><h2>Result</h2>';
  html += timerRingHTML(gs.elapsed, gs.tl);

  if (gs.gt === 1) {
    if (gs.killed !== undefined && gs.killed >= 0) {
      const name = gs.pl[gs.killed] ? gs.pl[gs.killed].u : '?';
      const role = MAFIA_ROLES[gs.killedRole] || '?';
      html += `<p><strong>${esc(name)}</strong> was eliminated.</p>`;
      html += `<p>They were a <strong>${role}</strong> ${MAFIA_ROLE_EMOJI[gs.killedRole] || ''}</p>`;
    } else if (gs.saved) {
      html += '<p>Nobody was eliminated! The Doctor saved someone. 💊</p>';
    } else {
      html += '<p>No elimination this round.</p>';
    }
  } else if (gs.gt === 2) {
    if (gs.spyIdx !== undefined) {
      const spyName = gs.pl[gs.spyIdx] ? gs.pl[gs.spyIdx].u : '?';
      html += `<p>The spy was: <strong>${esc(spyName)}</strong></p>`;
      html += `<p>Location: <strong>${gs.loc}</strong></p>`;
      if (gs.spyGuess) html += `<p>Spy guessed: <strong>${gs.spyGuess}</strong> ${gs.guessOk ? '✅' : '❌'}</p>`;
    }
  }

  html += '</div>';
  el.innerHTML = html;
}

function renderGameOver(el, gs) {
  const me = gs.pl ? gs.pl.find(p => p.u === username) : null;
  let iWon = false;

  if (gs.gt === 1) {
    iWon = (gs.win === 'town' && me && me.rl !== 1) || (gs.win === 'mafia' && me && me.rl === 1);
  } else if (gs.gt === 2) {
    iWon = (gs.win === 'spy' && me && me.spy) || (gs.win === 'town' && me && !me.spy);
  } else if (gs.gt === 3) {
    iWon = (gs.win === 'liberal' && me && me.rl === 0) || (gs.win === 'fascist' && me && me.rl !== 0);
  }

  let html = `<div class="game-card game-over-card ${iWon ? 'win' : 'lose'}">`;
  html += `<h2>${iWon ? '🎉 Victory!' : '😔 Defeat'}</h2>`;

  if (gs.gt === 1) html += `<p>${gs.win === 'mafia' ? 'Mafia wins!' : 'Town wins!'}</p>`;
  else if (gs.gt === 2) html += `<p>${gs.win === 'spy' ? 'Spy wins!' : 'Town wins!'}</p>`;
  else if (gs.gt === 3) html += `<p>${gs.win === 'fascist' ? 'Fascists win!' : 'Liberals win!'} ${gs.reason ? '(' + gs.reason + ')' : ''}</p>`;

  html += '<div style="margin:16px 0">';
  gs.pl.forEach(p => {
    let roleLabel = '';
    if (gs.gt === 1) roleLabel = MAFIA_ROLES[p.rl] || '';
    else if (gs.gt === 2) roleLabel = p.spy ? 'Spy' : 'Citizen';
    else if (gs.gt === 3) roleLabel = SH_ROLES[p.rl] || '';
    html += `<div class="player-item${p.a ? '' : ' dead'}">
      ${avatarHTML(p.u, 24)}
      <span class="player-name">${esc(p.u)}</span>
      <span class="player-role-tag" style="background:${hashColor(roleLabel)};color:#fff">${roleLabel}</span>
    </div>`;
  });
  html += '</div>';
  html += '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">';
  html += '<button class="btn-primary" onclick="requestRematch()">Rematch</button>';
  html += '<button class="btn-secondary" onclick="backToLobby()">Back to Lobby</button>';
  html += '</div>';
  html += '</div>';
  el.innerHTML = html;

  if (iWon) { spawnConfetti(); SFX.win(); } else { SFX.lose(); }
}

function renderSidebar() {
  const sidebar = $('#gamePlayers');
  if (!gameState) return;
  const pl = (gameState.gs && gameState.gs.pl) || gameState.pl || [];
  let html = '';
  pl.forEach(p => {
    html += `<div class="player-item${p.a === false ? ' dead' : ''}">
      ${avatarHTML(p.u, 24)}
      <span class="player-name">${esc(p.u)}</span>
      ${p.r !== undefined ? `<span class="player-ready">${p.r ? '✅' : ''}</span>` : ''}
    </div>`;
  });
  sidebar.innerHTML = html;
}

// ── Spyfall UI helpers ───────────────────────────────────────────
window.showAccuseUI = function() {
  if (!gameState || !gameState.gs) return;
  const gs = gameState.gs;
  let html = '<div style="margin-top:12px"><p style="font-size:.85rem;margin-bottom:8px">Who is the spy?</p><div class="vote-grid">';
  gs.pl.forEach((p, i) => {
    if (p.a && p.u !== username) {
      html += `<button class="vote-btn" onclick="gameAction('accuse',{target:${i}})">${avatarHTML(p.u, 28)}<span style="font-size:.75rem">${esc(p.u)}</span></button>`;
    }
  });
  html += '</div></div>';
  const ui = document.getElementById('accuseUI');
  if (ui) ui.innerHTML = html;
};

window.showSpyGuessUI = function() {
  if (!gameState || !gameState.gs || !gameState.gs.locs) return;
  let html = '<div style="margin-top:12px"><p style="font-size:.85rem;margin-bottom:8px">Guess the location:</p><div class="vote-grid">';
  gameState.gs.locs.forEach((loc, i) => {
    html += `<button class="vote-btn" onclick="gameAction('guess',{loc:${i}})" style="min-width:90px"><span style="font-size:.8rem">${esc(loc)}</span></button>`;
  });
  html += '</div></div>';
  const ui = document.getElementById('accuseUI');
  if (ui) ui.innerHTML = html;
};

// ── Liar's Dice Rendering ────────────────────────────────────────
function diceHTML(value, hidden) {
  if (hidden || !value) return '<span class="dice hidden">?</span>';
  return `<span class="dice">${DICE_FACES[value] || '?'}</span>`;
}

let ldBidQty = 1;
let ldBidFace = 2;

function getMinValidBid(gs) {
  if (!gs.bq) return { qty: 1, face: 2 };
  if (gs.bf < 6) return { qty: gs.bq, face: gs.bf + 1 };
  return { qty: gs.bq + 1, face: 1 };
}

function isValidBid(qty, face, gs) {
  if (face < 1 || face > 6 || qty < 1) return false;
  const totalDice = gs.dc0 + gs.dc1;
  if (qty > totalDice) return false;
  if (!gs.bq) return true;
  if (qty > gs.bq) return true;
  if (qty === gs.bq && face > gs.bf) return true;
  return false;
}

function renderLiarsDice(el, gs) {
  const myIdx = gs.pl ? gs.pl.findIndex(p => p.u === username) : -1;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const totalDice = gs.dc0 + gs.dc1;
  let html = '<div class="game-card liars-dice-card">';

  if (gs.ph === 1) {
    html += '<h2>🎲 Rolling Dice...</h2>';
    html += timerRingHTML(gs.elapsed, gs.tl);
    html += '<p class="ld-hint">Look at your dice — your opponent can\'t see them!</p>';
    if (myIdx >= 0) {
      html += '<div class="dice-row my-dice"><div class="dice-label">Your dice</div><div class="dice-set">';
      (gs['d' + myIdx] || []).forEach(d => { html += `<span class="dice rolling">${DICE_FACES[d] || '?'}</span>`; });
      html += '</div></div>';
      html += '<div class="dice-row opp-dice"><div class="dice-label">' + esc(gs.pl[oppIdx].u) + '\'s dice</div><div class="dice-set">';
      (gs['d' + oppIdx] || []).forEach(() => { html += diceHTML(0, true); });
      html += '</div></div>';
    }
    SFX.diceRoll();
  } else if (gs.ph === 2) {
    // Bidding phase
    const isMyTurn = myIdx >= 0 && gs.turn === myIdx;
    html += `<h2>${isMyTurn ? '🎯 Your Turn' : '⏳ Opponent\'s Turn'}</h2>`;

    // Score bar
    html += '<div class="ld-score-bar">';
    html += `<div class="ld-score-player${gs.turn === 0 ? ' active' : ''}">${avatarHTML(gs.pl[0].u, 24)}<span>${esc(gs.pl[0].u)}</span><span class="ld-dice-count">${gs.dc0} dice</span></div>`;
    html += '<div class="ld-score-vs">vs</div>';
    html += `<div class="ld-score-player${gs.turn === 1 ? ' active' : ''}">${avatarHTML(gs.pl[1].u, 24)}<span>${esc(gs.pl[1].u)}</span><span class="ld-dice-count">${gs.dc1} dice</span></div>`;
    html += '</div>';

    // Current bid display
    if (gs.bq) {
      html += `<div class="bid-display"><span class="bid-claim">"There are at least <strong>${gs.bq}</strong> ${DICE_FACES[gs.bf]}s among all ${totalDice} dice"</span><span class="bid-by">— ${esc(gs.pl[gs.bb].u)}</span></div>`;
    } else {
      html += '<div class="bid-display bid-empty">No bid yet — first player makes an opening bid</div>';
    }

    // My dice
    if (myIdx >= 0) {
      html += '<div class="dice-row my-dice"><div class="dice-label">Your dice (hidden from opponent)</div><div class="dice-set">';
      (gs['d' + myIdx] || []).forEach(d => { html += diceHTML(d, false); });
      html += '</div></div>';
    }

    if (isMyTurn) {
      const minBid = getMinValidBid(gs);
      if (ldBidQty < minBid.qty || (ldBidQty === minBid.qty && ldBidFace < minBid.face)) {
        ldBidQty = minBid.qty;
        ldBidFace = minBid.face;
      }
      if (ldBidQty > totalDice) ldBidQty = totalDice;

      html += '<div class="bid-selector">';
      html += '<div class="bid-section"><label class="bid-label">How many dice?</label>';
      html += '<div class="bid-qty-row">';
      for (let q = 1; q <= totalDice; q++) {
        const sel = q === ldBidQty ? ' selected' : '';
        const valid = isValidBid(q, ldBidFace, gs) || q > (gs.bq || 0);
        html += `<button class="bid-qty-btn${sel}${!valid ? ' dim' : ''}" onclick="setBidQty(${q})">${q}</button>`;
      }
      html += '</div></div>';

      html += '<div class="bid-section"><label class="bid-label">Which face? <span class="ld-wild-hint">💡 ⚀ (1s) are wild!</span></label>';
      html += '<div class="bid-face-row">';
      for (let f = 1; f <= 6; f++) {
        const sel = f === ldBidFace ? ' selected' : '';
        html += `<button class="bid-face-btn${sel}" onclick="setBidFace(${f})">${DICE_FACES[f]}</button>`;
      }
      html += '</div></div>';

      const canBid = isValidBid(ldBidQty, ldBidFace, gs);
      html += `<div class="bid-preview${canBid ? '' : ' invalid'}">`;
      if (canBid) {
        html += `Your bid: <strong>${ldBidQty}× ${DICE_FACES[ldBidFace]}</strong> — "At least ${ldBidQty} ${ldBidFace === 1 ? 'ones' : DICE_FACES[ldBidFace] + 's'} total"`;
      } else {
        html += `⚠️ Must bid higher than ${gs.bq}× ${DICE_FACES[gs.bf]}`;
      }
      html += '</div>';

      html += '<div class="bid-actions">';
      html += `<button class="btn-primary btn-lg bid-submit-btn${canBid ? '' : ' disabled'}" onclick="submitBid()" ${canBid ? '' : 'disabled'}>Place Bid</button>`;
      if (gs.bq) {
        html += '<div class="liar-divider"><span>or</span></div>';
        html += `<button class="btn-danger btn-lg liar-btn" onclick="gameAction('liar',{})">🤥 Call LIAR!</button>`;
        html += '<p class="liar-hint">Think they\'re bluffing? Call it! All dice get revealed.</p>';
      }
      html += '</div></div>';
    } else if (myIdx >= 0) {
      html += '<p class="waiting-turn">Waiting for <strong>' + esc(gs.pl[gs.turn].u) + '</strong> to bid or call Liar...</p>';
    }
  } else if (gs.ph === 6) {
    html += '<h2>🤥 Challenge!</h2>';
    html += timerRingHTML(gs.elapsed, gs.tl);
    if (gs.bq) {
      html += `<div class="bid-display challenge-bid">Bid: <strong>${gs.bq}× ${DICE_FACES[gs.bf]}</strong> — "At least ${gs.bq} ${DICE_FACES[gs.bf]}s"</div>`;
      const wasRight = gs.actual >= gs.bq;
      html += `<div class="bid-display ${wasRight ? 'bid-true' : 'bid-false'}">Actual count: <strong>${gs.actual}</strong> ${wasRight ? '✅ Bid was TRUE' : '❌ Bid was a BLUFF'}</div>`;
    }

    for (let p = 0; p < 2; p++) {
      const dice = gs['d' + p] || [];
      const isLoser = gs.loser === p;
      html += `<div class="dice-row${isLoser ? ' loser' : ' winner'}"><div class="dice-label">${esc(gs.pl[p].u)}${isLoser ? ' 💀 loses a die!' : ''}</div><div class="dice-set">`;
      dice.forEach(d => { html += diceHTML(d, false); });
      html += '</div></div>';
    }
  } else if (gs.ph === 7) {
    const winner = gs.pl[gs.win];
    const iWon = myIdx === gs.win;
    html = `<div class="game-card liars-dice-card game-over-card ${iWon ? 'win' : 'lose'}">`;
    html += `<h2>${iWon ? '🎉 Victory!' : '😔 Defeat'}</h2>`;
    html += `<p><strong>${esc(winner.u)}</strong> wins!</p>`;

    for (let p = 0; p < 2; p++) {
      const dice = gs['d' + p] || [];
      const dc = p === 0 ? gs.dc0 : gs.dc1;
      html += `<div class="dice-row"><div class="dice-label">${esc(gs.pl[p].u)} (${dc} dice left)</div><div class="dice-set">`;
      dice.forEach(d => { html += diceHTML(d, false); });
      if (dc === 0) html += '<span class="dice-none">No dice!</span>';
      html += '</div></div>';
    }
    html += '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">';
    html += '<button class="btn-primary" onclick="requestRematch()">Rematch</button>';
    html += '<button class="btn-secondary" onclick="backToLobby()">Back to Lobby</button>';
    html += '</div>';
    if (iWon) { setTimeout(spawnConfetti, 100); SFX.win(); } else { SFX.lose(); }
  }

  html += '</div>';
  el.innerHTML = html;
}

window.setBidQty = function(q) {
  ldBidQty = q;
  if (gameState && gameState.gs) renderLiarsDice($('#gameContent'), gameState.gs);
};

window.setBidFace = function(f) {
  ldBidFace = f;
  if (gameState && gameState.gs) renderLiarsDice($('#gameContent'), gameState.gs);
};

window.submitBid = function() {
  if (gameState && gameState.gs && isValidBid(ldBidQty, ldBidFace, gameState.gs)) {
    gameAction('bid', { qty: ldBidQty, face: ldBidFace });
  }
};

// ── Confetti ─────────────────────────────────────────────────────
function spawnConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti';
  document.body.appendChild(container);
  const colors = ['#5b7fff','#f87171','#4ade80','#fbbf24','#a78bfa','#fb923c'];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 1.5 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 4000);
}

// ── Global Actions ───────────────────────────────────────────────
window.joinRoom = function(id) {
  send({ t: 'joinRoom', id: id });
  currentRoom = id;
  showView('game');
};

window.toggleReady = function(r) {
  send({ t: 'ready', r: r });
};

window.gameAction = function(action, data) {
  data = data || {};
  data.t = 'action';
  data.a = action;
  send(data);
};

window.backToLobby = function() {
  send({ t: 'backToLobby' });
  currentRoom = -1;
  gameState = null;
  showView('lobby');
};

window.requestRematch = function() {
  send({ t: 'rematch' });
};

let pendingJoinRoom = -1;
window.tryJoinRoom = function(id, locked) {
  if (locked) {
    pendingJoinRoom = id;
    showModal('password');
    return;
  }
  joinRoom(id);
};

// ── Arcade ───────────────────────────────────────────────────────
const ARCADE_GAMES = [
  { id:'tetris',     name:'Tetris',          icon:'🧱', cat:'Classics', desc:'Stack falling blocks to clear lines',              path:'/games/tetris.html',          hasScore:true },
  { id:'snake',      name:'Snake',           icon:'🐍', cat:'Classics', desc:'Eat food and grow without hitting yourself',       path:'/games/snake.html',           hasScore:true },
  { id:'flappyBird', name:'Flappy Bird',     icon:'🐦', cat:'Classics', desc:'Tap to fly through the pipes',                    path:'/games/flappyBird.html',      hasScore:true },
  { id:'pacman',     name:'Pac-Man',         icon:'👾', cat:'Classics', desc:'Eat all the pellets, avoid the ghosts',           path:'/games/pacman.html',          hasScore:true },
  { id:'asteroids',  name:'Asteroids',       icon:'☄️', cat:'Classics', desc:'Blast space rocks in every direction',             path:'/games/asteroids.html',       hasScore:true },
  { id:'spaceInvaders',name:'Space Invaders',icon:'👽', cat:'Classics', desc:'Defend Earth from alien waves',                   path:'/games/spaceInvaders.html',   hasScore:true },
  { id:'breakout',   name:'Breakout',        icon:'🏓', cat:'Classics', desc:'Bounce the ball to break all bricks',             path:'/games/breakout.html',        hasScore:true },
  { id:'frogger',    name:'Frogger',         icon:'🐸', cat:'Classics', desc:'Cross roads and rivers to reach home',            path:'/games/frogger.html',         hasScore:true },
  { id:'pong',       name:'Pong',            icon:'🏏', cat:'Classics', desc:'Classic paddle tennis — first to 10 wins',        path:'/games/pong.html',            hasScore:true },
  { id:'missileCommand',name:'Missile Command',icon:'🚀',cat:'Classics',desc:'Protect your cities from incoming missiles',     path:'/games/missileCommand.html',  hasScore:true },
  { id:'basketball', name:'Basketball',      icon:'🏀', cat:'Classics', desc:'Shoot hoops and rack up points',                  path:'/games/basketball.html',      hasScore:true },
  { id:'2048',       name:'2048',            icon:'🔢', cat:'Puzzle',   desc:'Slide tiles to merge and reach 2048',             path:'/games/2048.html',            hasScore:true },
  { id:'minesweeper',name:'Minesweeper',     icon:'💣', cat:'Puzzle',   desc:'Clear the field without hitting a mine',          path:'/games/minesweeper.html',     hasScore:true },
  { id:'sokoban',    name:'Sokoban',         icon:'📦', cat:'Puzzle',   desc:'Push boxes onto targets in fewest moves',         path:'/games/sokoban.html',         hasScore:false },
  { id:'othello',    name:'Othello',         icon:'⚫', cat:'Puzzle',   desc:'Flip your opponent\'s pieces to dominate',        path:'/games/othello.html',         hasScore:true },
  { id:'lunarLander',name:'Lunar Lander',    icon:'🌙', cat:'Action',   desc:'Land your spacecraft safely on the moon',         path:'/games/lunarLander.html',     hasScore:true },
  { id:'miniGolf',   name:'Mini Golf',       icon:'⛳', cat:'Action',   desc:'Putt your way through tricky courses',            path:'/games/miniGolf.html',        hasScore:true },
  { id:'whacAMole',  name:'Whac-A-Mole',    icon:'🔨', cat:'Quick Play',desc:'Whack moles as fast as you can',                 path:'/games/whacAMole.html',       hasScore:true },
  { id:'simonSays',  name:'Simon Says',      icon:'🧠', cat:'Quick Play',desc:'Repeat the growing color pattern',               path:'/games/simonSays.html',       hasScore:true },
  { id:'colorMatch', name:'Color Match',     icon:'🎨', cat:'Quick Play',desc:'Pick the display color, not the word',           path:'/games/colorMatch.html',      hasScore:true },
  { id:'hexgl',      name:'HexGL',           icon:'🏎️', cat:'3D Showcase',desc:'Futuristic anti-gravity racing (Wipeout-style)',path:'/games/hexgl/index.html',     hasScore:true },
  { id:'synthblast', name:'SYNTHBLAST',      icon:'🔫', cat:'3D Showcase',desc:'Retro-futuristic tank shooter with synthwave vibes',path:'/games/synthblast/index.html',hasScore:true },
  { id:'astray',     name:'Astray',          icon:'🧩', cat:'3D Showcase',desc:'Navigate a 3D maze with physics — tilt to roll',path:'/games/astray/index.html',    hasScore:true },
];

function renderArcadeGrid() {
  const grid = document.getElementById('arcadeGrid');
  if (!grid) return;
  const cats = [...new Set(ARCADE_GAMES.map(g => g.cat))];
  let html = '';
  cats.forEach(cat => {
    html += `<div class="arcade-category-label">${cat}</div>`;
    ARCADE_GAMES.filter(g => g.cat === cat).forEach(g => {
      html += `<div class="room-card solo-card arcade-card" onclick="launchArcadeGame('${g.id}')">
        <div class="room-card-header">
          <span class="room-card-name">${g.icon} ${g.name}</span>
          ${g.hasScore ? '<span class="arcade-lb-badge">🏆 Leaderboard</span>' : ''}
        </div>
        <p style="font-size:.8rem;color:var(--text-secondary);margin:8px 0">${g.desc}</p>
        <button class="room-join-btn">Play</button>
      </div>`;
    });
  });
  grid.innerHTML = html;
}

window.launchArcadeGame = function(id) {
  const g = ARCADE_GAMES.find(x => x.id === id);
  if (!g) return;
  const title = document.getElementById('arcadeGameTitle');
  if (title) title.textContent = g.icon + ' ' + g.name;
  const iframe = document.getElementById('arcadeIframe');
  if (iframe) iframe.src = g.path;
  showView('arcade');
};

window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'arcade-score') return;
  const { game, score } = e.data;
  if (!game || score === undefined || !username) return;
  fetch('/api/arcade-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ u: username, game, score })
  }).catch(() => {});
});

// ── Tower of Words ───────────────────────────────────────────────
let towerWords = [];
let towerLetter = '';
let towerTimer = null;
let towerTimeLeft = 10;
let towerTimerMax = 10;
let towerActive = false;

window.startTower = function() {
  towerWords = [];
  towerTimerMax = 10;
  towerTimeLeft = towerTimerMax;
  towerActive = true;
  const letters = 'abcdefghijklmnoprstw';
  towerLetter = letters[Math.floor(Math.random() * letters.length)];
  renderTower();
  startTowerTimer();
};

function startTowerTimer() {
  if (towerTimer) clearInterval(towerTimer);
  towerTimeLeft = towerTimerMax;
  towerTimer = setInterval(() => {
    towerTimeLeft -= 0.1;
    updateTowerTimerDisplay();
    if (towerTimeLeft <= 3) SFX.tick(towerTimeLeft <= 1);
    if (towerTimeLeft <= 0) {
      clearInterval(towerTimer);
      towerTimer = null;
      towerActive = false;
      SFX.lose();
      submitTowerScore();
      renderTower();
    }
  }, 100);
}

function updateTowerTimerDisplay() {
  const bar = document.getElementById('towerTimerBar');
  if (bar) bar.style.width = Math.max(0, towerTimeLeft / towerTimerMax * 100) + '%';
  const txt = document.getElementById('towerTimerText');
  if (txt) txt.textContent = Math.ceil(Math.max(0, towerTimeLeft)) + 's';
}

window.submitTowerWord = function() {
  const input = document.getElementById('towerInput');
  if (!input) return;
  const word = input.value.trim().toLowerCase();
  input.value = '';
  if (word.length < 3) { toast('Word must be at least 3 letters', true); return; }
  if (word[0] !== towerLetter) { toast(`Word must start with "${towerLetter.toUpperCase()}"`, true); return; }
  if (towerWords.includes(word)) { toast('Word already used!', true); return; }
  towerWords.push(word);
  towerLetter = word[word.length - 1];
  towerTimerMax = Math.max(3, towerTimerMax - 0.3);
  SFX.success();
  startTowerTimer();
  renderTower();
};

function submitTowerScore() {
  const score = towerWords.length;
  if (score > 0 && username) {
    fetch('/api/tower-score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ u: username, s: score })
    }).catch(() => {});
  }
}

function renderTower() {
  const stack = document.getElementById('towerStack');
  const ui = document.getElementById('towerUI');
  if (!stack || !ui) return;

  let stackHtml = '';
  towerWords.forEach((w, i) => {
    stackHtml += `<div class="tower-block" style="animation-delay:${i * 0.05}s">${w}</div>`;
  });
  stack.innerHTML = stackHtml;
  stack.scrollTop = stack.scrollHeight;

  if (!towerActive && towerWords.length > 0) {
    ui.innerHTML = `<div class="game-card" style="text-align:center">
      <h2>Tower Collapsed!</h2>
      <p>Height: <strong>${towerWords.length}</strong> words</p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
        <button class="btn-primary" onclick="startTower()">Play Again</button>
        <button class="btn-secondary" onclick="leaveTower()">Back to Lobby</button>
      </div>
    </div>`;
    return;
  }

  if (!towerActive) {
    ui.innerHTML = `<div class="game-card" style="text-align:center">
      <h2>🗼 Tower of Words</h2>
      <p>Type words fast! Each must start with the last letter of the previous word.</p>
      <button class="btn-primary btn-lg" onclick="startTower()">Start</button>
    </div>`;
    return;
  }

  ui.innerHTML = `<div class="tower-input-area">
    <div class="tower-timer-bar-wrap"><div class="tower-timer-bar" id="towerTimerBar"></div></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <span class="tower-letter">${towerLetter.toUpperCase()}</span>
      <input type="text" id="towerInput" placeholder="Type a word starting with ${towerLetter.toUpperCase()}..." autocomplete="off" spellcheck="false" style="flex:1">
      <span id="towerTimerText" style="font-weight:700;color:var(--amber);min-width:30px">${Math.ceil(towerTimeLeft)}s</span>
    </div>
    <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px">Height: ${towerWords.length} | Min 3 letters</div>
  </div>`;

  const inp = document.getElementById('towerInput');
  if (inp) {
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitTowerWord(); });
  }
}

window.leaveTower = function() {
  if (towerTimer) { clearInterval(towerTimer); towerTimer = null; }
  towerActive = false;
  towerWords = [];
  showView('lobby');
};

// ── Magic 8 Ball ─────────────────────────────────────────────────
const MAGIC_8_ANSWERS = [
  'It is certain.','It is decidedly so.','Without a doubt.','Yes, definitely.',
  'You may rely on it.','As I see it, yes.','Most likely.','Outlook good.',
  'Yes.','Signs point to yes.','Reply hazy, try again.','Ask again later.',
  'Better not tell you now.','Cannot predict now.','Concentrate and ask again.',
  "Don't count on it.",'My reply is no.','My sources say no.',
  'Outlook not so good.','Very doubtful.'
];
let magic8Shaking = false;

function renderMagic8(answer) {
  const el = $('#magic8Content');
  if (!el) return;
  const display = answer || 'Ask a question, then shake!';
  const ansClass = answer ? (MAGIC_8_ANSWERS.indexOf(answer) < 10 ? 'positive' : MAGIC_8_ANSWERS.indexOf(answer) < 15 ? 'neutral' : 'negative') : '';
  el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:24px;padding:20px">
    <div class="magic8-ball${magic8Shaking ? ' shaking' : ''}" id="magic8Ball">
      <div class="magic8-window">
        <div class="magic8-triangle ${ansClass}">
          <span class="magic8-answer">${display}</span>
        </div>
      </div>
    </div>
    <input type="text" id="magic8Question" placeholder="Type your question..." maxlength="100" autocomplete="off" style="max-width:320px;width:100%;text-align:center">
    <button class="btn-primary btn-lg" onclick="shakeMagic8()" ${magic8Shaking ? 'disabled' : ''}>🎱 Shake</button>
  </div>`;
}

window.shakeMagic8 = function() {
  if (magic8Shaking) return;
  const q = document.getElementById('magic8Question');
  if (q && !q.value.trim()) { toast('Type a question first!', true); return; }
  magic8Shaking = true;
  renderMagic8('...');
  SFX.diceRoll();
  setTimeout(() => {
    magic8Shaking = false;
    const answer = MAGIC_8_ANSWERS[Math.floor(Math.random() * MAGIC_8_ANSWERS.length)];
    SFX.success();
    renderMagic8(answer);
  }, 1200);
};

// ── Reaction Timer ───────────────────────────────────────────────
let rxState = 'idle';
let rxRound = 0;
let rxTimes = [];
let rxStartTime = 0;
let rxTimeout = null;

function startReactionGame() {
  rxRound = 0;
  rxTimes = [];
  rxState = 'idle';
  nextReactionRound();
}

function nextReactionRound() {
  if (rxRound >= 5) {
    rxState = 'done';
    renderReaction();
    submitReactionScore();
    return;
  }
  rxState = 'waiting';
  renderReaction();
  const delay = 2000 + Math.random() * 4000;
  rxTimeout = setTimeout(() => {
    rxState = 'ready';
    rxStartTime = performance.now();
    SFX.yourTurn();
    renderReaction();
  }, delay);
}

function tapReaction() {
  if (rxState === 'waiting') {
    if (rxTimeout) { clearTimeout(rxTimeout); rxTimeout = null; }
    rxState = 'early';
    SFX.lose();
    renderReaction();
    return;
  }
  if (rxState === 'ready') {
    const ms = Math.round(performance.now() - rxStartTime);
    rxTimes.push(ms);
    rxRound++;
    rxState = 'result';
    SFX.success();
    renderReaction();
    setTimeout(nextReactionRound, 1500);
    return;
  }
}

function submitReactionScore() {
  if (rxTimes.length === 0 || !username) return;
  const best = Math.min(...rxTimes);
  fetch('/api/reaction-score', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ u: username, ms: best })
  }).catch(() => {});
}

function renderReaction() {
  const el = $('#reactionContent');
  if (!el) return;

  if (rxState === 'idle') {
    el.innerHTML = `<div class="game-card" style="text-align:center">
      <h2>⚡ Reaction Timer</h2>
      <p>5 rounds. Tap as fast as you can when the screen turns green!</p>
      <button class="btn-primary btn-lg" onclick="startReactionGame()">Start</button>
    </div>`;
    return;
  }

  if (rxState === 'waiting') {
    el.innerHTML = `<div class="reaction-zone waiting" onclick="tapReaction()">
      <div class="reaction-label">Wait for green...</div>
      <div class="reaction-round">Round ${rxRound + 1}/5</div>
    </div>`;
    return;
  }

  if (rxState === 'ready') {
    el.innerHTML = `<div class="reaction-zone ready" onclick="tapReaction()">
      <div class="reaction-label">TAP NOW!</div>
      <div class="reaction-round">Round ${rxRound + 1}/5</div>
    </div>`;
    return;
  }

  if (rxState === 'early') {
    el.innerHTML = `<div class="reaction-zone early">
      <div class="reaction-label">Too early!</div>
      <button class="btn-primary btn-lg" onclick="nextReactionRound()" style="margin-top:16px">Try Again</button>
    </div>`;
    return;
  }

  if (rxState === 'result') {
    const lastMs = rxTimes[rxTimes.length - 1];
    el.innerHTML = `<div class="reaction-zone result">
      <div class="reaction-time">${lastMs}ms</div>
      <div class="reaction-round">Round ${rxRound}/5</div>
    </div>`;
    return;
  }

  if (rxState === 'done') {
    const avg = Math.round(rxTimes.reduce((a, b) => a + b, 0) / rxTimes.length);
    const best = Math.min(...rxTimes);
    el.innerHTML = `<div class="game-card" style="text-align:center">
      <h2>Results</h2>
      <div style="display:flex;gap:20px;justify-content:center;margin:16px 0">
        <div><div style="font-size:2rem;font-weight:800;color:var(--green)">${best}ms</div><div style="font-size:.8rem;color:var(--text-secondary)">Best</div></div>
        <div><div style="font-size:2rem;font-weight:800;color:var(--amber)">${avg}ms</div><div style="font-size:.8rem;color:var(--text-secondary)">Average</div></div>
      </div>
      <div style="margin:12px 0;font-size:.85rem;color:var(--text-secondary)">${rxTimes.map((t, i) => `R${i + 1}: ${t}ms`).join(' | ')}</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
        <button class="btn-primary" onclick="startReactionGame()">Play Again</button>
        <button class="btn-secondary" onclick="showView('lobby')">Back to Lobby</button>
      </div>
    </div>`;
    return;
  }
}

window.startReactionGame = startReactionGame;
window.nextReactionRound = nextReactionRound;
window.tapReaction = tapReaction;
window.shakeMagic8 = window.shakeMagic8;

// ── Leaderboard ──────────────────────────────────────────────────
function loadLeaderboard() {
  fetch('/api/leaderboard').then(r => r.json()).then(data => {
    let html = '<table class="lb-table"><thead><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>Rate</th><th>Streak</th></tr></thead><tbody>';
    data.forEach(e => {
      const rate = e.g > 0 ? Math.round(e.w / e.g * 100) : 0;
      const rankCls = e.r === 1 ? 'gold' : e.r === 2 ? 'silver' : e.r === 3 ? 'bronze' : '';
      const medal = e.r === 1 ? '🥇' : e.r === 2 ? '🥈' : e.r === 3 ? '🥉' : e.r;
      const title = getTitle(e);
      const streakStr = (e.cs || 0) >= 2 ? `🔥${e.cs}` : '-';
      const towerStr = e.tb ? ` | 🗼${e.tb}` : '';
      const rxStr = e.rt ? ` | ⚡${e.rt}ms` : '';
      html += `<tr class="${e.u === username ? 'me' : ''}">
        <td class="lb-rank ${rankCls}">${medal}</td>
        <td>${avatarHTML(e.u, 22)} ${esc(e.u)}${title ? `<span class="player-title">${title}</span>` : ''}${towerStr}${rxStr}</td>
        <td>${e.w}</td><td>${e.l}</td>
        <td><div class="lb-bar"><div class="lb-bar-fill" style="width:${rate}%"></div></div> ${rate}%</td>
        <td>${streakStr}</td></tr>`;
    });
    html += '</tbody></table>';
    if (data.length === 0) html = '<p style="text-align:center;color:var(--text-muted)">No games played yet.</p>';
    $('#leaderboardBody').innerHTML = html;
  }).catch(() => {
    $('#leaderboardBody').innerHTML = '<p style="color:var(--red)">Failed to load.</p>';
  });
}

let arcadeLbGame = '';

function loadArcadeLeaderboard(game) {
  if (game) arcadeLbGame = game;
  let html = '<div style="margin-bottom:12px"><label style="font-size:.85rem;color:var(--text-secondary);margin-right:8px">Game:</label>';
  html += '<select id="arcadeLbSelect" style="background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:.85rem">';
  ARCADE_GAMES.filter(g => g.hasScore).forEach(g => {
    const sel = g.id === arcadeLbGame ? ' selected' : '';
    html += `<option value="${g.id}"${sel}>${g.icon} ${g.name}</option>`;
  });
  html += '</select></div>';
  if (!arcadeLbGame) arcadeLbGame = ARCADE_GAMES.find(g => g.hasScore)?.id || '';
  html += '<div id="arcadeLbBody"><p style="text-align:center;color:var(--text-muted)">Loading...</p></div>';
  $('#leaderboardBody').innerHTML = html;
  const sel = document.getElementById('arcadeLbSelect');
  if (sel) {
    sel.addEventListener('change', () => loadArcadeLeaderboard(sel.value));
    arcadeLbGame = sel.value;
  }
  fetch(`/api/arcade-leaderboard?game=${encodeURIComponent(arcadeLbGame)}`).then(r => r.json()).then(data => {
    const body = document.getElementById('arcadeLbBody');
    if (!body) return;
    if (!data.length) { body.innerHTML = '<p style="text-align:center;color:var(--text-muted)">No scores yet for this game.</p>'; return; }
    let t = '<table class="lb-table"><thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead><tbody>';
    data.forEach(e => {
      const medal = e.r === 1 ? '🥇' : e.r === 2 ? '🥈' : e.r === 3 ? '🥉' : e.r;
      const cls = e.r <= 3 ? ['','gold','silver','bronze'][e.r] : '';
      t += `<tr class="${e.u === username ? 'me' : ''}"><td class="lb-rank ${cls}">${medal}</td><td>${avatarHTML(e.u, 22)} ${esc(e.u)}</td><td style="font-weight:700;color:var(--accent)">${e.s}</td></tr>`;
    });
    t += '</tbody></table>';
    body.innerHTML = t;
  }).catch(() => {
    const body = document.getElementById('arcadeLbBody');
    if (body) body.innerHTML = '<p style="color:var(--red)">Failed to load.</p>';
  });
}

// ── Rules ────────────────────────────────────────────────────────
function loadRules(game) {
  fetch(`/rules/${game}.json`).then(r => r.json()).then(data => {
    let html = '';
    if (data.overview) html += `<h3>Overview</h3><p>${data.overview}</p>`;
    if (data.roles) {
      html += '<h3>Roles</h3><ul>';
      data.roles.forEach(r => html += `<li><strong>${r.name}</strong>: ${r.desc}</li>`);
      html += '</ul>';
    }
    if (data.phases) {
      html += '<h3>How to Play</h3><ul>';
      data.phases.forEach(p => html += `<li><strong>${p.name}</strong>: ${p.desc}</li>`);
      html += '</ul>';
    }
    if (data.winConditions) {
      html += '<h3>Win Conditions</h3><ul>';
      data.winConditions.forEach(w => html += `<li>${w}</li>`);
      html += '</ul>';
    }
    if (data.tips) {
      html += '<h3>Tips</h3><ul>';
      data.tips.forEach(t => html += `<li>${t}</li>`);
      html += '</ul>';
    }
    $('#rulesBody').innerHTML = html;
  }).catch(() => {
    $('#rulesBody').innerHTML = '<p style="color:var(--red)">Failed to load rules.</p>';
  });
}

// ── QR Code ──────────────────────────────────────────────────────
function initQR() {
  fetch('/api/info').then(r => r.json()).then(data => {
    const url = data.url || location.origin;
    $('#qrUrl').textContent = data.host || location.host;
    if (typeof QRCode !== 'undefined') {
      new QRCode(document.getElementById('qrCode'), {
        text: url, width: 120, height: 120,
        colorDark: '#e8eaed', colorLight: '#1a1d27',
        correctLevel: QRCode.CorrectLevel.L
      });
    }
    $('#joinPlayerCount').textContent = `Online — ${data.players} players`;
  }).catch(() => {
    const url = `http://${location.host}`;
    $('#qrUrl').textContent = location.host;
    if (typeof QRCode !== 'undefined') {
      new QRCode(document.getElementById('qrCode'), {
        text: url, width: 120, height: 120,
        colorDark: '#e8eaed', colorLight: '#1a1d27',
        correctLevel: QRCode.CorrectLevel.L
      });
    }
  });
}

// ── Event Bindings ───────────────────────────────────────────────
function init() {
  initTheme();
  initColorPicker();
  initEmoteBar();
  initQR();

  // Smart reconnect
  const savedUser = localStorage.getItem('username');
  if (savedUser) {
    username = savedUser;
    $('#usernameInput').value = username;
  }

  connect();

  // Join
  $('#joinBtn').addEventListener('click', () => {
    username = $('#usernameInput').value.trim();
    if (!username || username.length > 16) { toast('Enter a valid name (1-16 chars)', true); return; }
    send({ t: 'join', u: username, c: selectedColor });
    localStorage.setItem('username', username);
    $('#lobbyUsername').textContent = username;
  });
  $('#usernameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });

  // Chat
  $('#chatSendBtn').addEventListener('click', sendChat);
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('#gameChatSendBtn').addEventListener('click', sendChat);
  $('#gameChatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  // Chat toggle
  $('#chatToggle').addEventListener('click', () => {
    $('#lobbyChatSection').classList.toggle('collapsed');
  });
  $('#gameChatToggle').addEventListener('click', () => {
    $('#gameChatSection').classList.toggle('collapsed');
  });

  // Leave room
  $('#leaveRoomBtn').addEventListener('click', () => {
    send({ t: 'leaveRoom' });
    currentRoom = -1;
    gameState = null;
    showView('lobby');
  });

  // Leaderboard
  $('#leaderboardBtn').addEventListener('click', () => { loadLeaderboard(); showModal('leaderboard'); });
  $('#leaderboardClose').addEventListener('click', () => hideModal('leaderboard'));

  // Rules
  $('#rulesNavBtn').addEventListener('click', () => { loadRules('mafia'); showModal('rules'); });
  $('#gameRulesBtn').addEventListener('click', () => {
    const gt = gameState ? gameState.gt : 1;
    const gameKey = GAME_CLASSES[gt] || 'mafia';
    $$('.rules-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.game === gameKey));
    loadRules(gameKey);
    showModal('rules');
  });
  $('#rulesClose').addEventListener('click', () => hideModal('rules'));
  $$('.rules-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.rules-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadRules(tab.dataset.game);
    });
  });

  // Mute toggle
  const muteHandler = () => SFX.toggleMute();
  $('#muteBtn').addEventListener('click', muteHandler);
  $('#muteBtn').classList.add('mute-btn-ref');
  $('#gameMuteBtn').addEventListener('click', muteHandler);
  $('#gameMuteBtn').classList.add('mute-btn-ref');
  if (SFX._muted) { $$('.mute-btn-ref').forEach(b => b.textContent = '🔇'); }

  // Theme toggle
  $('#themeBtn').addEventListener('click', toggleTheme);

  // Create room
  $('#createRoomClose').addEventListener('click', () => hideModal('createRoom'));
  $$('.game-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.game-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedGameType = parseInt(opt.dataset.gt);
    });
  });
  $('#createRoomSubmit').addEventListener('click', () => {
    const name = $('#roomNameInput').value.trim() || 'Room';
    const pw = $('#roomPwInput').value.trim();
    const msg = { t: 'createRoom', n: name, gt: selectedGameType };
    if (pw) msg.pw = pw;
    send(msg);
    hideModal('createRoom');
    currentRoom = 0;
    showView('game');
  });

  // Password prompt
  $('#pwClose').addEventListener('click', () => hideModal('password'));
  $('#pwSubmitBtn').addEventListener('click', () => {
    const pw = $('#pwPromptInput').value.trim();
    hideModal('password');
    send({ t: 'joinRoom', id: pendingJoinRoom, pw: pw });
    currentRoom = pendingJoinRoom;
    showView('game');
  });

  // Tower of Words
  $('#towerPlayBtn').addEventListener('click', () => {
    showView('tower');
    towerActive = false;
    towerWords = [];
    renderTower();
  });
  $('#towerLeaveBtn').addEventListener('click', () => {
    if (towerTimer) { clearInterval(towerTimer); towerTimer = null; }
    towerActive = false;
    showView('lobby');
  });

  // Magic 8 Ball
  $('#magic8Btn').addEventListener('click', () => {
    showView('magic8');
    magic8Shaking = false;
    renderMagic8();
  });
  $('#magic8LeaveBtn').addEventListener('click', () => showView('lobby'));

  // Reaction Timer
  $('#reactionBtn').addEventListener('click', () => {
    showView('reaction');
    rxState = 'idle';
    renderReaction();
  });
  $('#reactionLeaveBtn').addEventListener('click', () => {
    if (rxTimeout) { clearTimeout(rxTimeout); rxTimeout = null; }
    rxState = 'idle';
    showView('lobby');
  });

  // Arcade
  renderArcadeGrid();
  $('#arcadeLeaveBtn').addEventListener('click', () => {
    const iframe = document.getElementById('arcadeIframe');
    if (iframe) iframe.src = 'about:blank';
    showView('lobby');
  });

  // Leaderboard tabs
  $$('#lbTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#lbTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.lb === 'multiplayer') loadLeaderboard();
      else loadArcadeLeaderboard();
    });
  });

  // Modal backdrop clicks
  $$('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', () => {
      bd.closest('.modal').classList.remove('active');
    });
  });

  // Periodic lobby poll for join screen
  setInterval(() => {
    if (views.join.classList.contains('active')) {
      fetch('/api/info').then(r => r.json()).then(d => {
        $('#joinPlayerCount').textContent = `Online — ${d.players} players`;
      }).catch(() => {});
    }
  }, 10000);
}

document.addEventListener('DOMContentLoaded', init);
})();
