# GDD errata (game core implementation, 2026-10-18)

Where the implementation in `src/game/` departs from, or has to pick a reading
of, GDD v1.0. Rules in the GDD win over the pacing table; where the GDD is
internally inconsistent the pillar-consistent intent was implemented.

## 1. Loyalty grace day (8.4, 6.8)

The GDD gives the decay condition as `lastActiveDay < d` and, in the same
sentence, describes it as "inactive on the day that just ended **and** the day
before it, giving one free day". The formula alone has no free day (a vassal
active on day 3 would decay at the end of day 4). The parenthetical and the
worked examples ("from 50 a fully ignored vassal leaves after 26 / 18 / 11
days, counting the grace day") agree with each other, so the code implements
the intent: a vassal decays at the boundary ending day `d` only when
`lastActiveDay < d - 1`. A never-active vassal counts as active on the day
before first play, which reproduces exactly 26 / 18 / 11 days.

## 2. Catch-up caps count decays, not boundaries (6.9)

"Loyalty decay applies for at most 7 missed days" is implemented as *at most 7
decay applications per vassal per catch-up*, and likewise 3 per utility.
Counting raw boundaries would let the grace day eat one of the seven and the
GDD's own example (Steady, 30 days away, 60 → 39) would come out at 42.

## 3. Reward snapshot carries the utility delta (4, 6.7)

`BoardQuest.rewards` gains a fifth field, `utility: number`, the points the
completion actually restored to the tied utility. Section 6.7 requires undo to
revert utility gains exactly, which is impossible to do from `{xp, coins, dp,
loyalty}` when the restore was clamped at 100.

## 4. Quiet waves (6.9, 9.4)

A period settles as `quiet` whenever total trust across all vassals is zero at
settlement, whether or not the app was opened during it. This is the same
rule as 6.9 applied uniformly, and it also means a week in which the player
opened the app but did nothing is not scored as a loss. 9.4 says quiet has "no
log"; 6.9 says "one `waveQuiet` line"; the record stores the one line.

## 5. Items not modelled in the v2 schema

- The **emergency generator** (8.2, 40 settlement to pause one utility's decay
  for the next boundary) needs per-utility state the section-4 schema does not
  have. Not implemented in v1; the schema is unchanged.
- The Resurrection token's **"loyalty they had the day before leaving"** for an
  away vassal is not stored; the vassal returns at the minimum of 50 the GDD
  specifies (the day-before value is at most 5, so 50 always wins). The
  14-day window is enforced for streaks; away vassals are always offered,
  since the leaving day is not recorded.

## 6. Pacing table (19)

Seeded 365-day simulation through the public API (`pacing.test.ts`, seed 1234):

| Profile | R2 | R3 | R4 | R5 | R6 | R7 | Level 30/90/365 d | Losses |
|---|---|---|---|---|---|---|---|---|
| Gentle 90% | 2.3 | 6.0 | 11.1 | 19.0 | 29.0 | 41.0 | 9 / 16 / 31 | 0 |
| Gentle 60% | 3.0 | 7.7 | 14.4 | 25.0 | 38.0 | — | 7 / 13 / 25 | 1 |
| Steady 90% | 2.0 | 4.6 | 8.1 | 13.4 | 20.4 | 29.1 | 11 / 21 / 39 | 0 |
| Hardcore 90% | 1.6 | 3.9 | 6.6 | 10.4 | 15.7 | 22.4 | 14 / 25 / 47 | 0 |
| Hardcore 60% | 2.0 | 5.0 | 9.0 | 14.6 | 21.6 | 32.6 | 11 / 20 / 39 | 1 |

All rings land within one week of the GDD table; no formula was changed. The
60% profiles lose far fewer waves than the GDD's throwaway sim (1 vs 8 and 20)
because real combo forging and Well-kept bonuses are counted; this errs on the
safe side of pillar 1 and was left as is.

---

Entries 7-19 come from the engine review of 2026-10-18
(`docs/review/engine-review.md`); the finding number is given in brackets.

## 7. Reset-hour change shifts every stored day index (6.8, 15.4) [1]

All stored game-day values (`firstPlayDay`, `lastOpenDay`, `board.day`, quest
`instanceId`s, `lastActiveDay`, `lastQuestDay`, `streakLostOnDay`,
`forgedDay`, `log[].day`) are in a frame that depends on `settings.resetHour`.
"Changing the reset hour applies from the next boundary" is implemented by
`changeResetHour(save, hour, now)`: it shifts every index by the difference
between today's index under the old and the new hour (-1, 0 or +1) so the
player's "today" is unchanged, the current board and its done quests survive,
and the current day ends at the **next occurrence of the new hour** (raising
04:00 -> 20:00 at 13:00 ends the day at 20:00 that evening; lowering 20:00 ->
04:00 at 13:00 ends it at 04:00 the next morning). Independently,
`processBoundaries` never replaces a board for today or a later day, so a
clock set back or westward travel keeps the current board; undo keeps working
on the `lastOpenDay` board while the index is behind it.

## 8. Migration: structural v2 detection and normalised boards (4) [2, 4]

A persisted `{ state, version }` envelope is unwrapped and the inner save is
recognised by shape (`player`, `settings`, `vassals`, `utilities`); the inner
`version` wins over the envelope's, so a v2 save stored under an older store
version is never downgraded to the legacy `{name, level, xp}` path. Migrated
boards are normalised: unknown templates are dropped, a `rewards` snapshot
without `utility` (the GDD 4 shape, pre-errata 3) gets `utility: 0`, a done
quest without a snapshot reopens, and a `bonusId` that is not on the board is
cleared. Combos, titles, wave history and the log are validated the same way,
so no `NaN` can enter the defense or utility arithmetic.

## 9. Reroll and the bonus flag (6.3) [3]

"The replacement cannot be the bonus; if the bonus is rerolled the flag moves
to the new quest only if it has the highest tier, otherwise it is recomputed"
is read as: the flag moves only when the rerolled quest *was* the bonus, and
then only among quests still `open` (the replacement is always one). It never
lands on a `done` quest, whose rewards were paid at x1. The same-tier
fallback for the replacement draws from any tier, lower included (GDD: "any
tier if none").

## 10. Day index and DST (6.8) [5]

`gameDayIndex` evaluates the timezone offset at `now`, exactly as 6.8's
"take local date-time, subtract resetHour, take the local calendar date". The
boundary therefore stays at the reset hour on the new clock on change-over
days; the game day lasts 23 or 25 hours and the index is monotonic.

## 11. Disabled habits (4, 15.4, 9.3) [6, 10]

A disabled habit's vassal is frozen: it is excluded from defense **and** from
the "zero trust -> quiet week" check, so trust left on it cannot turn a
do-nothing week into a loss. Its quests may still be on the board for the
rest of the day, but `completeQuest`, `markTried`, `startTimer`,
`incrementCount` and `rerollQuest` refuse them (`habit is disabled`), so the
frozen vassal and utility are never touched. Trust is period state, not
vassal history: settlement resets it for every vassal, disabled ones
included, so a habit re-enabled later starts the period at zero like the
others. This is the one reading of "no trust" for a disabled habit.

## 12. The Full Set (12) [7]

A board holds at most `questsPerDay` (3/4/5) quests, so "all eight habits in
one day" can never happen from a generated board. The legendary now forges
when every habit that can appear on the board (enabled and not away), at
least **five** of them, has a `done` quest on today's board. It stays a
Hardcore-only item in practice (five slots), which matches its legendary
billing; the GDD's 12 power is unchanged.

## 13. Catch-up bounds (6.9) [8]

At most 400 boundaries are replayed per catch-up; the rest of the absence is
fast-forwarded (`lastOpenDay` and `week.index` jump to today, one `catchUp`
line, no wave record per skipped period). This is observably identical to a
full replay: trust is reset at the first settlement, the decay caps are long
spent, and every skipped period would have been `quiet`. `week.history`
keeps the last 104 records (two years). A v2 save with no `lastOpenDay`
takes today, not `firstPlayDay`, so a damaged import does not replay years.

## 14. Returning vassals refill an empty board (5, 6.3) [9]

When every eligible vassal was away the board for the day is empty. A vassal
returning through "Welcome back", the Resurrection token or the switch to
Benevolent re-issues today's board at once (same stored seed) rather than
leaving the player with nothing until tomorrow. A board that already has
quests is left alone.

## 15. Ring is sticky; `player.highestRing` (6.7, 8.3, 15.7) [12]

6.7 says the ring cannot go down on undo and that an unlock overlay is not
re-shown, but also that DP is reverted. `player.highestRing` records the
highest ring ever reached; `ring` is derived from DP but never below it, and
`ringUnlocked` fires only when `highestRing` rises. Undo therefore reverts
DP and leaves the ring alone; re-crossing the threshold fires nothing.
`migrate` fills the field from the stored ring.

## 16. Wave log reward line (9.5) [11]

When the wave's DP award crosses a ring threshold the reward line reads
`Domain Points +22. The Flat is registered.` instead of `132/120 toward The
Flat` (the ring is recomputed after the record is built so attack and walls
use the ring the wave was fought at).

## 17. Returning vassals and leaving vassals (5) [15]

A vassal brought back (any route) gets `lastActiveDay = today`, a fresh grace
day; nothing else about "nothing else changes" is affected. A vassal that
leaves in Strict mode has its trust zeroed, since an away vassal cannot
contribute to the period.

## 18. Strict -> Benevolent (5, 15.4) [16]

Benevolent mode has no "away" state and no Welcome-back button, so switching
from Strict to Benevolent brings every away vassal back for free at loyalty
50 (`setBenevolence`), without counting a re-recruitment. Switching to Strict
changes nothing else.

## 19. Flavour and tooling departures [15]

- The battle-log header is `Wave {w} reaches {ring}: {monster} at the gate.
  Attack {a}.` with a seeded monster roster and the Static as a boss every
  tenth week; 9.5 specifies no monster. Flavour only; the record keeps the
  GDD line order otherwise.
- `generateBoard(save, day, seed?)` accepts the stored `board.seed` so a day
  issued under an earlier player name can be replayed after a rename (the
  seed includes the name, as 6.3 step 1 specifies).
- The vassal receives the post-multiplier `xp` (6.4), not `baseXp`; the
  content schema note now says so.

## 20. Save version 4 adds the City Map

`SAVE_VERSION` is 4. `SaveFile.map` holds the City Map as specified in
`docs/design/CITY-MAP.md`: outposts (active and retired), the visit log,
domain snapshots, `lastSeen` and `nextSeq`. A wave breakdown gains
`outposts` (Stronghold defense, capped). A custom template may name an
`outpostId`, and a completion of that quest tags the place. The map never
changes Domain Points or the ring.

A v2 or v3 save has no map. `migrate` gives it an empty one seeded with one
snapshot of the current state (`periodIndex` is `week.index - 1`, `day` is
`lastOpenDay`, plus Domain Points, ring, and the last wave result, or
`quiet` when there is no history), so the 7-day compare has a baseline. Every
stored wave breakdown gets `outposts: 0`. A brand-new save starts with
`snapshots: []`; the seed is only for a save that arrived without a map. A v4
save round-trips through `exportSave` and `migrate`.

Where the code departs from CITY-MAP section 4, it stays as written:

- A damaged map drops an outpost whose id, type, cell, name or habits cannot
  be kept, and clamps the text, raises `peak` to at least what the visits
  earn, rebuilds `nextSeq` and drops visits whose outpost is gone (4.1). An
  outpost that is valid but breaks an active rule (the same name, the zone
  cap, or the three-cell gap) is retired and kept, visits included, so a
  hand-merged save does not lose the place.
- A custom template keeps `outpostId` on migrate only while that outpost is
  still on the map and not retired.
- Refusal codes (4.3). A retired outpost refuses a visit, a move or a quest
  tag with `outpost is retired`. Creating one also refuses `pick a habit`
  when no related habit resolves (type `other` with none chosen) and
  `unknown outpost` when the type is not one of the eleven. Restoring one
  whose old cell is taken, when the caller did not pass a cell, places it on
  a free cell in the same zone, which is the reading in CITY-MAP 3.5.
  `cell taken` remains the refusal when no free cell is left, or when the
  caller chose that cell. Restore also refuses `name taken`.
- Undoing a tagged quest removes that quest's visit (4.3). When another log
  for the same outpost and day was uncounted, that log becomes the counted
  visit and the counter stays. Otherwise the counted visit is taken back.
  `peak` never drops either way.
- The functions (4.3). Outpost actions live in `outposts.ts`. Snapshots,
  `markMapSeen` and `compareSnapshot` live in `map.ts`. `wallRadius` and
  `zoneOfCell` live in `mapGeometry.ts`.
- `validateContent()` requires each type's `icon` to be a non-empty string,
  and checks habits, state order and the rule numbers (4.4). It does not open
  `src/assets/outposts/<icon>.svg`. Those pictures are in the tree under that
  path.
