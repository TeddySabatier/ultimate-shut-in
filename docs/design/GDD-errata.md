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
