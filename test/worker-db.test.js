const test = require('node:test');
const assert = require('node:assert/strict');
const { createD1 } = require('./d1-fake.js');
const db = require('../worker/src/db.js');

const R = Date.UTC(2026, 9, 30, 14, 35);
const pick = (playerId, roundId, hex, submittedAt) =>
  ({ playerId, nickname: playerId.toUpperCase(), roundId, hex, submittedAt, dayKey: '2026-10-30', weekKey: '2026-W44' });

test('a voided round cannot be resolved by a late run', async () => {
  const d = createD1();
  await db.savePick(d, pick('alpha', R, '#C8263F', 1));
  await db.voidRound(d, R, R + 400000);
  await db.resolveRound(d, R, 9, '#C8263F', [{ playerId: 'alpha', closeness: 100, rank: 1 }], R + 401000);
  assert.equal((await db.getRound(d, R)).status, 'void');
  assert.equal((await db.playerPick(d, R, 'alpha')).rank, null);
});

test('a resolved round cannot be voided by a late run', async () => {
  const d = createD1();
  await db.savePick(d, pick('alpha', R, '#C8263F', 1));
  await db.resolveRound(d, R, 9, '#C8263F', [{ playerId: 'alpha', closeness: 100, rank: 1 }], R + 90000);
  await db.voidRound(d, R, R + 400000);
  assert.equal((await db.getRound(d, R)).status, 'resolved');
});

test('second pick for the same round is rejected', async () => {
  const d = createD1();
  assert.equal(await db.savePick(d, pick('alpha', R, '#C8263F', 1)), true);
  assert.equal(await db.savePick(d, pick('alpha', R, '#000000', 2)), false);
});

test('board keeps each player best resolved pick and skips void rounds', async () => {
  const d = createD1();
  const R2 = R + 300000, R3 = R + 600000;
  await db.savePick(d, pick('alpha', R, '#000000', 1));
  await db.savePick(d, pick('alpha', R2, '#000000', 2));
  await db.savePick(d, pick('bravo', R2, '#000000', 3));
  await db.savePick(d, pick('bravo', R3, '#000000', 4));
  await db.resolveRound(d, R, 1, '#000000', [{ playerId: 'alpha', closeness: 50, rank: 1 }], R + 90000);
  await db.resolveRound(d, R2, 2, '#000000', [{ playerId: 'alpha', closeness: 80, rank: 1 }, { playerId: 'bravo', closeness: 70, rank: 2 }], R2 + 90000);
  await db.voidRound(d, R3, R3 + 400000);
  const rows = await db.board(d, 'day_key', '2026-10-30', 'bravo', 10);
  assert.deepEqual(rows.map(r => [r.player_id, r.closeness, r.rank]), [['alpha', 80, 1], ['bravo', 70, 2]]);
});

const scoring = require('../worker/src/scoring.js');
const stats = { n: 2, qMean: 0.6, pMean: 0.4, nullVar: 0.05, q: [0.7, 0.5], p: [0.3, 0.5] };

test('resolveRound stores the PRNG color', async () => {
  const d = createD1();
  await db.savePick(d, pick('alpha', R, '#C8263F', 1));
  await db.resolveRound(d, R, 9, '#C8263F', [{ playerId: 'alpha', closeness: 100, rank: 1 }], R + 90000, '#112233');
  assert.equal((await db.getRound(d, R)).prng_hex, '#112233');
});

test('rounds needing stats are resolved and unscored', async () => {
  const d = createD1();
  const R2 = R + 300000, R3 = R + 600000;
  await db.savePick(d, pick('alpha', R, '#C8263F', 1));
  await db.savePick(d, pick('alpha', R2, '#C8263F', 2));
  await db.savePick(d, pick('alpha', R3, '#C8263F', 3));
  await db.resolveRound(d, R, 9, '#C8263F', [{ playerId: 'alpha', closeness: 100, rank: 1 }], R + 90000, '#112233');
  await db.voidRound(d, R2, R2 + 400000);
  assert.deepEqual(await db.roundsNeedingStats(d, 10), [R]);
  await db.saveStats(d, R, Object.assign({}, stats, { n: 1, q: [0.7], p: [0.3] }), await db.roundPicks(d, R));
  assert.deepEqual(await db.roundsNeedingStats(d, 10), []);
});

test('saveStats stores per-pick chance scores', async () => {
  const d = createD1();
  await db.savePick(d, pick('alpha', R, '#C8263F', 1));
  await db.savePick(d, pick('beta', R, '#00FF00', 2));
  await db.resolveRound(d, R, 9, '#C8263F', [], R + 90000, '#112233');
  const picks = await db.roundPicks(d, R);
  await db.saveStats(d, R, stats, picks);
  const row = d.raw.prepare('SELECT chance_q, chance_p FROM picks WHERE round_id = ? AND player_id = ?').get(R, picks[0].playerId);
  assert.deepEqual([row.chance_q, row.chance_p], [0.7, 0.3]);
});

test('statsRows skips unscored and empty rounds and keeps null pMean', async () => {
  const d = createD1();
  const R2 = R + 300000, R3 = R + 600000;
  for (const r of [R, R2, R3]) {
    await db.savePick(d, pick('alpha', r, '#C8263F', r));
    await db.resolveRound(d, r, 9, '#C8263F', [], r + 90000, null);
  }
  await db.saveStats(d, R, { n: 1, qMean: 0.6, pMean: null, nullVar: 0.08, q: [0.6], p: null }, await db.roundPicks(d, R));
  await db.saveStats(d, R3, { n: 0, qMean: null, pMean: null, nullVar: 0, q: [], p: null }, []);
  assert.deepEqual((await db.statsRows(d)).map(r => ({ ...r })), [{ roundId: R, n: 1, qMean: 0.6, pMean: null, nullVar: 0.08 }]);
  assert.equal((await db.roundStatsRow(d, R)).status, 'resolved');
  assert.equal(await db.roundStatsRow(d, 1), null);
});

test('scoreDue backfills an old round without a PRNG color', async () => {
  const d = createD1();
  await db.savePick(d, pick('alpha', R, '#C8263F', 1));
  await db.resolveRound(d, R, 9, '#C02040', [], R + 90000);
  assert.equal(await scoring.scoreDue(d), 1);
  const row = await db.roundStatsRow(d, R);
  assert.ok(row.qMean > 0.9);
  assert.equal(row.pMean, null);
  assert.equal(row.n, 1);
});
