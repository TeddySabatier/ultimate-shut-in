# Notes: Hold the Haven (`tower-defense`), review leftovers

Branch `fix/td-review-leftovers`, from `integration/arena` after PR #25 merged (`0ce2640`). Source: the independent review of `c73fecd` (0 critical, 6 major, 15 minor). The first run's later commits had already fixed some findings, so each one was re-checked against the merged code before anything was changed. Spec and player doc: `docs/games/tower-defense.md`.

Commits: `eb94ca0` engine and balance, `8c69d9c` screen flow, strings and tests, `ef90afa` card layout, frame key and e2e, then this note and the doc.

## Status of every finding

"At merge" is the code of `0ce2640`. Probes: an instrumented canvas and Playwright on the production build (`vite preview`), the bot over seeds 1 to 100 (engine bundled with esbuild).

| Item | At merge | Now | Evidence |
| --- | --- | --- | --- |
| M1 interpolation jitter | FIXED (b3227b8) | FIXED | Canvas `arc` patched, Lab at 1280x800, `rm=0`, seed 7, starter, difficulty 1: 361 frames, 100 frames of the first blob on a straight run, 0 direction reversals, 0 backward steps (before and after this branch). Screen test checks the drawn position mid-tick. |
| M2 French pad bar overflow | STILL OPEN | FIXED (8c69d9c) | Before: "Emplacement précédent" scrollWidth 110 in 103 px at 844x390, 158 in 151 px at 390x844 and 150% text. After: the buttons read "Précédent" / "Suivant" (full text in `aria-label`); no element in the game root overflows its box at 844x390, 390x844 at 150% text and 320x568, in French and English; screenshots looked at. |
| M3 intro against the controls | STILL OPEN | FIXED (8c69d9c) | Before: tapping the Lantern card on a fresh game built it on pad 1 at once. Now a card only picks; a tap on a free pad builds the picked tower (Playwright touch tap: card tap leaves glow at 100, the tap on pad 4 gives "Pad 4 of 10: Lantern of Wren, level 1", glow 53); Enter and a Build button do the same for keyboard and assistive technology. Intro, board label, feed and doc say so (en, fr). Four new Screen tests. |
| M4 Chorus reach | STILL OPEN | FIXED (eb94ca0) | Before: 0 pads with two or more neighbouring pads on all 6 map/mirror combinations. Now the Chorus has a reach in units (2100 + 5 per power + 250 per level, pad centre to pad centre): 6 or 7 pads per map have two or more other pads within 2100 u (10 with 2320 at power 44). Tests: the aura boosts two towers, and every map has 5 or more such pads. The bot builds a Chorus (rule rewritten). |
| M5 slow Screen test | STILL OPEN (5.8 s in the full suite, hidden by `timeout: 60000`) | FIXED (8c69d9c) | The whole-game test advances five ticks per frame (the clock's catch-up limit) and has no timeout override: 0.4 s alone, 1.2 s in the full suite (two full runs, 1100 tests, all green). The slowest tower-defense test is the shared kit's termination check, 3.6 s, which carries its own 60 s limit in the kit. |
| M6 difficulty curve, support towers | PARTLY (HP smoothed; starter d3 0, removal of Clean +28 points, Study +18) | FIXED (eb94ca0) | Table below. Removing one member from the full party at difficulty 3 (300 seeds): 185 wins with all eight; 170 without Move, 170 Outside, 146 Clean, 182 Social, 178 Study, 194 Sleep, 150 Eat, 203 Hygiene; the largest rise is +6 points. |
| m1 tower texts and hint never shown | FIXED (b3227b8) | FIXED | `td-info` shows the picked card or the tower under the cursor; the pad line says "Best spot"; Screen tests. |
| m2 punctuation in JSX | FIXED | FIXED | `pad.line`, `hud.separator`; French "Emplacement 1 sur 10 : libre" test. |
| m3 French grammar | STILL OPEN ("prête", "1 vaincus") | FIXED (8c69d9c) | "Tour {tower} choisie." and "{n} monstre(s) vaincu(s)"; engine test on the log. |
| m4 doc says difficulty 4 is one in five | doc rewritten at merge | FIXED | Section 13 holds the 100-seed table (full party 40 percent at difficulty 4). |
| m5 allocation in the frame loop | MOSTLY FIXED (b3227b8) | FIXED (ef90afa) | `draw.ts` reuses geometry, points and font strings, `enemySlow` takes a scratch point; the last per-frame string, the static-layer cache key in `Screen.tsx`, is now three numbers. |
| m6 test titles promise more | FIXED for the first four | FIXED | The balance block was rewritten around what it asserts (parties, difficulties, ablation, hit points). |
| m7 e2e replay proves nothing | FIXED (fbbed14) | FIXED | The replay compares two Bot play outcomes (`lab-compare` says "Matches the previous run."). |
| m8 tiny pad targets | OPEN | MITIGATED (8c69d9c) | The cell stays 24 to 34 px (a 9 column board on a phone). Pad numbers are bold and at least 10 px (were 8), a tap picks the nearest pad within one cell, and Previous/Next/Build are real buttons. |
| m9 board and cards do not fit one screen | OPEN | MITIGATED (8c69d9c, ef90afa) | Cards now sit right under the board, the intro goes away after the first wave, cards are 3 or 4 per row (3 under 360 px). With a wave running at 390x844 the last card ends at y 836 of 844 (the Lab's own header is included); at 320x568 and at 150% text they still scroll, and Pause is there for that. |
| m10 note ordering after 500 notes | FIXED (b3227b8) | FIXED | The feed sorts by a tuple (`at`, kind, id). |
| m13 unfinished states | PARTLY FIXED | FIXED (8c69d9c) | HUD reads "Get ready: n waves" before the first wave (was "Wave 0 of n"); "Upgrade (-)" is gone; Next wave is disabled once the last wave has started; the dead `.still` rule is gone. |
| m14 focus after Give up | FIXED (b3227b8) | FIXED | The result line takes focus (Screen test). |
| m15 `end` screenshot | OPEN | SKIPPED, documented | A real finished game takes minutes, the e2e budget is 20 s, and the Lab cannot show a bot game on the stage. The doc now says the shot is the closing screen after giving up mid-game. |
| m11 `towerStats` signature, m12 card grid | not in the list | documented | Both are in the doc. |

## Win rates of the bot (seeds 1 to 100, no buffs)

| Difficulty | full (power 44) | mid, 8 members at power 20 | five vassals at power 21 | starter (power 8) | mixed fixture |
| --- | --- | --- | --- | --- | --- |
| 1 | 100 | 100 | 100 | 100 | 100 |
| 2 | 100 | 100 | 100 | 93 | 100 |
| 3 | 63 | 31 | 11 | 26 | 31 |
| 4 | 40 | 0 | 0 | 0 | 3 |
| 5 | 6 | 0 | 0 | 0 | 0 |

At merge it was: full 100/100/51/36/11, starter 100/80/0/0/0, mixed 100/80/48/17/1, five 100/86/31/0/0.

What changed and why:

- The three maps are not equally hard, and a win rate is a step per map, which is why a smooth curve needed changes in several places: monsters now toughen with the party's mean power at a third of the towers' rate (`hpPct`), the base damage of Sweeper (5 to 7) and Bubble (8 to 10) and the Archivist mark (25/35/45 to 40/50/60) were raised until a bot that built only one kind of gun did about as well with each, and `HP_PCT` is `[280, 300, 465, 540, 570]`.
- The bot (spec section 9) builds six damage towers before any support tower, then Chorus, Lull, Archivist and (when hurt) Hearth, then a seventh damage tower. Before, the supports came first and took glow from the guns, so a bot with fewer members won more often.
- Known limits, in the doc: a win rate moves in steps of about a third because the maps differ; the five-vassal party (11) is below the starter party (26) at difficulty 3 for that reason, and it was higher (31) at merge, so the mid-game party lost something to the new, stronger link between power and result. The Arena raises difficulty every other room and a party that got there has been trained and geared. Only the full party has a real chance at difficulties 4 and 5.

## Decisions

- A tap on a card no longer builds. The old flow (card tap builds on the cursor pad) was what the first run's notes described as a decision; it contradicted the intro and the brief ("number keys pick a tower, Enter places"), so the brief won. After a build the pick is used up, so a stray tap on a free pad later builds nothing.
- Chorus reach in units rather than extra pads: the maps stay as the spec drew them, and the aura now scales with power and level like every other range.
- The "mid" party of the old tests and a five-vassal party are both in the balance tests with loose bands (30 seeds); the 100-seed table lives in the doc.

## Needs from files I do not own

None.
