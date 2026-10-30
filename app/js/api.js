// Worker client. Every call resolves to { status, body }; network failure resolves status 0.
(function (root) {
  'use strict';
  var offset = 0;

  function request(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(root.QTConfig.apiBase + path, opts).then(function (res) {
      return res.json().then(function (b) { return { status: res.status, body: b }; },
        function () { return { status: res.status, body: {} }; });
    }, function () { return { status: 0, body: {} }; });
  }

  function q(playerId) { return playerId ? '?player=' + encodeURIComponent(playerId) : ''; }

  root.QTApi = {
    // Server clock in ms, corrected by the offset measured in syncClock().
    now: function () { return Date.now() + offset; },
    syncClock: function () {
      var sent = Date.now();
      return request('GET', '/now').then(function (r) {
        if (r.status === 200) offset = r.body.now - Math.round((sent + Date.now()) / 2);
        return r;
      });
    },
    pick: function (body) { return request('POST', '/pick', body); },
    round: function (id, playerId) { return request('GET', '/round/' + id + q(playerId)); },
    board: function (period, playerId) { return request('GET', '/board/' + period + q(playerId)); },
    practice: function () { return request('GET', '/practice'); }
  };
})(this);
