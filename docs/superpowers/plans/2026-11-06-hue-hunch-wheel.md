# Hue Hunch Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a second app, Hue Hunch Wheel (two timed spins, Redo/Submit, live picks wheel), rename the existing app to Hue Hunch Grid, and give both apps Stats screens comparing picks against chance, the beacon and a PRNG control.

**Architecture:** One repo, one Worker, two front ends. `app/js/ui.js` becomes a shared screen framework (`QTUI`) that each app configures through a small `QTGame` object; picking screens live in their own files. The Worker gains chance-score math (`worker/src/chance.js`), a PRNG control drawn at resolution, per-round stats computed by the cron (which also backfills old rounds), and three read endpoints. `tools/build-site.js` assembles one Pages site with the grid at `/qtrain/` and a self-contained wheel at `/qtrain/wheel/`.

**Tech Stack:** ES5 browser JS (KaiOS 2.5 / Gecko 48), canvas 2D, Cloudflare Worker + D1, node:test with `test/d1-fake.js` (node:sqlite), GitHub Pages via Actions.

**Spec:** `docs/superpowers/specs/2026-11-03-hue-hunch-wheel-design.md`

## Global Constraints

- App code in `app/js` and `wheel/js`: ES5 only. No async/await, modules, arrow functions, `let`/`const`, `?.`, `??`, template literals. Worker and tests may use modern JS.
- Screen 240x320, keypad only: Enter and `5` are the center press; SoftLeft/SoftRight softkeys; Backspace goes back. Desktop aliases Q/E stay.
- Names: grid app "Hue Hunch Grid", wheel app "Hue Hunch Wheel".
- Grid keeps localStorage key `qtrain.state`; wheel uses `huehunch-wheel.state`.
- Schema changes are additive (`ALTER TABLE ... ADD COLUMN`); live data must survive.
- Scoring and ranking of picks do not change.
- No other player's pick is ever returned to a player who has no pick in that round.
- Stats copy is neutral: never claims an effect the data does not show.
- Wheel ads use `qtrain` / `qtrain-us` for now.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `wheel`, not `main`.

## Review Focus

1. A round with one pick, or many identical picks: the chance band must widen (identical picks are fully correlated), not shrink as 1/sqrt(n).
2. Old resolved rounds with no PRNG color: stats work, Algorithm shows as unavailable, never as 0% or NaN.
3. `GET /round/:id/picks` for a player with no pick, an unknown round, a void round: 403 or empty, never a leak.
4. Wheel press timing on a slow phone: the picked color must come from the line's angle at the press time, not from the last painted frame.
5. Grid app after the refactor: nickname, competitive, practice, boards, result, How it works and saved data all behave exactly as before.

---

### Task 1: Shared UI framework and the Grid rename

**Files:**
- Create: `app/js/game.js`, `app/js/screen-grid.js`, `app/js/main.js`
- Modify: `app/js/ui.js`, `app/js/player.js`, `app/index.html`, `app/manifest.webapp`, `app/manifest.webmanifest`, `test/player.test.js`

