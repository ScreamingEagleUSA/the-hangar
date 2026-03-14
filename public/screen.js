(function() {
'use strict';

const GAME_NAMES = ['', 'Mafia', 'Spyfall', 'Secret Hitler', "Liar's Dice", 'Tic-Tac-Toe'];
const GAME_ICONS = ['', '🐺', '🕵️', '🏛️', '🎲', '❌⭕'];
const GAME_CLASSES = ['', 'mafia', 'spyfall', 'secrethitler', 'liarsdice', 'tictactoe'];
const PHASE_NAMES = ['Waiting', 'Role Reveal', 'Discussion', 'Night', 'Action', 'Voting', 'Result', 'Game Over'];
const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const LD_PHASE_NAMES = {1: 'Rolling', 2: 'Bidding', 6: 'Challenge!', 7: 'Game Over'};
const TTT_SYMBOLS = ['❌', '⭕'];
const MAFIA_ROLES = ['Villager', 'Mafia', 'Doctor', 'Detective'];
const SH_ROLES = ['Liberal', 'Fascist', 'Hitler'];

let activeRooms = [];
let currentDisplayIdx = 0;
let rotateTimer = null;
let prevPhases = {};
const EMOTES_SC = ['👍','😂','😱','💀','🔥','🤔','👏','😈'];
const ANNOUNCE_MAP = {
  1: 'GAME ON!', 2: 'DISCUSS!', 3: 'NIGHT FALLS...',
  5: 'TIME TO VOTE!', 7: 'GAME OVER!'
};

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const colors = ['#5b7fff','#f87171','#4ade80','#fbbf24','#a78bfa','#fb923c','#38bdf8','#f472b6','#34d399','#e879f9'];
  return colors[Math.abs(h) % colors.length];
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function initQR() {
  fetch('/api/info').then(r => r.json()).then(data => {
    const url = data.url || location.origin;
    document.getElementById('serverIP').textContent = data.host || location.host;
    document.getElementById('serverHost').textContent = data.host || location.host;
    if (typeof QRCode !== 'undefined') {
      new QRCode(document.getElementById('qrBig'), {
        text: url,
        width: 80, height: 80,
        colorDark: '#000', colorLight: '#fff',
        correctLevel: QRCode.CorrectLevel.L
      });
    }
  }).catch(() => {});
}

function poll() {
  fetch('/api/rooms').then(r => r.json()).then(rooms => {
    activeRooms = rooms.filter(r => r.ph > 0);

    if (activeRooms.length === 0) {
      document.getElementById('noGames').style.display = '';
      document.getElementById('roomDisplay').classList.remove('active');
      document.getElementById('roomDots').innerHTML = '';
      return;
    }

    document.getElementById('noGames').style.display = 'none';
    if (currentDisplayIdx >= activeRooms.length) currentDisplayIdx = 0;

    const room = activeRooms[currentDisplayIdx];
    fetchRoom(room.id);

    // Dots
    let dots = '';
    activeRooms.forEach((r, i) => {
      dots += `<div class="room-dot${i === currentDisplayIdx ? ' active' : ''}"></div>`;
    });
    document.getElementById('roomDots').innerHTML = dots;
  }).catch(() => {});
}

function fetchRoom(id) {
  fetch('/api/room?id=' + id).then(r => r.json()).then(data => {
    const gs = data.gs || {};
    const phase = gs.ph !== undefined ? gs.ph : data.ph;
    const key = 'room_' + id;
    if (prevPhases[key] !== undefined && prevPhases[key] !== phase) {
      const msg = ANNOUNCE_MAP[phase];
      if (msg) showAnnouncement(msg);
    }
    prevPhases[key] = phase;
    renderRoom(data);
  }).catch(() => {});
}

function showAnnouncement(text) {
  const overlay = document.getElementById('announceOverlay');
  overlay.innerHTML = `<div class="announce-text" style="color:var(--accent)">${text}</div>`;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 2500);
}

function pollReactions() {
  fetch('/api/reactions').then(r => r.json()).then(arr => {
    const container = document.getElementById('reactionsFloat');
    if (arr.length === 0) return;
    arr.forEach(e => {
      const bubble = document.createElement('div');
      bubble.className = 'react-bubble';
      bubble.textContent = EMOTES_SC[e] || '?';
      container.appendChild(bubble);
      setTimeout(() => bubble.remove(), 3000);
    });
  }).catch(() => {});
}

function renderRoom(data) {
  const el = document.getElementById('roomDisplay');
  el.classList.add('active');

  const gt = data.gt;
  const gs = data.gs || {};
  const phase = gs.ph !== undefined ? gs.ph : data.ph;
  const pl = gs.pl || data.pl || [];

  let timerHTML = '';
  if (gs.tl && gs.elapsed !== undefined) {
    const remaining = Math.max(0, gs.tl - gs.elapsed);
    const secs = Math.ceil(remaining / 1000);
    const pct = gs.tl > 0 ? remaining / gs.tl : 0;
    let cls = '';
    if (pct < 0.2) cls = 'danger';
    else if (pct < 0.5) cls = 'warn';
    timerHTML = `<div class="timer-big ${cls}">${formatTime(secs)}</div>`;
  }

  let html = `<div class="room-header">
    <span class="room-name">${data.n}</span>
    <span class="game-badge ${GAME_CLASSES[gt]}">${GAME_ICONS[gt]} ${GAME_NAMES[gt]}</span>
  </div>`;

  const phaseName = gt === 4 ? (LD_PHASE_NAMES[phase] || PHASE_NAMES[phase] || 'Unknown') : (PHASE_NAMES[phase] || 'Unknown');
  html += `<div class="phase-display">
    <div class="phase-name">${phaseName}</div>
    ${timerHTML}
  </div>`;

  // Liar's Dice spectator view (shows ALL dice)
  if (gt === 4) {
    html += renderLiarsDiceScreen(gs, pl, phase);
  }

  // Tic-Tac-Toe spectator view
  if (gt === 5) {
    html += renderTicTacToeScreen(gs, pl, phase);
  }

  // SH policy tracks
  if (gt === 3 && gs.lp !== undefined) {
    html += '<div style="display:flex;gap:24px;justify-content:center;margin:16px 0">';
    html += '<div><div style="font-size:.85rem;color:var(--accent);text-align:center;margin-bottom:6px">Liberal</div><div class="policy-track-big">';
    for (let i = 0; i < 5; i++) html += `<div class="policy-slot-big liberal${i < gs.lp ? ' enacted' : ''}">${i < gs.lp ? '✓' : ''}</div>`;
    html += '</div></div>';
    html += '<div><div style="font-size:.85rem;color:var(--orange);text-align:center;margin-bottom:6px">Fascist</div><div class="policy-track-big">';
    for (let i = 0; i < 6; i++) html += `<div class="policy-slot-big fascist${i < gs.fp ? ' enacted' : ''}">${i < gs.fp ? '✓' : ''}</div>`;
    html += '</div></div></div>';
  }

  // Players
  html += '<div class="players-row">';
  pl.forEach(p => {
    html += `<div class="screen-player${p.a === false ? ' dead' : ''}">
      <div class="sp-avatar" style="background:${hashColor(p.u)}">${initials(p.u)}</div>
      <div class="sp-name">${p.u}</div>
      ${phase === 7 && p.rl !== undefined ? `<div class="sp-role">${gt === 1 ? MAFIA_ROLES[p.rl] : gt === 3 ? SH_ROLES[p.rl] : (p.spy ? 'Spy' : 'Citizen')}</div>` : ''}
      ${p.r !== undefined ? `<div style="font-size:1.2rem">${p.r ? '✅' : '⬜'}</div>` : ''}
    </div>`;
  });
  html += '</div>';

  // Game over result
  if (phase === 7 && gs.win !== undefined) {
    let cls = 'win-green';
    let msg = '';
    if (gt === 4) {
      const winner = pl[gs.win] ? pl[gs.win].u : '?';
      msg = winner + ' Wins!';
    } else if (gt === 1) { msg = gs.win === 'mafia' ? 'Mafia Wins!' : 'Town Wins!'; cls = gs.win === 'mafia' ? 'win-red' : 'win-green'; }
    else if (gt === 2) { msg = gs.win === 'spy' ? 'Spy Wins!' : 'Town Wins!'; cls = gs.win === 'spy' ? 'win-red' : 'win-green'; }
    else if (gt === 3) { msg = gs.win === 'fascist' ? 'Fascists Win!' : 'Liberals Win!'; cls = gs.win === 'fascist' ? 'win-red' : 'win-green'; }
    html += `<div class="result-text ${cls}">${msg}</div>`;
    if (gs.reason) html += `<div style="text-align:center;color:var(--muted);font-size:1rem">${gs.reason}</div>`;
  }

  el.innerHTML = html;
}

function renderLiarsDiceScreen(gs, pl, phase) {
  let html = '';

  if (gs.bq) {
    html += `<div style="text-align:center;font-size:1.6rem;margin:12px 0;padding:12px;border-radius:12px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.15)">`;
    html += `Current bid: <strong>${gs.bq}× ${DICE_FACES[gs.bf]}</strong>`;
    if (gs.bb !== undefined && pl[gs.bb]) html += ` by <strong>${pl[gs.bb].u}</strong>`;
    html += '</div>';
  }

  if (phase === 6 && gs.actual !== undefined) {
    html += `<div style="text-align:center;font-size:1.3rem;margin:8px 0;color:var(--amber)">Actual matching dice: <strong>${gs.actual}</strong></div>`;
    if (gs.loser !== undefined && pl[gs.loser]) {
      html += `<div style="text-align:center;font-size:1.1rem;color:var(--red)">${pl[gs.loser].u} loses a die!</div>`;
    }
  }

  // Show both players' dice side by side (spectator sees all)
  html += '<div style="display:flex;justify-content:center;gap:40px;margin:20px 0;flex-wrap:wrap">';
  for (let p = 0; p < 2 && p < pl.length; p++) {
    const dice = gs['d' + p] || [];
    const dcKey = 'd' + (p === 0 ? 'c0' : 'c1');
    const diceCount = p === 0 ? gs.dc0 : gs.dc1;
    const isActive = gs.turn === p && phase === 2;
    html += `<div style="text-align:center;padding:16px 24px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid ${isActive ? 'var(--amber)' : 'var(--border)'}">`;
    html += `<div style="font-size:1.2rem;font-weight:700;margin-bottom:8px;color:${isActive ? 'var(--amber)' : 'var(--text)'}">${pl[p].u}</div>`;
    html += `<div style="font-size:.9rem;color:var(--muted);margin-bottom:8px">${diceCount} dice remaining</div>`;
    html += '<div style="display:flex;gap:4px;justify-content:center">';
    dice.forEach(d => {
      if (d > 0) {
        html += `<span style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;font-size:2.4rem;border-radius:8px;background:rgba(255,255,255,.1);border:1px solid var(--border)">${DICE_FACES[d]}</span>`;
      } else {
        html += `<span style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;font-size:1.4rem;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--muted)">?</span>`;
      }
    });
    html += '</div></div>';
  }
  html += '</div>';

  return html;
}

function renderTicTacToeScreen(gs, pl, phase) {
  let html = '';
  if (gs.scores) {
    html += `<div style="display:flex;align-items:center;justify-content:center;gap:16px;font-size:1.4rem;margin:12px 0">`;
    html += `<span style="font-weight:700">${pl[0] ? pl[0].u : '?'} ${TTT_SYMBOLS[0]}</span>`;
    html += `<span style="font-size:2.5rem;font-weight:900;color:var(--accent)">${gs.scores[0]} - ${gs.scores[1]}</span>`;
    html += `<span style="font-weight:700">${TTT_SYMBOLS[1]} ${pl[1] ? pl[1].u : '?'}</span>`;
    html += '</div>';
    html += `<div style="font-size:.9rem;color:var(--muted);text-align:center;margin-bottom:8px">Round ${(gs.round || 0) + 1} — First to 3</div>`;
  }
  if (gs.board) {
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:300px;margin:16px auto">';
    for (let i = 0; i < 9; i++) {
      const val = gs.board[i];
      const winCell = gs.winLine && gs.winLine.includes(i);
      html += `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:3rem;border-radius:12px;background:${winCell ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.05)'};border:2px solid ${winCell ? 'var(--green)' : 'var(--border)'}">${val >= 0 ? TTT_SYMBOLS[val] : ''}</div>`;
    }
    html += '</div>';
  }
  if (phase === 4 && gs.turn !== undefined && pl[gs.turn]) {
    html += `<div style="text-align:center;font-size:1.2rem;color:var(--amber);margin:8px 0">${pl[gs.turn].u}'s turn ${TTT_SYMBOLS[gs.turn]}</div>`;
  }
  if (phase === 6 || phase === 7) {
    if (gs.winner === -2) html += '<div style="text-align:center;font-size:1.4rem;color:var(--amber);margin:8px 0">Draw!</div>';
    else if (gs.winner >= 0 && pl[gs.winner]) html += `<div style="text-align:center;font-size:1.4rem;color:var(--green);margin:8px 0">${pl[gs.winner].u} wins!</div>`;
  }
  return html;
}

function startRotation() {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateTimer = setInterval(() => {
    if (activeRooms.length > 1) {
      currentDisplayIdx = (currentDisplayIdx + 1) % activeRooms.length;
    }
  }, 15000);
}

initQR();
poll();
setInterval(poll, 2000);
setInterval(pollReactions, 3000);
startRotation();

})();
