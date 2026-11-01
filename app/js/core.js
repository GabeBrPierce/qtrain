// Shared game logic for the browser (global QTCore), Node tests and the Worker.
// Keep to the Gecko 48 subset: no async/await, modules, ?. or ??.
(function (root) {
  'use strict';

  var BASE = [
    [200, 30, 50], [240, 120, 20], [240, 210, 30],
    [60, 190, 60], [30, 180, 170], [60, 150, 240],
    [40, 60, 200], [130, 50, 190], [230, 60, 170]
  ];
  var BASE_NAMES = ['crimson', 'orange', 'yellow', 'green', 'teal', 'sky', 'blue', 'purple', 'pink'];

  var ROUND_MS = 300000;
  var LOCK_MS = 10000;
  var PULSE_WINDOW_MS = 240000;
  var MAX_DIST = 441.673;

  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  var STEPS = [32, 19, 12, 7, 4, 3, 2, 1];
  function stepAt(depth) {
    return depth >= 1 && depth <= STEPS.length ? STEPS[depth - 1] : 1;
  }

  // Index i is key i+1: R-, lighter, R+ / G-, same, G+ / B-, darker, B+.
  function optionsFor(rgb, depth) {
    if (!rgb) return BASE.map(function (c) { return c.slice(); });
    var r = rgb[0], g = rgb[1], b = rgb[2], s = stepAt(depth);
    return [
      [r - s, g, b], [r + s, g + s, b + s], [r + s, g, b],
      [r, g - s, b], [r, g, b], [r, g + s, b],
      [r, g, b - s], [r - s, g - s, b - s], [r, g, b + s]
    ].map(function (c) { return c.map(clamp); });
  }

  function hex2(v) { var h = v.toString(16).toUpperCase(); return h.length < 2 ? '0' + h : h; }
  function toHex(rgb) { return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]); }
  function fromHex(hex) {
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function closeness(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    var d = Math.sqrt(dr * dr + dg * dg + db * db);
    return Math.max(0, Math.round(1000 * (1 - d / MAX_DIST)) / 10);
  }

  function rgbFromOutputValue(hex) { return fromHex(hex.slice(0, 6)); }

  // Close time of the round that is still accepting picks at nowMs.
  function openRoundFor(nowMs) {
    var close = Math.floor(nowMs / ROUND_MS) * ROUND_MS + ROUND_MS;
    return close - nowMs <= LOCK_MS ? close + ROUND_MS : close;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function dayKey(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  // ISO 8601 week, UTC: the week belongs to the year holding its Thursday.
  function weekKey(ms) {
    var d = new Date(ms);
    var day = d.getUTCDay() || 7;
    var thu = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day);
    var year = new Date(thu).getUTCFullYear();
    var week = Math.floor((thu - Date.UTC(year, 0, 1)) / 86400000 / 7) + 1;
    return year + '-W' + pad2(week);
  }

  // Resolves to fallback if the promise has not settled within ms (Gecko's fetch never times out).
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var t = setTimeout(function () { resolve(fallback); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function () { clearTimeout(t); resolve(fallback); });
    });
  }

  // Results cannot exist before the pulse is published (~60-80 s after close).
  function shouldPoll(nowMs, roundId, lastPollMs, failed) {
    return nowMs >= roundId + 60000 && nowMs - lastPollMs >= (failed ? 30000 : 15000);
  }

  // The round named by the server's last 409 wins while it is still accepting picks.
  function roundForSubmit(nowMs, hint) {
    return hint && hint - LOCK_MS > nowMs ? hint : openRoundFor(nowMs);
  }

  // Local time as h:mm AM/PM.
  function clock(ms) {
    var d = new Date(ms), h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
  }

  var api = {
    BASE: BASE, BASE_NAMES: BASE_NAMES,
    ROUND_MS: ROUND_MS, LOCK_MS: LOCK_MS, PULSE_WINDOW_MS: PULSE_WINDOW_MS,
    stepAt: stepAt, optionsFor: optionsFor, toHex: toHex, fromHex: fromHex,
    closeness: closeness, rgbFromOutputValue: rgbFromOutputValue,
    openRoundFor: openRoundFor, dayKey: dayKey, weekKey: weekKey,
    clock: clock, withTimeout: withTimeout, shouldPoll: shouldPoll, roundForSubmit: roundForSubmit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QTCore = api;
})(this);
