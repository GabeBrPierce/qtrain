// Per-device player state kept in localStorage, with an in-memory fallback.
// Browser global QTPlayer; CommonJS for tests.
(function (root) {
  'use strict';
  var KEY = 'qtrain.state';
  var HISTORY = 20;
  var AD_EVERY = 3;
  var BLOCKED = ['FUCK', 'SHIT', 'CUNT', 'NIGG', 'FAG', 'BITCH', 'WHORE', 'SLUT', 'RAPE', 'NAZI', 'HITLER', 'PENIS', 'DICK', 'COCK', 'PUSSY', 'ASSHOLE', 'RETARD', 'KKK'];

  function uuid() {
    var c = (typeof crypto !== 'undefined' && crypto) || root.crypto;
    var b = new Array(16);
    if (c && c.getRandomValues) {
      var u = new Uint8Array(16);
      c.getRandomValues(u);
      for (var i = 0; i < 16; i++) b[i] = u[i];
    } else {
      for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256);
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function validNickname(s) {
    if (typeof s !== 'string') return false;
    var n = s.toUpperCase();
    if (!/^[A-Z0-9]{3,12}$/.test(n)) return false;
    for (var i = 0; i < BLOCKED.length; i++) if (n.indexOf(BLOCKED[i]) !== -1) return false;
    return true;
  }

  function dayNumber(key) {
    var p = key.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
  }

  function create(storage) {
    if (storage === undefined) {
      try { storage = root.localStorage; } catch (e) { storage = null; }
    }
    var s = null;
    try { s = JSON.parse(storage.getItem(KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (!s.id) s.id = uuid();
    if (!s.history) s.history = [];
    if (!s.pendings) s.pendings = s.pending ? [s.pending] : [];
    delete s.pending;
    s.adCount = s.adCount || 0;
    s.streak = s.streak || 0;
    save();

    function save() {
      try { storage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* memory only */ }
    }

    return {
      id: function () { return s.id; },
      nickname: function () { return s.nickname || null; },
      setNickname: function (n) {
        if (!validNickname(n)) return false;
        s.nickname = n.toUpperCase();
        save();
        return true;
      },
      streak: function () { return s.streak; },
      recordCompetitive: function (dayKey) {
        if (s.lastDay === dayKey) return;
        var gap = s.lastDay ? dayNumber(dayKey) - dayNumber(s.lastDay) : 0;
        s.streak = gap === 1 ? s.streak + 1 : 1;
        s.lastDay = dayKey;
        save();
      },
      recordPractice: function (c) {
        s.history.unshift(c);
        if (s.history.length > HISTORY) s.history.length = HISTORY;
        if (s.best == null || c > s.best) s.best = c;
        save();
      },
      practiceBest: function () { return s.best == null ? null : s.best; },
      practiceHistory: function () { return s.history.slice(); },
      adTick: function () {
        s.adCount = (s.adCount + 1) % AD_EVERY;
        save();
        return s.adCount === 0;
      },
      // Competitive picks awaiting a result, oldest first. One per round.
      pendings: function () { return s.pendings.slice(); },
      addPending: function (p) {
        for (var i = 0; i < s.pendings.length; i++) if (s.pendings[i].roundId === p.roundId) return;
        s.pendings.push({ roundId: p.roundId, hex: p.hex });
        s.pendings.sort(function (a, b) { return a.roundId - b.roundId; });
        save();
      },
      removePending: function (roundId) {
        s.pendings = s.pendings.filter(function (p) { return p.roundId !== roundId; });
        save();
      },
      // The pick for a round that has not closed yet, if any.
      openPending: function (nowMs) {
        for (var i = 0; i < s.pendings.length; i++) if (s.pendings[i].roundId > nowMs) return s.pendings[i];
        return null;
      }
    };
  }

  var api = { create: create, validNickname: validNickname };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QTPlayer = api;
})(this);
