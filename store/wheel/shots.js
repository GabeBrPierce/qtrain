// Captures the banner and 5 KaiStore screenshots (240x320) for Hue Hunch Wheel with the backend mocked.
// Needs the built site served on port 5502 (node tools/build-site.js && npx http-server@14.1.1 _site -p 5502)
// and the repo on port 5500 for the banner, then run through Playwright's run-code with page as the argument.
// A fake clock makes the two presses land on the same blue every time.
async (page) => {
  const OUT = 'C:/Users/Gabriel.Pierce/source/repos/vibe-code-stuff/qtrain/store/wheel/';
  const APP = 'http://127.0.0.1:5502/wheel/index.html';
  const LAP = 2400;
  const d = new Date(); d.setHours(19, 41, 35, 0);
  const NOW = d.getTime();
  const OPEN = Math.floor(NOW / 300000) * 300000 + 300000; // the 7:45 round
  const ME = 'a1b2c3d4-0000-4000-8000-000000000001';
  const others = [['PIXEL', '#2E8CE6'], ['NOVA', '#E04A3A'], ['MOTH', '#F2D04A'], ['KIRA', '#3AA860'], ['BEAM', '#8A3AC8'],
    ['JUNO', '#E8E8F0'], ['ORBIT', '#402010'], ['RUNE', '#20C0C0'], ['FLUX', '#1E5FB0']]
    .map((r, i) => ({ nickname: r[0], tag: 'ab' + i, hex: r[1], submittedAt: i, mine: false }));
  const series = Array.from({ length: 40 }, (_, i) => {
    const half = 30 / Math.sqrt(i + 1);
    return { t: NOW - (40 - i) * 3600000, q: +(50 + 6 * Math.sin(i / 3) / Math.sqrt(i + 1)).toFixed(1),
      a: i < 15 ? null : +(50 - 4 * Math.cos(i / 2) / Math.sqrt(i + 1)).toFixed(1), lo: +(50 - half).toFixed(1), hi: +(50 + half).toFixed(1) };
  });
  let myHex = null;

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 240, height: 130 });
  await page.goto('http://127.0.0.1:5500/store/wheel/banner.html');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + 'img_hue_hunch_wheel.jpg', type: 'jpeg', quality: 92 });

  await page.setViewportSize({ width: 240, height: 320 });
  await page.route('**/static.kaiads.com/**', r => r.abort());
  // Desktop Chromium draws scrollbars that a KaiOS phone does not. CSS animations run on real time, not the
  // fake clock, so they are switched off to keep screens from being caught mid-fade.
  await page.addInitScript(() => addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{display:none} *{animation:none!important}'; document.head.appendChild(s);
  }));
  await page.route('http://127.0.0.1:8787/**', r => {
    const u = new URL(r.request().url());
    let body = {};
    if (u.pathname === '/now') body = { now: NOW };
    else if (u.pathname === '/pick') { myHex = JSON.parse(r.request().postData()).hex; body = { ok: true }; }
    else if (/\/picks$/.test(u.pathname)) body = { roundId: OPEN, picks: others.concat([{ nickname: 'ZED', tag: 'a1b2', hex: myHex || '#2A6FC8', submittedAt: 99, mine: true }]) };
    else if (u.pathname.startsWith('/round/')) body = { roundId: OPEN, status: 'open', players: 10, top: [] };
    else if (u.pathname.startsWith('/board/')) body = { top: [] };
    else if (u.pathname === '/stats/all') body = { rounds: 412, picks: 2210, quantum: 50.6, algorithm: 49.1, algorithmRounds: 300, algorithmSince: series[15].t, band: [46.1, 53.9], series };
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  const key = k => page.evaluate(k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);
  const seed = pendings => page.evaluate(([me, p]) => localStorage.setItem('huehunch-wheel.state', JSON.stringify({
    id: me, nickname: 'ZED', introSeen: 'dev', sound: false, streak: 6, lastDay: null,
    best: 91, history: [91, 84, 77], adCount: 0, pendings: p
  })), [ME, pendings]);
  const shot = async name => { await page.clock.runFor(450); await page.screenshot({ path: OUT + 'screenshots/' + name + '.png' }); };

  await page.clock.install({ time: NOW });
  // 1. Home
  await page.goto(APP); await seed([]); await page.goto(APP);
  await page.clock.runFor(800);
  await shot('1-home');

  // 2. Hue spin, line partway round
  await key('Enter');
  await page.clock.runFor(LAP * 0.27);
  await shot('2-hue-spin');

  // 3. Stopped on a blue hue, then a slightly deep shade: Redo or Submit
  await page.clock.runFor(LAP * 0.31 - 450);
  await key('Enter');
  await page.clock.runFor(LAP * 0.31);
  await key('Enter');
  await shot('3-review');

  // 4. Locked in: everyone's picks so far
  await key('SoftRight');
  await page.clock.runFor(1500);
  await shot('4-live');

  // 5. Stats, all rounds
  await key('Backspace'); await page.clock.runFor(400);
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  await page.clock.runFor(900);
  await shot('5-stats');
  return 'done ' + myHex;
}
