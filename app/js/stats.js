// Plain-language reading and chart scaling for the Stats screens. Browser global QTStats; CommonJS for tests.
(function (root) {
  'use strict';

  // One neutral sentence about where a value sits against the chance band.
  function verdict(label, value, band) {
    if (value == null || !band) return label + ': not available yet.';
    var head = label + ' ' + value + '%: ';
    if (value > band[1]) return head + 'above the chance band: closer than chance usually gives.';
    if (value < band[0]) return head + 'below the chance band: farther than chance usually gives.';
    return head + 'inside the chance band, so no different from chance.';
  }

  // Axis range in percent that shows 50 and every value given, with 2 points of room.
  function scale(values) {
    var lo = 50, hi = 50;
    values.forEach(function (v) {
      if (v == null) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    return { min: Math.max(0, lo - 2), max: Math.min(100, hi + 2) };
  }

  var api = { verdict: verdict, scale: scale };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QTStats = api;
})(this);
