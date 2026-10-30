// Deployment settings. apiBase points at the Cloudflare Worker.
(function (root) {
  'use strict';
  var local = /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname);
  root.QTConfig = {
    apiBase: local ? 'http://127.0.0.1:8787' : 'https://qtrain.REPLACE_ME.workers.dev',
    kaiads: {
      publisher: '0b1f52de-82bb-4c58-b2e4-1b125c046417',
      app: 'qtrain',
      slot: 'qtrain-us'
    }
  };
})(this);
