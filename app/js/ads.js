// KaiAds full-screen ads. Silently does nothing when the SDK is missing or fails.
(function (root) {
  'use strict';
  root.QTAds = {
    // The SDK loads async; wait up to 10 s for it before giving up on this ad.
    show: function (tries) {
      tries = tries || 0;
      if (typeof root.getKaiAd !== 'function') {
        if (tries < 10) setTimeout(function () { root.QTAds.show(tries + 1); }, 1000);
        return;
      }
      var c = root.QTConfig.kaiads;
      try {
        root.getKaiAd({
          publisher: c.publisher,
          app: c.app,
          slot: c.slot,
          onerror: function (err) { console.error('KaiAds error:', err); },
          onready: function (ad) { ad.call('display'); }
        });
      } catch (e) {
        console.error('KaiAds failed:', e);
      }
    }
  };
})(this);
