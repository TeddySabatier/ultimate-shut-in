# Notes: brief G (the Arena)

Agent: Arena (G1 on `feat/G1-arena-engine`, G2 on `feat/G2-arena-ui`). Nobody answers overnight, so every decision below was taken alone.

## An earlier attempt was already on origin

When this run started, `origin` already held `feat/G1-arena-engine` (2 commits), `feat/G2-arena-ui` (1 commit on top of it) and `cursor/g1-arena-engine-0d9a`, all by "Cursor Agent" between 06:59 and 07:13 UTC on 2026-10-20, with **no pull request** (its own notes say `gh pr create` returned 403) and red e2e on every commit (`e2e/settings.spec.ts` still expects save version 4; a wave-window strict-mode violation; one flaky sample replay). Nothing was force-pushed or deleted. This run keeps its own engine (a fuller run state machine, a migration that validates everything it reads, a rare-item stash, the proof computed from `economy.ts`) and merged the old branch into `feat/G1-arena-engine` with `git merge -s ours`, so both old commits stay in history, the push was a fast-forward and the old files are still readable at `0df2e03` (G1) and `ee826ce` (G2). `feat/G2-arena-ui` is handled the same way. Their SVG icons and a few ideas were looked at; their UI was not ported because it targets a different engine API. If the maintainer prefers the old attempt, `git diff 0df2e03 feat/G1-arena-engine` shows exactly what differs.

## Decisions taken alone (G1)

1. **`WaveBreakdown.arena` is optional (`arena?: number`).** The brief asks for "one new `arena` term next to `outposts`". Making it required would break the type of every `WaveBreakdown` literal in files this brief does not own (`OverlayHost.test.tsx`, `MapScreen.test.tsx`). Records settled before v5 simply lack it; the engine reads it with `?? 0` and the migration fills 0.
2. **Arena events were added to `GameEvent`, and `eventKey` in `src/components/overlays/eventText.ts` got one grouped `case`.** `eventKey` is an exhaustive switch with a `string` return type, so any new `GameEvent` member breaks `tsc` until it is handled. That is the only edit G1 makes outside its list (4 lines, no behaviour). G2 gives the events real toast copy.
3. **The request list is `arena.requests`**, not a top-level `arenaRequests`: the brief puts the whole addition under one `arena` field right after `map`.
4. **A loss pays a share of the spoils (`run.carryHome` = 25%, coins only).** The brief says a loss ends the run, clears the buffs and keeps what was banked. Taking everything unbanked felt punitive against the tone rules ("the troops come home"), so a loss, or leaving, carries a quarter of the run's coins home. Defense and rare items are only ever won by banking. One number in `arena.json` (set it to 0 to take it away).
5. **Banking is a choice of one**: coins, wave defense, or a rare item (the last needs 3 wins and an item not yet owned). The defense bonus is `1` per win, at most `6` per wave period in total (a Stronghold is `+2`, titles cap at `+12`).
6. **Training cap.** A coin cap per wave period equal to 25% of what a 90%-adherence player of the same difficulty earns (`trainingWeeklyCap`), plus two bumps per period. The economy proof test computes it from `economy.ts`.
7. **Gear is bought per vassal and slot** (three slots, tiers 1 to 3, ring-gated and ring-priced); rare items (tier 4) are won, kept in a stash and worn by hand. Traits added to a troop: `gear:<slot>:<tier>` per worn item and `training:<bumps>`. Games ignore trait ids they do not know.
8. **Wave bonus on a quiet week is carried to the next period** instead of lost (warm tone).
9. **No Arena reward ever touches** Domain Points, streaks, loyalty or utilities (a test snapshots the save and checks only `player.coins`, `arena.*` and the `log` line change).

