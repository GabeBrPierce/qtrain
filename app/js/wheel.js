// Two-spin wheel picker. A line sweeps clockwise from the top, one lap per LAP_MS. The first press picks
// a hue on the hue ring; the second picks a shade of it on the shade ring; then the player can redo or
// submit. Times are passed in, so a press counts where the line was at the key press, not the last frame.
// Browser global QTWheel; CommonJS for tests.
(function (root) {
  'use strict';
  var LAP_MS = 2400;
  // Shade ring anchors as [saturation, lightness]: pale, vivid, dark, muted, then back to pale.
  var SHADES = [[0.9, 0.88], [1, 0.5], [0.9, 0.14], [0.25, 0.5]];

  function hsl(h, s, l) {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      t = (t % 1 + 1) % 1;
      var v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
      return Math.round(v * 255);
    }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }

  function hueRgb(h) { return hsl(h, 1, 0.5); }

  function shadeRgb(h, s) {
    var x = (s % 1) * SHADES.length, i = Math.floor(x), t = x - i;
    var a = SHADES[i], b = SHADES[(i + 1) % SHADES.length];
    return hsl(h, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
  }

  function fracAt(startMs, nowMs) { return ((nowMs - startMs) % LAP_MS + LAP_MS) % LAP_MS / LAP_MS; }

  // Where a color sits on the live wheel: angle by hue, pale near the center, dark at the rim.
  function place(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    return { frac: (h / 6 + 1) % 1, r: 1 - (max + min) / 2 };
  }

  function create() {
    var phase = 'hue', start = 0, hue = 0, shade = 0;
    return {
      phase: function () { return phase; },
      start: function (now) { phase = 'hue'; start = now; },
      press: function (now) {
        if (phase === 'hue') { hue = fracAt(start, now); phase = 'shade'; start = now; }
        else if (phase === 'shade') { shade = fracAt(start, now); phase = 'review'; }
        return phase;
      },
      back: function (now) {
        if (phase === 'hue') return false;
        phase = 'hue';
        start = now;
        return true;
      },
      hue: function () { return hue; },
      frac: function (now) { return phase === 'review' ? shade : fracAt(start, now); },
      current: function () { return phase === 'review' ? shadeRgb(hue, shade) : null; },
      preview: function (now) {
        if (phase === 'hue') return hueRgb(fracAt(start, now));
        return shadeRgb(hue, phase === 'shade' ? fracAt(start, now) : shade);
      }
    };
  }

  var api = { LAP_MS: LAP_MS, hsl: hsl, hueRgb: hueRgb, shadeRgb: shadeRgb, fracAt: fracAt, place: place, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QTWheel = api;
})(this);
