# Review: Hold the Haven (`tower-defense`), branch `feat/game-tower-defense-v2`

Adversarial review of `git diff origin/integration/arena...HEAD` (3 commits, 17 files) against `docs/briefs/games/README.md`, `docs/briefs/games/tower-defense.md`, `docs/design/games/CONTRACT.md`, `docs/games/tower-defense.md` and `docs/RESPONSIVE-RULES.md`.

## Checks run

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npx vitest run src/games` | 14 files, 229 tests, all pass |
| `npm run build` | ok; `node scripts/check-main-chunk.mjs`: the main chunk holds no game |
| `node scripts/games-budget.mjs` | `tower-defense` code 46.1 KB / 150 KB, assets 0 / 200 KB |
| Files outside the allowed list | none (all 17 paths are inside the list; 3 screenshots, 79 KB in total) |
| Playwright | not run (out of scope for this review) |

Probes I ran outside the worktree (engine bundled with esbuild, run with node):

- A 60-game random-action fuzz up to 20,000 steps each (all parties, all difficulties, en and fr): glow never negative, Haven always in `0..havenMax`, every state number an integer, the replay of the same actions gives an identical state (JSON), and the outcome does not change after the end. **No engine defect found.**
- The bot win rate by party size and power (table under M1).
- Forfeit at tick 19 and at tick 20 of the same seed (M2).
- The hint spent by the first card tap (M3).

## Verified correct (no finding)

Determinism (setup rng salted `tower-defense:`, `reduce` uses no randomness, the bot uses only its `rng`); integer maths (every division floored, squared distances, `pointInto` exact); the glow economy (place and upgrade refused below cost, every other change adds); the tick order of spec section 8; Runner and Lantern "first" targeting (highest `pos`, then lowest id, since the array stays in id order); Lantern ignores armour; Sweeper hits everyone in range; Chorus is the highest boost among non-jammed Chorus towers at Chebyshev distance 1 and is recomputed every tick; Archivist prefers unmarked enemies and never weakens a live mark; Lull cap 50, the highest Lull applies, the Specter is immune, the Static is halved; Hearth heals 1 per interval and waits at `cd = 0` when the Haven is full; Bubble splash uses each enemy's own mark and its own armour, knock-back once per 40 ticks, never the Static; the Static jams the nearest non-jammed tower within 3000 u every 100 ticks; waves, counts, intervals and template 7 match section 5; lost is checked before won; revive restores `ceil(max / 2)`; every action after the end returns the same state; the tick guard ends the game at 18,000. Frame-rate independence comes from the shared `useFixedStep` (the Screen dispatches `state.speed` ticks per 50 ms step); the Screen test proves 20 ticks per second at 30 and 60 fps and 40 at x2. Every action has a button and a key.

## Findings

Counts: critical 0, major 3, minor 7, nit 8.

### Critical

None.

### Major

**M1. Difficulty 3 is unwinnable for any party below about power 30; difficulties 1 and 2 are always won.**
`src/games/tower-defense/engine.ts:146` (`HP_PCT = [150, 300, 530, 600, 680]`).
Scenario: the bot (spec section 9 rules), seeds 1 to 30, plain run:

| Party | d1 | d2 | d3 | d4 |
| --- | --- | --- | --- | --- |
| 3 members, power 8 (`parties.starter`) | 30/30 | 30/30 | **0/30** | 0/30 |
| 3 members, power 26 | 30/30 | 30/30 | **0/30** | 0/30 |
| 8 members, power 20 (level 5 or 6) | 30/30 | 30/30 | **0/30** | 0/30 |
| 8 members, power 32 | 30/30 | 30/30 | 11/30 | 3/30 |
| 8 members, power 44 (`parties.full`) | 30/30 | 30/30 | 22/30 | 11/30 |

The hit points jump by 77 percent between difficulty 2 and 3 (300 to 530), so the win rate is a cliff, the same problem the notes describe for the first values, only moved. A player whose vassals are below about level 8 meets a wall the first time the Arena hands out difficulty 3, while difficulties 1 and 2 never lose. The tests only check the full party at difficulty 3 (40 to 70 percent) and the naive starter at difficulty 1, so nothing catches this.
Fix: smooth `HP_PCT` (for example `[150, 240, 360, 470, 600]`) and, if the full-party difficulty 3 target must hold, recover it with a second lever that scales less with power (count or interval). Add a balance test that a mid party (8 members, power 20) wins at least some games at difficulty 3, and that difficulty 2 loses at least once for the starter party, so the curve has no cliff. Write the table in `docs/games/tower-defense.md` section 13.

**M2. The required "same seed gives the same outcome" e2e test depends on wall-clock timing and can flake in CI.**
`e2e/games/tower-defense.spec.ts:73-84`, with `src/games/tower-defense/engine.ts:775-778` (the trickle adds to `glowEarned`) and `:1050` (`glowEarned` in `stats`).
Scenario: the play callback places a tower and presses Give up while the real-time clock runs. The Lab's comparison (`outcomeKey` in `src/games/lab/LabGame.tsx:39-43`) compares the whole outcome except `durationMs`, so `stats` included. A forfeit at tick 19 gives `glowEarned: 0`, at tick 20 `glowEarned: 1` (probe, seed 42, full party). If the first run (which includes the page load and the first frames) reaches 1 s before Give up and the replay does not, or the reverse, `lab-compare` shows "Differs from the previous run." and the assertion `toHaveText('Matches the previous run.')` fails. A slow shard, the mobile emulation or two workers make 1 s plausible; the brief warns that a flaky or slow spec stalls every other PR.
Fix: play the replay through the deterministic engine: `replaySameSeed(page, () => botPlayToOutcome(page).then(() => undefined))`, as the brief suggests for real-time games. If the real UI must stay, press `p` first thing and keep the ticks out of the outcome (both runs then forfeit at the tick of the pause, which is still a race), so the Bot play route is the robust one.

**M3. The `hint` buff mostly does not work, can be spent without ever being shown, and is invisible to assistive technology.**
`src/games/tower-defense/Screen.tsx:131-140` (a card tap on a free cursor pad places at once), `:246` (the star needs `picked !== null`), `src/games/tower-defense/engine.ts:951` (placing on `bestPad` spends a hint), `src/games/tower-defense/draw.ts:372-378` (the star is canvas only), `src/games/tower-defense/strings.ts:25` (`pad.hint` is never used).
Scenario: a run with one hint (`hint-s` in the Arena lottery). At the start no card is picked, so no star is drawn; the first tap on a card places the tower on the cursor pad (pad 1) at once. On 31 of seeds 1 to 100 (full party, difficulty 3) pad 1 is the best pad for that first card, so the hint is spent and the player never saw a star. Later, the star appears only for the card picked last, and pressing another card's number places it at once, so the same silent spend repeats. A screen-reader user never learns where the star is: the canvas label, the pad status line and the feed do not mention it.
Fix: spend the hint only when the placement follows a displayed star (for example add `hinted: true` to the `place` action from the Screen when the target pad is the starred one, and have the bot never send it), or show the star before the first placement by pre-selecting the first card. Announce it in text: append `s.pad.hint` to the pad status when `cursor === hintPad`, and add the best pad number to the canvas label ("Best spot: pad 4"). Add a Screen test for the hint.

### Minor

**m1. Enemies twitch back by about one tick on every tick (interpolation reads refs that are one render late).**
`src/games/tower-defense/Screen.tsx:249-254`, `:266-297` (pattern inherited from `src/games/ui/RealtimeExample.tsx:35-47`).
Scenario: in a browser, `useFixedStep` dispatches the tick and then calls `onFrame(alpha)` in the same `requestAnimationFrame` callback. React 18 renders the update in a later task, so that frame still draws the old pair (`prevPos` = state n-1, `stateRef` = state n) at a small `alpha`, near state n-1, after the previous frame drew near state n at `alpha` 0.95. Every 50 ms the monsters step back one tick of movement (1 to 2 px at phone size, double at x2), a visible shimmer. The jsdom test hides it because `act()` flushes synchronously.
Fix: interpolate from data the frame callback owns: keep a `ticksDone` counter in the clock callback and draw from the state produced by the engine in that callback (for example run `engine.reduce` on a ref copy alongside `dispatch`), or clamp `alpha` to 1 until `stateRef.current.tick` has caught up with the number of ticks dispatched. Since the pattern is shared, also write it in the notes file for the owner of `src/games/ui/`.

**m2. Reduced motion still flashes: shot lines appear for one tick and vanish, several times a second.**
`src/games/tower-defense/draw.ts:299-309`; dead rule `src/games/tower-defense/Screen.module.css:187-189`.
Scenario: `reducedMotion: true`, a Runner (interval 4 at power 44) shooting: a coloured line blinks on for 50 ms five times per second, for every tower. The brief asks for "no flashing" under reduced motion. `.still .canvas { scroll-behavior: auto; }` does nothing.
Fix: under `v.reduced`, skip the shot lines or draw a steady marker that stays while the tower has a target (for example a small static dot on the aimed enemy for the whole interval). Remove the dead CSS rule.

**m3. Focus is lost when the game ends: Give up, Pause, Speed and Next wave unmount.**
`src/games/tower-defense/Screen.tsx:341-345`, `:425-437`.
Scenario: a keyboard user tabs to Give up and presses Enter. The game ends, the button is removed and focus falls to `document.body`; the next Tab starts from the top of the page and a screen reader loses its place. The same happens when the game ends while focus is on Pause or Next wave.
Fix: keep the buttons and set `disabled` at the end (as the cards already do), or move focus to the result banner (`tabIndex={-1}`) or to Leave when `over` turns true.

**m4. The frame loop allocates every frame, against spec section 10 ("No allocation in the frame loop").**
`src/games/tower-defense/draw.ts:216` (`geometry()` returns a new object), `:279` and `:316` (template-literal font strings), `:312-314` (closure and two `Point` objects), `:350` with `src/games/tower-defense/engine.ts:421` (`enemySlow` calls `padCenter`, which allocates a `Point` per Lull per enemy per frame).
Scenario: 48 enemies and 2 Lulls at 60 fps: about 6,000 short-lived objects per second from the slow check alone, which is the garbage-collector churn the brief's 60 fps target on a mid-range phone wants to avoid.
Fix: hoist the scratch points and geometry into the `Fx` or `View` object, cache the font strings per `letterSize`, and compute slowed enemies once per state change (a `Set` of ids rebuilt in the state effect, like `prevPos`) instead of per frame.

**m5. The responsive rules for the cards and breakpoints are not followed as written.**
`src/games/tower-defense/Screen.module.css:76`, `:191-211`.
Scenario: spec section 10 says cards `repeat(4, minmax(0, 1fr))`, 2 columns under 360px, and CONTRACT section 9 lists breakpoints at `max-width: 359px`, `min-width: 768px` and `max-height: 500px`. The CSS uses `repeat(auto-fill, minmax(4.9rem, 1fr))` and has no `max-width: 359px` query. At 390x844 with 150 percent text a 4.9rem card is about 118 px, so the 8 cards wrap to 2 or 3 per row instead of the specified layout, and the departure is not in the notes.
Fix: use `repeat(4, minmax(0, 1fr))` with `@media (max-width: 359px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`, or keep `auto-fill` and record the departure in `docs/review/notes/game-tower-defense.md`. Check 320x568 and 390x844 at 150 percent after the change.

**m6. Tests that cannot fail or assert less than their names say.**
- `src/games/tower-defense/engine.test.ts:873-884` "ticks in batches of 1, 2 or 5 give the same state": the engine has no notion of a batch; all three loops call `reduce` 600 times with the same action, so the test is a tautology. Fix: delete it (the Screen clock tests carry frame-rate independence) or make it meaningful (interleave a `place` at different points of a batch and assert the same final state when the action lands on the same tick).
- `engine.test.ts:963-967` is named "wins every seed on the full party at difficulty 2 and beats the naive floor on difficulty 1 with the starter party" but asserts `wins > 0` on 20 seeds. Fix: `expect(wins).toBe(20)` or rename.
- `engine.test.ts:461-487` "keeps glow at or above zero over 200 random games": 160 actions per game; the probe shows the furthest game reaches tick 103 and only 5 of 200 games ever kill a monster, so kill income, sell after upgrades and late-game calls are barely exercised. Fix: play each game to its end (20,000 steps, mostly ticks, as in my fuzz) and assert the invariant every step.
- `src/games/tower-defense/Screen.test.tsx:235-250` "plays a whole game to the outcome the engine computes for the same actions": it never computes the engine's outcome; it only checks `won` or `lost` and the first log line. Fix: record the dispatched actions (or replay the same tick count through `engine.reduce`) and compare the outcome, or rename.
- `Screen.test.tsx:290-298` "under reduced motion it still moves the enemies, tick by tick": nothing checks that interpolation is off (`alpha` 1); with interpolation left on, the test still passes. Fix: spy on `arc` and assert the monster's drawn x equals `pointInto` of the current `pos` at a mid-tick frame.

**m7. Important state lives only on the canvas.**
`src/games/tower-defense/Screen.tsx:314-321` (pad status), `src/games/tower-defense/strings.ts:45-52` (tower `blurb`, never shown), `draw.ts:285-296`, `:343-353`.
Scenario: a screen-reader user with the cursor on a jammed tower hears "Pad 3 of 10: Runner of Pell, level 1" with no word that it is jammed; marks, slows and the range are canvas only; and no player, sighted or not, can read what a tower does (the eight blurbs exist in both languages but nothing renders them). CONTRACT section 9 asks a canvas game to mirror the essential state in text.
Fix: add "jammed" (and the tower's blurb) to `padText`, and show each card's blurb as its `aria-description` or a visible line under the name.

### Nit

**n1. Hard-coded visible text.** `Screen.tsx:313` (`' · '`), `:321` (`': '`, which gives "Emplacement 1 sur 10: libre" without the French space before the colon), `:382` (`'-'`, "Upgrade (-)"), `draw.ts:352` (`'z'`). Fix: add `hud.separator`, `pad.line` ("{status}: {text}" / "{status} : {text}"), and a slowed letter to `strings.ts`.

**n2. Unusable controls advertise numbers.** `Screen.tsx:381-386`, `:433-435`: "Upgrade (-)", "Sell (+0)" and "Next wave (+0)" stay enabled when nothing can happen; only the feed explains. Fix: a plain label ("Upgrade", "Sell", "Next wave") when there is no tower or no wave to call.

**n3. Note ordering breaks after 500 notes.** `Screen.tsx:328`: `order = after + 0.5 + id / 1000` exceeds the next engine line's order once `id >= 500` (pause toggles and "not enough glow" lines add up in a long game), so a note can sort after a later engine line. Fix: sort by `[after, kind, id]` as a tuple instead of one float.

**n4. Double P press can be lost.** `Screen.tsx:166-170` reads `pausedRef`, which is written in an effect after commit; two `p` presses before a render both read `false` and both pause. Fix: `setPaused((p) => !p)` and derive the note from the new value.

**n5. A called wave's second monster comes one tick early.** `engine.ts:610` with `:985-995`: `callWave` queues spawns at `state.tick + offset`, the first spawns on the next tick (`tick + 1`), the second at `tick + interval`, so the first gap is `interval - 1`; a scheduled wave spawns its first monster on `waveAt` itself. Fix: `startWave` could use `w.tick + 1 + g.offset` when called between ticks, or document it.

**n6. A Hearth can cancel a loss in the same tick, silently.** `engine.ts:837-841` runs at step 6, after the leak at step 4, and the loss check is step 10. Probe: Haven 1, a leak, a Hearth ready: the feed says "Haven 0 of 10", the next HUD shows 1, the game goes on, no revive line. It follows the spec's tick order, but the player doc does not say it. Fix: one sentence under "Hearth" in `docs/games/tower-defense.md` (or a feed line when a Hearth lifts the Haven from 0).

**n7. Docs drift.** `docs/games/tower-defense.md` section 8 lists `towerStats(tower, state)`, the code exports `towerStats(tower)` (`engine.ts:372`); the enemy table's "800 (kept)" reads as if the Static's hit points were fixed, but the HP formula scales it (6,020 at difficulty 3, about 7,700 at difficulty 5). The `end` screenshot shows a give-up on a fresh board, not the end of a played game. Fix: correct the signature, add "scaled like every monster" to the Static row, and take the `end` shot after a short real game or a forfeit mid-wave.

**n8. Selling a jammed tower and placing it again clears the jam.** `engine.ts:972-983` and `:948` (a new tower starts with `jamUntil: 0`). At a 30 percent loss it is a weak exploit, but it undoes the boss's only mechanic. Fix: carry `jamUntil` to the pad (refuse `place` on a pad whose last tower is still jammed) or accept and document it.
