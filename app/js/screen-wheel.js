// Wheel app screens: the two-spin pick, the live wheel while locked in, and a wheel view of the result.
// A line sweeps a ring of hues; the first press picks the hue, the second a shade of it, then Redo or Submit.
(function (root) {
  'use strict';
  var UI = root.QTUI, Core = root.QTCore, Api = root.QTApi, Sfx = root.QTSfx, W = root.QTWheel;
  var $ = function (id) { return document.getElementById(id); };
  var raf = root.requestAnimationFrame || function (f) { return setTimeout(f, 30); };
  var caf = root.cancelAnimationFrame || clearTimeout;

  var SIZE = 200, C = SIZE / 2, OUTER = 97, INNER = 64;
  var LIVE_MS = 4000, LIVE_FAIL_MS = 15000, NAMED = 5;

  function ang(frac) { return frac * 2 * Math.PI - Math.PI / 2; } // 0 at the top, clockwise

  // A ring of colorAt(0..1) drawn once to an offscreen canvas.
  function ring(colorAt) {
    var cv = document.createElement('canvas'), N = 180;
    cv.width = cv.height = SIZE;
    var c = cv.getContext('2d');
    for (var i = 0; i < N; i++) {
      var a0 = ang(i / N), a1 = ang((i + 1.6) / N); // slight overlap hides seams
      c.beginPath();
      c.arc(C, C, OUTER, a0, a1);
      c.arc(C, C, INNER, a1, a0, true);
      c.closePath();
      c.fillStyle = UI.css(colorAt((i + 0.5) / N));
      c.fill();
    }
    return cv;
  }
  var hueRing = null;

  function needle(c, a, from, to) {
    var cos = Math.cos(a), sin = Math.sin(a);
    c.lineCap = 'round';
    [['#000', 6], ['#fff', 3]].forEach(function (s) {
      c.strokeStyle = s[0]; c.lineWidth = s[1];
      c.beginPath(); c.moveTo(C + cos * from, C + sin * from); c.lineTo(C + cos * to, C + sin * to); c.stroke();
    });
  }

  // ---------- Pick ----------
  var wheel = W.create(), mode = 'practice', busy = false, img = null, loop = null;
  UI.screens.pick = {
    enter: function (m) {
      mode = m || mode;
      busy = false;
      hueRing = hueRing || ring(W.hueRgb);
      img = hueRing;
      wheel.start(Date.now());
      this.tick();
      UI.content('<div class="wheel"><div class="hint" id="wh-hint"></div>' +
        '<canvas id="wh" data-key="5" width="' + SIZE + '" height="' + SIZE + '"></canvas><div class="hex" id="wh-hex"></div></div>');
      this.labels();
      this.run();
    },
    labels: function () {
      var ph = wheel.phase();
      $('wh-hint').textContent = ph === 'hue' ? 'Stop the line on the hue' : ph === 'shade' ? 'Now stop it on the shade' : 'Your color';
      $('wh-hex').textContent = ph === 'review' ? Core.toHex(wheel.current()) : '';
      if (ph === 'review') UI.soft('Redo', '', busy ? '...' : 'Submit', busy, busy);
      else UI.soft('', 'Stop', '');
    },
    run: function () {
      var self = this;
      caf(loop);
      (function frame() { self.draw(); loop = raf(frame); })();
    },
    draw: function () {
      var cv = $('wh');
      if (!cv) return;
      var c = cv.getContext('2d'), now = Date.now();
      c.clearRect(0, 0, SIZE, SIZE);
      c.drawImage(img, 0, 0);
      c.beginPath(); c.arc(C, C, INNER - 8, 0, 2 * Math.PI);
      c.fillStyle = UI.css(wheel.preview(now)); c.fill();
      c.lineWidth = 2; c.strokeStyle = '#111'; c.stroke();
      needle(c, ang(wheel.frac(now)), INNER - 8, OUTER + 1);
    },
    leave: function () { caf(loop); loop = null; },
    tick: function () { UI.pickHeader(mode); },
    redo: function () {
      wheel.back(Date.now());
      img = hueRing;
      Sfx.play('undo');
      this.labels();
    },
    key: function (k) {
      if (busy) return true;
      var ph = wheel.phase();
      if ((k === 'Enter' || k === '5') && ph !== 'review') {
        var next = wheel.press(Date.now()); // the press time decides, not the last frame drawn
        Sfx.play('key', next === 'shade' ? 3 : 7);
        if (next === 'shade') {
          var h = wheel.hue();
          img = ring(function (s) { return W.shadeRgb(h, s); });
        }
        this.labels();
        return true;
      }
      if (ph === 'review' && k === 'SoftRight') {
        Sfx.play('submit');
        busy = true;
        this.labels();
        UI.submit(wheel.current(), mode, function () { busy = false; if (UI.current() === 'pick') UI.screens.pick.labels(); });
        return true;
      }
      if ((ph === 'review' && k === 'SoftLeft') || (ph !== 'hue' && k === 'Backspace')) { this.redo(); return true; }
      if (k === 'Backspace') { Sfx.play('back'); UI.go('home'); return true; }
      return k === 'SoftLeft' || k === 'SoftRight';
    }
  };

  // ---------- Disc of picks ----------
  // Angle by hue, pale colors near the center, dark at the rim (QTWheel.place), drawn dimmed behind the dots.
  var discs = {};
  function disc(S) {
    if (discs[S]) return discs[S];
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c = cv.getContext('2d'), im = c.createImageData(S, S), R = S / 2 - 4, h = S / 2;
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var dx = x + 0.5 - h, dy = y + 0.5 - h, d = Math.sqrt(dx * dx + dy * dy) / R, k = (y * S + x) * 4;
      if (d > 1) continue;
      var rgb = W.hsl(((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1, 0.85, 1 - d);
      im.data[k] = rgb[0] * 0.55; im.data[k + 1] = rgb[1] * 0.55; im.data[k + 2] = rgb[2] * 0.55; im.data[k + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    return (discs[S] = cv);
  }

  function spot(S, hex) {
    var p = W.place(Core.fromHex(hex)), R = (S / 2 - 4) * Math.min(1, p.r), a = ang(p.frac);
    return { x: S / 2 + Math.cos(a) * R, y: S / 2 + Math.sin(a) * R };
  }

  // Draws a name unless it would overlap one already in taken (boxes [x0, y0, x1, y1]).
  function label(c, S, text, x, y, color, taken) {
    c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
    x = Math.max(24, Math.min(S - 24, x));
    y = Math.max(10, y);
    var w = c.measureText(text).width / 2 + 2, box = [x - w, y - 9, x + w, y + 2];
    for (var i = 0; i < taken.length; i++) {
      var t = taken[i];
      if (box[0] < t[2] && t[0] < box[2] && box[1] < t[3] && t[1] < box[3]) return;
    }
    taken.push(box);
    c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(text, x, y);
    c.fillStyle = color; c.fillText(text, x, y);
  }

  // picks: [{ nickname, tag, hex, mine }], oldest first. Your own and the newest few get names.
  function drawPicks(cv, picks, beaconHex) {
    if (!cv) return;
    var S = cv.width, c = cv.getContext('2d'), count = {};
    c.clearRect(0, 0, S, S);
    c.drawImage(disc(S), 0, 0);
    picks.forEach(function (p) { count[p.nickname] = (count[p.nickname] || 0) + 1; });
    var named = picks.length - NAMED;
    var order = picks.filter(function (p) { return !p.mine; }).concat(picks.filter(function (p) { return p.mine; }));
    order.forEach(function (p) {
      var s = spot(S, p.hex);
      c.beginPath(); c.arc(s.x, s.y, p.mine ? 7 : 5, 0, 2 * Math.PI);
      c.fillStyle = p.hex; c.fill();
      c.lineWidth = p.mine ? 2.5 : 1.5; c.strokeStyle = p.mine ? '#fff' : '#000'; c.stroke();
    });
    var taken = [], b = beaconHex && spot(S, beaconHex);
    if (b) {
      c.beginPath(); c.arc(b.x, b.y, 10, 0, 2 * Math.PI);
      c.lineWidth = 3; c.strokeStyle = '#000'; c.stroke();
      c.lineWidth = 2; c.strokeStyle = '#ffd76a'; c.stroke();
      c.beginPath(); c.arc(b.x, b.y, 4, 0, 2 * Math.PI); c.fillStyle = beaconHex; c.fill();
      label(c, S, 'BEACON', b.x, b.y + 21, '#ffd76a', taken);
    }
    // Names: yours first, then the newest, skipping any that would overlap one already drawn.
    picks.filter(function (p) { return p.mine; }).concat(picks.filter(function (p, i) { return !p.mine && i >= named; }).reverse())
      .forEach(function (p) {
        var s = spot(S, p.hex);
        label(c, S, p.mine ? 'YOU' : p.nickname + (count[p.nickname] > 1 && p.tag ? '-' + p.tag : ''), s.x, s.y - (p.mine ? 11 : 9), p.mine ? '#ffd76a' : '#fff', taken);
      });
  }

  // ---------- Locked in: the live wheel ----------
  var baseLocked = UI.screens.locked;
  var live = null, pollAt = 0, pollBusy = false, failed = false, liveRound = null;
  function mineOnly(p) { return [{ nickname: UI.player.nickname(), tag: '', hex: p.hex, mine: true }]; }

  UI.screens.locked = {
    enter: function () {
      var p = UI.lockedPick();
      if (!p || !liveRound || p.roundId !== liveRound) { live = null; pollAt = 0; failed = false; }
      liveRound = p && p.roundId;
      baseLocked.enter.call(this);
      var sw = document.querySelector('#content .swatch');
      if (!sw) return; // no pick: the base screen went home
      var cv = document.createElement('canvas');
      cv.id = 'lv'; cv.width = cv.height = 172;
      sw.parentNode.replaceChild(cv, sw);
      this.drawLive();
    },
    drawLive: function () {
      var p = UI.lockedPick();
      if (p) drawPicks($('lv'), live || mineOnly(p), null);
    },
    tick: function () {
      baseLocked.tick.call(this);
      var p = UI.lockedPick(), now = Date.now();
      // Picks only arrive while the round is open; one more look just after it closes.
      if (!p || pollBusy || Api.now() > p.roundId + 10000 || now - pollAt < (failed ? LIVE_FAIL_MS : LIVE_MS)) return;
      pollBusy = true;
      pollAt = now;
      var self = this, rid = p.roundId;
      Api.livePicks(rid, UI.player.id()).then(function (r) {
        pollBusy = false;
        failed = r.status !== 200;
        if (failed || rid !== liveRound) return;
        live = r.body.picks;
        if (UI.current() === 'locked') self.drawLive();
      });
    },
    key: function (k) { return baseLocked.key.call(this, k); }
  };

  // ---------- Result: Left/Right flips to a wheel of everyone's picks and the beacon ----------
  var result = UI.screens.result, resultKey = result.key, shown = null;
  result.key = function (k) {
    var r = UI.lastResult();
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && r && r.status === 'resolved') { Sfx.play('move'); UI.go('resultWheel', r); return true; }
    return resultKey.call(this, k);
  };

  UI.screens.resultWheel = {
    enter: function (r) {
      shown = r;
      UI.header('Round ' + UI.clock(r.roundId), UI.players(r.players));
      UI.content('<div class="wheel"><div class="hint">Everyone\'s picks and the beacon</div>' +
        '<canvas id="rw" width="' + SIZE + '" height="' + SIZE + '"></canvas>' +
        '<div class="hex">Beacon ' + UI.esc(r.hex) + ' &middot; Left/Right: score</div></div>');
      UI.soft('', 'Stats', 'Next');
      drawPicks($('rw'), r.me ? mineOnly(r.me) : [], r.hex);
      Api.livePicks(r.roundId, UI.player.id()).then(function (x) {
        if (x.status === 200 && UI.current() === 'resultWheel' && shown === r) drawPicks($('rw'), x.body.picks, r.hex);
      });
    },
    key: function (k) {
      if (k === 'ArrowLeft' || k === 'ArrowRight') { Sfx.play('move'); UI.go('result', shown); return true; }
      if (k === 'Enter') { Sfx.play('select'); UI.go('stats', { roundId: shown.roundId, back: 'resultWheel', backArg: shown }); return true; }
      if (k === 'SoftRight') { Sfx.play('select'); UI.go('pick', 'competitive'); return true; }
      if (k === 'Backspace') { Sfx.play('back'); UI.go('home'); return true; }
      return false;
    }
  };
})(this);
