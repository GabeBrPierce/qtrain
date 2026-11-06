// Assembles the GitHub Pages site in _site/: the Grid app at the root and the Wheel app under wheel/.
// The wheel gets its own copies of the shared scripts and styles so it never loads from ../ and can
// move to its own origin unchanged. Usage: node tools/build-site.js [version]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_site');
const SHARED_JS = ['config', 'core', 'player', 'api', 'ads', 'sfx', 'ui', 'stats', 'screen-stats', 'wheel', 'screen-wheel', 'main'];
const version = process.argv[2];

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'app'), OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'wheel'), path.join(OUT, 'wheel'), { recursive: true });
SHARED_JS.forEach(f => fs.copyFileSync(path.join(ROOT, 'app', 'js', f + '.js'), path.join(OUT, 'wheel', 'js', f + '.js')));
fs.copyFileSync(path.join(ROOT, 'app', 'css', 'app.css'), path.join(OUT, 'wheel', 'css', 'app.css'));

// The version reopens "How it works" after every update.
if (version) {
  ['js/config.js', 'wheel/js/config.js'].forEach(f => {
    const file = path.join(OUT, f), src = fs.readFileSync(file, 'utf8');
    if (!src.includes("version: 'dev'")) throw new Error('no version placeholder in ' + f);
    fs.writeFileSync(file, src.replace("version: 'dev'", `version: '${version}'`));
  });
}
console.log('built', OUT, version ? 'version ' + version : '(dev)');
