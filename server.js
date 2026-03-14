require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const config = require('./src/config');
const Chat = require('./src/chat');
const Leaderboard = require('./src/leaderboard');
const Lobby = require('./src/lobby');
const ChatRooms = require('./src/chat-rooms');
const { handleMessage, handleDisconnect } = require('./src/ws-protocol');

const app = express();
const server = http.createServer(app);

// Supabase client (gracefully degrades if not configured)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  console.log('Supabase connected');
} else {
  console.log('Supabase not configured -- running with in-memory storage only');
}

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });
const _clients = new Map(); // ws -> clientId
let _nextClientId = 1;

function broadcastAll(msg) {
  for (const [ws] of _clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function sendToClient(clientId, msg) {
  if (clientId === null) {
    broadcastAll(msg);
    return;
  }
  for (const [ws, cid] of _clients) {
    if (cid === clientId && ws.readyState === ws.OPEN) {
      ws.send(msg);
      return;
    }
  }
}

function disconnectClient(clientId) {
  for (const [ws, cid] of _clients) {
    if (cid === clientId) {
      try {
        ws.send(JSON.stringify({ t: 'kicked', m: 'Idle timeout' }));
        ws.close();
      } catch {}
      return;
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = _nextClientId++;
  _clients.set(ws, clientId);
  console.log(`[WS] Client #${clientId} connected`);

  ws.on('message', (data) => {
    try {
      handleMessage(clientId, data.toString());
    } catch (e) {
      console.error('[WS] Message error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client #${clientId} disconnected`);
    _clients.delete(ws);
    handleDisconnect(clientId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Client #${clientId} error:`, err.message);
  });
});

// JSON body parsing
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Big screen shortcut
app.get('/screen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'screen.html'));
});

// API: Room list
app.get('/api/rooms', (req, res) => {
  res.json(Lobby.serializeRooms());
});

// API: Room state (observer view)
app.get('/api/room', (req, res) => {
  const id = parseInt(req.query.id);
  if (isNaN(id)) return res.status(400).json({ err: 'missing id' });
  const room = Lobby.getRoom(id);
  if (!room || !room.active) return res.status(404).json({ err: 'not found' });
  res.json(Lobby.serializeRoomState(id, -1));
});

// API: Leaderboard
app.get('/api/leaderboard', (req, res) => {
  res.json(Leaderboard.serialize());
});

// API: Chat history
app.get('/api/chat', (req, res) => {
  res.json(Chat.serializeRecent(20));
});

// API: Server info
app.get('/api/info', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  res.json({
    url: `${protocol}://${host}`,
    host: host,
    players: Lobby.getConnectedCount(),
  });
});

// API: Tower of Words score
app.post('/api/tower-score', async (req, res) => {
  const { u, s } = req.body || {};
  if (!u || !s) return res.status(400).json({ err: 'missing data' });
  Leaderboard.recordTowerScore(u, s);
  await Leaderboard.save();
  res.json({ ok: true });
});

// API: Reaction Timer score
app.post('/api/reaction-score', async (req, res) => {
  const { u, ms } = req.body || {};
  if (!u || !ms) return res.status(400).json({ err: 'missing data' });
  Leaderboard.recordReactionTime(u, ms);
  await Leaderboard.save();
  res.json({ ok: true });
});

// API: Spectator reactions
const _reactions = [];
const MAX_REACTIONS = 10;

app.post('/api/react', (req, res) => {
  const { e } = req.body || {};
  if (e === undefined || e > 7) return res.status(400).json({ err: 'invalid emote' });
  _reactions.push({ emote: e, ts: Date.now() });
  if (_reactions.length > MAX_REACTIONS) _reactions.shift();
  res.json({ ok: true });
});

app.get('/api/reactions', (req, res) => {
  const now = Date.now();
  const recent = _reactions.filter(r => now - r.ts < 15000).map(r => r.emote);
  res.json(recent);
});

// API: Arcade score (best per user per game)
app.post('/api/arcade-score', async (req, res) => {
  const { u, game, score } = req.body || {};
  if (!u || !game || score === undefined) return res.status(400).json({ err: 'missing data' });
  await Leaderboard.recordArcadeScore(u, game, score);
  res.json({ ok: true });
});

// API: Arcade leaderboard for a specific game
app.get('/api/arcade-leaderboard', async (req, res) => {
  const game = req.query.game;
  if (!game) return res.status(400).json({ err: 'missing game' });
  const data = await Leaderboard.getArcadeLeaderboard(game);
  res.json(data);
});

// API: Chat rooms
app.get('/api/chat-rooms', async (req, res) => {
  const rooms = await ChatRooms.listRooms();
  res.json(rooms);
});

app.post('/api/chat-rooms', async (req, res) => {
  const { name, password, username } = req.body || {};
  if (!name || !username) return res.status(400).json({ err: 'missing data' });
  const room = await ChatRooms.createRoom(name, password, username);
  if (!room) return res.status(500).json({ err: 'failed to create' });
  res.json({ ok: true, room });
});

app.delete('/api/chat-rooms/:id', async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ err: 'missing username' });
  const ok = await ChatRooms.deleteRoom(req.params.id, username);
  res.json({ ok });
});

// 404
app.use((req, res) => res.status(404).send('Not Found'));

// Startup
async function start() {
  await Chat.init(supabase);
  await Leaderboard.init(supabase);
  await ChatRooms.init(supabase, sendToClient);
  Lobby.init(broadcastAll, sendToClient, disconnectClient);

  // Game loop -- must start after Lobby.init() populates rooms
  setInterval(() => Lobby.tick(), 200);

  const port = process.env.PORT || 3000;
  const host = '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`The Hangar is running on http://${host}:${port}`);
  });
}

start().catch(e => {
  console.error('Failed to start:', e);
  process.exit(1);
});
