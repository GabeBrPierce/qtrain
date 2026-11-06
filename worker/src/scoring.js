const { fromHex } = require('../../app/js/core.js');
const { roundStats } = require('./chance.js');
const db = require('./db.js');

// Scores resolved rounds that have no stats yet, oldest first: new rounds and, after the stats
// migration, every older one. A run scores at most maxPicks picks (scoring costs CPU per pick) and leaves
// the rest for the next minute; a round bigger than that is scored alone. Each round is claimed first, so
// a run killed mid-round loses that round's stats instead of blocking every later round.
async function scoreDue(d, maxRounds = 10, maxPicks = 400) {
  let rounds = 0, picks = 0;
  for (const id of await db.roundsNeedingStats(d, maxRounds)) {
    const rows = await db.roundPicks(d, id);
    if (rounds && picks + rows.length > maxPicks) break;
    if (!(await db.claimStats(d, id))) continue;
    const round = await db.getRound(d, id);
    const stats = roundStats(rows.map(p => fromHex(p.hex)), fromHex(round.hex), round.prng_hex ? fromHex(round.prng_hex) : null);
    await db.saveStats(d, id, stats, rows);
    rounds++;
    picks += rows.length;
  }
  return rounds;
}

module.exports = { scoreDue };
