const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/js/player.js');

function memStorage() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
}

test('id is a v4 uuid and stable across loads', () => {
  const s = memStorage();
  const a = P.create(s).id();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(P.create(s).id(), a);
});

test('nickname validation', () => {
  assert.equal(P.validNickname('ab'), false);
  assert.equal(P.validNickname('zed'), true);
  assert.equal(P.validNickname('ZED!'), false);
  assert.equal(P.validNickname('ABCDEFGHIJKLM'), false);
  assert.equal(P.validNickname('ABCDEFGHIJKL'), true);
});

test('setNickname uppercases and persists, rejects invalid', () => {
  const s = memStorage();
  const p = P.create(s);
  assert.equal(p.nickname(), null);
  assert.equal(p.setNickname('zed'), true);
  assert.equal(P.create(s).nickname(), 'ZED');
  assert.equal(p.setNickname('no'), false);
  assert.equal(p.nickname(), 'ZED');
});

test('streak counts consecutive days', () => {
  const p = P.create(memStorage());
  assert.equal(p.streak(), 0);
  p.recordCompetitive('2026-10-29');
  p.recordCompetitive('2026-10-30');
  assert.equal(p.streak(), 2);
  p.recordCompetitive('2026-10-30');
  assert.equal(p.streak(), 2);
  p.recordCompetitive('2026-11-02');
  assert.equal(p.streak(), 1);
});

test('streak crosses month boundaries', () => {
  const p = P.create(memStorage());
  p.recordCompetitive('2026-10-31');
  p.recordCompetitive('2026-11-01');
  assert.equal(p.streak(), 2);
});

test('adTick fires every third call and persists', () => {
  const s = memStorage();
  const p = P.create(s);
  assert.deepEqual([p.adTick(), p.adTick(), p.adTick(), p.adTick()], [false, false, true, false]);
  const q = P.create(s);
  assert.deepEqual([q.adTick(), q.adTick()], [false, true]);
});

test('practice history keeps last 20, newest first, and tracks best', () => {
  const p = P.create(memStorage());
  assert.equal(p.practiceBest(), null);
  for (let i = 1; i <= 25; i++) p.recordPractice(i);
  const h = p.practiceHistory();
  assert.equal(h.length, 20);
  assert.equal(h[0], 25);
  assert.equal(p.practiceBest(), 25);
});

test('pending pick round trip', () => {
  const s = memStorage();
  const p = P.create(s);
  assert.equal(p.pending(), null);
  p.setPending({ roundId: 1793367000000, hex: '#FB253E' });
  assert.deepEqual(P.create(s).pending(), { roundId: 1793367000000, hex: '#FB253E' });
  p.setPending(null);
  assert.equal(P.create(s).pending(), null);
});

test('works when storage throws', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const p = P.create(bad);
  assert.ok(p.id());
  assert.equal(p.id(), p.id());
  assert.equal(p.setNickname('zed'), true);
  assert.equal(p.nickname(), 'ZED');
  p.recordCompetitive('2026-10-30');
  assert.equal(p.streak(), 1);
  assert.deepEqual([p.adTick(), p.adTick(), p.adTick()], [false, false, true]);
});
