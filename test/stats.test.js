const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../app/js/stats.js');

test('verdict inside the band', () => {
  assert.equal(S.verdict('Quantum', 54.1, [40, 60]), 'Quantum 54.1%: inside the chance band, so no different from chance.');
});

test('verdict above and below the band', () => {
  assert.equal(S.verdict('Quantum', 61, [40, 60]), 'Quantum 61%: above the chance band: closer than chance usually gives.');
  assert.equal(S.verdict('Algorithm', 39.9, [40, 60]), 'Algorithm 39.9%: below the chance band: farther than chance usually gives.');
});

test('verdict with no value', () => {
  assert.equal(S.verdict('Algorithm', null, [40, 60]), 'Algorithm: not available yet.');
});

test('scale covers 50 and every value, padded 2', () => {
  assert.deepEqual(S.scale([45, 55, 52, null]), { min: 43, max: 57 });
  assert.deepEqual(S.scale([60, 70]), { min: 48, max: 72 });
});

test('scale clamps to 0..100', () => {
  assert.deepEqual(S.scale([0, 100]), { min: 0, max: 100 });
});
