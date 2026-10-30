# QTrain design

Date: 2026-10-30
Status: draft for review

## Intent

A KaiOS game where players try to "sense" a color before it is drawn from a public randomness source. Players pick a color by drilling down a 3x3 grid; every 5 minutes a NIST Randomness Beacon pulse decides the real color, and the closest picks top the scoreboards. The owner frames it as training "magical skills" to influence quantum odds; the game itself is a game of luck and intuition. The store listing and in-app copy should present it that way and must not promise real-world winnings.

Success: it is fun to play a round in under a minute on a keypad phone, the scoreboards feel alive, it passes KaiStore review, and it earns ad revenue.

## Goals

- Competitive mode: 5-minute rounds decided by the NIST beacon, with Round, Day, Week and All-time boards.
- Practice mode: instant rounds with the same picker, decided by the lizaonair QRNG, not ranked.
- Fully playable with a D-pad, number keys and softkeys on a 240x320 screen.
- Hosted on GitHub Pages, submitted to the KaiStore as a hosted app, monetized with KaiAds.

## Non-goals

- Anti-cheat against multiple accounts. The owner does not care; covering the color space takes ~16.7M accounts.
- Real accounts, passwords, email, or cross-device sync.
- Offline play (the game needs the network to submit and see results).
- Touchscreen or desktop polish beyond "works in a browser for testing".

## Anti-goals

- Ads that interrupt picking or hide the countdown.
- Any claim that skill here improves odds in gambling, lotteries, or anything real.
- A results value anyone could tamper with: the color must come from a public pulse players can look up.

## Decided by the owner

- Rounds every 5 minutes, decided by a NIST beacon pulse.
- Scoreboards rank the closest pick.
- Picker: 9 base colors on keys 1-9. After the first pick, the current color sits on 5 and the others nudge it:

  | key | effect | key | effect | key | effect |
  |---|---|---|---|---|---|
  | 1 | red - x | 2 | all channels + x (lighter) | 3 | red + x |
  | 4 | green - x | 5 | current color (no-op) | 6 | green + x |
  | 7 | blue - x | 8 | all channels - x (darker) | 9 | blue + x |

- x shrinks as the player drills down so they can reach any exact hex.
- Right softkey = Submit. Left softkey = Undo, shown in muted gray and disabled until there is something to undo. Back/Backspace also undoes when undo is available (otherwise Back behaves normally).
- Players can drill as many levels as they want before submitting.
- Two modes: practice (lizaonair, instant) and competitive (beacon).
- No protection against multi-accounting.
- Monetization: ads.
- Hosting: GitHub Pages. Distribution: KaiStore.
- Project folder: `C:\Users\Gabriel.Pierce\source\repos\vibe-code-stuff\qtrain`.

## Designer's calls (owner can override)

### Picker details
- Base colors (key 1-9): crimson `#C81E32`, orange `#F07814`, yellow `#F0D21E`, green `#3CBE3C`, teal `#1EB4AA`, sky `#3C96F0`, blue `#283CC8`, purple `#8232BE`, pink `#E63CAA`.
- Step at depth d (d = number of picks so far, starting at 1 after the base pick): `max(1, round(32 * 0.6^(d-1)))`, giving 32, 19, 12, 7, 4, 3, 2, 1, 1...
- Channels clamp to 0..255.
- The bar above the grid shows the current hex and step size. Undo pops one level (step grows back).
- A prototype of this lives at `.superpowers/brainstorm/*/content/round-flow-v2.html`.

### Rounds
- Rounds close at every UTC minute divisible by 5 (:00, :05, ...). 288 rounds per day.
- A round's id is its close time in ms since epoch.
- Picks for a round are accepted until 10 s before close. After submitting, a pick cannot change. One pick per player per round; a later submit for the same round is rejected.
- The deciding pulse is the NIST beacon pulse whose `timeStamp` equals the close time: `GET https://beacon.nist.gov/beacon/2.0/pulse/time/{closeMs}`. Use the pulse's `outputValue` (512-bit hex). If that pulse is missing or its time does not match, use the next pulse within 4 minutes after the close time and record which pulse was used. If no pulse arrives in that window (beacon outage), the round is void: no color, no ranks, no board entries, and players see "Beacon offline, round void". This keeps every round's color unique; rounds never share a pulse.
- Color = first 3 bytes of `outputValue` as R, G, B.
- Closeness = `100 * (1 - dist / 441.673)` where dist is Euclidean RGB distance and 441.673 is the max distance (sqrt(3) * 255). Shown with one decimal.
- Ties: earlier submit time wins.

### Practice mode
- Same picker, submit draws a color instantly from lizaonair: one value 0..65535 (R and G) plus one 0..255 (B). Ranges above 65535 return wrong values on that API.
- lizaonair sends no CORS headers, so the Worker proxies it.
- Practice results are kept on the device only (local best, recent history) and never ranked.

