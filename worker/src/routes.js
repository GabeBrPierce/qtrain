const db = require('./db.js');
const chance = require('./chance.js');

// Stats and live-pick reads. Each returns { status, body }; index.js turns that into a Response.
// CommonJS so the node tests can load it (index.js is an ES module).

const pct = x => (x == null ? null : Math.round(x * 1000) / 10);

async function roundStats(d, roundId) {
  const row = await db.roundStatsRow(d, roundId);
  if (!row) return { roundId, status: 'none' };
  if (row.status === 'void') return { roundId, status: 'void' };
  if (row.status !== 'resolved' || row.n == null || row.n < 0) return { roundId, status: 'pending' }; // -1: being scored
  return { roundId, status: 'ready', n: row.n, quantum: pct(row.qMean), algorithm: pct(row.pMean), band: chance.bandFor(row.n, row.nullVar) };
}

async function handleStats(env, parts) {
  if (parts[1] === 'all' && parts.length === 2) return { status: 200, body: chance.summary(await db.statsRows(env.DB)) };
  if (parts[1] === 'round' && /^\d+$/.test(parts[2] || '') && parts.length === 3) return { status: 200, body: await roundStats(env.DB, Number(parts[2])) };
  return { status: 404, body: { error: 'not_found' } };
}

const LIVE_LIMIT = 200;

// Everyone's picks so far, but only for a player who has already picked in this round.
async function handleLivePicks(env, roundId, playerId) {
  if (!playerId || !(await db.playerPick(env.DB, roundId, playerId))) return { status: 403, body: { error: 'pick_first' } };
  const rows = await db.livePicks(env.DB, roundId, LIVE_LIMIT);
  return {
    status: 200,
    body: {
      roundId,
      picks: rows.map(r => ({ nickname: r.nickname, tag: r.player_id.slice(0, 4), hex: r.hex, submittedAt: r.submitted_at, mine: r.player_id === playerId })),
    },
  };
}

module.exports = { handleStats, handleLivePicks };
