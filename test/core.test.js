const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/js/core.js');

test('step shrinks then floors at 1', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(C.stepAt), [32, 19, 12, 7, 4, 3, 2, 1, 1, 1]);
});

test('optionsFor layout matches the keypad', () => {
  const o = C.optionsFor([100, 100, 100], 1);
  assert.deepEqual(o, [
    [68, 100, 100], [132, 132, 132], [132, 100, 100],
    [100, 68, 100], [100, 100, 100], [100, 132, 100],
    [100, 100, 68], [68, 68, 68], [100, 100, 132],
  ]);
});

test('optionsFor clamps channels to 0..255 integers', () => {
  const o = C.optionsFor([0, 255, 3], 2);
  o.forEach(c => c.forEach(v => assert.ok(v >= 0 && v <= 255 && Number.isInteger(v), String(v))));
});

test('optionsFor deep in the drill stays valid', () => {
  const o = C.optionsFor([255, 0, 128], 30);
  assert.equal(o[2][0], 255);
  assert.equal(o[0][0], 254);
  o.forEach(c => assert.match(C.toHex(c), /^#[0-9A-F]{6}$/));
});

test('optionsFor null returns the base colors', () => {
  assert.deepEqual(C.optionsFor(null, 0), C.BASE);
});

test('hex round trip', () => {
  assert.equal(C.toHex([251, 37, 62]), '#FB253E');
  assert.equal(C.toHex([0, 5, 255]), '#0005FF');
  assert.deepEqual(C.fromHex('#fb253e'), [251, 37, 62]);
});

test('closeness', () => {
  assert.equal(C.closeness([0, 0, 0], [0, 0, 0]), 100);
  assert.equal(C.closeness([0, 0, 0], [255, 255, 255]), 0);
  assert.equal(C.closeness([200, 30, 50], [200, 30, 60]), 97.7);
});

test('rgbFromOutputValue takes the first three bytes', () => {
  assert.deepEqual(C.rgbFromOutputValue('121C32B429C5'), [0x12, 0x1c, 0x32]);
});

test('openRoundFor', () => {
  const close = Date.UTC(2026, 9, 30, 14, 35);
  assert.equal(C.openRoundFor(close - 120000), close);
  assert.equal(C.openRoundFor(close - 10001), close);
  assert.equal(C.openRoundFor(close - 10000), close + 300000);
  assert.equal(C.openRoundFor(close), close + 300000);
});

test('day and week keys', () => {
  assert.equal(C.dayKey(Date.UTC(2026, 9, 30, 23, 59)), '2026-10-30');
  assert.equal(C.weekKey(Date.UTC(2026, 9, 30)), '2026-W44');
  assert.equal(C.weekKey(Date.UTC(2027, 0, 1)), '2026-W53');
  assert.equal(C.weekKey(Date.UTC(2026, 0, 5)), '2026-W02');
});
