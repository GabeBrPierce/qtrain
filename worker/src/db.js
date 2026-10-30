// D1 queries. Every function takes the D1 binding first.

function savePick(db, pick) {
  return db.batch([
    db.prepare('INSERT INTO players (id, nickname, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET nickname = ?2')
      .bind(pick.playerId, pick.nickname, pick.submittedAt),
    db.prepare('INSERT OR IGNORE INTO rounds (round_id, day_key, week_key) VALUES (?1, ?2, ?3)')
      .bind(pick.roundId, pick.dayKey, pick.weekKey),
    db.prepare('INSERT OR IGNORE INTO picks (round_id, player_id, hex, submitted_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(pick.roundId, pick.playerId, pick.hex, pick.submittedAt),
  ]).then(results => results[2].meta.changes === 1);
}

function getRound(db, roundId) {
  return db.prepare('SELECT * FROM rounds WHERE round_id = ?1').bind(roundId).first();
}

function countPicks(db, roundId) {
  return db.prepare('SELECT COUNT(*) AS n FROM picks WHERE round_id = ?1').bind(roundId).first('n');
}

function topPicks(db, roundId, limit) {
  return db.prepare(
    'SELECT p.player_id, pl.nickname, p.hex, p.closeness, p.rank FROM picks p JOIN players pl ON pl.id = p.player_id ' +
    'WHERE p.round_id = ?1 AND p.rank IS NOT NULL ORDER BY p.rank LIMIT ?2'
  ).bind(roundId, limit).all().then(r => r.results);
}

function playerPick(db, roundId, playerId) {
  return db.prepare('SELECT hex, closeness, rank FROM picks WHERE round_id = ?1 AND player_id = ?2')
    .bind(roundId, playerId).first();
}

function dueRounds(db, nowMs) {
  return db.prepare("SELECT round_id FROM rounds WHERE status = 'open' AND round_id <= ?1 ORDER BY round_id")
    .bind(nowMs).all().then(r => r.results.map(x => x.round_id));
}

function roundPicks(db, roundId) {
  return db.prepare('SELECT player_id AS playerId, hex, submitted_at AS submittedAt FROM picks WHERE round_id = ?1')
    .bind(roundId).all().then(r => r.results);
}

function resolveRound(db, roundId, pulseIndex, hex, ranked, nowMs) {
  const stmts = ranked.map(p =>
    db.prepare('UPDATE picks SET closeness = ?1, rank = ?2 WHERE round_id = ?3 AND player_id = ?4')
      .bind(p.closeness, p.rank, roundId, p.playerId));
  stmts.push(db.prepare("UPDATE rounds SET status = 'resolved', pulse_index = ?1, hex = ?2, resolved_at = ?3 WHERE round_id = ?4")
    .bind(pulseIndex, hex, nowMs, roundId));
  return db.batch(stmts);
}

function voidRound(db, roundId, nowMs) {
  return db.prepare("UPDATE rounds SET status = 'void', resolved_at = ?1 WHERE round_id = ?2").bind(nowMs, roundId).run();
}

// Each player's best resolved pick in the period, ranked; top `limit` plus the given player.
function board(db, column, key, playerId, limit) {
  const where = column ? `AND r.${column} = ?3` : '';
  const sql =
    'WITH best AS (SELECT p.player_id, p.hex, p.closeness, p.round_id, p.submitted_at, ' +
    'ROW_NUMBER() OVER (PARTITION BY p.player_id ORDER BY p.closeness DESC, p.submitted_at ASC) AS rn ' +
    `FROM picks p JOIN rounds r ON r.round_id = p.round_id WHERE r.status = 'resolved' ${where}), ` +
    'ranked AS (SELECT *, ROW_NUMBER() OVER (ORDER BY closeness DESC, submitted_at ASC) AS rank FROM best WHERE rn = 1) ' +
    'SELECT ranked.player_id, pl.nickname, ranked.hex, ranked.closeness, ranked.round_id, ranked.rank ' +
    'FROM ranked JOIN players pl ON pl.id = ranked.player_id WHERE ranked.rank <= ?1 OR ranked.player_id = ?2 ORDER BY ranked.rank';
  const stmt = db.prepare(sql);
  return (column ? stmt.bind(limit, playerId || '', key) : stmt.bind(limit, playerId || '')).all().then(r => r.results);
}

module.exports = { savePick, getRound, countPicks, topPicks, playerPick, dueRounds, roundPicks, resolveRound, voidRound, board };