**Interfaces:**
- Produces:
  - `QTPlayer.create(storage, key)`: `key` defaults to `'qtrain.state'`.
  - `root.QTGame = { name, storageKey, intro }` where `intro` is the How-it-works paragraph about picking (HTML string). Grid: `{ name: 'Hue Hunch Grid', storageKey: 'qtrain.state', intro: <current 1-9 paragraph> }`.
  - `root.QTUI` with: `screens`, `go(name, arg)`, `header(title, info)`, `soft(l, c, r, lOff, rOff)`, `content(html)`, `toast(msg)`, `esc`, `css`, `clock`, `mmss`, `players`, `replay`, `submit(rgb, mode, onFail)`, `player`, `state` (exposes `lastRoundId`, `results`), `start()`.
  - Screens may define `leave()`; `go` calls it on the outgoing screen (needed for the wheel's animation loops and polls).
  - `screens.pick` is no longer defined in ui.js; `app/js/screen-grid.js` registers it. `submit(rgb, mode, onFail)` takes the color instead of reading the grid picker; `onFail()` lets the pick screen re-render.

- [ ] **Step 1: Write the failing test** in `test/player.test.js`:

```js
test('create takes a storage key', () => {
  const s = memStorage();
  P.create(s, 'other.state').setNickname('zed');
  assert.equal(P.create(s, 'other.state').nickname(), 'ZED');
  assert.equal(P.create(s).nickname(), null);
});
```

- [ ] **Step 2: Run** `npm test`. Expected: the new test FAILS (nickname shared through the default key); the other 47 pass.
- [ ] **Step 3: Implement** the `key` parameter in `player.js` (`var k = key || KEY`).
- [ ] **Step 4: Run** `npm test`. Expected: 48 pass.
- [ ] **Step 5: Refactor ui.js.** Move the Pick screen and the grid picker into `screen-grid.js` using `QTUI`. Replace every literal "Hue Hunch" in ui.js with `QTGame.name` (home header, share texts, About). The About picking paragraph becomes `QTGame.intro`. Remove the auto-start at the bottom of ui.js into `QTUI.start()`; `main.js` is one line calling it. Script order in `app/index.html`: config, core, picker, player, api, ads, sfx, game, ui, screen-grid, main, kaiads.
- [ ] **Step 6: Rename** title and header in `index.html`, and `name`, `short_name`, `locales.en-US.name` in both manifests to "Hue Hunch Grid". Leave `id`, paths, `developer` and icon URLs alone.
- [ ] **Step 7: Verify in a browser.** Serve the repo (`npx --yes http-server@14.1.1 . -p 5500 -c-1 --silent`), open `/app/index.html` with the local Worker or the Playwright mocks from `store/shots.js`. Check: header says "Hue Hunch Grid", the grid picks and undoes, practice submits, competitive submits and locks, boards load, About text shows the grid paragraph. Run `npm test`: 48 pass.
- [ ] **Step 8: Commit**: `git commit -m "Split the screens into a shared framework and rename to Hue Hunch Grid"`

### Task 2: Chance-score math

**Files:**
- Create: `worker/src/chance.js`, `test/chance.test.js`

**Interfaces:**
- Produces (CommonJS, like `rank.js`):
  - `chance(pRgb, tRgb)`: share of colors farther from p than t is, 0..1, ties half. Estimated on `GRID16` (cell centers `8 + 16k`, k = 0..15 per channel, 4096 points).
  - `nullVar(picksRgb)`: population variance, over targets t in `GRID8` (centers `16 + 32k`, 512 points), of `mean_i chanceOn(GRID8, p_i, t)`. Uses one sort of the 512 squared distances per pick. Returns 0 for no picks.
  - `roundStats(picksRgb, quantumRgb, prngRgb | null)` returns `{ n, qMean, pMean, nullVar, q: [..], p: [..] | null }` (means 0..1, per-pick scores in pick order).
  - `summary(rows)` where rows are `{ roundId, n, qMean, pMean, nullVar }` ascending, returns `{ rounds, picks, quantum, algorithm, algorithmRounds, algorithmSince, band: [lo, hi], series }`. Values are percents to one decimal. `quantum` is the pick-weighted mean; `band = 50 ± 1.96 * sqrt(Σ n²·v / (Σ n)²) * 100`; `algorithm` uses only rows with `pMean != null` (null when none); `series` holds at most 40 points `{ t, q, a, lo, hi }` of the running values, evenly spaced over the rows and always including the last.
  - `bandFor(n, nullVar)` returns `[lo, hi]` percents for one round.

- [ ] **Step 1: Write the failing tests:**
  - `chance matches an exact count within half a point`: an exact reference (count over all 2^24 colors via the separable per-(r,g) range count, test-local helper) for pairs `[[0,0,0],[255,255,255]]`, `[[128,128,128],[130,140,120]]`, `[[20,200,90],[180,60,140]]`. Assert `Math.abs(chance - exact) < 0.005`.
  - `chance of the pick itself is about 1`: `chance([10,20,30],[10,20,30]) > 0.99`.
  - `nullVar of one pick is about 1/12`: `Math.abs(nullVar([[90,40,200]]) - 1/12) < 0.006`.
  - `identical picks do not shrink the band`: `nullVar` of ten copies equals `nullVar` of one copy (within 1e-12).
  - `spread picks shrink the band`: `nullVar([[0,0,0],[255,255,255],[255,0,0],[0,255,255]]) < 1/12 / 2`.
  - `roundStats leaves p null without a PRNG color`.
  - `summary weights rounds by picks and skips missing algorithm`: rows `{n:1,qMean:1,pMean:null,nullVar:1/12}` and `{n:3,qMean:0.5,pMean:0.5,nullVar:0.01}` give `quantum 62.5`, `algorithm 50`, `algorithmRounds 1`, `algorithmSince` the second roundId.
  - `summary caps the series at 40 points and keeps the last`: 100 rows, `series.length === 40`, last `t` is the last roundId.
- [ ] **Step 2: Run** `node --test test/chance.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `worker/src/chance.js` per the Interfaces. Compare squared distances; no `Math.sqrt` in loops.
- [ ] **Step 4: Run** `npm test`. Expected: all pass. If the exact-count test misses by more than 0.005, switch `chance` to a 32-step grid (32768 points) and note it in the ledger.
- [ ] **Step 5: Commit**: `git commit -m "Add chance-score math for stats"`

### Task 3: PRNG control, stored stats and backfill

**Files:**
- Create: `worker/migrations/0001-stats.sql`
- Modify: `worker/schema.sql`, `worker/src/db.js`, `worker/src/index.js`, `test/worker-db.test.js`, `README.md`

**Interfaces:**
- Consumes: `chance.roundStats`.
- Produces:
  - Columns: `rounds.prng_hex TEXT, stats_n INTEGER, q_mean REAL, p_mean REAL, null_var REAL`; `picks.chance_q REAL, chance_p REAL`. Added to the CREATE statements in `schema.sql` (fresh DBs) and as ALTERs in the migration (live DB, run once).
  - `db.resolveRound(db, roundId, pulseIndex, hex, ranked, nowMs, prngHex)` also stores `prng_hex`.
  - `db.roundsNeedingStats(db, limit)` returns resolved round ids with `stats_n IS NULL`, oldest first.
  - `db.saveStats(db, roundId, stats, picks)` writes the round's stats and each pick's `chance_q`/`chance_p` in one batch. `picks` are `roundPicks` rows in the same order as the scores.
  - `db.statsRows(db)` returns `{ roundId, n, qMean, pMean, nullVar }` for resolved rounds with `stats_n > 0`, ascending.
  - `db.roundStatsRow(db, roundId)` returns the same shape plus `status`, or null.
  - `index.js`: `resolveDue` draws `prngHex` with `Math.random` for each resolved round; `scheduled` runs `resolveDue` then `scoreDue`.
  - `worker/src/scoring.js` (CommonJS, so node tests can load it; `index.js` is ESM and the root package is `"type": "commonjs"`): `scoreDue(db, limit = 10)` scores up to `limit` rounds from `roundsNeedingStats`.

- [ ] **Step 1: Write the failing tests** in `test/worker-db.test.js`:
  - `resolveRound stores the PRNG color`.
  - `rounds needing stats are resolved and unscored`: one resolved, one void, one open; only the resolved id comes back; after `saveStats` it no longer does.
  - `saveStats stores per-pick chance scores`.
  - `statsRows skips rounds without picks scored and keeps null pMean for backfilled rounds`.
  - `scoreDue backfills an old round without a PRNG color` (resolved with `prngHex` null: `q_mean` set, `p_mean` null).
- [ ] **Step 2: Run** `node --test test/worker-db.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the schema, migration and db functions. `test/d1-fake.js` loads `schema.sql`, so the CREATE statements carry the new columns.
- [ ] **Step 4: Implement** `scoring.js` and the PRNG draw in `index.js`. Round with no picks: `saveStats` with `n = 0` so it is not retried.
- [ ] **Step 5: Run** `npm test`. Expected: all pass.
- [ ] **Step 6: Local check**: `cd worker && npx wrangler d1 execute qtrain --local --file migrations/0001-stats.sql` on an existing local DB, then `npx wrangler dev --test-scheduled`, submit a pick, trigger `/__scheduled` after the round closes, and confirm `SELECT prng_hex, stats_n, q_mean FROM rounds` is filled.
- [ ] **Step 7: README**: the Deploy section runs `migrations/0001-stats.sql` once on the live DB before `wrangler deploy`.
- [ ] **Step 8: Commit**: `git commit -m "Draw a PRNG control color and store per-round stats"`

### Task 4: Stats and live-picks endpoints

**Files:**
- Create: `worker/src/routes.js` (CommonJS: `handleStats(env, parts, now)` and `handleLivePicks(env, roundId, playerId)` returning `{ status, body }`; `index.js` wraps them with `json()`)
- Modify: `worker/src/index.js`, `worker/src/db.js`, `app/js/api.js`, `test/worker-logic.test.js`, `test/api.smoke.sh`

**Interfaces:**
- Consumes: `chance.summary`, `chance.bandFor`, `db.statsRows`, `db.roundStatsRow`.
- Produces:
  - `GET /stats/round/:id` returns `{ roundId, status: 'ready'|'pending'|'void'|'none', n, quantum, algorithm|null, band: [lo, hi] }` (percents, one decimal).
  - `GET /stats/all` returns `chance.summary(statsRows)`. Empty: `{ rounds: 0, picks: 0, quantum: null, algorithm: null, band: null, series: [] }`.
  - `GET /round/:id/picks?player=<id>` returns 403 `{ error: 'pick_first' }` unless the player has a pick in that round. Otherwise `{ roundId, picks: [{ nickname, tag, hex, submittedAt, mine }] }`, oldest first, capped at 200 (`db.livePicks(db, roundId, limit)`). Route it before `/round/:id`.
  - `QTApi.roundStats(id)`, `QTApi.allStats()`, `QTApi.livePicks(id, playerId)`.

- [ ] **Step 1: Write the failing tests** in `test/worker-logic.test.js`, calling `routes.js` with `createD1()` as `env.DB`:
  - `live picks are refused before you pick` (403).
  - `live picks list everyone once you pick, with your own marked`.
  - `round stats are pending until scored, then carry the band`.
  - `all stats are empty-safe`.
- [ ] **Step 2: Run** them. Expected: FAIL, `routes.js` not found.
- [ ] **Step 3: Implement** `routes.js`, wire it into `index.js`, and add the `QTApi` methods.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Extend** `test/api.smoke.sh` with the three endpoints, and run it against `wrangler dev`. Expected: it prints its pass line.
- [ ] **Step 6: Commit**: `git commit -m "Serve round and all-time stats and live round picks"`

### Task 5: Stats screens in both apps

**Files:**
- Create: `app/js/stats.js`, `app/js/screen-stats.js`, `test/stats.test.js`
- Modify: `app/js/ui.js` (Home entry and result key), `app/css/app.css`, `app/index.html`

**Interfaces:**
- Consumes: `QTUI`, `QTApi.roundStats`, `QTApi.allStats`.
- Produces:
  - `QTStats.verdict(label, value, band)` returns e.g. `"Quantum 54.1%: inside the chance band, so no different from chance."`; above the band: `"... above the chance band: closer than chance usually gives."`; below: `"... below the chance band: farther than chance usually gives."`; `value == null`: `"<label>: not available yet."`.
  - `QTStats.scale(series, band)` returns `{ min, max }`, covering 50, the band and every value, padded 2 points, clamped to 0..100.
  - Screen `stats`, entered as `go('stats', { roundId|null, back })`: tab 0 "This round" (only when roundId is given), tab 1 "All rounds". Left/Right switch tabs, Backspace and SoftRight return to `back`.
  - Home gains "Stats" (before "How it works"). The result screen's center softkey is "Stats".

- [ ] **Step 1: Write the failing tests** for `verdict` (inside, above, below, null) and `scale` (includes 50 and the band; clamps).
- [ ] **Step 2: Run** `node --test test/stats.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `stats.js` (ES5, dual export like `core.js`).
- [ ] **Step 4: Implement** `screen-stats.js`:
  - **This round:** three labelled horizontal bars (Expected 50%, Quantum, Algorithm), the band shaded on the shared scale behind them, the player count, and the verdict sentence for Quantum.
  - **All rounds:** a canvas line chart (about 220x110): 50% line, shaded band, Quantum line, Algorithm line from `algorithmSince`. Then the totals (rounds, picks), the verdict, and "Algorithm control since <date>".
  - **Key at the bottom of both tabs:** a swatch per series, "Shaded band: where chance lands 95% of the time", and "About 1 round in 20 lands outside it by luck alone."
  - Colors: Quantum `#5AB0FF`, Algorithm `#F2B134`, Expected and band neutral gray.
- [ ] **Step 5: Run** `npm test`. Expected: all pass.
- [ ] **Step 6: Verify in a browser** with mocked `/stats/*` (pattern from `store/shots.js`): inside-band, above-band and no-algorithm cases at 240x320. Everything is readable without scrolling except the key, which may scroll with Down.
- [ ] **Step 7: Commit**: `git commit -m "Add round and all-rounds stats screens"`

### Task 6: Wheel picker logic

**Files:**
- Create: `app/js/wheel.js`, `test/wheel.test.js`

**Interfaces:**
- Produces `QTWheel` (ES5, dual export):
  - `LAP_MS = 2400`.
  - `hueRgb(h)`: `hsl(h, 1, 0.5)`, h in 0..1.
  - `shadeRgb(h, s)`: s in 0..1 walks four equal segments through HSL anchors: pale (S .9, L .88), vivid (1, .5), dark (.9, .14), muted (.25, .5), then back to pale. (S, L) are interpolated linearly inside a segment.
  - `fracAt(startMs, nowMs)`: `((nowMs - startMs) / LAP_MS) % 1`; angle = `frac * 2π`, 0 at the top, clockwise.
  - `place(rgb)` returns `{ frac, r }`: frac is the HSL hue, r = 1 - L (pale near the center, dark at the rim), for drawing picks.
  - `create()` returns a state machine:
    - `phase()`: 'hue', 'shade' or 'review'.
    - `start(now)`.
    - `press(now)`: in hue, stores the hue from `fracAt` and moves to shade with start = now. In shade, stores the shade and moves to review. Returns the new phase.
    - `back(now)`: from shade or review goes to hue (start = now) and returns true; from hue returns false.
    - `current()`: the rgb in review, else null.
    - `preview(now)`: the rgb under the line right now.

- [ ] **Step 1: Write the failing tests:**
  - `hue ring starts red at the top`: `hueRgb(0)` is `[255,0,0]`.
  - `shade ring hits its anchors`: `shadeRgb(0, 0.25)` equals `hsl(0, 1, .5)`.
  - `fracAt wraps each lap`: `fracAt(0, 3600)` is 0.5.
  - `press uses the press time, not a frame time`: start(0), press(600) gives hue 0.25, press(1800) gives shade 0.75, and `current()` equals `shadeRgb(0.25, 0.75)`.
  - `back returns to the hue spin and clears the guess`.
  - `place puts pale colors near the center and dark ones at the rim`.
- [ ] **Step 2: Run** `node --test test/wheel.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `wheel.js`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**: `git commit -m "Add the two-spin wheel picker logic"`

### Task 7: The wheel app

**Files:**
- Create: `wheel/index.html`, `wheel/js/game.js`, `wheel/manifest.webapp`, `wheel/manifest.webmanifest`, `wheel/css/wheel.css`, `app/js/screen-wheel.js`, `tools/build-site.js`
- Modify: `.github/workflows/pages.yml`, `.gitignore` (`_site/`), `tools/make-icons.js` (wheel icon to `wheel/icons/56.png`, `112.png`), `app/js/ui.js` (result screen hook)

**Interfaces:**
- Consumes: `QTUI`, `QTWheel`, `QTApi.livePicks`, `QTStats`.
- Produces:
  - `wheel/js/game.js`: `QTGame = { name: 'Hue Hunch Wheel', storageKey: 'huehunch-wheel.state', intro: <two spins, Redo/Submit, live wheel> }`.
  - `screen-wheel.js` registers:
    - `pick`: canvas wheel about 200x200 and a `requestAnimationFrame` loop that stops in `leave()`. The hue ring is pre-rendered once to an offscreen canvas. Enter or 5 calls `press(Date.now())` from the key handler, so the stop uses the press time. In review: SoftLeft "Redo", SoftRight "Submit", which calls `QTUI.submit(rgb, mode, onFail)`. Backspace calls `back()`, or goes home from hue. Sounds: 'key' on each stop, 'undo' on Redo.
    - `locked`: replaces the grid's locked screen in this app. Draws the disc and plots every pick with `place()`; nicknames go above your own dot and the newest 5, with `-tag` added when names repeat. Polls `livePicks` every 4 s, backing off to 15 s after a failure. It keeps the countdown from the grid's locked screen and stops polling in `leave()`.
  - The result screen in the wheel app: Left/Right toggle between the score view and a wheel view that also plots the beacon color as a ring marker.
  - `tools/build-site.js [version]`: writes `_site/` with `app/*` at the root and `wheel/*` under `_site/wheel/`. It copies the shared files (`config, core, player, api, ads, sfx, ui, stats, screen-stats, wheel, screen-wheel, main` js and `css/app.css`) into `_site/wheel/js` and `_site/wheel/css`, and stamps `version: 'dev'` in both config copies when a version is given.
  - Wheel manifests: copy the grid's and change: `id` `huehunch-wheel`, name and short_name "Hue Hunch Wheel", `launch_path` and `start_url` `/qtrain/wheel/index.html`, scope `/qtrain/wheel/`, icons under `wheel/icons/`. The subtitle and description are about stopping a spinning line on the beacon's next color.
- [ ] **Step 1: Implement** `build-site.js`, then switch the workflow to it: run the tests, `node tools/build-site.js ${GITHUB_SHA::7}`, upload `_site`. Add `wheel/**` and `tools/build-site.js` to the trigger paths. Remove the sed stamp step, since the build stamps the version now.
- [ ] **Step 2: Implement** the wheel shell (`index.html`, its script order mirrors the grid's with wheel.js and screen-wheel.js in place of picker.js and screen-grid.js), `game.js` and `screen-wheel.js`.
- [ ] **Step 3: Generate icons:** `node tools/make-icons.js` now also writes the wheel icon (a hue ring with a white line on the same rounded square).
- [ ] **Step 4: Verify in a browser:** `node tools/build-site.js && npx --yes http-server@14.1.1 _site -p 5500 -c-1 --silent`, with the local Worker running.
  - Both `/` (grid) and `/wheel/` load.
  - The wheel saves to its own localStorage key.
  - Hue stop, shade stop, Redo and Submit all work.
  - The live wheel shows a second player's pick (submitted with curl) within about 5 s.
  - The result toggle shows the beacon marker.
  - Stats opens from the result screen.
  - Practice works, with no live view.
  - Then run `npm test`: all pass.
- [ ] **Step 5: Commit**: `git commit -m "Add the Hue Hunch Wheel app and a combined Pages build"`

### Task 8: Store art and docs

**Files:**
- Create: `store/wheel/banner.html`, `store/wheel/img_hue_hunch_wheel.jpg`, `store/wheel/shots.js`, `store/wheel/screenshots/*.png`
- Rename: `store/img_hue_hunch.jpg` to `store/img_hue_hunch_grid.jpg`
- Modify: `README.md`, `store/shots.js` (retake for the Grid name and the Stats entry)

- [ ] **Step 1: Make the wheel banner and screenshots.** The banner is 240x130 JPG, under 100 KB, with no text. The five 240x320 screenshots are home, hue spin, review, live wheel and stats, made with the backend mocked as in `store/shots.js`.
- [ ] **Step 2: Retake the grid screenshots and update the README.** README covers both apps, the build script, the migration step and the wheel's manifest URLs.
- [ ] **Step 3: Run** `npm test`. Expected: all pass.
- [ ] **Step 4: Commit**: `git commit -m "Add Wheel store art and document both apps"`

### Task 9: Release (owner go-ahead required)

- [ ] **Step 1:** Ask the owner before any of the following. Each one changes live systems.
- [ ] **Step 2:** `cd worker && npx wrangler d1 execute qtrain --remote --file migrations/0001-stats.sql`
- [ ] **Step 3:** `npx wrangler deploy`, then `bash ../test/api.smoke.sh https://qtrain.help-agapebible.workers.dev`
- [ ] **Step 4:** Merge `wheel` into `main` and push. Confirm the Pages deploy succeeds and that both `/qtrain/` and `/qtrain/wheel/manifest.webmanifest` load.
- [ ] **Step 5:** Tell the owner what is left for them: submit the wheel manifest URLs to the KaiStore, try installing both apps on a real phone (the same-origin risk), and register the wheel's own KaiAds slot.
