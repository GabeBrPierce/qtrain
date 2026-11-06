// Stats screen, shared by both apps: this round and all rounds, each against chance.
// Entered as go('stats', { roundId, back, backArg }); roundId may be null (from Home).
(function (root) {
  'use strict';
  var UI = root.QTUI, Api = root.QTApi, Sfx = root.QTSfx, Stats = root.QTStats;
  var $ = function (id) { return document.getElementById(id); };
  var Q = '#5AB0FF', A = '#F2B134', E = '#BBBBBB';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var arg = null, tab = 1, req = 0;

  function day(ms) { var d = new Date(ms); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function num(v) { return v == null ? '-' : v + '%'; }

  function key() {
    return '<div class="skey"><b>Key</b>' +
      '<div><i style="background:' + Q + '"></i>Quantum: picks scored against the beacon color</div>' +
      '<div><i style="background:' + A + '"></i>Algorithm: the same picks against a color from an ordinary computer random generator, drawn when the round was decided</div>' +
      '<div><i style="background:' + E + '"></i>Expected: 50%, what pure guessing averages</div>' +
      '<div><i class="band"></i>Shaded band: where chance lands 95% of the time. Inside it = consistent with chance. About 1 round in 20 lands outside it by luck alone.</div>' +
      '<div>Score: the share of all colors that were farther from a pick than the drawn color was.</div></div>';
  }

  function tabs() {
    var t = arg.roundId ? ['This round', 'All rounds'] : ['All rounds'];
    return '<div class="tabs">' + t.map(function (l, i) {
      var on = arg.roundId ? i === tab : true;
      return '<span class="' + (on ? 'on' : '') + '">' + l + '</span>';
    }).join('') + '</div>';
  }

  // Horizontal bar on a 0-100 scale, with the band shaded behind it.
  function bar(label, color, value, band) {
    var b = band ? '<u style="left:' + band[0] + '%;width:' + (band[1] - band[0]) + '%"></u>' : '';
    var fill = value == null ? '' : '<s style="width:' + value + '%;background:' + color + '"></s>';
    return '<div class="bar"><span>' + label + '</span><em>' + b + fill + '<q></q></em><span>' + num(value) + '</span></div>';
  }

  function roundView(b) {
    if (b.status === 'void') return '<div class="note">This round was void, so it has no stats.</div>';
    if (b.status !== 'ready') return '<div class="note">Stats for this round are still being worked out. Check back in a minute.</div>';
    return '<div class="bars">' + bar('Expected', E, 50, b.band) + bar('Quantum', Q, b.quantum, b.band) + bar('Algorithm', A, b.algorithm, b.band) + '</div>' +
      '<div class="note">' + UI.players(b.n) + ' &middot; band ' + b.band[0] + '-' + b.band[1] + '%</div>' +
      '<div class="note verdict">' + UI.esc(Stats.verdict('Quantum', b.quantum, b.band)) + '</div>' +
      (b.algorithm == null ? '' : '<div class="note verdict">' + UI.esc(Stats.verdict('Algorithm', b.algorithm, b.band)) + '</div>');
  }

  function allView(s) {
    if (!s.rounds) return '<div class="note">No rounds have been scored yet.</div>';
    return '<canvas id="st-chart" width="224" height="110"></canvas>' +
      '<div class="note">' + s.rounds + ' rounds &middot; ' + s.picks + ' picks &middot; oldest to newest</div>' +
      '<div class="note verdict">' + UI.esc(Stats.verdict('Quantum', s.quantum, s.band)) + '</div>' +
      '<div class="note verdict">' + UI.esc(Stats.verdict('Algorithm', s.algorithm, s.band)) + '</div>' +
      (s.algorithmSince ? '<div class="note">Algorithm control since ' + day(s.algorithmSince) + '.</div>' : '');
  }

  function chart(s) {
    var cv = $('st-chart');
    if (!cv || !cv.getContext) return;
    var c = cv.getContext('2d'), w = cv.width, h = cv.height, L = 26, T = 6, B = 6;
    var pts = s.series, vals = [];
    pts.forEach(function (p) { vals.push(p.q, p.a, p.lo, p.hi); });
    var sc = Stats.scale(vals);
    function y(v) { return T + (1 - (v - sc.min) / (sc.max - sc.min || 1)) * (h - T - B); }
    function x(i) { return pts.length < 2 ? (L + w) / 2 : L + i * (w - L - 4) / (pts.length - 1); }

    c.fillStyle = '#181818'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.beginPath();
    pts.forEach(function (p, i) { c[i ? 'lineTo' : 'moveTo'](x(i), y(p.hi)); });
    for (var i = pts.length - 1; i >= 0; i--) c.lineTo(x(i), y(pts[i].lo));
    if (pts.length < 2) { c.rect(L, y(pts[0].hi), w - L - 4, y(pts[0].lo) - y(pts[0].hi)); }
    c.fill();

    c.strokeStyle = E; c.lineWidth = 1;
    if (c.setLineDash) c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(L, y(50)); c.lineTo(w - 4, y(50)); c.stroke();
    if (c.setLineDash) c.setLineDash([]);

    [['a', A], ['q', Q]].forEach(function (ln) {
      c.strokeStyle = c.fillStyle = ln[1]; c.lineWidth = 2;
      c.beginPath();
      var started = false;
      pts.forEach(function (p, i) {
        if (p[ln[0]] == null) return;
        c[started ? 'lineTo' : 'moveTo'](x(i), y(p[ln[0]]));
        started = true;
      });
      c.stroke();
      var last = pts[pts.length - 1][ln[0]];
      if (last != null) { c.beginPath(); c.arc(x(pts.length - 1), y(last), 2.5, 0, 2 * Math.PI); c.fill(); }
    });

    c.fillStyle = '#999'; c.font = '9px sans-serif'; c.textAlign = 'right';
    c.fillText(Math.round(sc.max) + '%', L - 3, T + 6);
    c.fillText('50%', L - 3, y(50) + 3);
    c.fillText(Math.round(sc.min) + '%', L - 3, h - B);
  }

  function load() {
    var mine = ++req, onRound = arg.roundId && tab === 0;
    UI.content(tabs() + '<div id="st-body"><div class="note">Loading...</div></div>' + key());
    UI.header(onRound ? 'Round ' + UI.clock(arg.roundId) : 'All rounds', 'Stats');
    var p = onRound ? Api.roundStats(arg.roundId) : Api.allStats();
    p.then(function (r) {
      if (mine !== req || UI.current() !== 'stats') return;
      if (r.status !== 200) { $('st-body').innerHTML = '<div class="note">Could not load. Press Left/Right to retry.</div>'; return; }
      $('st-body').innerHTML = onRound ? roundView(r.body) : allView(r.body);
      if (!onRound && r.body.rounds) chart(r.body);
    });
  }

  UI.screens.stats = {
    enter: function (a) {
      arg = a || { roundId: null, back: 'home' };
      tab = arg.roundId ? 0 : 1;
      UI.soft('', '', 'Back');
      load();
    },
    key: function (k) {
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        if (arg.roundId) tab = 1 - tab;
        Sfx.play('move');
        load();
        return true;
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') { $('content').scrollTop += k === 'ArrowDown' ? 40 : -40; return true; }
      if (k === 'SoftRight' || k === 'Backspace') { Sfx.play('back'); UI.go(arg.back, arg.backArg); return true; }
      return false;
    }
  };
})(this);