### Players
- On first launch the app creates a random player id (UUID) and asks for a nickname (3-12 chars, A-Z 0-9, uppercase, T9-friendly). Both stored in localStorage.
- Nicknames are not unique; boards show nickname plus a short id suffix only on collision.
- Simple filter for obviously offensive nicknames (small word list).
- Lost device = new player. No recovery.

### Scoreboards
- Round: every pick in that round, ranked.
- Day (UTC), Week (ISO week, UTC), All-time: each player's single best pick in the period, ranked; ties broken by earlier submit.
- Each board shows top 10 plus the player's own position.

### Engagement
- Daily streak: days in a row with at least one competitive pick.
- Result screen shows closeness, rank in round, and "your best today".
- Share (left softkey on results): opens SMS with text like "I hit 94.2% on QTrain round 14:35 (#3 of 41). Beacon #C8263F, me #FB253E".
- Optional local notification when a submitted round resolves, if the platform allows it; otherwise the app polls while open.

### Screens
1. Splash/home: Competitive (shows countdown to next close), Practice, Boards, Settings (nickname, about).
2. Pick: header with round time and countdown; grid; softkeys Undo / Submit. In the last 10 s the round shows "locked", and the player picks for the next round.
3. Locked in: swatch, countdown, softkeys Practice / Boards.
4. Result: you vs beacon swatches, closeness, rank, best today; softkeys Share / Next. Links the pulse index so players can verify.
5. Boards: tabs Round / Day / Week / All switched with left/right D-pad.
6. About: how rounds work, the beacon, "a game of luck and intuition".

### Platform
- One codebase serves KaiOS 2.5 and 3.x. Write JS that runs on Gecko 48 (KaiOS 2.5): no async/await, no ES modules, no optional chaining; plain ES5 plus what Gecko 48 supports (let/const, arrow functions, template literals, Promise, fetch). No build step required; a build step that transpiles is acceptable if the builder prefers it.
- Keys: `SoftLeft`, `SoftRight`, `Enter`, `Backspace`, `ArrowUp/Down/Left/Right`, digits. Desktop testing aliases: Q = SoftLeft, E = SoftRight.
- Manifests: `manifest.webapp` (2.5) and `manifest.webmanifest` (3.x), icons 56 and 112 px.
- Dark theme, large type, the grid fills the screen between header and softkey bar.

### Backend
- One Cloudflare Worker with a D1 database (free tier).
- Tables: `players(id, nickname, created_at)`, `picks(round_id, player_id, rgb, submitted_at, closeness, rank)`, `rounds(round_id, pulse_index, rgb, resolved_at)`.
- Endpoints:
  - `POST /pick {playerId, nickname, roundId, rgb}`: validates the round is open and not locked, one pick per player per round.
  - `GET /round/{roundId}`: status, beacon color, ranked picks once resolved.
  - `GET /board/{day|week|all}?player=`: top 10 plus the player's rank.
  - `GET /practice`: proxied lizaonair draw.
- A Cron Trigger every minute resolves any closed, unresolved rounds: fetch the pulse, compute color, score and rank picks.
- CORS allows the GitHub Pages origin.

### Ads
- KaiAds full-screen ad when the app opens (after splash) and after a result screen, at most once every 3 results. Practice and competitive results both count toward the same counter (owner's decision). Never on the pick screen.
- Publisher id is configuration, not hard-coded in several places.
- KaiAds setup supplied by the owner: SDK `https://static.kaiads.com/ads-sdk/ads-sdk.v5.min.js`, call `getKaiAd({ publisher: '0b1f52de-82bb-4c58-b2e4-1b125c046417', app: 'qtrain', slot: 'qtrain-us', onerror, onready: ad => ad.call('display') })`.
- The owner's snippet links the manifest at `/manifest.webmanifest`. On a GitHub Pages project site (`<user>.github.io/qtrain/`) that root path breaks, so use a relative `manifest.webmanifest` unless a custom domain is used.

## Constraints

- KaiStore accepts only apps monetized with KaiAds (per KaiOS developer docs). Hosted apps are allowed: only the manifest is submitted and content stays on the owner's server.
- Store listing limits: subtitle 40 chars, description 220 chars, icons 56x56 and 112x112; test on 256 MB devices.
- NIST beacon: free, no key, CORS open, pulses every 60 s.
- lizaonair: free, no key, no CORS headers, values above 65535 come back wrong.
- Free tiers only for hosting and backend.

## Unverified, check early

- Whether the KaiAds SDK works inside a hosted app served from GitHub Pages. If not, the fallback is a packaged app whose code calls the Worker; the rest of the design holds.
- KaiOS 2.5 support for whatever notification API is used.

## Accounts the owner must set up

- GitHub (not currently signed in on this machine).
- Cloudflare (Worker + D1).
- KaiAds publisher account and KaiStore developer account.

## Left to the builder

- File layout, frameworks (or none), test approach.
- Exact visual styling within the dark, large-type direction.
- Polling intervals and caching.
- Offensive-word list contents.
