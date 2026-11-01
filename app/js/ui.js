// Screens and key handling. Each screen is { enter(arg), key(k) -> handled?, tick() }.
(function (root) {
  'use strict';
  var Core = root.QTCore, Api = root.QTApi, Ads = root.QTAds, Sfx = root.QTSfx;
  var VERSION = root.QTConfig.version;
  var player = root.QTPlayer.create();
  Sfx.setEnabled(player.sound());
  var picker = root.QTPicker.create();
  var $ = function (id) { return document.getElementById(id); };

  var screens = {};
  var current = null, currentName = '';
  var lastRoundId = null;      // most recent competitive round this player joined
  var results = [];           // resolved rounds waiting to be shown, oldest first
  var polls = {};             // roundId -> { at, failed, busy }
  var roundHint = null;       // open round named by the server's last 409

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function css(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
  var clock = Core.clock;
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

  // Scroll #content just enough to show the highlighted menu row.
  function showSel() {
    var c = $('content'), s = c.querySelector('.sel');
    if (!s) return;
    if (s.offsetTop < c.scrollTop) c.scrollTop = s.previousSibling ? s.offsetTop : 0;
    else if (s.offsetTop + s.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTop = s.offsetTop + s.offsetHeight - c.clientHeight;
  }

  // Restart a CSS animation class on an element that stays in the page.
  function replay(el, cls) {
    el.className = el.className.replace(new RegExp('\\b' + cls + '\\b', 'g'), '');
    void el.offsetWidth;
    el.className += ' ' + cls;
  }

  var raf = root.requestAnimationFrame || function (f) { return setTimeout(f, 30); };

  // Count the score up from 0, then color it and celebrate a close pick.
  function reveal(c, colors) {
    var el = $('score'), start = Date.now(), DUR = 900;
    if (!el) return;
    Sfx.play('result', c);
    (function step() {
      if ($('score') !== el) return;
      var t = Math.min(1, (Date.now() - start) / DUR), e = 1 - Math.pow(1 - t, 3);
      el.textContent = t < 1 ? (c * e).toFixed(1) + '%' : c + '%';
      if (t < 1) { raf(step); return; }
      el.style.color = 'hsl(' + Math.round(Math.max(0, c - 50) * 2.4) + ',90%,65%)';
      replay(el, 'pop');
      if (c >= 90) burst(colors, c >= 97 ? 24 : 14);
    })();
  }

  // Sparks flying out from the score.
  function burst(colors, n) {
    var box = $('content'), sc = $('score');
    var cx = sc.offsetLeft + sc.offsetWidth / 2, cy = sc.offsetTop + sc.offsetHeight / 2;
    var ring = document.createElement('div');
    ring.className = 'ring';
    ring.style.left = cx + 'px';
    ring.style.top = cy + 'px';
    box.appendChild(ring);
    var sparks = [ring];
    box.style.overflowY = 'hidden'; // sparks past the edge must not flash a scrollbar
    for (var i = 0; i < n; i++) {
      var s = document.createElement('div');
      s.className = 'spark';
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.background = colors[i % colors.length];
      box.appendChild(s);
      sparks.push(s);
    }
    void box.offsetWidth;
    sparks.forEach(function (s, i) {
      if (!i) { s.className += ' go'; return; }
      var ang = (i / n) * 2 * Math.PI + Math.random() * 0.4, d = 50 + Math.random() * 50;
      s.style.transform = 'translate(' + Math.round(Math.cos(ang) * d) + 'px,' + Math.round(Math.sin(ang) * d) + 'px) scale(0.3)';
      s.style.opacity = '0';
    });
    setTimeout(function () {
      sparks.forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); });
      box.style.overflowY = '';
    }, 900);
  }

  function go(name, arg) {
    var c = $('content');
    c.scrollTop = 0;
    replay(c, 'enter');
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
      soft(player.nickname() ? 'Cancel' : '', 'Save', 'Save');
      setTimeout(function () { $('nick').focus(); }, 50);
    },
    key: function (k) {
      var canLeave = !!player.nickname();
      if (canLeave && (k === 'SoftLeft' || (k === 'Backspace' && $('nick').value === ''))) { $('nick').blur(); Sfx.play('back'); go('home'); return true; }
      if (k === 'Enter' || k === 'SoftRight') {
        if (player.setNickname($('nick').value.trim())) { $('nick').blur(); Sfx.play('select'); go('home'); }
        else { $('nick-err').textContent = 'Use 3-12 letters or numbers.'; Sfx.play('error'); replay($('nick'), 'shake'); }
        return true;
      }
      return false;
    }
  };

  // ---------- Home ----------
  var HOME = ['competitive', 'practice', 'boards', 'nick', 'sound', 'about'];
  var homeSel = 0, adShownOnOpen = false;
  screens.home = {
    enter: function () {
      header('QTrain', player.nickname());
      this.render();
      soft('', 'Select', '');
      if (!adShownOnOpen) { adShownOnOpen = true; Ads.show(); }
      if (results.length) showResult();
    },
    render: function () {
      var open = Core.openRoundFor(Api.now());
      var p = player.openPending(Api.now());
      var compLabel = p ? 'Locked in for ' + clock(p.roundId) : 'Next round ' + clock(open);
      content(menu([
        'Competitive<small>' + compLabel + ' &middot; ' + mmss(open - Core.LOCK_MS - Api.now()) + '</small>',
        'Practice<small>Instant rounds' + (player.practiceBest() != null ? ' &middot; best ' + player.practiceBest() + '%' : '') + '</small>',
        'Boards<small>Round, day, week, all time</small>',
        'Nickname<small>' + esc(player.nickname() || '') + ' &middot; streak ' + player.streak() + 'd</small>',
        'Sound<small>' + (player.sound() ? 'On' : 'Off') + '</small>',
        'How it works'
      ], homeSel));
      showSel();
    },
    tick: function () { this.render(); },
    key: function (k) {
      if (k === 'ArrowDown') { homeSel = (homeSel + 1) % HOME.length; Sfx.play('move'); this.render(); return true; }
      if (k === 'ArrowUp') { homeSel = (homeSel + HOME.length - 1) % HOME.length; Sfx.play('move'); this.render(); return true; }
      if (k === 'Enter') { openHome(HOME[homeSel]); return true; }
      return false; // Backspace on home: let KaiOS close the app
    },
    click: function (i) { homeSel = i; openHome(HOME[i]); }
  };
  function openHome(item) {
    if (item === 'sound') {
      Sfx.setEnabled(player.toggleSound());
      Sfx.play('select');
      screens.home.render();
      return;
    }
    Sfx.play('select');
    if (item === 'competitive') {
      if (player.openPending(Api.now())) go('locked'); else go('pick', 'competitive');
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
    // anim: 'zin' after drilling in, 'zout' after undo.
    render: function (anim) {
      var cur = picker.current();
      this.tick();
      content('<div class="depth">' + (cur ? Core.toHex(cur) + ' &middot; step ' + picker.step() : 'Press 1-9 to pick a color') + '</div>' +
        '<div class="grid ' + (anim || '') + '">' + picker.options().map(function (c, i) {
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
      if (/^[1-9]$/.test(k)) { if (picker.press(+k)) { Sfx.play('key', +k); this.render('zin'); } return true; }
      if (k === 'SoftLeft' || (k === 'Backspace' && picker.canUndo())) { if (picker.undo()) { Sfx.play('undo'); this.render('zout'); } return true; }
      if (k === 'Backspace') { Sfx.play('back'); go('home'); return true; }
      if (k === 'SoftRight' && picker.current()) { Sfx.play('submit'); submit(); return true; }
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
        if (r.status !== 200) { screens.pick.render(); Sfx.play('error'); toast('Could not reach the random source. Try again.'); return; }
        var c = Core.closeness(picker.current(), r.body.rgb);
        player.recordPractice(c);
        go('practiceResult', { mine: picker.current(), drawn: r.body.rgb, closeness: c });
      });
      return;
    }
    var roundId = Core.roundForSubmit(Api.now(), roundHint);
    Api.pick({ playerId: player.id(), nickname: player.nickname(), roundId: roundId, hex: hex }).then(function (r) {
      busy = false;
      if (r.status === 200) {
        roundHint = null;
        player.addPending({ roundId: roundId, hex: hex });
        player.recordCompetitive(Core.dayKey(Api.now()));
        lastRoundId = roundId;
        Sfx.play('lock');
        go('locked');
      } else if (r.status === 409 && r.body.error === 'round_closed') {
        roundHint = r.body.openRoundId;
        Api.syncClock();
        screens.pick.render();
        Sfx.play('error');
        toast('That round just closed. Submit again for ' + clock(r.body.openRoundId) + '.');
      } else if (r.status === 409 && r.body.error === 'already_picked') {
        player.addPending({ roundId: roundId, hex: hex });
        lastRoundId = roundId;
        go('locked');
      } else {
        screens.pick.render();
        Sfx.play('error');
        toast(r.status === 0 ? 'No connection. Try again.' : 'Something went wrong. Try again.');
      }
    });
  }

  // ---------- Locked in ----------
  function lockedPick() {
    var list = player.pendings();
    return player.openPending(Api.now()) || list[list.length - 1] || null;
  }
  screens.locked = {
    enter: function () {
      var p = lockedPick();
      if (!p) { go('home'); return; }
      header('Locked in', 'Round ' + clock(p.roundId));
      content('<div class="big"><div class="swatch breathe" style="background:' + esc(p.hex) + '"></div>' +
        '<div class="timer" id="lk-timer"></div><div class="note" id="lk-note" style="text-align:center"></div></div>');
      soft('Practice', '', 'Boards');
      this.tick();
    },
    tick: function () {
      var p = lockedPick();
      if (!p) return;
      var left = p.roundId - Api.now();
      $('lk-timer').textContent = left > 0 ? mmss(left) : '...';
      var hurry = left > 0 && left <= 10000;
      $('lk-timer').className = 'timer' + (hurry ? ' hurry' : '');
      if (hurry) Sfx.play('tick');
      $('lk-note').textContent = left > 0 ? 'The NIST beacon pulse at ' + clock(p.roundId) + ' decides the color.' :
        'Waiting for the beacon pulse. Back to pick for ' + clock(Core.openRoundFor(Api.now())) + '.';
    },
    key: function (k) {
      if (k === 'SoftLeft') { Sfx.play('select'); go('pick', 'practice'); return true; }
      if (k === 'SoftRight') { Sfx.play('select'); go('boards'); return true; }
      if (k === 'Backspace') { Sfx.play('back'); go('home'); return true; }
      return false;
    }
  };

  // ---------- Results ----------
  function pollPending() {
    var now = Api.now();
    player.pendings().forEach(function (p) {
      var st = polls[p.roundId] || (polls[p.roundId] = { at: 0, failed: false, busy: false });
      if (st.busy || !Core.shouldPoll(now, p.roundId, st.at, st.failed)) return;
      st.busy = true;
      st.at = now;
      Api.round(p.roundId, player.id()).then(function (r) {
        st.busy = false;
        st.failed = r.status !== 200;
        if (st.failed || (r.body.status !== 'resolved' && r.body.status !== 'void')) return;
        delete polls[p.roundId];
        player.removePending(p.roundId);
        lastRoundId = r.body.roundId;
        results.push(r.body);
        if (currentName === 'locked' || currentName === 'home') showResult();
        else toast('Round ' + clock(r.body.roundId) + ' result is ready on Home.');
      });
    });
  }

  function showResult() {
    go('result', results.shift());
  }

  var lastResult = null;
  screens.result = {
    enter: function (r) {
      lastResult = r;
      header('Round ' + clock(r.roundId), players(r.players));
      if (r.status === 'void') {
        content('<div class="big"><div class="score">Void</div><div class="note" style="text-align:center">The beacon was offline, so this round does not count.</div></div>');
        soft('', '', 'Next');
        Sfx.play('error');
        afterResult();
        return;
      }
      var me = r.me || {};
      content('<div class="pair"><div><div class="s" style="background:' + esc(me.hex || '#000') + '"></div>You</div>' +
        '<div><div class="s" style="background:' + esc(r.hex) + '"></div>Beacon</div></div>' +
        '<div class="score" id="score">' + (me.closeness != null ? '0%' : '-') + '</div>' +
        '<div class="sub">#' + (me.rank || '-') + ' of ' + r.players + ' &middot; ' + esc(r.hex) + '</div>' +
        '<div class="sub" id="best-today">&nbsp;</div>' +
        '<div class="note" style="text-align:center">Pulse #' + r.pulseIndex + ' at beacon.nist.gov</div>');
      soft('Share', '', 'Next');
      if (me.closeness != null) reveal(me.closeness, [me.hex, r.hex, '#fff']);
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
      if (k === 'SoftRight') { Sfx.play('select'); go('pick', 'competitive'); return true; }
      if (k === 'Backspace') { Sfx.play('back'); go('home'); return true; }
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
        '<div class="score" id="score">0%</div>' +
        '<div class="sub">' + Core.toHex(r.mine) + ' vs ' + Core.toHex(r.drawn) + '</div>' +
        (hist.length ? '<div class="note" style="text-align:center">Before: ' + hist.join('%, ') + '%</div>' : ''));
      soft('Share', '', 'Again');
      reveal(r.closeness, [css(r.mine), css(r.drawn), '#fff']);
      afterResult();
    },
    key: function (k) {
      var r = lastPractice;
      if (k === 'SoftLeft') { share('I hit ' + r.closeness + '% in QTrain practice. Drawn ' + Core.toHex(r.drawn) + ', me ' + Core.toHex(r.mine)); return true; }
      if (k === 'SoftRight' || k === 'Enter') { Sfx.play('select'); go('pick', 'practice'); return true; }
      if (k === 'Backspace') { Sfx.play('back'); go('home'); return true; }
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
      var rid = lastRoundId || (player.pendings()[0] && player.pendings()[0].roundId);
      if (t === 'round' && !rid) { $('lb').innerHTML = '<div>Play a competitive round first.</div>'; return; }
      var p = t === 'round' ? Api.round(rid, player.id()) : Api.board(t, player.id());
      p.then(function (r) {
        if (req !== boardReq || currentName !== 'boards') return;
        if (r.status !== 200) { $('lb').innerHTML = '<div>Could not load. Press Left/Right to retry.</div>'; return; }
        $('lb').innerHTML = renderBoard(r.body, t);
        var rows = $('lb').children;
        for (var i = 0; i < rows.length; i++) rows[i].style.animationDelay = Math.min(i, 12) * 40 + 'ms';
      });
    },
    key: function (k) {
      if (k === 'ArrowRight') { tab = (tab + 1) % TABS.length; Sfx.play('move'); this.load(); return true; }
      if (k === 'ArrowLeft') { tab = (tab + TABS.length - 1) % TABS.length; Sfx.play('move'); this.load(); return true; }
      if (k === 'SoftRight' || k === 'Backspace') { Sfx.play('back'); go('home'); return true; }
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
      content('<div class="about"><div class="logo">' + Core.BASE.map(function (c, i) {
        return '<i style="background:' + css(c) + ';animation-delay:' + i * 120 + 'ms"></i>';
      }).join('') + '</div>' +
        '<p>Every 5 minutes the NIST Randomness Beacon publishes a random number. Its first three bytes become a color.</p>' +
        '<p>Before the round closes, sense that color: press 1-9 for a base color, then keep refining. Red, green, blue and brightness nudges get finer the deeper you go. Submit locks it in.</p>' +
        '<p>Closeness is how near your color is to the beacon\'s: 100% is exact. Boards rank the closest picks.</p>' +
        '<p>Practice rounds draw instantly from a quantum-seeded generator and are not ranked.</p>' +
        '<p>QTrain is a game of luck and intuition. Any pulse can be checked at beacon.nist.gov.</p>' +
        '<p>Turn sound on or off from the Home menu.</p>' +
        '</div>');
      soft('', '', player.needsIntro(VERSION) ? (player.nickname() ? 'Start' : 'Next') : 'Back');
    },
    key: function (k) {
      if (k === 'SoftRight' || k === 'Backspace' || k === 'Enter') {
        player.markIntroSeen(VERSION);
        Sfx.play(k === 'Backspace' ? 'back' : 'select');
        go(player.nickname() ? 'home' : 'nick');
        return true;
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') { document.querySelector('.about').scrollTop += k === 'ArrowDown' ? 40 : -40; return true; }
      return false;
    }
  };

  // ---------- input ----------
  var ALIASES = { q: 'SoftLeft', Q: 'SoftLeft', e: 'SoftRight', E: 'SoftRight' };
  var SOFT_IDS = { SoftLeft: 'sk-left', Enter: 'sk-center', SoftRight: 'sk-right' };
  document.addEventListener('keydown', function (ev) {
    var k = ev.key;
    var typing = ev.target && ev.target.tagName === 'INPUT';
    var emptyBack = typing && k === 'Backspace' && ev.target.value === '';
    if (typing && !emptyBack && k !== 'Enter' && k !== 'SoftRight' && k !== 'SoftLeft') return;
    if (!typing && ALIASES[k]) k = ALIASES[k];
    var sk = SOFT_IDS[k] && $(SOFT_IDS[k]);
    if (sk && sk.textContent && sk.className.indexOf('off') === -1) replay(sk, 'press');
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

  var first = player.pendings()[0];
  if (first) lastRoundId = first.roundId;
  go(player.needsIntro(VERSION) ? 'about' : player.nickname() ? 'home' : 'nick');
  Api.syncClock();
})(this);
