# Notes: Still Water (`game-still-water`)

PR #26 (draft, stacked on #25). The seed commit was the overnight Cursor build, never reviewed. This file is the audit of that build against `docs/briefs/games/still-water.md`, `docs/briefs/games/README.md` and `docs/design/games/CONTRACT.md`, the baseline results, the checklist and the decisions taken.

## Baseline: the seeded state against the current kit

Run on `e6c171a` in a fresh worktree:

| Command | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npx vitest run src/games` | 14 files, 164 tests, all pass |
| `npm test` | 75 files, 995 tests, all pass |
| `npm run build` | passes |
| `node scripts/games-budget.mjs` | still-water code 18.3 KB / 150 KB |
| `npm run screenshots:check` | 60 expected files, no stale ones |

So the kit and the lint found nothing: the seed already took the locale argument, had `forfeit`, the doc headings and `shootGame` screenshots. What was wrong was the design and the quality, which no kit checks. Found by reading the code against the brief:

1. **Always-held scored about 50 percent.** The accuracy was agreement over scored ticks; the kit and the old tests did not notice because the old notes claimed Jaccard. Holding the button all the time passed 60 percent with the steadiness bonus on easy difficulties.
2. **The hint was a static dashed ring.** `showHint` drew a ring that marked nothing, plus a free +10 score for having an Eat troop. No real "gentle hint line".
3. **Move was not adjustable.** It silently lengthened every phase (a longer game, nothing to choose).
4. **The bot had no seeded timing error.** It was a fixed lateness per difficulty plus "gust" cycles drawn at setup, so its score was almost the same for every seed and the "score distribution" was not a distribution. It also never exercised `tap`.
5. **The ring was not smooth.** It scaled in 20 Hz steps (no `onFrame(alpha)`), contrary to the real-time section of the contract.
6. **Layout shifted during play.** Decoys were buttons that appeared in a list above the hold button and pushed it down mid-press. In landscape the not-therapy note and every hint were hidden with `display: none`.
7. **Keys.** The window handler took Space and Enter even from a focused Pause or Step away button (a keyboard user pressing Space on Pause also held the breath). Focus loss with a key down stuck the hold. A vibration button showed on browsers without `navigator.vibrate`.
8. **Hard-coded colours** (`#152030`, `#2a4a6a`) in the CSS, and `Meter` as a progress bar updated 20 times a second (screen reader noise).
9. **Water level jumped** (average of cycle accuracies with a partial cycle) and was never 0 at the start. The unplayed cycles of a forfeit counted nothing, so leaving at once could score high on a short average.
10. **Docs, e2e.** The replay test used Step away at once, which proves nothing; there was no scripted real-UI play. The doc said the "hint" added points. The `previous`/Bot play workaround note was true but avoidable.
11. **Copy.** Log lines like "A drifting leaf drifted by", a lost banner that was not the brief's line, and a `learned` note worded as "often steadies attention".

## Checklist against the brief

Legend: done (was right in the seed), fixed (wrong or weak in the seed, now right), added (missing, now there), cut (with the reason).

