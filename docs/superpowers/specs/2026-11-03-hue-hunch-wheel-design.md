# Hue Hunch Wheel design

Date: 2026-11-03
Status: draft for review

## Intent

A second KaiOS app, **Hue Hunch Wheel**, that plays the same game as the existing app but swaps the 3x3 grid picker for a timing picker: a line sweeps around a wheel and the player presses when it *feels* right. The game is about feel and reflex, not careful navigation. It shares the backend, the rounds and the scoreboards with the grid app, which is renamed **Hue Hunch Grid**.

The wheel app adds one thing the grid app does not have: after you lock in a guess, you watch everyone's guesses for that round appear on the wheel live, each labelled with the player's nickname.

Success: stopping the line feels like a skill you can get a sense for; the live wheel makes a round feel like a crowd event; both apps sit on the same boards without either breaking.

## Goals

- Same game as Hue Hunch Grid in every way except picking: 5-minute beacon rounds, practice rounds, nickname, streak, history, sounds, animations, How it works, ads, Round/Day/Week/All-time boards.
- Two-press picker (below).
- Live view of the round's picks after you guess (below).
- Both apps share one backend and one set of boards.
- Rename the existing app to Hue Hunch Grid.
- Optional Stats screens in both apps comparing picks against chance, the quantum color and an ordinary computer-random control, for this round and all rounds (below).

## Non-goals

- A one-press picker. A spike of a one-press disc (spinning line plus a bead sliding along it) was tried; the owner preferred two presses.
- Live picks in the grid app.
- Push connections (WebSockets etc.). Polling is enough.
- Anti-cheat beyond what the grid app has (see the peek note under Live view).

## Anti-goals

- Showing anyone else's picks before you have locked in your own for that round.
- Anything that changes how picks are scored or ranked: a wheel pick is an RGB hex, scored exactly like a grid pick.
- Breaking the grid app or its saved player data.

## Decided by the owner

- Name: **Hue Hunch Wheel**. The existing app becomes **Hue Hunch Grid** (store name, manifests, header, share text, How it works).
- Picking is two timed presses. The line moves; the wheel does not.
  1. **Hue spin:** a line sweeps around a ring of vivid hues. Press to stop it; where it stops is the hue.
  2. **Shade spin:** the ring becomes the shades of that hue, and the line sweeps again. Press to stop; that shade is the guess.
  3. **Redo or submit:** after the second press the player sees the color and chooses Redo (back to the hue spin) or Submit. Nothing is sent until Submit. Practice works the same way.
- Boards are shared with Hue Hunch Grid.
- Both apps get the new Stats screens (see Stats).
- Live view: after you lock in, the wheel shows your guess and every other pick so far this round, with each player's nickname above their color. New picks appear as they arrive, until the round closes. Before you guess you see nothing.

## Decided with the owner (proposed by Claude, agreed)

- The shade ring loops through pale, vivid, dark and muted/gray tones of the chosen hue, so muted beacon colors are reachable. The spike showed a disc with only vivid-to-dark tones scored poorly on muted targets.
- "Tag" means the nickname.
- Live means the phone polls every few seconds; a new pick can take that long to show.
- A dot's position on the live wheel: angle = hue, distance from center = shade, so similar colors cluster.
- Grid players' picks show on the wheel too, since the round is shared.

## Claude's calls (owner can override)

- **Same repo, second app folder, self-contained when published.** `wheel/` beside `app/`. Source reuses `app/js` (core, player, api, ads, sfx, config), but the Pages build copies the shared files into the published wheel folder so the wheel site never loads from `../`. Published at `https://gabebrpierce.github.io/qtrain/wheel/`. Reason: it is unconfirmed whether KaiStore (KaiOS 2.5 especially) accepts two hosted apps on one origin; a self-contained folder can move to its own origin without code changes. The owner should test install on a device early.
- **Ads.** The wheel uses the grid app's KaiAds app and slot (`qtrain` / `qtrain-us`) until the owner registers its own; then only `config` changes. Until then its earnings count under the grid app.
- **Shared screens, not a fork of ui.js.** Home, nickname, boards, result, About and How it works should be the same code driving both apps; only the pick screen and the locked/live screen differ. How the builder splits ui.js to allow that is their call, but a 500-line copy is not.
- **Separate saved data.** The wheel stores its state under its own key (not `qtrain.state`) with its own player id. On a phone the two installed apps are separate anyway; in a desktop browser they share an origin, and one shared id would mean one pick per round across both apps.
- **Same steady sweep speed** for both spins, always clockwise, so a player can learn the rhythm. Exact speed is tuned by feel during the build (the spike used one lap per 2.4 s).
- **On the result screen** the beacon's color also appears on the live wheel among the picks.
- **Practice rounds** use the same two-press picker; there is no live view in practice (no other players).
- **Store art** for the wheel app: its own banner, five screenshots and icon, made the same way as the grid app's (`store/`), in a `store/wheel/` folder.

