const crypto = require('crypto');

let _supabase = null;
const _roomMembers = new Map(); // roomId -> Set<clientId>
const _clientRooms = new Map(); // clientId -> roomId
let _sendFn = null;

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

const ChatRooms = {
  async init(supabase, sendToClient) {
    _supabase = supabase;
    _sendFn = sendToClient;
    // Clean up expired rooms on startup
    if (_supabase) {
      await _supabase.from('chat_rooms').delete().lt('expires_at', new Date().toISOString()).then(() => {});
    }
  },

  async createRoom(name, password, createdBy) {
    if (!_supabase) return null;
    const pwHash = password ? hashPassword(password) : '';
    const { data, error } = await _supabase.from('chat_rooms').insert({
      name: name.substring(0, 30),
      password_hash: pwHash,
      created_by: createdBy,
    }).select().single();
    if (error) { console.error('ChatRooms: create failed', error.message); return null; }
    return data;
  },

  async listRooms() {
    if (!_supabase) return [];
    const { data, error } = await _supabase
      .from('chat_rooms')
      .select('id, name, created_by, created_at, expires_at, password_hash')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      createdBy: r.created_by,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      locked: r.password_hash.length > 0,
      members: _roomMembers.has(r.id) ? _roomMembers.get(r.id).size : 0,
    }));
  },

  async joinRoom(roomId, password, clientId, username) {
    if (!_supabase) return { ok: false, err: 'No database' };

    const { data: room } = await _supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!room) return { ok: false, err: 'Room not found or expired' };

    if (room.password_hash && room.password_hash.length > 0) {
      if (!password || hashPassword(password) !== room.password_hash) {
        return { ok: false, err: 'Wrong password' };
      }
    }

    // Leave any current room
    this.leaveRoom(clientId, username);

    if (!_roomMembers.has(roomId)) _roomMembers.set(roomId, new Map());
    _roomMembers.get(roomId).set(clientId, username);
    _clientRooms.set(clientId, roomId);

    // Send recent messages
    const { data: msgs } = await _supabase
      .from('chat_room_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(50);

    // Notify other members
    this._broadcastToRoom(roomId, {
      t: 'chatRoomMsg', s: 1, m: `${username} joined`, roomId,
    }, clientId);

    return {
      ok: true,
      room: { id: room.id, name: room.name, createdBy: room.created_by, expiresAt: room.expires_at },
      msgs: (msgs || []).map(m => ({ u: m.username, m: m.message, ts: m.created_at })),
      members: [..._roomMembers.get(roomId).values()],
    };
  },

  leaveRoom(clientId, username) {
    const roomId = _clientRooms.get(clientId);
    if (!roomId) return;
    _clientRooms.delete(clientId);
    const members = _roomMembers.get(roomId);
    if (members) {
      members.delete(clientId);
      if (members.size === 0) _roomMembers.delete(roomId);
    }
    if (username) {
      this._broadcastToRoom(roomId, {
        t: 'chatRoomMsg', s: 1, m: `${username} left`, roomId,
      });
    }
  },

  async sendMessage(clientId, username, message) {
    const roomId = _clientRooms.get(clientId);
    if (!roomId || !message || message.length === 0) return false;

    const msg = message.substring(0, 500);

    if (_supabase) {
      await _supabase.from('chat_room_messages').insert({
        room_id: roomId, username, message: msg,
      }).then(() => {}).catch(() => {});
    }

    this._broadcastToRoom(roomId, {
      t: 'chatRoomMsg', u: username, m: msg, roomId,
      ts: new Date().toISOString(),
    });
    return true;
  },

  async deleteRoom(roomId, username) {
    if (!_supabase) return false;
    const { data: room } = await _supabase.from('chat_rooms').select('created_by').eq('id', roomId).single();
    if (!room || room.created_by !== username) return false;

    // Kick all members
    if (_roomMembers.has(roomId)) {
      for (const [cid] of _roomMembers.get(roomId)) {
        _clientRooms.delete(cid);
        if (_sendFn) _sendFn(cid, JSON.stringify({ t: 'chatRoomKicked', roomId, m: 'Room deleted' }));
      }
      _roomMembers.delete(roomId);
    }

    await _supabase.from('chat_rooms').delete().eq('id', roomId);
    return true;
  },

  getClientRoom(clientId) {
    return _clientRooms.get(clientId) || null;
  },

  _broadcastToRoom(roomId, msg, excludeClientId) {
    const members = _roomMembers.get(roomId);
    if (!members || !_sendFn) return;
    const str = JSON.stringify(msg);
    for (const [cid] of members) {
      if (cid !== excludeClientId) _sendFn(cid, str);
    }
  },
};

module.exports = ChatRooms;