| Item | Status |
| --- | --- |
| Rhythm 4-2-6 at difficulty 1, 5-3-7 and faster by difficulty, 5 to 8 cycles | done (kept the seed's table: 4-2-6, 5-3-7, 4-2-5, 3-2-4, 3-1-3.5; cycles 5, 6, 6, 7, 8); tested; exact table in the docs |
| Accuracy is the overlap of hold and ideal, per cycle, smooth water score, no failure state | fixed (hits minus false holds over the ideal; water fills smoothly over the first cycle) |
| Decoys only after the first two cycles; one on the water at a time | fixed (slotted placement, tested for 5 difficulties x 30 seeds); the seed could stack them |
| Tapping a decoy costs a little calm; ignoring adds to steadiness | done, fixed counting (steadiness derived from decoys that left untouched; forfeit no longer counts ripples that never appeared) |
| Never a loud sound; no sound by default | done: no sound at all, no setting (the brief allows it) |
| Reduced motion: progress bar and text cue, works with a screen reader | fixed: indeterminate `progressbar` with a text value that changes at phase changes, polite live cue, ring hidden from AT; the seed's `Meter` announced a value 20 times a second |
| Hold by Space, Enter, large button, touch | fixed: key handler no longer steals keys from focused controls, releases on blur and hidden tab and on pause, pointer capture guarded, focus on the hold button after Begin |
| Alternate "tap each phase" mode | done, kept; engine-side meaning unchanged (press says "this phase has started"); documented limit |
| Optional vibration, off by default | fixed: only offered where `navigator.vibrate` exists |
| Score 0 to 1000 from accuracy and steadiness; won at 60 percent; lost with warm copy; fled on exit | fixed: score is accuracy x a ceiling of 850 to 1000 (steadiness, calm); the lost banner is now exactly the brief's line; leaving scores only the cycles played |
| `learned` note about slow exhales, general tip, not advice (en and fr) | fixed wording ("can help", "a general tip, not advice"), both languages |
| Not-therapy note in the docs and a one-line note in the game | fixed: always visible (the seed hid it in landscape) |
| Party: Sleep widens tolerance, Eat a gentle hint line, Move makes the rhythm adjustable | fixed: Sleep unchanged in spirit; Eat is now a real "In 3 s: hold" line; Move is now a pace choice (brisk, steady, slow) |
| Buffs: `time` widens tolerance, `hint` shows the guide, `revive` forgives a cycle, `luck` removes a decoy, `attack` and `defense` ignored | fixed: `time` is 1 tick per 2 s (was 1 per second, a huge grace), `hint` count is that many cycles with the line (was a flag), `revive` count honoured, `luck` removes one |
| Determinism; bot with seeded timing error | fixed: bot error comes from `turnRng(seed, cycle)`, per cycle, with lapses; it taps ripples with a seeded chance |
| `onFrame(alpha)` for smooth drawing, 50 ms tick, `useFixedStep` | fixed (added): the ring is painted from `onFrame` straight into the DOM |
| Engine pure: no `Math.random`, `Date`, `navigator` in `.ts` files | done (lint passes); integer arithmetic for scoring |
| All text via `strings.ts`, en and fr, natural French with "tu" | fixed log and button copy; a unit test forbids "vous" |
| At least 25 unit tests | 56 engine tests (the seed had 28), 21 Screen tests (the seed had 5), the 10 contract kit tests |
| Accessible: labelled controls, `aria-live`, focus, 44 px, contrast | fixed: tokens only (no hard-coded colours), non-colour signal for holding (filled ring, thick edge, aria-pressed), groups with names |
| Responsive at 320x568, 390x844 at 150 percent, 844x390 | fixed: looked at screenshots at the three sizes; two columns in landscape, pond bounded by `dvh`, reserved ripple row; `expectResponsiveGame` in the e2e |
| Leaving early scores through the engine's forfeit | done, kept (`forfeit` action, then a separate Leave); unplayed cycles count as 0 |
| e2e: the three template tests, each under about 20 s, three `shootGame` screenshots | fixed: scripted real-UI play with `page.clock`, a replay that scores a real partial game, screenshots `start`, `play`, `reduced` |
| Docs with `## Party`, `## Buffs`, exact rhythm tables, not-therapy note | rewritten to match the code |
| Cut line (vibration, tap mode, distractions) | nothing cut |

### Added beyond the seed

- **Begin button and a two second get-ready lead.** The seed started the clock at mount, so a player had no time to read or to place a thumb. The lead (`LEAD_TICKS`, 40) scores nothing. The Move pace choice lives on the ready screen.
- **A one-line report per cycle** in a polite live region, so a screen reader user hears how a cycle went without a running number.

## Decisions

- **Scoring formula.** `score = round(mean cycle accuracy x ceiling / 100)`, `ceiling = 850 + 100 x (ripples let go / ripples) + 50 x calm / 100`. Ignoring ripples can only raise a good breath, never rescue a bad one (a player who never holds and ignores everything scores 0, which the seed's flat bonuses did not guarantee).
- **Accuracy is hits minus false holds over the ideal,** not Jaccard: always-held scores 0 to 21 percent depending on the rhythm, never held scores 0.
- **Pace not score.** Move's pace changes the length of the breath only. No multiplier, so nobody is rewarded for choosing one.
- **Hint is information only,** no points. The `hint` buff count means cycles of hint, Eat means all cycles.
- **Bot table is deliberately sloppy** (it presses up to 2 s late at difficulty 1) so that its win rate falls from 94 to 44 percent with the difficulty and sits at 58 to 66 percent on normal; the numbers are in `docs/games/still-water.md`.
- **Quality of ripples.** They are plain buttons with the ripple's name (the brief's `tap(decoyId)`), in a row that is always reserved. They are not announced to a screen reader when they appear, on purpose (ignoring is the point).
- **Strings in the engine.** The outcome log is written in the engine from `strings[state.locale]` (the contract's rule 7); `learned` carries both languages.
- **e2e fake clock.** Playwright's `page.clock` drives the page's animation frames, so the real UI is scripted exactly and fast. A full human-length run through the UI would be about 19 s of real time on this machine (4,000 frames of React and painting), too close to the 20 s budget; the whole game is played with Bot play in the e2e, and by a perfect scripted player in `Screen.test.tsx`.
- **Line endings.** The files are LF.

## Files I do not own

Nothing needed. Observations only, for the maintainers:

- `src/components/SystemWindow.tsx` hard-codes its tone colours (`#6b6b8a`, `#ffb84d`, ...) instead of tokens; not touched.
- The Lab's `Bot play` after `Replay same seed` (the earlier workaround in this file): `replay()` sets `previous` to the current result and clears it, so a bot run after a replay compares against `null` only when no result existed. The e2e no longer depends on that (the replay spec plays the same scripted breath twice).

## Pull request

PR #26 is a draft stacked on #25 (`feat/game-tower-defense-v2`): its description starts with "Stacked on #25. Merge that one first." Do not mark it ready or merge it before the independent review.