## Backend change

One new read: the picks so far for a round, returned only to a player who has a pick in that round.

- `GET /round/:id/picks?player=<id>` returns `{ roundId, picks: [{ nickname, hex, submittedAt }] }`, ordered by submission time.
- If `player` has no pick in that round: 403, no picks.
- After the round resolves it still answers (the live view stays up on the result screen).
- Peek note: someone could submit a throwaway pick under a new id to unlock the list. That only reveals others' guesses, never the beacon color, so it does not help win. Accepted, same spirit as the grid app's "no anti-cheat" non-goal.
- The response may need a cap for very busy rounds; the builder picks a sensible limit and the client copes with a capped list.

## Stats (both apps)

Purpose, in the owner's words: show the data and let it make the case either way, whether people have some predictive (or determinative) relationship to quantum numbers, or whether these are random numbers we just feel connected to. The screens present data neutrally; copy never claims an effect the data does not show (this extends the grid app's anti-goal about claims of real-world skill).

### The measure: chance score

Raw closeness cannot be compared to 50%: random guessing averages about 62% closeness, and central colors score higher regardless. So each pick gets a **chance score** against a target color t:

- `chance(p, t)` = the share of all 16,777,216 RGB colors c that are farther from p than t is (Euclidean RGB distance, ties count half).
- If the target is uniformly random and independent of the pick, this is uniform on 0..1 whatever the pick is, so the average is exactly 50% under chance. Above 50% = picks landed closer than chance.
- Exact computation is feasible (for each R,G pair, count the B values inside the sphere); a sampled estimate is fine if it is within about 0.5 points. Builder's call.

### Three series

1. **Expected:** the 50% line plus a chance band (95%). The band must be honest about the fact that all picks in a round share one target, so their scores are correlated: derive it from the null distribution of the round's mean (for the round's actual picks, the mean chance score against many random targets), not from a naive 1/sqrt(n). For all rounds, combine the rounds' null variances (rounds are independent). The band narrows as data grows.
2. **Quantum:** mean chance score of the round's picks against the beacon color.
3. **Algorithm:** when a round resolves, the Worker also draws a color from an ordinary PRNG (`Math.random`, V8's xorshift128+) at that moment. It is stored with the round, never shown before resolution, and the same picks are scored against it. It is the control: it should look like chance.

Which picks count: competitive picks from both apps in resolved rounds. Practice and void rounds are excluded.

### Views

- **Round stats** (from the result screen, optional, one key): three horizontal bars, Expected/Quantum/Algorithm, with the band drawn on the scale, the player count, and one plain sentence such as "Quantum 54.1%: inside the chance band, so no different from chance this round."
- **All rounds** (next from Round stats, and from a new **Stats** entry on Home): running average over time for Quantum and Algorithm as two lines, the 50% line, and the shaded band, with the same kind of plain sentence and totals (rounds, picks). Downsample the series to what reads on 240 px.
- Every stats screen has a **key** naming each line, bar and the band, and saying "inside the band = consistent with chance".
- Easy to move between: left/right switches Round and All rounds, Backspace returns to where you came from.

### Data

- New per-round values: the PRNG color, pick count, quantum mean, algorithm mean, null variance of the mean. Per-pick chance scores are stored too so totals can be recomputed. Column and table names are the builder's call; schema changes must be additive (`ALTER TABLE ... ADD COLUMN`) so the live data survives.
- Backfill: quantum scores are computed for past resolved rounds. The algorithm control starts the day this ships (no PRNG color was drawn before); the All rounds view says so and plots Algorithm only from then.
- New endpoints, e.g. `GET /stats/round/:id` and `GET /stats/all` (exact shape is the builder's call). Stats are public; they show no individual picks.

## Screen constraints

- 240x320, keypad only. Center key (and 5) presses. Backspace goes back like the grid app.
- Nickname labels on a crowded wheel will collide. Your own pick and the newest few always get labels; older ones may drop to dots only. The exact rule is the builder's call.
- KaiOS 2.5 (Gecko 48): ES5 only, as the rest of `app/js`. Canvas is fine. Keep animation cheap on low-end phones.

## Left to the builder

- Exact shade ring path and the hue ring's look.
- Poll interval (a few seconds) and backoff on failure.
- How ui.js is split to share screens.
- Icon, banner and screenshot designs for the wheel app.
- Chart drawing (canvas or DOM) and exact layout of the stats screens within the 240x320 limits.
- Number of simulated targets for the chance band, and when it is computed (at resolution is natural).
