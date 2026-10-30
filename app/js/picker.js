// Drill-down color picker state. Browser global QTPicker; CommonJS for tests.
(function (root) {
  'use strict';
  var Core = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.QTCore;

  function create() {
    var stack = [];

    function current() { return stack.length ? stack[stack.length - 1] : null; }
    function options() { return Core.optionsFor(current(), stack.length); }

    function press(key) {
      if (!(key >= 1 && key <= 9)) return false;
      if (stack.length && key === 5) return false;
      stack.push(options()[key - 1]);
      return true;
    }

    function undo() {
      if (!stack.length) return false;
      stack.pop();
      return true;
    }

    return {
      press: press,
      undo: undo,
      canUndo: function () { return stack.length > 0; },
      current: current,
      depth: function () { return stack.length; },
      options: options,
      step: function () { return Core.stepAt(stack.length); },
      reset: function () { stack = []; }
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QTPicker = api;
})(this);
