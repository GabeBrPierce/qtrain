# QTrain

A KaiOS game: guess the color the NIST Randomness Beacon draws every 5 minutes. Closest pick wins the Round, Day, Week and All-time boards. Practice rounds draw instantly from lizaonair.com/qrng.

- `app/` static KaiOS web app (GitHub Pages). Plain JS that runs on KaiOS 2.5 (Gecko 48) and 3.x.
- `worker/` Cloudflare Worker + D1: stores picks, resolves rounds every minute from the beacon, serves boards, proxies practice draws.
- `docs/superpowers/` design and build plan.

## Develop

```bash
npm test                                   # unit tests
cd worker && npm install
npx wrangler d1 execute qtrain --local --file schema.sql
npx wrangler dev --test-scheduled          # API on http://127.0.0.1:8787
```

```bash
npx http-server@14.1.1 app -p 5500 -c-1    # app on http://localhost:5500 (talks to the local Worker)
bash test/api.smoke.sh                     # API smoke test (local by default, or pass a URL)
```

Resolve closed rounds locally: `curl "http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"`.

Desktop keys: 1-9 pick, Backspace undo/back, Q = left softkey, E = right softkey, Enter = center, arrows navigate.

## Deploy

```bash
cd worker
npx wrangler d1 execute qtrain --remote --file schema.sql
npx wrangler deploy
bash ../test/api.smoke.sh https://qtrain.<subdomain>.workers.dev
```

Put the Worker URL in `app/js/config.js` (`apiBase`). Pushing `app/` to `main` deploys GitHub Pages through `.github/workflows/pages.yml` (repo Settings > Pages > Source: GitHub Actions). The manifests assume the site lives at `https://<user>.github.io/qtrain/`; change the `/qtrain/` paths if the repo name or domain differs.

## KaiStore

- Hosted app: submit the manifest URL (`.../qtrain/manifest.webapp` for KaiOS 2.5, `.../qtrain/manifest.webmanifest` for 3.x). Content updates go live when Pages updates.
- Ads: KaiAds publisher `0b1f52de-82bb-4c58-b2e4-1b125c046417`, slot `qtrain-us` (set in `app/js/config.js`). Ads show on app open and after every 3rd result.
- Listing limits: subtitle 40 chars, description 220 chars, icons 56 and 112 px (`node tools/make-icons.js` regenerates them).
- Describe it as a game of luck and intuition.
