// Grid pick screen: 1-9 picks a base color, then nudges refine it.
(function (root) {
  'use strict';
  var UI = root.QTUI, Core = root.QTCore, Sfx = root.QTSfx;
  var picker = root.QTPicker.create();
  var BASE_LBL = Core.BASE_NAMES;
  var NUDGE_LBL = ['R-', 'lighter', 'R+', 'G-', 'yours', 'G+', 'B-', 'darker', 'B+'];
  var pickMode = 'practice', busy = false;

  UI.screens.pick = {
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
      UI.content('<div class="depth">' + (cur ? Core.toHex(cur) + ' &middot; step ' + picker.step() : 'Press 1-9 to pick a color') + '</div>' +
        '<div class="grid ' + (anim || '') + '">' + picker.options().map(function (c, i) {
          return '<div class="cell' + (cur && i === 4 ? ' center' : '') + '" data-key="' + (i + 1) + '" style="background:' + UI.css(c) + '">' +
            (i + 1) + '<small>' + (cur ? NUDGE_LBL[i] : BASE_LBL[i]) + '</small></div>';
        }).join('') + '</div>');
      UI.soft('Undo', '', busy ? '...' : 'Submit', !picker.canUndo(), !cur || busy);
    },
    tick: function () { UI.pickHeader(pickMode); },
    key: function (k) {
      if (busy) return true;
      if (/^[1-9]$/.test(k)) { if (picker.press(+k)) { Sfx.play('key', +k); this.render('zin'); } return true; }
      if (k === 'SoftLeft' || (k === 'Backspace' && picker.canUndo())) { if (picker.undo()) { Sfx.play('undo'); this.render('zout'); } return true; }
      if (k === 'Backspace') { Sfx.play('back'); UI.go('home'); return true; }
      if (k === 'SoftRight' && picker.current()) {
        Sfx.play('submit');
        busy = true;
        this.render();
        UI.submit(picker.current(), pickMode, function () { busy = false; UI.screens.pick.render(); });
        return true;
      }
      return k === 'SoftRight';
    }
  };
})(this);
