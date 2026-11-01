// Captures the 5 KaiStore screenshots (240x320) with the backend mocked, so nothing touches the live Worker.
// Needs the repo served on port 5500 (npx http-server@14.1.1 . -p 5500), then run through Playwright's
// run-code with page as the argument.
async (page) => {
  const OUT = 'C:/Users/Gabriel.Pierce/source/repos/vibe-code-stuff/qtrain/store/screenshots/';
  const APP = 'http://127.0.0.1:5500/app/index.html';
  const d = new Date(); d.setHours(19, 41, 35, 0);
  const NOW = d.getTime();
  const PAST = Math.floor(NOW / 300000) * 300000; // the 7:40 round, already resolved
  const ME = 'a1b2c3d4-0000-4000-8000-000000000001';
  const top = [
    ['PIXEL', '#2E8CE6', 98.6], ['NOVA', '#3390EB', 97.9], ['ZED', '#3C96F0', 96.4], ['MOTH', '#2A80D8', 94.2],
    ['KIRA', '#45A0F5', 91.8], ['BEAM', '#2878C8', 89.5], ['JUNO', '#1E90D0', 87.0], ['ORBIT', '#5A9CE0', 84.3]
  ].map((r, i) => ({ rank: i + 1, nickname: r[0], hex: r[1], closeness: r[2], tag: 'a' + i }));

  await page.setViewportSize({ width: 240, height: 320 });
  await page.route('**/static.kaiads.com/**', r => r.abort());
  // Desktop Chromium draws scrollbars that a KaiOS phone does not.
  await page.addInitScript(() => addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{display:none}'; document.head.appendChild(s);
  }));
  await page.route('http://127.0.0.1:8787/**', r => {
    const u = new URL(r.request().url());
    let body = {};
    if (u.pathname === '/now') body = { now: Date.now() + (NOW - Date.now()) };
    else if (u.pathname === '/pick') body = { ok: true };
    else if (u.pathname.startsWith('/round/')) body = {
      roundId: +u.pathname.split('/')[2], status: 'resolved', hex: '#2F8FE8', pulseIndex: 1452231, players: 37,
      me: { hex: '#3C96F0', closeness: 96.4, rank: 3 }, top
    };
    else if (u.pathname.startsWith('/board/')) body = { top, me: { rank: 3, hex: '#3C96F0', closeness: 96.4 } };
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  const key = k => page.evaluate(k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);
  const seed = pendings => page.evaluate(([me, p]) => localStorage.setItem('qtrain.state', JSON.stringify({
    id: me, nickname: 'ZED', introSeen: 'dev', sound: false, streak: 6, lastDay: null,
    best: 93, history: [93, 88, 71, 90, 64], adCount: 0, pendings: p
  })), [ME, pendings]);
  const shot = async name => { await page.waitForTimeout(450); await page.screenshot({ path: OUT + name + '.png' }); };

  // 1. Home
  await page.goto(APP); await seed([]); await page.goto(APP);
  await page.waitForTimeout(800);
  await shot('1-home');

  // 2. Color picker on the 9 base colors
  await key('Enter');
  await shot('2-picker');

  // 3. Locked in on a blue pick
  await key('6'); await page.waitForTimeout(300);
  await key('SoftRight');
  await page.waitForTimeout(800);
  await shot('3-locked');

  // 4. Result, caught while the sparks fly
  await seed([{ roundId: PAST, hex: '#3C96F0' }]);
  await page.goto(APP);
  await page.waitForFunction(() => document.querySelectorAll('.spark').length > 0, null, { polling: 50, timeout: 15000 });
  // The burst is a short CSS transition that a background page barely paints, so pin each spark 90% of the
  // way along its own path. Copies replace the originals so the app's cleanup timer cannot remove them first.
  await page.evaluate(() => {
    document.querySelectorAll('.spark, .ring').forEach(el => {
      const c = el.cloneNode(), m = /translate\((-?\d+)px,\s*(-?\d+)px\)/.exec(el.style.transform);
      c.style.transition = 'none';
      if (m) { c.style.transform = 'translate(' + m[1] * 0.9 + 'px,' + m[2] * 0.9 + 'px) scale(0.75)'; c.style.opacity = '0.95'; }
      if (m) el.parentNode.replaceChild(c, el); else el.parentNode.removeChild(el); // the ring reads as clutter in a still
    });
  });
  await page.screenshot({ path: OUT + '4-result.png' });

  // 5. Boards, day tab
  await page.waitForTimeout(1200);
  await key('Backspace'); await page.waitForTimeout(400);
  await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
  await page.waitForTimeout(900);
  await shot('5-boards');
  return 'done';
}
