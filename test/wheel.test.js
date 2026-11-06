const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../app/js/wheel.js');

test('hue ring starts red at the top', () => {
  assert.deepEqual(W.hueRgb(0), [255, 0, 0]);
  assert.deepEqual(W.hueRgb(1 / 3), [0, 255, 0]);
});

test('shade ring hits its anchors', () => {
  assert.deepEqual(W.shadeRgb(0, 0.25), W.hsl(0, 1, 0.5));
  assert.deepEqual(W.shadeRgb(0, 0), W.hsl(0, 0.9, 0.88));
  assert.deepEqual(W.shadeRgb(0, 0.5), W.hsl(0, 0.9, 0.14));
  assert.deepEqual(W.shadeRgb(0, 0.75), W.hsl(0, 0.25, 0.5));
  assert.deepEqual(W.shadeRgb(0, 0.999999), W.shadeRgb(0, 0));
});

test('fracAt wraps each lap', () => {
  assert.equal(W.fracAt(0, 3600), 0.5);
  assert.equal(W.fracAt(1000, 1000 + W.LAP_MS * 3), 0);
});

test('press uses the press time, not a frame time', () => {
  const w = W.create();
  w.start(0);
  assert.equal(w.phase(), 'hue');
  assert.equal(w.press(600), 'shade');
  assert.equal(w.current(), null);
  assert.equal(w.press(2400), 'review');
  assert.deepEqual(w.current(), W.shadeRgb(0.25, 0.75));
});

test('preview follows the line in each spin', () => {
  const w = W.create();
  w.start(0);
  assert.deepEqual(w.preview(1200), W.hueRgb(0.5));
  w.press(1200);
  assert.deepEqual(w.preview(1200 + 600), W.shadeRgb(0.5, 0.25));
});

test('back returns to the hue spin and clears the guess', () => {
  const w = W.create();
  w.start(0);
  assert.equal(w.back(10), false);
  w.press(600); w.press(1200);
  assert.equal(w.back(5000), true);
  assert.equal(w.phase(), 'hue');
  assert.equal(w.current(), null);
  assert.equal(W.fracAt(5000, 5600), 0.25);
});

test('place puts pale colors near the center and dark ones at the rim', () => {
  assert.ok(W.place([240, 240, 255]).r < 0.2);
  assert.ok(W.place([30, 0, 0]).r > 0.85);
  assert.ok(Math.abs(W.place([0, 255, 0]).frac - 1 / 3) < 0.01);
});
