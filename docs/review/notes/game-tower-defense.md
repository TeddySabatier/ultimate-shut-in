# Notes: Hold the Haven (`tower-defense`)

Branch `feat/game-tower-defense-v2` (PR #25 against `integration/arena`). Spec: `docs/games/tower-defense.md`.

## Another branch exists

`origin/feat/game-tower-defense` (Cursor Agent, about 07:17 UTC on 2026-10-20) holds an older, unrelated attempt at this game. It has no PR and was **not** merged, checked out or copied. The maintainer should close or delete it once PR #25 merges.

## Departures from the spec and decisions

- **Balance (the tunable numbers), after the review.** Damage scales with `(100 + p)` percent, not `(100 + 2p)` (range, interval and cost scaling unchanged). `HP_PCT = [220, 310, 410, 470, 520]` (spec: 70 to 135), `CNT_PCT = [90, 100, 110, 115, 120]` (spec: 70 to 130), no step above 1.45 times. Start glow (`[120, 110, 100, 95, 90]`) and the Static's 800 are unchanged. A leaking monster is removed, so the Haven's hit points are the only loss and the win rate is steep in monster hit points; the first values (and a first retune with a 77 percent step) made difficulty 3 a wall for any party below about power 30.
  Win table of the bot of spec section 9, no buffs (30 seeds unless noted):

| Difficulty | full (power 44) | mid, 8 members at power 20 | starter (power 8) |
| --- | --- | --- | --- |
| 1 | 30 | 30 | 30 |
| 2 | 30 | 20 | 24 |
| 3 | 16 (51 of 100) | 11 | 0 |
| 4 | 12 | 0 | 0 |
| 5 | 3 (5 of 50) | 0 | 0 |

  Targets, each asserted in `engine.test.ts`: (a) full d3 seeds 1..100: 51 (40 to 70); (b) mid d3 seeds 1..30: 11 (at least 3); (c) starter d2 seeds 1..30: 24 (18 to 29); (d) naive bot, starter, d1, seeds 1..50: 50 (at least 45); (e) full d5 seeds 1..50: 5 (at least 1). Both (a) and (b) hold. Difficulty 3 stays out of reach for the starter party; the Arena only raises the difficulty with the room index.
- **Spec ambiguities, decided:**
  - A tower never targets, splashes or sweeps a monster with hp <= 0 that is only waiting for removal at the end of the tick.
  - The kill goes to the member whose blow drops the monster (credited at that moment); `dealt` counts at most the monster's remaining hit points.
  - `cleared` = min(started, oldest wave still queued or alive - 1): waves called early clear together. A `waveDone` feed line ("Wave n cleared.") covers a clear while a later wave is already running (the spec has only `waveCleared`, which promises a next wave in s seconds).
  - `glowEarned` includes the next-wave bonus.
  - Bot: if the party has no Runner, Lantern, Sweeper or Bubble, it builds and upgrades its Archivist as the damage kind. "Damage towers" for the Chorus pad score and rule (b) are Runner, Lantern, Sweeper and Bubble. When it cannot afford the wanted tower it never upgrades instead (spec step 1 goes straight to step 3).
  - Feed parameters are pre-localised strings (monster and tower names), because the state keeps the locale.
  - Enemy ids rise with spawn order, so "ties to the lowest id" is "first in the array".
  - With no hint left, tapping a card with the cursor on a free pad places the tower at once if affordable (else it selects the card and the feed says why). The `1` to `8` keys do the same; Enter or Space on the board place the picked card or upgrade. With a hint left, a first tap only selects the card and moves the cursor to its best pad (see Review fixes).
  - The pad status line (`aria-live="polite"`, `data-testid="td-pad"`) announces the cursor move, so the feed is kept for game events.
  - Unaffordable cards are shown with a dashed edge and a danger-coloured cost, never reduced opacity (axe contrast); they stay enabled.
  - The card grid uses `repeat(auto-fill, minmax(min(100%, 4.9rem), 1fr))` instead of the spec's `repeat(4, minmax(0, 1fr))`: in the landscape two-column layout the cards' column is only about 350 px and four columns overflowed; `auto-fill` gives 4 columns on a phone and 3 there, and `min(100%, ...)` keeps the track minimum from ever exceeding its container, so it still obeys the minmax rule. A `max-width: 359px` rule gives two columns.
  - Hearth starts with `cd = 0`, so it heals a hurt Haven the tick after it is placed.
- **Cut:** nothing. All three maps, three levels, sell and speed x2 are in.
- **Extra files:** `draw.ts` (canvas drawing, no DOM), `glyphs.ts`, `screenLogic.ts` (pad cursor and feed text), all flat in the game folder.

## Review fixes (cold review of c73fecd)

- **M1** damage `(100 + p)`, `HP_PCT` and `CNT_PCT` retuned, balance tests (a) to (e) plus a smoothness test; table above and in the spec.
- **M2** the same-seed e2e replays through Bot play (deterministic); the real-UI forfeit no longer feeds the comparison.
- **M3** with a hint left, a card tap or key selects the card and moves the cursor to its best pad (the star), announced by a feed line, the pad status line, the board label and a visible "Hints n"; a second tap or Enter places. `place` carries `hinted: true` only when the Screen showed that star, and only then is a hint spent (the bot never sends it).
- **n6** a Haven at 0 is settled right after the leaks (revive, or lost and the rest of the tick is skipped), so a Hearth cannot cancel a loss.
- **n8** `sell` is refused while a tower is jammed (the feed says why).
- **n5** a called wave queues at `tick + 1 + offset`, matching a scheduled wave's gaps.
- **m1** the Screen keeps its own `prev` and `cur` states, updated at the moment of each action (`engine.reduce` is pure, so they equal React's), and draws from those: no one-render lag. **For the owner of `src/games/ui/`:** `RealtimeExample` has the same pattern (refs updated in an effect after the render that follows `onFrame`), so its frame right after a tick interpolates the old pair; a hook that hands out the tick's states, or a note in CONTRACT section 6, would spare other games.
- **m2** no shot lines under reduced motion (nothing replaces them); the dead `.still` rule is gone.
- **m3** the result line takes focus when the game ends.
- **m4** the draw loop reuses geometry, scratch points and font strings; `enemySlow` no longer allocates.
- **m5** `max-width: 359px` breakpoint added; the `auto-fill` grid is explained above.
- **m6** tests rewritten: the batch test now interleaves actions and can fail; the difficulty 2 test asserts 20 of 20; the glow fuzz plays 200 mixed bot and random games to their end and asserts kills and late waves; the Screen test compares the whole outcome with the engine's; a reduced-motion test checks where a monster is drawn mid-tick, with and without motion.
- **m7** the pad status says when a tower is jammed, and the description of the picked card (or of the tower under the cursor) is visible text.
- **n1** separators, the French space before a colon and the slowed mark come from `strings.ts`. **n2** plain labels ("Upgrade", "Sell", "Next wave") when nothing can happen. **n3** the feed sorts by a tuple. **n4** pause is a functional toggle and the note follows the state. **n7** the spec's `towerStats` signature, the Static row, and the `end` screenshot (a mid-wave forfeit with towers and monsters on the board).

## Environment

- The worktree folder was deleted once mid-build and re-created by the maintainer's session; the engine was rewritten from the spec and the session context, nothing was lost.
- No git identity was configured in the worktree, so commits carry `Claude Fable 5.1 <noreply@anthropic.com>` as author.

## Needs from files I do not own

None.
