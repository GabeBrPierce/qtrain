const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../worker/src/beacon.js');
const R = require('../worker/src/rank.js');

const CLOSE = Date.UTC(2026, 9, 30, 14, 35);
const pulse = timeMs => ({ pulseIndex: 1, timeMs, outputValue: 'C8263F00' });

test('parsePulse reads index, time and outputValue', () => {
  const p = B.parsePulse({ pulse: { pulseIndex: 2005868, timeStamp: '2026-10-30T13:30:00.000Z', outputValue: '121C32' } });
  assert.deepEqual(p, { pulseIndex: 2005868, timeMs: Date.UTC(2026, 9, 30, 13, 30), outputValue: '121C32' });
});

test('choosePulse ok at close and at the window edge', () => {
  assert.equal(B.choosePulse(CLOSE, pulse(CLOSE), CLOSE + 5000).status, 'ok');
  assert.equal(B.choosePulse(CLOSE, pulse(CLOSE + 240000), CLOSE + 250000).status, 'ok');
});

test('choosePulse voids a pulse past the window', () => {
  assert.equal(B.choosePulse(CLOSE, pulse(CLOSE + 240001), CLOSE + 300000).status, 'void');
});

test('choosePulse waits for a missing pulse inside the window', () => {
  assert.equal(B.choosePulse(CLOSE, null, CLOSE + 60000).status, 'wait');
});

test('choosePulse keeps waiting while in-window pulses may still be publishing', () => {
  assert.equal(B.choosePulse(CLOSE, null, CLOSE + 240001).status, 'wait');
  assert.equal(B.choosePulse(CLOSE, null, CLOSE + 360000).status, 'wait');
});

test('choosePulse voids a missing pulse after the window plus publish allowance', () => {
  assert.equal(B.choosePulse(CLOSE, null, CLOSE + 360001).status, 'void');
});

test('fetchPulseFrom passes a timeout signal', async () => {
  let opts;
  await B.fetchPulseFrom(CLOSE, (u, o) => { opts = o; return Promise.resolve({ ok: false, status: 404 }); });
  assert.ok(opts.signal instanceof AbortSignal);
});

test('choosePulse ignores a pulse from before the close', () => {
  assert.equal(B.choosePulse(CLOSE, pulse(CLOSE - 60000), CLOSE + 1000).status, 'wait');
});

test('fetchPulseFrom asks for the first pulse at or after close', async () => {
  let url;
  const body = { pulse: { pulseIndex: 7, timeStamp: new Date(CLOSE).toISOString(), outputValue: 'AABBCC' } };
  const p = await B.fetchPulseFrom(CLOSE, u => { url = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }); });
  assert.equal(url, 'https://beacon.nist.gov/beacon/2.0/pulse/time/next/' + (CLOSE - 1));
  assert.equal(p.pulseIndex, 7);
});

test('fetchPulseFrom returns null on 404 and on network error', async () => {
  assert.equal(await B.fetchPulseFrom(CLOSE, () => Promise.resolve({ ok: false, status: 404 })), null);
  assert.equal(await B.fetchPulseFrom(CLOSE, () => Promise.reject(new Error('down'))), null);
});

test('rankPicks orders by closeness then earlier submit', () => {
  const ranked = R.rankPicks([
    { playerId: 'a', hex: '#000000', submittedAt: 5 },
    { playerId: 'b', hex: '#C8263F', submittedAt: 9 },
    { playerId: 'c', hex: '#C8263F', submittedAt: 3 },
  ], [200, 38, 63]);
  assert.deepEqual(ranked.map(r => r.playerId), ['c', 'b', 'a']);
  assert.deepEqual(ranked.map(r => r.rank), [1, 2, 3]);
  assert.equal(ranked[0].closeness, 100);
});

const { createD1 } = require('./d1-fake.js');
const DB = require('../worker/src/db.js');
const routes = require('../worker/src/routes.js');
const RID = Date.UTC(2026, 9, 30, 14, 35);
const save = (d, id, hex, at) => DB.savePick(d, { playerId: id, nickname: id.toUpperCase(), roundId: RID, hex, submittedAt: at, dayKey: '2026-10-30', weekKey: '2026-W44' });

test('live picks are refused before you pick', async () => {
  const d = createD1();
  await save(d, 'alpha-1234', '#112233', 1);
  const r = await routes.handleLivePicks({ DB: d }, RID, 'beta-5678');
  assert.equal(r.status, 403);
  assert.equal(r.body.picks, undefined);
  assert.equal((await routes.handleLivePicks({ DB: d }, RID, null)).status, 403);
});

test('live picks list everyone once you pick, with your own marked', async () => {
  const d = createD1();
  await save(d, 'alpha-1234', '#112233', 2);
  await save(d, 'beta-5678', '#445566', 1);
  const r = await routes.handleLivePicks({ DB: d }, RID, 'alpha-1234');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.picks.map(p => [p.nickname, p.tag, p.hex, p.mine]), [['BETA-5678', 'beta', '#445566', false], ['ALPHA-1234', 'alph', '#112233', true]]);
  assert.ok(!JSON.stringify(r.body).includes('"beta-5678"') && !JSON.stringify(r.body).includes('"alpha-1234"'), 'no full player ids');
});

test('round stats are pending until scored, then carry the band', async () => {
  const d = createD1();
  assert.equal((await routes.handleStats({ DB: d }, ['stats', 'round', String(RID)])).body.status, 'none');
  await save(d, 'alpha-1234', '#112233', 1);
  assert.equal((await routes.handleStats({ DB: d }, ['stats', 'round', String(RID)])).body.status, 'pending');
  await DB.resolveRound(d, RID, 9, '#112233', [], RID + 90000, '#FFFFFF');
  await DB.saveStats(d, RID, { n: 1, qMean: 0.9, pMean: 0.2, nullVar: 1 / 12, q: [0.9], p: [0.2] }, await DB.roundPicks(d, RID));
  const b = (await routes.handleStats({ DB: d }, ['stats', 'round', String(RID)])).body;
  assert.deepEqual([b.status, b.n, b.quantum, b.algorithm], ['ready', 1, 90, 20]);
  assert.ok(b.band[0] < 50 && b.band[1] > 50);
});

test('all stats are empty-safe', async () => {
  const r = await routes.handleStats({ DB: createD1() }, ['stats', 'all']);
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.rounds, r.body.quantum, r.body.series.length], [0, null, 0]);
});

test('unknown stats paths are not found', async () => {
  assert.equal((await routes.handleStats({ DB: createD1() }, ['stats', 'week'])).status, 404);
});

test('a round being scored reads as pending, not as ready', async () => {
  const d = createD1();
  await save(d, 'alpha-1234', '#112233', 1);
  await DB.resolveRound(d, RID, 9, '#112233', [], RID + 90000, '#FFFFFF');
  await DB.claimStats(d, RID);
  assert.equal((await routes.handleStats({ DB: d }, ['stats', 'round', String(RID)])).body.status, 'pending');
});
