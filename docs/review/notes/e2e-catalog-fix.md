# Notes: arena and sample e2e independent of registered games

Branch `fix/arena-e2e-catalog`, base `integration/arena` (`c129dea`).

## The break

`e2e/arena.spec.ts` was written when only the dev game Coin Duel (`sample`) was registered. The Arena host draws a game from the registry, so as soon as any real game is registered (every game PR adds one) it can draw `tower-defense` and the test clicks Coin Duel's controls. Separately, `e2e/games/sample.spec.ts` "replaying the same seed gives the same outcome" used a tap loop (`count()` then `click()`), which reads an empty stage right after "Replay same seed" remounts the game and quits without playing: `lab-outcome-result` never shows.

## The fix

- **Debug-only catalog restriction.** With the debug flag on, `localStorage['haven.debug.games']` (comma-separated ids, for example `sample`; a JSON array also works) narrows the Arena's catalog to those games, in the registry's order. Unknown ids give an empty catalog; empty, blank or unreadable values restrict nothing. With the debug flag off it is ignored entirely, so a player can never narrow their own catalog. Code: `src/components/arena/host/debugGames.ts` (pure, no registry import), applied by `listedGames()` in `src/components/arena/host/catalog.ts`. The registry was left alone (it is shared with the Lab and the budget scripts, and the Lab must keep listing everything). Tests: `debugGames.test.ts` (flag off ignores, flag on filters, unknown ids, order, bad values) and `catalog.test.ts` (the real catalog with the flag and the setting).
- **`e2e/arena.spec.ts`.** `seed` sets `haven.debug.games=sample` in its init script (option `games: null` leaves it unrestricted), so every test that plays through the host keeps testing the host with Coin Duel whatever else is registered. New test: with no restriction the Arena lists every registered game (the names are read from the Games Lab page, nothing hard-coded, the debug flag shows the dev-only ones too).
- **`e2e/games/sample.spec.ts`.** The replay test uses the new `replaySameSeedWithBot` helper (`e2e/games/lab-helpers.ts`): Bot play twice (the Lab says "Matches the previous run."), "Replay same seed" (back to "No outcome yet"), Bot play a third time: same outcome. Only explicit waits. `playByTapping` (also used by the "plays a full game" test) and the same loop in `e2e/lab.spec.ts` now wait for the first ally button and for the next round or the result after each tap. `replaySameSeed(page, play)` is unchanged, so the other game specs are unaffected.

## For the game PRs

Merge `integration/arena` once this lands in it. No edit to any game folder or game spec is needed. The sample spec header says a game spec copies it: new game specs can use `replaySameSeedWithBot` when their real play is long or real time.

## Not done

Game specs that tap in a loop (copies of the old sample template) may still race; they belong to their owners.
