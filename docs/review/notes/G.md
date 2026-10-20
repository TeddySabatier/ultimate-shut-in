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

## Requests for files I do not own

None so far.

## Open questions for the morning reviewer

- Balance numbers (fees, win payouts, training curve) are in `src/game/content/arena.json` and proved in `src/game/arena/economy.test.ts`; the playtest is the real check.
