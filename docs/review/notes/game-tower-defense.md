# Notes: Hold the Haven (`tower-defense`)

Branch `feat/game-tower-defense-v2` (PR #25 against `integration/arena`). Spec: `docs/games/tower-defense.md`.

## Another branch exists

`origin/feat/game-tower-defense` (Cursor Agent, about 07:17 UTC on 2026-10-20) holds an older, unrelated attempt at this game. It has no PR and was **not** merged, checked out or copied. The maintainer should close or delete it once PR #25 merges.

## Departures from the spec and decisions

- **Balance (the tunable numbers).** `HP_PCT = [150, 300, 530, 600, 680]` (spec: 70 to 135) and `CNT_PCT = [90, 100, 110, 115, 120]` (spec: 70 to 130). With the first values the bot won every game at every difficulty: tower damage at power 44 is generous and a leaking monster is removed, so the Haven's hit points are the only loss and the win rate is a cliff. Start glow (`[120, 110, 100, 95, 90]`) and the Static's hit points (800) are unchanged.
  Results: bot, `parties.full`, seeds 1..100, difficulty 3: **51 of 100** (difficulty 1: 50/50, 2: 50/50, 4: 20/50, 5: 5/50 on 50 seeds); naive bot, difficulty 1, `parties.starter`, seeds 1..50: **50 of 50**. The kit's "bot wins at least once with full on plain (difficulty 2)" passes.
- **Spec ambiguities, decided:**
  - A tower never targets, splashes or sweeps a monster with hp <= 0 that is only waiting for removal at the end of the tick.
  - The kill goes to the member whose blow drops the monster (credited at that moment); `dealt` counts at most the monster's remaining hit points.
  - `cleared` = min(started, oldest wave still queued or alive - 1): waves called early clear together. A `waveDone` feed line ("Wave n cleared.") covers a clear while a later wave is already running (the spec has only `waveCleared`, which promises a next wave in s seconds).
  - `glowEarned` includes the next-wave bonus.
  - Bot: if the party has no Runner, Lantern, Sweeper or Bubble, it builds and upgrades its Archivist as the damage kind. "Damage towers" for the Chorus pad score and rule (b) are Runner, Lantern, Sweeper and Bubble. When it cannot afford the wanted tower it never upgrades instead (spec step 1 goes straight to step 3).
  - Feed parameters are pre-localised strings (monster and tower names), because the state keeps the locale.
  - Enemy ids rise with spawn order, so "ties to the lowest id" is "first in the array".
  - Tapping a card with the cursor on a free pad places the tower at once if affordable (the spec's "else selects it" case: the card is selected and the feed says why). The `1` to `8` keys do the same; Enter or Space on the board place the picked card or upgrade.
  - The pad status line (`aria-live="polite"`, `data-testid="td-pad"`) announces the cursor move, so the feed is kept for game events.
  - Unaffordable cards are shown with a dashed edge and a danger-coloured cost, never reduced opacity (axe contrast); they stay enabled.
  - Hearth starts with `cd = 0`, so it heals a hurt Haven the tick after it is placed.
- **Cut:** nothing. All three maps, three levels, sell and speed x2 are in.
- **Extra files:** `draw.ts` (canvas drawing, no DOM), `glyphs.ts`, `screenLogic.ts` (pad cursor and feed text), all flat in the game folder.

## Environment

- The worktree folder was deleted once mid-build and re-created by the maintainer's session; the engine was rewritten from the spec and the session context, nothing was lost.
- No git identity was configured in the worktree, so commits carry `Claude Fable 5.1 <noreply@anthropic.com>` as author.

## Needs from files I do not own

None.
