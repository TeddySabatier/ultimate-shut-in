# src/game

Pure game logic for Haven Protocol. No React, no zustand, no DOM, no
`localStorage`, no `Date.now()`. Everything is a plain TypeScript function over
a `SaveFile` (GDD section 4) plus an injected `now: number` (Unix ms) and, where
randomness is involved, a seed derived from the save.

## The contract: pure, immutable, events-out

- **Pure.** Same inputs, same outputs. The current time and the timezone are
  parameters (`now`, and `{ tz }` where a game day must be computed); tests
  pass fixed values.
- **Immutable.** A state-changing function never touches its input. It clones
  the save once, mutates the clone through internal `*Draft` helpers, and
  returns `{ save, events, error? }` (`ActionResult`). When `error` is set the
  action was refused and `save` is the input object, unchanged.
- **Events out.** Every transition that the UI should toast is reported as a
  `GameEvent` (`levelUp`, `vassalLevelUp`, `utilityRestored`, `utilityDegraded`,
  `titleEarned`, `comboForged`, `ringUnlocked`, `waveSettled`, `questDone`,
  `catchUp`, ...). The store applies `save` and forwards `events`; it never
  derives toasts by diffing state.
- **Deterministic.** Boards come from `fnv1a("firstPlayDay:day:name")` fed to
  `mulberry32`; battle logs from `fnv1a("firstPlayDay:periodIndex")`. Any day
  can be replayed from a save.

Day indices are absolute: whole days since the Unix epoch on the local clock
shifted back by `settings.resetHour` (`time.gameDayIndex`). `firstPlayDay` is
the index of the first open; wave periods are counted from it.

`gameDayIndex(now, resetHour, tz)` follows GDD 6.8 literally: the timezone
offset is evaluated at `now` (not at `now - resetHour`), the local wall clock
is shifted back by the reset hour, and the calendar date is taken. On a DST
change-over day the boundary therefore stays at the reset hour on the new
clock and the game day lasts 23 or 25 hours; the index never decreases.

Because every stored day index (`firstPlayDay`, `lastOpenDay`, `board.day`,
quest `instanceId`s, `lastActiveDay`, `lastQuestDay`, `streakLostOnDay`,
`forgedDay`, `log[].day`) lives in the frame defined by `resetHour`, the
store must change the hour through `changeResetHour(save, hour, now)`, which
shifts them all so "today" is unchanged; writing `settings.resetHour`
directly is not supported. `processBoundaries` never replaces a board for
today or a later day, so a clock set back (or westward travel) keeps the
current board and its done quests until the index catches up again.

## Module map

