const { CHAT_BUFFER_SIZE } = require('./config');

let _buffer = [];
let _supabase = null;

const Chat = {
  async init(supabase) {
    _supabase = supabase;
    _buffer = [];
    if (_supabase) {
      try {
        const { data } = await _supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(CHAT_BUFFER_SIZE);
        if (data) {
          _buffer = data.map(row => ({
            username: row.username,
            message: row.message,
            timestamp: Math.floor(new Date(row.created_at).getTime() / 1000),
            isSystem: row.is_system,
          }));
        }
        console.log(`Chat: loaded ${_buffer.length} messages from Supabase`);
      } catch (e) {
        console.error('Chat: failed to load from Supabase', e.message);
      }
    }
  },

  addMessage(username, msg) {
    if (!username || !msg || msg.length === 0) return false;
    const entry = {
      username,
      message: msg.substring(0, 140),
      timestamp: Math.floor(Date.now() / 1000),
      isSystem: false,
    };
    _buffer.push(entry);
    if (_buffer.length > CHAT_BUFFER_SIZE) _buffer.shift();

    if (_supabase) {
      _supabase.from('chat_messages').insert({
        username, message: entry.message, is_system: false,
      }).then(() => {}).catch(() => {});
    }
    return true;
  },

  addSystemMessage(msg) {
    if (!msg) return;
    const entry = {
      username: '',
      message: msg.substring(0, 140),
      timestamp: Math.floor(Date.now() / 1000),
      isSystem: true,
    };
    _buffer.push(entry);
    if (_buffer.length > CHAT_BUFFER_SIZE) _buffer.shift();

    if (_supabase) {
      _supabase.from('chat_messages').insert({
        username: '', message: entry.message, is_system: true,
      }).then(() => {}).catch(() => {});
    }
  },

  serializeRecent(count = 20) {
    const slice = _buffer.slice(-count);
    return slice.map(cm => {
      const obj = { m: cm.message, ts: cm.timestamp };
      if (cm.isSystem) obj.s = 1; else obj.u = cm.username;
      return obj;
    });
  },

  getCount() { return _buffer.length; },
};

module.exports = Chat;
