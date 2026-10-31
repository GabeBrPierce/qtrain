// Sound effects synthesized with Web Audio, so there are no audio files to load.
// Silently does nothing where Web Audio is missing or sound is off.
(function (root) {
  'use strict';
  var ctx = null, enabled = true;
  // C major pentatonic, one note per picker key.
  var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];

  function audio() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  // One note: frequency (Hz), start offset and length (s), waveform, peak volume, optional end frequency.
  function tone(a, f, at, len, type, vol, f2) {
    var t = a.currentTime + at;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  var SOUNDS = {
    move: function (a) { tone(a, 1200, 0, 0.03, 'square', 0.04); },
    select: function (a) { tone(a, 660, 0, 0.06, 'triangle', 0.12); tone(a, 990, 0.05, 0.08, 'triangle', 0.12); },
    back: function (a) { tone(a, 700, 0, 0.06, 'triangle', 0.1); tone(a, 470, 0.05, 0.08, 'triangle', 0.1); },
    key: function (a, n) { tone(a, SCALE[(n || 1) - 1], 0, 0.12, 'triangle', 0.16); },
    undo: function (a) { tone(a, 500, 0, 0.12, 'sine', 0.14, 260); },
    submit: function (a) { tone(a, 300, 0, 0.25, 'sawtooth', 0.07, 1200); tone(a, 1568, 0.22, 0.2, 'sine', 0.12); },
    lock: function (a) { tone(a, 784, 0, 0.15, 'sine', 0.14); tone(a, 1175, 0.12, 0.3, 'sine', 0.14); },
    error: function (a) { tone(a, 160, 0, 0.18, 'square', 0.08); tone(a, 120, 0.15, 0.22, 'square', 0.08); },
    // Rising arpeggio: more and higher notes the closer the pick.
    result: function (a, c) {
      var n = c >= 95 ? 6 : c >= 85 ? 5 : c >= 70 ? 4 : c >= 50 ? 3 : 2;
      for (var i = 0; i < n; i++) tone(a, SCALE[i + (c >= 85 ? 3 : 0)], i * 0.09, 0.22, 'triangle', 0.14);
      if (c >= 95) tone(a, 2093, n * 0.09, 0.5, 'sine', 0.12);
    },
    tick: function (a) { tone(a, 1800, 0, 0.02, 'square', 0.03); }
  };

  root.QTSfx = {
    setEnabled: function (on) { enabled = !!on; },
    play: function (name, arg) {
      if (!enabled || !SOUNDS[name]) return;
      var a = audio();
      if (!a) return;
      try { SOUNDS[name](a, arg); } catch (e) { /* audio is optional */ }
    }
  };
})(this);
