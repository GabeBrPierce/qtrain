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
