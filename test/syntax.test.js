const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Browser scripts are not loaded by the other tests, so a syntax slip would only show on the phone.
for (const dir of ['app/js', 'wheel/js']) {
  for (const f of fs.readdirSync(path.join(__dirname, '..', dir)).filter(f => f.endsWith('.js'))) {
    test(`${dir}/${f} parses`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', dir, f), 'utf8');
      assert.doesNotThrow(() => new Function(src));
    });
  }
}
