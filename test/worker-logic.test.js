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

test('choosePulse voids a missing pulse after the window', () => {
  assert.equal(B.choosePulse(CLOSE, null, CLOSE + 240001).status, 'void');
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
