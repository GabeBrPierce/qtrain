const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/js/core.js');
const P = require('../app/js/picker.js');

test('starts empty with base options and no undo', () => {
  const p = P.create();
  assert.equal(p.depth(), 0);
  assert.equal(p.current(), null);
  assert.equal(p.canUndo(), false);
  assert.deepEqual(p.options(), C.BASE);
});

test('first press picks a base color', () => {
  const p = P.create();
  assert.equal(p.press(1), true);
  assert.deepEqual(p.current(), [200, 30, 50]);
  assert.equal(p.depth(), 1);
  assert.equal(p.canUndo(), true);
});

test('key 5 after the first pick is a no-op', () => {
  const p = P.create();
  p.press(1);
  assert.equal(p.press(5), false);
  assert.equal(p.depth(), 1);
  assert.deepEqual(p.current(), [200, 30, 50]);
});

test('key 3 at depth 1 adds 32 red', () => {
  const p = P.create();
  p.press(1);
  p.press(3);
  assert.deepEqual(p.current(), [232, 30, 50]);
  assert.equal(p.step(), C.stepAt(2));
});

test('undo restores the previous color and stops at depth 0', () => {
  const p = P.create();
  p.press(1);
  p.press(3);
  assert.equal(p.undo(), true);
  assert.deepEqual(p.current(), [200, 30, 50]);
  assert.equal(p.undo(), true);
  assert.equal(p.current(), null);
  assert.equal(p.undo(), false);
});

test('reset clears the drill', () => {
  const p = P.create();
  p.press(2);
  p.press(9);
  p.reset();
  assert.equal(p.depth(), 0);
  assert.equal(p.canUndo(), false);
});

test('rejects keys outside 1..9', () => {
  const p = P.create();
  assert.equal(p.press(0), false);
  assert.equal(p.press(10), false);
  assert.equal(p.depth(), 0);
});
