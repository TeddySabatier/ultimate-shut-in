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

## Module map

| Module | Purpose |
|---|---|
| `types.ts` | `SaveFile` schema (GDD 4), `GameEvent`, `ActionResult`. |
| `content/index.ts` | Typed loaders for `content/*.json`, lookups, `pickLine`/`formatLine`, `validateContent()`. |
| `rng.ts` | `fnv1a`, `mulberry32`, small seeded helpers. |
| `time.ts` | `gameDayIndex`, `currentMonthKey`, wave-period helpers, `fixedTz` for tests. |
| `economy.ts` | Difficulty tables, XP curves, ring derivation, wall bonus, `questRewards`, prices, constants. |
| `board.ts` | `generateBoard` (GDD 6.3) and quest actions: `startTimer`, `pauseTimer`, `incrementCount`, `completeQuest`, `markTried`, `undoQuest`, `rerollQuest`. |
| `vassals.ts` | Loyalty gain/decay with the grace day, trust, Strict-mode leaving, `reRecruitVassal`. |
| `utilities.ts` | Tied habits, restore/decay, state thresholds, Well-kept check. |
| `wave.ts` | `waveAttack`, `waveDefense`, `classifyWave`, `settleWave`, monsters and battle-log lines. |
| `titles.ts` | Condition evaluation (never revokes) and capped effect sums. |
| `combos.ts` | Forge on same-day habit pairs, unforge on undo, counted items for the wave. |
| `resurrection.ts` | Token offer, eligibility window, `applyResurrection`. |
| `tick.ts` | `processBoundaries(save, now)`: the single entry point on app open/focus. |
| `save.ts` | `createNewSave`, `migrate` (legacy `{name, level, xp}` and v2), `exportSave`. |
| `draft.ts` | Internal clone/log helpers behind the contract. |
| `index.ts` | Public re-exports. |

## How the store should use it

```ts
import { createNewSave, migrate, processBoundaries, completeQuest } from '@/game';

let save = migrate(JSON.parse(localStorage.getItem(KEY) ?? 'null'), Date.now());
({ save } = processBoundaries(save, Date.now()));   // on open and on every focus
const r = completeQuest(save, instanceId, Date.now());
if (!r.error) { save = r.save; toast(r.events); }
```

## Tests

Colocated `*.test.ts`, vitest. `pacing.test.ts` runs a seeded 365-day simulation
through the public API and asserts the GDD 19 ring-arrival weeks within
+-1.5 weeks and zero wave losses at 90% adherence. `content.test.ts` runs
`validateContent()` so a broken JSON cross-reference fails CI.