10. **Independent review of G1 (a fresh reviewer, code only).** Fixed: the daily run count and the request limit are counted from time stamps, so `changeResetHour` (which cannot shift Arena days, `tick.ts` is not mine) never gives the limit back; migration enforces buff caps, offer count and the `def@room` id format, derives the room and difficulty of the game in progress, and brings a banked-defense period back to the next one; gear and training are refused for a troop already at power 100 (`power full`); `itemMinWins <= maxRooms` is validated. **Kept on purpose:** banked defense (at most +6 per wave period) can move a wave result up one step and so award that result's own Domain Points. The brief makes it a defense term, never a direct DP award; the test now shows the bound. A quiet week never gets DP. Also kept: the Gentle fee stops rising from ring 4 (it is capped at one day of Gentle earnings, 37 coins); no unequip (a rare item can be replaced by another or left); `log.learnedKeep` is reserved for the screen.

## Files outside the G1 list that this PR touches

- `src/components/overlays/eventText.ts`: grouped `case` in `eventKey` (exhaustive switch).
- `e2e/settings.spec.ts` (`version` 4 to 5) and `e2e/progression.spec.ts` (`.first()`: the wave log line can now start with "Decisive", which matched the result line too; it depends on the calendar date, so it also fails on the base branch on some days).

## Requests for files I do not own

None so far.

## Open questions for the morning reviewer

- Balance numbers (fees, win payouts, training curve) are in `src/game/content/arena.json` and proved in `src/game/arena/economy.test.ts`; the playtest is the real check.

## G2 decisions

11. **The host keeps the game on show after its end.** `ArenaHost` (in `src/components/arena/host/`) shows the game's final board and a results panel (result, score, coins added, the game's log, the learned note in the player's language) until the player presses Continue; the screen holds the host by key while the save's run has already moved on to the lottery or ended. Leaving after the end means Continue; leaving before any outcome records `fledOutcome()` one task later, so an `onFinish` in the same task wins.
12. **Invalid outcomes** (`outcomeProblems`, with the fitted party's ids) are logged with `console.error` and applied as `fled`, score 0. `src/components/arena/host/games.test.ts` plays every registered game (the dev sample included, and every game that merges later) with the Lab's bot in English and French, with the party and run the Arena builds, and checks the outcome passes the host and the engine accepts it.
13. **Toasts** only for purchases and requests (`arenaGearBought`, `arenaGearEquipped`, `arenaTrained`, `arenaDecorBought`, `arenaRequestSaved`); the run flow speaks through the screen itself. Refusals become warm notices from `strings.arena.errors`.
14. **e2e** seeds the save with an init script (the persist envelope, one reload) and level-24 troops: level 30 with loyalty 100 is power 100, where gear and training are refused as useless. A lost duel retries (a loss ends the run). The Arena hub is one more tile in `e2e/responsive.spec.ts`. The regenerated contact sheets were **not** committed (they would add about 1.5 MB, over the 0.5 MB rule); the screenshots in the PR are three small dedicated ones in `docs/review/responsive/arena-*.png` (about 130 KB).
15. **No wide frame on `#/arena`.** `AppShell` widens only `/map`; changing it is outside this brief, so the hub is one column at 30rem on tablets and desktops (its two-column layout is ready for a wider frame: one `wide` class away).
16. Engine log lines say "Wins: {n}" to avoid "1 wins".

## Requests for files I do not own (G2)

- `src/screens/CharacterScreen.tsx` (the Ledger wave breakdown) and `src/screens/HomeScreen.tsx` (the Defense breakdown list) do not show the new `arena` term; one line each: `Arena +{n}` next to Outposts when `breakdown.arena > 0`. The wave window log already says it.
- `src/components/AppShell.tsx`: add `/arena` to the `wide` class condition (item 15).
- `docs/ARCHITECTURE.md` paragraph for the maintainer: the Arena is a lazy route (`#/arena`) whose host (`src/components/arena/host/`) is the only importer of the game registry; engine in `src/game/arena/`; save v5 adds `arena`; `docs/design/ARENA.md` has the rest.
