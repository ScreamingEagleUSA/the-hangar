let _entries = [];
let _supabase = null;

const Leaderboard = {
  async init(supabase) {
    _supabase = supabase;
    _entries = [];
    if (_supabase) {
      try {
        const { data } = await _supabase.from('leaderboard').select('*');
        if (data) {
          _entries = data.map(row => ({
            username: row.username,
            wins: row.wins || 0,
            losses: row.losses || 0,
            gamesPlayed: row.games_played || 0,
            currentStreak: row.current_streak || 0,
            maxStreak: row.max_streak || 0,
            towerBest: row.tower_best || 0,
            reactionBest: row.reaction_best || 0,
            active: true,
          }));
        }
        console.log(`Leaderboard: loaded ${_entries.length} entries from Supabase`);
      } catch (e) {
        console.error('Leaderboard: failed to load', e.message);
      }
    }
  },

  _findOrCreate(username) {
    let ps = _entries.find(e => e.active && e.username === username);
    if (ps) return ps;
    ps = {
      username, wins: 0, losses: 0, gamesPlayed: 0,
      currentStreak: 0, maxStreak: 0, towerBest: 0, reactionBest: 0, active: true,
    };
    _entries.push(ps);
    return ps;
  },

  recordWin(username) {
    const ps = this._findOrCreate(username);
    ps.wins++;
    ps.gamesPlayed++;
    ps.currentStreak++;
    if (ps.currentStreak > ps.maxStreak) ps.maxStreak = ps.currentStreak;
  },

  recordLoss(username) {
    const ps = this._findOrCreate(username);
    ps.losses++;
    ps.gamesPlayed++;
    ps.currentStreak = 0;
  },

  recordTowerScore(username, height) {
    const ps = this._findOrCreate(username);
    if (height > ps.towerBest) ps.towerBest = height;
  },

  recordReactionTime(username, ms) {
    const ps = this._findOrCreate(username);
    if (ps.reactionBest === 0 || ms < ps.reactionBest) ps.reactionBest = ms;
  },

  async save() {
    if (!_supabase) return;
    for (const ps of _entries) {
      if (!ps.active) continue;
      try {
        await _supabase.from('leaderboard').upsert({
          username: ps.username,
          wins: ps.wins,
          losses: ps.losses,
          games_played: ps.gamesPlayed,
          current_streak: ps.currentStreak,
          max_streak: ps.maxStreak,
          tower_best: ps.towerBest,
          reaction_best: ps.reactionBest,
        }, { onConflict: 'username' });
      } catch (e) {
        console.error('Leaderboard save error:', e.message);
      }
    }
  },

  async recordArcadeScore(username, game, score) {
    if (!_supabase) return;
    try {
      const { data } = await _supabase
        .from('arcade_scores')
        .select('score')
        .eq('username', username)
        .eq('game', game)
        .single();
      if (data && data.score >= score) return;
      await _supabase.from('arcade_scores').upsert(
        { username, game, score, created_at: new Date().toISOString() },
        { onConflict: 'username,game' }
      );
    } catch (e) {
      if (e.code === 'PGRST116') {
        await _supabase.from('arcade_scores').insert({ username, game, score });
      } else {
        console.error('Arcade score error:', e.message);
      }
    }
  },

  async getArcadeLeaderboard(game) {
    if (!_supabase) return [];
    try {
      const { data } = await _supabase
        .from('arcade_scores')
        .select('username, score')
        .eq('game', game)
        .order('score', { ascending: false })
        .limit(20);
      return (data || []).map((r, i) => ({ r: i + 1, u: r.username, s: r.score }));
    } catch (e) {
      console.error('Arcade leaderboard error:', e.message);
      return [];
    }
  },

  serialize() {
    const active = _entries.filter(e => e.active && e.gamesPlayed > 0);
    active.sort((a, b) => b.wins - a.wins);
    return active.map((ps, i) => {
      const obj = {
        r: i + 1, u: ps.username, w: ps.wins, l: ps.losses,
        g: ps.gamesPlayed, cs: ps.currentStreak, ms: ps.maxStreak,
      };
      if (ps.towerBest > 0) obj.tb = ps.towerBest;
      if (ps.reactionBest > 0) obj.rt = ps.reactionBest;
      return obj;
    });
  },
};

module.exports = Leaderboard;
