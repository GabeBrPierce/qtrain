// Screens and key handling. Each screen is { enter(arg), key(k) -> handled?, tick() }.
(function (root) {
  'use strict';
  var Core = root.QTCore, Api = root.QTApi, Ads = root.QTAds;
  var player = root.QTPlayer.create();
  var picker = root.QTPicker.create();
  var $ = function (id) { return document.getElementById(id); };

  var screens = {};
  var current = null, currentName = '';
  var lastRoundId = null;      // most recent competitive round this player joined
  var resultReady = null;      // resolved round waiting to be shown
  var polling = false;

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function css(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
  function clock(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function players(n) { return n + (n === 1 ? ' player' : ' players'); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); }

  function header(title, info) { $('hdr-title').textContent = title; $('hdr-info').textContent = info || ''; }
  function soft(left, center, right, leftOff, rightOff) {
    $('sk-left').textContent = left || '';
    $('sk-center').textContent = center || '';
    $('sk-right').textContent = right || '';
    $('sk-left').className = leftOff ? 'off' : '';
    $('sk-right').className = rightOff ? 'off' : '';
  }
  function content(html) { $('content').innerHTML = html; }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.className = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'hidden'; }, 2500);
  }

  function go(name, arg) {
    currentName = name;
    current = screens[name];
    current.enter(arg);
  }

  function share(text) {
    try {
      if (root.MozActivity) { new root.MozActivity({ name: 'new', data: { type: 'websms/sms', number: '', body: text } }); return; }
      if (root.WebActivity) { new root.WebActivity('new', { type: 'websms/sms', number: '', body: text }).start(); return; }
    } catch (e) { /* fall through */ }
    root.location.href = 'sms:?body=' + encodeURIComponent(text);
  }

  function afterResult() { if (player.adTick()) Ads.show(); }

  // ---------- menu helper ----------
  function menu(items, sel) {
    return '<ul class="menu">' + items.map(function (it, i) {
      return '<li data-i="' + i + '" class="' + (i === sel ? 'sel' : '') + '">' + it + '</li>';
    }).join('') + '</ul>';
  }

  // ---------- Nickname ----------
  screens.nick = {
    enter: function () {
      header('Welcome', '');
      content('<div class="note">Pick a nickname for the boards (3-12 letters or numbers).</div>' +
        '<input class="nick" id="nick" maxlength="12" value="' + esc(player.nickname() || '') + '">' +
        '<div class="note" id="nick-err"></div>');
      soft('', 'Save', 'Save');
      setTimeout(function () { $('nick').focus(); }, 50);
    },
    key: function (k) {
      if (k === 'Enter' || k === 'SoftRight') {
        if (player.setNickname($('nick').value.trim())) { $('nick').blur(); go('home'); }
        else $('nick-err').textContent = 'Use 3-12 letters or numbers.';
        return true;
      }
      return false;
    }
  };

  // ---------- Home ----------
  var HOME = ['competitive', 'practice', 'boards', 'nick', 'about'];
  var homeSel = 0, adShownOnOpen = false;
  screens.home = {
    enter: function () {
      header('QTrain', player.nickname());
      this.render();
      soft('', 'Select', '');
      if (!adShownOnOpen) { adShownOnOpen = true; Ads.show(); }
      if (resultReady) showResult();
    },
    render: function () {
      var open = Core.openRoundFor(Api.now());
      var p = player.pending();
      var compLabel = p && p.roundId > Api.now() - Core.PULSE_WINDOW_MS ? 'Locked in for ' + clock(p.roundId) : 'Next round ' + clock(open);
      content(menu([
        'Competitive<small>' + compLabel + ' &middot; ' + mmss(open - Core.LOCK_MS - Api.now()) + '</small>',
        'Practice<small>Instant rounds' + (player.practiceBest() != null ? ' &middot; best ' + player.practiceBest() + '%' : '') + '</small>',
        'Boards<small>Round, day, week, all time</small>',
        'Nickname<small>' + esc(player.nickname() || '') + ' &middot; streak ' + player.streak() + 'd</small>',
        'How it works'
      ], homeSel));
    },
    tick: function () { this.render(); },
    key: function (k) {
      if (k === 'ArrowDown') { homeSel = (homeSel + 1) % HOME.length; this.render(); return true; }
      if (k === 'ArrowUp') { homeSel = (homeSel + HOME.length - 1) % HOME.length; this.render(); return true; }
      if (k === 'Enter') { openHome(HOME[homeSel]); return true; }
      return false; // Backspace on home: let KaiOS close the app
    },
    click: function (i) { homeSel = i; openHome(HOME[i]); }
  };
  function openHome(item) {
    if (item === 'competitive') {
      var p = player.pending();
      if (p) go('locked'); else go('pick', 'competitive');
    } else if (item === 'practice') go('pick', 'practice');
    else go(item);
  }

  // ---------- Pick ----------
  var BASE_LBL = Core.BASE_NAMES;
  var NUDGE_LBL = ['R-', 'lighter', 'R+', 'G-', 'yours', 'G+', 'B-', 'darker', 'B+'];
  var pickMode = 'practice', busy = false;
  screens.pick = {
    enter: function (mode) {
      pickMode = mode || pickMode;
      picker.reset();
      busy = false;
      this.render();
    },
    render: function () {
      var cur = picker.current();
      this.tick();
      content('<div class="depth">' + (cur ? Core.toHex(cur) + ' &middot; step ' + picker.step() : 'Press 1-9 to pick a color') + '</div>' +
        '<div class="grid">' + picker.options().map(function (c, i) {
          return '<div class="cell' + (cur && i === 4 ? ' center' : '') + '" data-key="' + (i + 1) + '" style="background:' + css(c) + '">' +
            (i + 1) + '<small>' + (cur ? NUDGE_LBL[i] : BASE_LBL[i]) + '</small></div>';
        }).join('') + '</div>');
      soft('Undo', '', busy ? '...' : 'Submit', !picker.canUndo(), !cur || busy);
    },
    tick: function () {
      if (pickMode === 'practice') { header('Practice', 'best ' + (player.practiceBest() != null ? player.practiceBest() + '%' : '-')); return; }
      var open = Core.openRoundFor(Api.now());
      header('Round ' + clock(open), mmss(open - Core.LOCK_MS - Api.now()) + ' left');
    },
    key: function (k) {
      if (busy) return true;
      if (/^[1-9]$/.test(k)) { if (picker.press(+k)) this.render(); return true; }
      if (k === 'SoftLeft' || (k === 'Backspace' && picker.canUndo())) { if (picker.undo()) this.render(); return true; }
      if (k === 'Backspace') { go('home'); return true; }
      if (k === 'SoftRight' && picker.current()) { submit(); return true; }
      return k === 'SoftRight';
    }
  };

  function submit() {
    var hex = Core.toHex(picker.current());
    busy = true;
    screens.pick.render();
    if (pickMode === 'practice') {
      Api.practice().then(function (r) {
        busy = false;
        if (r.status !== 200) { screens.pick.render(); toast('Could not reach the random source. Try again.'); return; }
        var c = Core.closeness(picker.current(), r.body.rgb);
        player.recordPractice(c);
        go('practiceResult', { mine: picker.current(), drawn: r.body.rgb, closeness: c });
      });
      return;
    }
    var roundId = Core.openRoundFor(Api.now());
    Api.pick({ playerId: player.id(), nickname: player.nickname(), roundId: roundId, hex: hex }).then(function (r) {
      busy = false;
      if (r.status === 200) {
        player.setPending({ roundId: roundId, hex: hex });
        player.recordCompetitive(Core.dayKey(Api.now()));
        lastRoundId = roundId;
        go('locked');
      } else if (r.status === 409 && r.body.error === 'round_closed') {
        Api.syncClock();
        screens.pick.render();
        toast('That round just closed. Submit again for ' + clock(r.body.openRoundId) + '.');
      } else if (r.status === 409 && r.body.error === 'already_picked') {
        if (!player.pending()) player.setPending({ roundId: roundId, hex: hex });
        lastRoundId = roundId;
        go('locked');
      } else {
        screens.pick.render();
        toast(r.status === 0 ? 'No connection. Try again.' : 'Something went wrong. Try again.');
      }
    });
  }

  // ---------- Locked in ----------
  screens.locked = {
    enter: function () {
      var p = player.pending();
      if (!p) { go('home'); return; }
      header('Locked in', 'Round ' + clock(p.roundId));
      content('<div class="big"><div class="swatch" style="background:' + esc(p.hex) + '"></div>' +
        '<div class="timer" id="lk-timer"></div><div class="note" id="lk-note" style="text-align:center"></div></div>');
      soft('Practice', '', 'Boards');
      this.tick();
    },
    tick: function () {
      var p = player.pending();
      if (!p) return;
      var left = p.roundId - Api.now();
      $('lk-timer').textContent = left > 0 ? mmss(left) : '...';
      $('lk-note').textContent = left > 0 ? 'The NIST beacon pulse at ' + clock(p.roundId) + ' decides the color.' : 'Waiting for the beacon pulse...';
    },
    key: function (k) {
      if (k === 'SoftLeft') { go('pick', 'practice'); return true; }
      if (k === 'SoftRight') { go('boards'); return true; }
      if (k === 'Backspace') { go('home'); return true; }
      return false;
    }
  };

  // ---------- Results ----------
  function pollPending() {
    var p = player.pending();
    if (!p || polling || resultReady || Api.now() < p.roundId + 3000) return;
    polling = true;
    Api.round(p.roundId, player.id()).then(function (r) {
      polling = false;
      if (r.status !== 200) return;
      if (r.body.status === 'resolved' || r.body.status === 'void') {
        resultReady = r.body;
        player.setPending(null);
        lastRoundId = r.body.roundId;
        if (currentName === 'locked' || currentName === 'home') showResult();
        else toast('Round ' + clock(r.body.roundId) + ' result is ready on Home.');
      }
    });
  }

  function showResult() {
    var r = resultReady;
    resultReady = null;
    go('result', r);
  }

  var lastResult = null;
  screens.result = {
    enter: function (r) {
      lastResult = r;
      header('Round ' + clock(r.roundId), players(r.players));
      if (r.status === 'void') {
        content('<div class="big"><div class="score">Void</div><div class="note" style="text-align:center">The beacon was offline, so this round does not count.</div></div>');
        soft('', '', 'Next');
        afterResult();
        return;
      }
      var me = r.me || {};
      content('<div class="pair"><div><div class="s" style="background:' + esc(me.hex || '#000') + '"></div>You</div>' +
        '<div><div class="s" style="background:' + esc(r.hex) + '"></div>Beacon</div></div>' +
        '<div class="score">' + (me.closeness != null ? me.closeness + '%' : '-') + '</div>' +
        '<div class="sub">#' + (me.rank || '-') + ' of ' + r.players + ' &middot; ' + esc(r.hex) + '</div>' +
        '<div class="sub" id="best-today">&nbsp;</div>' +
        '<div class="note" style="text-align:center">Pulse #' + r.pulseIndex + ' at beacon.nist.gov</div>');
      soft('Share', '', 'Next');
      Api.board('day', player.id()).then(function (b) {
        var el = $('best-today');
        if (el && b.status === 200 && b.body.me) el.textContent = 'Best today ' + b.body.me.closeness + '% (#' + b.body.me.rank + ') · streak ' + player.streak() + 'd';
      });
      afterResult();
    },
    key: function (k) {
      var r = lastResult;
      if (k === 'SoftLeft' && r.status === 'resolved' && r.me) {
        share('I hit ' + r.me.closeness + '% on QTrain round ' + clock(r.roundId) + ' (#' + r.me.rank + ' of ' + r.players + '). Beacon ' + r.hex + ', me ' + r.me.hex);
        return true;
      }
      if (k === 'SoftRight') { go('pick', 'competitive'); return true; }
      if (k === 'Backspace') { go('home'); return true; }
      return false;
    }
  };

  var lastPractice = null;
  screens.practiceResult = {
    enter: function (r) {
      lastPractice = r;
      header('Practice', 'best ' + player.practiceBest() + '%');
      var hist = player.practiceHistory().slice(1, 6);
      content('<div class="pair"><div><div class="s" style="background:' + css(r.mine) + '"></div>You</div>' +
        '<div><div class="s" style="background:' + css(r.drawn) + '"></div>QRNG</div></div>' +
        '<div class="score">' + r.closeness + '%</div>' +
        '<div class="sub">' + Core.toHex(r.mine) + ' vs ' + Core.toHex(r.drawn) + '</div>' +
        (hist.length ? '<div class="note" style="text-align:center">Before: ' + hist.join('%, ') + '%</div>' : ''));
      soft('Share', '', 'Again');
      afterResult();
    },
    key: function (k) {
      var r = lastPractice;
      if (k === 'SoftLeft') { share('I hit ' + r.closeness + '% in QTrain practice. Drawn ' + Core.toHex(r.drawn) + ', me ' + Core.toHex(r.mine)); return true; }
      if (k === 'SoftRight' || k === 'Enter') { go('pick', 'practice'); return true; }
      if (k === 'Backspace') { go('home'); return true; }
      return false;
    }
  };

  // ---------- Boards ----------
  var TABS = ['round', 'day', 'week', 'all'];
  var TAB_LBL = ['Round', 'Day', 'Week', 'All'];
  var tab = 1, boardReq = 0;
  screens.boards = {
    enter: function () {
      header('Boards', player.nickname());
      soft('', '', 'Home');
      this.load();
    },
    load: function () {
      var t = TABS[tab], req = ++boardReq;
      content('<div class="tabs">' + TAB_LBL.map(function (l, i) {
        return '<span data-tab="' + i + '" class="' + (i === tab ? 'on' : '') + '">' + l + '</span>';
      }).join('') + '</div><div class="lb" id="lb"><div>Loading...</div></div>');
      var rid = lastRoundId || (player.pending() && player.pending().roundId);
      if (t === 'round' && !rid) { $('lb').innerHTML = '<div>Play a competitive round first.</div>'; return; }
      var p = t === 'round' ? Api.round(rid, player.id()) : Api.board(t, player.id());
      p.then(function (r) {
        if (req !== boardReq || currentName !== 'boards') return;
        if (r.status !== 200) { $('lb').innerHTML = '<div>Could not load. Press Left/Right to retry.</div>'; return; }
        $('lb').innerHTML = renderBoard(r.body, t);
      });
    },
    key: function (k) {
      if (k === 'ArrowRight') { tab = (tab + 1) % TABS.length; this.load(); return true; }
      if (k === 'ArrowLeft') { tab = (tab + TABS.length - 1) % TABS.length; this.load(); return true; }
      if (k === 'SoftRight' || k === 'Backspace') { go('home'); return true; }
      return false;
    }
  };

  function renderBoard(b, t) {
    if (t === 'round' && b.status !== 'resolved') {
      return '<div>Round ' + clock(b.roundId) + ': ' + (b.status === 'void' ? 'void (beacon offline)' : b.status + ', ' + players(b.players)) + '</div>';
    }
    var rows = b.top || [];
    if (!rows.length) return '<div>No picks yet. Be the first.</div>';
    var names = {};
    rows.forEach(function (r) { names[r.nickname] = (names[r.nickname] || 0) + 1; });
    var html = rows.map(function (r) {
      var mine = b.me && b.me.rank === r.rank;
      return '<div class="' + (mine ? 'me' : '') + '"><span>' + r.rank + ' <i style="background:' + esc(r.hex) + '"></i>' + esc(r.nickname) +
        (names[r.nickname] > 1 ? '-' + esc(r.tag) : '') + '</span><span>' + r.closeness + '%</span></div>';
    }).join('');
    if (b.me && b.me.rank > rows.length) {
      html += '<div class="me"><span>' + b.me.rank + ' <i style="background:' + esc(b.me.hex) + '"></i>You</span><span>' + b.me.closeness + '%</span></div>';
    }
    if (t === 'round') html = '<div><span>Beacon ' + esc(b.hex) + '</span><span><i style="background:' + esc(b.hex) + '"></i></span></div>' + html;
    return html;
  }

  // ---------- About ----------
  screens.about = {
    enter: function () {
      header('How it works', '');
      content('<div class="about">' +
        '<p>Every 5 minutes the NIST Randomness Beacon publishes a random number. Its first three bytes become a color.</p>' +
        '<p>Before the round closes, sense that color: press 1-9 for a base color, then keep refining. Red, green, blue and brightness nudges get finer the deeper you go. Submit locks it in.</p>' +
        '<p>Closeness is how near your color is to the beacon\'s: 100% is exact. Boards rank the closest picks.</p>' +
        '<p>Practice rounds draw instantly from a quantum-seeded generator and are not ranked.</p>' +
        '<p>QTrain is a game of luck and intuition. Any pulse can be checked at beacon.nist.gov.</p>' +
        '</div>');
      soft('', '', 'Back');
    },
    key: function (k) {
      if (k === 'SoftRight' || k === 'Backspace') { go('home'); return true; }
      if (k === 'ArrowDown' || k === 'ArrowUp') { document.querySelector('.about').scrollTop += k === 'ArrowDown' ? 40 : -40; return true; }
      return false;
    }
  };

  // ---------- input ----------
  var ALIASES = { q: 'SoftLeft', Q: 'SoftLeft', e: 'SoftRight', E: 'SoftRight' };
  document.addEventListener('keydown', function (ev) {
    var k = ev.key;
    var typing = ev.target && ev.target.tagName === 'INPUT';
    if (typing && k !== 'Enter' && k !== 'SoftRight' && k !== 'SoftLeft') return;
    if (!typing && ALIASES[k]) k = ALIASES[k];
    if (current && current.key(k)) ev.preventDefault();
  });

  // Mouse/touch support for desktop testing.
  $('content').addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== this && !(el.dataset && (el.dataset.key || el.dataset.i || el.dataset.tab))) el = el.parentNode;
    if (!el || el === this) return;
    if (el.dataset.key) current.key(el.dataset.key);
    else if (el.dataset.i && current.click) current.click(+el.dataset.i);
    else if (el.dataset.tab && currentName === 'boards') { tab = +el.dataset.tab; screens.boards.load(); }
  });
  $('sk-left').addEventListener('click', function () { current.key('SoftLeft'); });
  $('sk-center').addEventListener('click', function () { current.key('Enter'); });
  $('sk-right').addEventListener('click', function () { current.key('SoftRight'); });

  setInterval(function () {
    if (current && current.tick) current.tick();
    pollPending();
  }, 1000);
  setInterval(function () { Api.syncClock(); }, 300000);

  Api.syncClock().then(function () {
    var p = player.pending();
    if (p) lastRoundId = p.roundId;
    go(player.nickname() ? 'home' : 'nick');
  });
})(this);
