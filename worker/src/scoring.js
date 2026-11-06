const { fromHex } = require('../../app/js/core.js');
const { roundStats } = require('./chance.js');
const db = require('./db.js');

// Scores resolved rounds that have no stats yet, oldest first: new rounds and, after the stats
// migration, every older one. Stops early once enough picks are scored to stay inside the cron's CPU time.
async function scoreDue(d, maxRounds = 10, maxPicks = 400) {
  let rounds = 0, picks = 0;
  for (const id of await db.roundsNeedingStats(d, maxRounds)) {
    const round = await db.getRound(d, id);
    const rows = await db.roundPicks(d, id);
    const stats = roundStats(rows.map(p => fromHex(p.hex)), fromHex(round.hex), round.prng_hex ? fromHex(round.prng_hex) : null);
    await db.saveStats(d, id, stats, rows);
    rounds++;
    picks += rows.length;
    if (picks >= maxPicks) break;
  }
  return rounds;
}

module.exports = { scoreDue };
