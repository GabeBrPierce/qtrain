# Hue Hunch

Two KaiOS games on one backend: guess the color the NIST Randomness Beacon draws every 5 minutes. Closest pick wins the Round, Day, Week and All-time boards, shared by both apps. Practice rounds draw instantly from lizaonair.com/qrng.

- **Hue Hunch Grid** (`app/`): pick with 1-9 on a 3x3 grid, then refine.
- **Hue Hunch Wheel** (`wheel/`): a line sweeps a color wheel; stop it on the hue, then on the shade, then Redo or Submit. After you lock in, everyone's picks appear on the wheel live.
- Both apps have **Stats**: picks scored against chance (50% = guessing), against the beacon, and against an ordinary PRNG color drawn at the same moment as a control, for one round and all rounds.

Layout:

- `app/` the Grid app and the shared code. `app/js/ui.js` is the screen framework (`QTUI`); each app's `js/game.js` names it, `screen-grid.js` / `screen-wheel.js` add its pick screens, `screen-stats.js` the Stats screens. Plain ES5 for KaiOS 2.5 (Gecko 48) and 3.x.
- `wheel/` the Wheel app's own page, manifests, icons, `js/game.js` and `css/wheel.css`. `tools/build-site.js` copies the shared scripts in.
- `worker/` Cloudflare Worker + D1: stores picks, resolves rounds every minute from the beacon, draws the PRNG control, scores stats (`chance.js`, `scoring.js`), serves boards, stats and live picks, proxies practice draws.
- `docs/superpowers/` design and build plan.

## Develop

```bash
npm test                                   # unit tests
cd worker && npm install
npx wrangler d1 execute qtrain --local --file schema.sql
npx wrangler dev --test-scheduled          # API on http://127.0.0.1:8787
```

```bash
node tools/build-site.js                   # assemble _site/: Grid at /, Wheel at /wheel/
npx http-server@14.1.1 _site -p 5500 -c-1  # http://localhost:5500 and /wheel/ (talk to the local Worker)
bash test/api.smoke.sh                     # API smoke test (local by default, or pass a URL)
```

Resolve closed rounds locally: `curl "http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"`.

Desktop keys: 1-9 pick (Grid), Enter or 5 stops the line (Wheel), Backspace undo/back, Q = left softkey, E = right softkey, Enter = center, arrows navigate. Left/Right on a Wheel result flips to the wheel of picks; the center key on a result opens Stats.

## Deploy

```bash
cd worker
npx wrangler d1 execute qtrain --remote --file schema.sql                  # new database only
npx wrangler d1 execute qtrain --remote --file migrations/0001-stats.sql   # once, on a database made before Stats
npx wrangler deploy
bash ../test/api.smoke.sh https://qtrain.<subdomain>.workers.dev
```

Put the Worker URL in `app/js/config.js` (`apiBase`). Pushing `app/` or `wheel/` to `main` runs the tests, builds `_site/` with `tools/build-site.js` and deploys GitHub Pages through `.github/workflows/pages.yml` (repo Settings > Pages > Source: GitHub Actions). The manifests assume the site lives at `https://<user>.github.io/qtrain/` (Wheel at `/qtrain/wheel/`); change the paths if the repo name or domain differs.

## KaiStore

- Hosted apps: submit the manifest URL (`manifest.webapp` for KaiOS 2.5, `manifest.webmanifest` for 3.x).
  - Grid: `https://gabebrpierce.github.io/qtrain/manifest.webapp` / `.../qtrain/manifest.webmanifest`
  - Wheel: `https://gabebrpierce.github.io/qtrain/wheel/manifest.webapp` / `.../qtrain/wheel/manifest.webmanifest`
  - Both apps share one origin. Install both on a real phone before relying on that; the Wheel folder is self-contained and can move to its own origin if the store objects.
- Content updates go live when Pages updates.
- Ads: KaiAds publisher `0b1f52de-82bb-4c58-b2e4-1b125c046417`, slot `qtrain-us` (set in `app/js/config.js`), used by both apps until the Wheel gets its own slot. Ads show on app open and after every 3rd result.
- Listing limits: subtitle 40 chars, description 220 chars, icons 56 and 112 px (`node tools/make-icons.js` regenerates both apps' icons).
- Describe them as games of luck and intuition.
- Store art, theme color `#2B2D5C` for both:
  - Grid in `store/`: banner `img_hue_hunch_grid.jpg` (from `banner.html`), five screenshots in `screenshots/` (from `shots.js`).
  - Wheel in `store/wheel/`: banner `img_hue_hunch_wheel.jpg` (from `banner.html`), five screenshots in `screenshots/`. `shots.js` makes both, with the backend mocked and a fake clock so the stops land on the same blue each run.
