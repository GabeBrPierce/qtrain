const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../worker/src/chance.js');

// Exact share of all 2^24 colors farther from p than t is (ties half), counted per (r, g) column.
function exact(p, t) {
  const d = (p[0] - t[0]) ** 2 + (p[1] - t[1]) ** 2 + (p[2] - t[2]) ** 2;
  let farther = 0, ties = 0;
  for (let r = 0; r < 256; r++) for (let g = 0; g < 256; g++) {
    const x = d - (r - p[0]) ** 2 - (g - p[1]) ** 2;
    if (x < 0) { farther += 256; continue; }
    const s = Math.floor(Math.sqrt(x));
    const inside = Math.min(255, p[2] + s) - Math.max(0, p[2] - s) + 1;
    let eq = 0;
    if (s * s === x) eq = s === 0 ? 1 : (p[2] - s >= 0 ? 1 : 0) + (p[2] + s <= 255 ? 1 : 0);
    farther += 256 - inside;
    ties += eq;
  }
  return (farther + ties / 2) / 16777216;
}

test('chance matches an exact count within half a point', () => {
  [[[0, 0, 0], [255, 255, 255]], [[128, 128, 128], [130, 140, 120]], [[20, 200, 90], [180, 60, 140]]].forEach(([p, t]) => {
    const a = C.chance(p, t), e = exact(p, t);
    assert.ok(Math.abs(a - e) < 0.005, `${p} vs ${t}: grid ${a}, exact ${e}`);
  });
});

test('chance of the pick itself is about 1', () => {
  assert.ok(C.chance([10, 20, 30], [10, 20, 30]) > 0.99);
});

test('nullVar of one pick is about 1/12', () => {
  assert.ok(Math.abs(C.nullVar([[90, 40, 200]]) - 1 / 12) < 0.006);
});

test('identical picks do not shrink the band', () => {
  const one = C.nullVar([[90, 40, 200]]);
  assert.ok(Math.abs(C.nullVar(Array(10).fill([90, 40, 200])) - one) < 1e-12);
});

test('spread picks shrink the band', () => {
  assert.ok(C.nullVar([[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 255]]) < 1 / 12 / 2);
});

test('nullVar of no picks is 0', () => {
  assert.equal(C.nullVar([]), 0);
});

test('roundStats leaves p null without a PRNG color', () => {
  const s = C.roundStats([[10, 20, 30], [200, 100, 50]], [12, 22, 28], null);
  assert.equal(s.n, 2);
  assert.equal(s.pMean, null);
  assert.equal(s.p, null);
  assert.equal(s.q.length, 2);
  assert.ok(s.qMean > 0 && s.qMean < 1);
});

test('roundStats scores the PRNG color like the quantum one', () => {
  const s = C.roundStats([[10, 20, 30]], [12, 22, 28], [12, 22, 28]);
  assert.equal(s.pMean, s.qMean);
});

test('summary weights rounds by picks and skips missing algorithm', () => {
  const s = C.summary([
    { roundId: 1, n: 1, qMean: 1, pMean: null, nullVar: 1 / 12 },
    { roundId: 2, n: 3, qMean: 0.5, pMean: 0.5, nullVar: 0.01 },
  ]);
  assert.equal(s.rounds, 2);
  assert.equal(s.picks, 4);
  assert.equal(s.quantum, 62.5);
  assert.equal(s.algorithm, 50);
  assert.equal(s.algorithmRounds, 1);
  assert.equal(s.algorithmSince, 2);
  assert.ok(s.band[0] < 50 && s.band[1] > 50);
  assert.equal(s.series[0].a, null);
});

test('summary caps the series at 40 points and keeps the last', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ roundId: i + 1, n: 2, qMean: 0.5, pMean: 0.5, nullVar: 0.04 }));
  const s = C.summary(rows);
  assert.equal(s.series.length, 40);
  assert.equal(s.series[39].t, 100);
  assert.equal(s.series[0].t, 1);
});

test('summary of nothing is empty-safe', () => {
  assert.deepEqual(C.summary([]), { rounds: 0, picks: 0, quantum: null, algorithm: null, algorithmRounds: 0, algorithmSince: null, band: null, series: [] });
});

test('bandFor centers on 50 and widens with variance', () => {
  const a = C.bandFor(1, 1 / 12), b = C.bandFor(4, 0.01);
  assert.ok(a[0] < b[0] && a[1] > b[1]);
  assert.equal(Math.round((a[0] + a[1]) / 2), 50);
});

test('bands never leave 0..100', () => {
  assert.deepEqual(C.bandFor(1, 0.09), [0, 100]);
  const s = C.summary([{ roundId: 1, n: 1, qMean: 0.8, pMean: null, nullVar: 0.09 }]);
  assert.deepEqual([s.series[0].lo, s.series[0].hi, s.band[0], s.band[1]], [0, 100, 0, 100]);
});