| Module | Purpose |
|---|---|
| `types.ts` | `SaveFile` schema (GDD 4), `GameEvent`, `ActionResult`. |
| `content/index.ts` | Typed loaders for `content/*.json`, lookups, `pickLine`/`formatLine`, `validateContent()`. |
| `rng.ts` | `fnv1a`, `mulberry32`, small seeded helpers. |
| `time.ts` | `gameDayIndex`, `currentMonthKey`, wave-period helpers, `fixedTz` for tests. |
| `economy.ts` | Difficulty tables, XP curves, ring derivation, wall bonus, `questRewards`, prices, constants. |
| `board.ts` | `generateBoard` (GDD 6.3) and quest actions: `startTimer`, `pauseTimer`, `incrementCount`, `completeQuest`, `markTried`, `undoQuest`, `rerollQuest`. |
| `notes.ts` | `setQuestLearned`: one "what I learned" note per quest template, kept on the save when the board rolls over. |
| `vassals.ts` | Loyalty gain/decay with the grace day, trust, Strict-mode leaving. |
| `recruit.ts` | `reRecruitVassal` (Welcome back), `setBenevolence` (Strict -> Benevolent brings away vassals back), shared return routine that refills an empty board. |
| `utilities.ts` | Tied habits, restore/decay, state thresholds, Well-kept check. |
| `wave.ts` | `waveAttack`, `waveDefense`, `classifyWave`, `settleWave`, monsters and battle-log lines. |
| `titles.ts` | Condition evaluation (never revokes) and capped effect sums. |
| `combos.ts` | Forge on same-day habit pairs, unforge on undo, counted items for the wave. |
| `resurrection.ts` | Token offer, eligibility window, `applyResurrection`. |
| `tick.ts` | `processBoundaries(save, now)`: the single entry point on app open/focus (catch-up replay capped at 400 boundaries). `changeResetHour(save, hour, now)`. |
| `save.ts` | `createNewSave`, `migrate` (legacy `{name, level, xp}`, v2, v3 and v4 with or without a persist envelope; boards, combos, titles, history, custom templates, proposals, activity and the map are normalised), `exportSave`. Save version 3 added `customTemplates`, `proposals` and `activity`; version 4 added `map` (outposts, visits, domain snapshots) and `breakdown.outposts`. |
| `mapGeometry.ts` | The City Map's grid, shared with the UI: zone radii, `zoneOfCell`, `cellKind` (streets, river, park, landmarks fixed by zone), `canHoldOutpost`, `ringFraction`, `wallRadius(dp)` (the creeping boundary), `compassVector`. No seed, no DOM. |
| `outposts.ts` | Outposts (`docs/design/CITY-MAP.md` 3): `createOutpost`, `editOutpost`, `moveOutpost`, `retireOutpost`, `restoreOutpost`, `forgetOutpost`, `logOutpostVisit`, `tagQuestAtOutpost`, `undoOutpostVisit`, `suggestOutpostCell`; selectors for states (`peak` never drops), quiet, caps and the perks read by `board.ts` (swap discount), `economy.ts` (+10% term) and `wave.ts` (stronghold defense). |
| `map.ts` | Domain snapshots at every settlement (`appendSnapshotDraft`, quiet weeks included), `markMapSeen`, `compareSnapshot` (the 7-days ghost), `waveResidue` (scorch marks and the walls-held flag), `wallsHeld`. |
| `template.ts` | `resolveTemplate(save, id)` (shipped or `c-` custom), `customToTemplate`, effort tiers and caps (`effortTier`, `maxTier`, `resolveTier`), recurrence and weekday helpers. |
| `custom.ts` | Custom quests: `addCustomTemplate`, `updateCustomTemplate`, `archiveCustomTemplate`, `addCustomQuestToBoard`, `previewCustomRewards`, recurrence (`recurrenceDue`, `placeRecurringDraft`). Max two on a board, never the Bonus. |
| `adapt.ts` | "The Haven notices": `recordActivityDraft`, `evaluateProposals` (five rules), `computeProposalsDraft` (limits, snoozes), `acceptProposal`, `dismissProposal`. |
| `compose/` | `parseQuestDraft` (on-device, English and French, no network) and its keyword tables. |
| `draft.ts` | Internal clone/log helpers behind the contract. |
| `index.ts` | Public re-exports. |

## City Map and outposts

The map never changes `player.domainPoints` or `player.ring`: it reads them. `wallRadius(dp)` in `mapGeometry.ts` is the one function both the engine (outpost placement, residue) and the SVG component use for the boundary, so what the player sees is what the rules say. Outposts earn states by counted visits (one per outpost per game day, from a check-in or a tagged quest); perks read the highest state ever reached. Every settlement appends a `DomainSnapshot`, which powers the *7 days* compare and the wave residue. Everything is specified in `docs/design/CITY-MAP.md`.

## Custom quests and proposals

A board quest names its template by id; `template.resolveTemplate(save, id)` is the only lookup (ids starting `c-` live in `save.customTemplates`). Custom quests pay the shipped formula for their tier, with the tier capped by kind and duration, at most two per board and never the Bonus contract. `processBoundaries` archives the finished day into `save.activity`, places recurring custom quests on the new board and recomputes the (at most three) proposals. Everything is specified in `docs/design/CUSTOM-QUESTS.md`.

## How the store should use it

```ts
import { createNewSave, migrate, processBoundaries, completeQuest } from '@/game';

let save = migrate(JSON.parse(localStorage.getItem(KEY) ?? 'null'), Date.now());
({ save } = processBoundaries(save, Date.now()));   // on open and on every focus
const r = completeQuest(save, instanceId, Date.now());
if (!r.error) { save = r.save; toast(r.events); }
```

Settings that the engine must see as actions rather than plain writes:

- `changeResetHour(save, hour, now)` for "Day starts at" (see above).
- `setBenevolence(save, mode, now, today)` for the Benevolent/Strict switch:
  going Benevolent welcomes every away vassal back, since Benevolent mode has
  no "Welcome back" button.
- Disabling a habit needs no call: its quests stay on the board but every
  action on them is refused with `habit is disabled`, and its vassal, trust
  and utility are frozen and ignored by the wave.

`player.ring` is sticky: it is derived from Domain Points but never drops
below `player.highestRing`, and `ringUnlocked` fires once per ring, so the
store needs no deduplication for the ring overlay.

## Tests

Colocated `*.test.ts`, vitest. `pacing.test.ts` runs a seeded 365-day simulation
through the public API and asserts the GDD 19 ring-arrival weeks within
+-1.5 weeks and zero wave losses at 90% adherence. `content.test.ts` runs
`validateContent()` so a broken JSON cross-reference fails CI.
`review.test.ts` holds one regression per finding of
`docs/review/engine-review.md`.
