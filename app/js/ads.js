// KaiAds full-screen ads. Silently does nothing when the SDK is missing or fails.
(function (root) {
  'use strict';
  root.QTAds = {
    show: function () {
      if (typeof root.getKaiAd !== 'function') return;
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
