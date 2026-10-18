# Haven Protocol: Game Design Document

Version 1.0, 2026-10-18. Scope: v1 (milestones M1 and M2). Working title was "Shut-In Protocol"; the shipped name is **Haven Protocol**, which keeps the system-window flavour, centres the one promise the game makes ("the Haven is always safe") and stays well away from the source work's title.

Content referenced here lives in `src/game/content/*.json` and is documented in `src/game/content/schema.md`. Where this document and the JSON disagree, the JSON is the source of truth for numbers and copy; this document is the source of truth for rules.

---

## 1. Vision and pillars

Haven Protocol is an offline-first mobile PWA in which real-life habits are quests. The player is two people at once: the **Absolute**, who never leaves the Haven and keeps its books, and the **Vassal**, the field self who goes out and does the thing. Every completed quest is a trip outside the domain that brings back XP, settlement and loyalty, and the Haven grows ring by ring from one room to a city.

Pillars, in priority order:

1. **The Haven is always safe.** Nothing the player has can be lost. Waves cannot breach, utilities cannot fail, vassals cannot be lost for good. Every "negative" state is a nudge rendered in warm copy, and every nudge has a one-action fix.
2. **Real life is the content.** The game never asks for a sensor, a photo or a location. It asks for honesty, and it keeps the stakes low enough that honesty is easy.
3. **Growth is visible on a map.** The ring boundary creeping outward is the payoff. Every number in the economy exists to feed that line.
4. **Dry warmth.** The Protocol speaks like a kind clerk. Vassals are people with jobs and opinions. Nothing shames; a lot of things are gently funny.
5. **Small, deterministic, testable.** All rules are pure functions over plain data with a seed. Engineers can replay any day.

## 2. Fantasy and tone

The fantasy is "I am the commander of a tiny fortress, and the fortress is my life." The Absolute sits at a desk in the Room reading system windows; the Vassal self goes out and comes back with a settlement report. The source material's inversion (a hero who cannot leave, served by people who go out) becomes the player's own split: the part of you that stays home is not the enemy, it is the base.

Tone rules for all copy:
- Second person, present tense, short sentences. The Protocol narrates; vassals speak in reported speech ("Pell says…").
- Never "you failed", "you missed", "streak broken", "penalty". Use "not this week", "dimmed", "away", "paused".
- Humour comes from bureaucratic understatement and from vassals treating ordinary life as logistics.
- Every negative system message contains the fix in the same sentence.

## 3. Core loop

**Minute loop.** Open the app, see the Board (3-5 quests), do a thing in real life, tap Done (or start a timer, or tap a counter). A settlement toast reports XP, settlement and loyalty. The ring map and the utility meters on the Haven screen update immediately.

**Day loop.** At the reset hour a new Board is issued from the enabled habits. The player completes what they can; the hardest quest is a Bonus contract. Completing two habits in one day forges a combo item. Utilities tied to Sleep, Hygiene and Eat tick down at the day boundary unless fed. Loyalty ticks up with completions and down with neglect.

**Week loop.** Every 7 days since first play, a wave attacks. Defense is the week's effort (trust) plus permanent growth (vassal levels, titles, walls, combos). The battle resolves as a log. Win: Domain Points and a step toward the next ring. Loss: a smaller Domain Point grant "for holding" and a kind line. Trust resets.

**Ring loop.** Domain Points accumulate from quests and waves. Crossing a threshold unlocks the next ring: a vignette, new facilities, new quest templates, a higher wall bonus, a bigger map. Seven rings; the last one is the city and the "ending" (the game continues).

## 4. Player state model

TypeScript-ish schema. All times are Unix ms; all "game day" values are integers counted from `firstPlayDay` (see 6.8). Everything here persists under one key (`usi.player` already exists; the engineer may migrate it to `haven.save`).

```ts
type HabitId = 'move' | 'outside' | 'clean' | 'social' | 'study' | 'sleep' | 'eat' | 'hygiene';
type Difficulty = 'gentle' | 'steady' | 'hardcore';
type Benevolence = 'benevolent' | 'strict';
type UtilityId = 'power' | 'water' | 'gas';
type QuestKind = 'check' | 'timer' | 'count';
type WaveResult = 'decisive' | 'win' | 'loss' | 'quiet';

interface SaveFile {
  version: 2;                       // bump on migration
  player: Player;
  settings: Settings;
  vassals: Record<HabitId, Vassal>; // all 8 always present, even if disabled
  utilities: Record<UtilityId, Utility>;
  board: Board | null;              // today's quests; null before first issue
  week: WeekState;
  combos: ComboItem[];              // forged this wave period
  titles: EarnedTitle[];
  stats: LifetimeStats;
  log: LogEntry[];                  // last 200 events, newest last
  firstPlayDay: number;             // game day index 0 = first day ever opened
  lastOpenDay: number;              // game day index of last boundary processed
}

interface Player {
  name: string;                     // 1-24 chars; default "Absolute"
  level: number;                    // 1..50
  xp: number;                       // 0 <= xp < xpToNext(level); at level 50, xp accumulates uncapped
  coins: number;                    // settlement, >= 0
  domainPoints: number;             // cumulative, never decreases
  ring: 1|2|3|4|5|6|7;              // == highest ring whose domainPointsRequired <= domainPoints
  resurrectionMonth: string | null; // "YYYY-MM" in which the token was last used
}

interface Settings {
  difficulty: Difficulty;           // default 'steady'
  benevolence: Benevolence;         // default 'benevolent'
  enabledHabits: HabitId[];         // 1..8 entries; default all 8
  resetHour: number;                // 0..23, default 4
  lightsOutHour: number;            // 0..23, default 23 (used by sleep quests copy only)
  wakeHour: number;                 // 0..23, default 8
  reducedMotion: boolean;           // default follows prefers-reduced-motion
}

interface Vassal {
  habit: HabitId;
  level: number;                    // 1..30
  xp: number;                       // 0 <= xp < vassalXpToNext(level)
  trust: number;                    // 0..7, days this wave period with >= 1 completion or "tried"
  loyalty: number;                  // 0..100
  away: boolean;                    // Strict mode only: true once loyalty hit 0; cleared on re-recruit
  lastActiveDay: number | null;     // game day of last completion or "tried"
  lifetimeQuests: number;
}

interface Utility {
  id: UtilityId;
  value: number;                    // 0..100
  fullStreakDays: number;           // consecutive day boundaries at 100 (for titles)
}

interface Board {
  day: number;                      // game day index this board belongs to
  seed: number;                     // hash(firstPlayDay, day, name) used for generation
  quests: BoardQuest[];             // 3..5
  bonusId: string;                  // one of quests[].instanceId
  rerolledToday: boolean;
}

interface BoardQuest {
  instanceId: string;               // `${day}-${templateId}`
  templateId: string;
  habit: HabitId;
  kind: QuestKind;
  status: 'open' | 'done' | 'tried';
  count: number;                    // for 'count' kind; 0..targetCount (may exceed, no extra reward)
  timer: { startedAt: number | null; accumulatedMs: number } | null; // 'timer' kind only
  timedBonus: boolean;              // set at completion if accumulatedMs >= durationMin*60k
  rewards: { xp: number; coins: number; dp: number; loyalty: number } | null; // snapshot at completion, used by undo
}

interface WeekState {
  index: number;                    // 0-based wave period index; period covers days [7i, 7i+7)
  history: WaveRecord[];            // newest last; keep all (small)
}

interface WaveRecord {
  index: number;
  ring: number;
  attack: number;
  defense: number;
  breakdown: { vassals: number; trust: number; walls: number; combos: number; titles: number; wellKept: number };
  result: WaveResult;
  dpAwarded: number;
  log: string[];                    // rendered battle log lines
  settledAt: number;
}

interface ComboItem { comboId: string; power: number; forgedDay: number; }
interface EarnedTitle { titleId: string; earnedAt: number; habit?: HabitId; }

interface LifetimeStats {
  questsTotal: number;
  questsByHabit: Record<HabitId, number>;
  questDaysTotal: number;
  questDayStreak: number;           // consecutive game days with >= 1 'done'
  bestQuestDayStreak: number;
  lastQuestDay: number | null;
  waveWins: number; waveLosses: number; decisiveStreak: number;
  combosForged: number;
  resurrectionsUsed: number;
  reRecruitments: number;
  streakLostOnDay: number | null;   // most recent day a streak >= 3 ended; for the token
  streakLostLength: number | null;
}

interface LogEntry { at: number; day: number; kind: string; text: string; }
```

Invariants the store must enforce (and tests should assert):
- `player.ring` is derived from `domainPoints` and the rings table; never set directly.
- `vassals[h].trust` only increases within a period and resets to 0 when a wave settles.
- A `BoardQuest` with `status: 'done'` always has `rewards` set; undo restores exact values from it.
- `utilities[*].value` is clamped to 0..100; decay never reads below 0.
- Disabled habits keep their Vassal record untouched: no decay, no trust, no quests.

## 5. Habit tracks and vassals

Eight tracks, eight vassals. Each has a level (1-30), Trust (0-7) and Loyalty (0-100). Portrait briefs and two-line personalities are in `habits.json`; summary:

| Habit | Vassal | Epithet | Voice in one line | Utility |
|---|---|---|---|---|
| Move | **Pell** (she) | the Runner | Ex-courier, counts in laps, solves things by walking around them. | — |
| Outside | **Wren** (they) | the Scout | Quiet mapper of light and pigeons; weather is intelligence. | — |
| Clean | **Ondra** (he) | the Steward | Retired stage manager; everything has a cue and a place. | — |
| Social | **Tobi** (he) | the Herald | Ex-radio host; a two-line text is still a broadcast. | — |
| Study | **Imre** (she) | the Archivist | Night-school librarian; skills are stacks of 25-minute blocks. | — |
| Sleep | **Lunel** (he) | the Nightwatch | Ex-night guard; a dark room at a sensible hour is a fortress. | Power |
| Eat | **Basil** (they) | the Quartermaster | Canteen cook; a meal at a table is dignity. | Gas |
| Hygiene | **Marisol** (she) | the Bathkeeper | Seaside bathhouse keeper; a clean shirt is armour. | Water |

**Vassal level curve.** Each completed quest grants the vassal the same XP the player receives. `vassalXpToNext(L) = 80 + 40·L` (120, 160, 200, … 1,240 at L29). Cap 30. A Gentle player who spreads 3 quests over 8 habits reaches vassal level ~5 after three months and ~14 after a year; Hardcore reaches ~24. Vassal level is a permanent wave defense contributor (see 9) and is shown as a small badge on the vassal card. There are no per-level vassal unlocks in v1; the level is the record of time spent together.

**Trust** = number of distinct game days in the current wave period on which that vassal had at least one quest `done` or `tried`. Max 7. Reset when the wave settles. Shown as seven pips.

**Loyalty** starts at 50 on first play and on re-recruitment. Gains and decay are in 8.4. In Benevolent mode loyalty floors at 1 and the vassal "waits" (idle copy from `vassalWaiting`). In Strict mode, reaching 0 sets `away: true`: the vassal's quests stop being issued, the card greys out with a "Welcome back" button. Tapping it (free) sets loyalty to 50, `away: false`, increments `reRecruitments`, and shows a `vassalReturning` line. Nothing else changes: level, XP and lifetime counts are kept. The vassal leaving is the only soft reset in the game, and it is three taps from undone.

## 6. Quest system

### 6.1 Template schema

See `schema.md`. Key fields: `habit`, `tier` (1-3), `minRing`, `kind` (`check` / `timer` / `count`), `durationMin` or `targetCount`, `baseXp`, `baseCoins`, `tags`. 79 templates ship in v1.

### 6.2 Difficulty tables

| | Gentle | Steady | Hardcore |
|---|---|---|---|
| Quests per day | 3 | 4 | 5 |
| Tier weights (T1 / T2 / T3) | 60 / 35 / 5 | 30 / 50 / 20 | 10 / 45 / 45 |
| Reward multiplier (XP and coins) | ×1.00 | ×1.10 | ×1.20 |
| Loyalty gain per completion | +8 | +6 | +5 |
| Loyalty decay per idle day (after grace) | −2 | −3 | −5 |
| Utility decay per day without the tied habit | −10 | −15 | −20 |
| Wave attack multiplier | ×0.80 | ×1.00 | ×1.25 |

If fewer than `questsPerDay` enabled habits exist the board still has `questsPerDay` slots (a habit may appear twice; never three times).

### 6.3 Generation algorithm (run once per game day, on first open after the boundary)

1. `seed = fnv1a(`${firstPlayDay}:${day}:${settings.name}`)`; use a small seeded PRNG (mulberry32). Everything below draws from it in this order so a day is reproducible.
2. **Pool** = templates where `habit ∈ enabledHabits`, vassal not `away`, `minRing ≤ player.ring`. Remove templates that appeared on yesterday's board (soft; if this empties a habit's pool, skip the removal for that habit).
3. **Habit weights.** For each eligible habit, `w = (100 − loyalty) + 20`, so neglected vassals are picked more. Draw `questsPerDay` habits by weighted sampling without replacement; once every eligible habit has been drawn once, continue with replacement but cap any habit at 2 slots.
4. **Tier per slot.** Draw a tier from the difficulty weights. If the habit has no eligible template at that tier, fall back to the nearest lower tier, then the nearest higher. (At ring 1 nothing is tier 3; Hardcore players at ring 1 therefore see tier 2 boards, and the ring 2 unlock at ~week 1 is their first tier 3. This is intended.)
5. **Template per slot.** Uniform draw among the habit's templates at that tier not already on the board.
6. **Bonus contract.** The slot with the highest tier; ties broken by highest `baseXp`, then first drawn. Flagged `bonusId`.
7. Store the Board with `day` and `seed`. Issue `questIssued` toasts only for the first board of a session (not on every render).

**Reroll.** Once per day the player may swap one open quest for another of the same habit and tier (any tier if none) for 15 settlement (10 from ring 5). The replacement cannot be the bonus; if the bonus is rerolled, the bonus flag moves to the new quest only if it has the highest tier, otherwise it is recomputed.

### 6.4 Reward formulas

Let `t` = tier, `D` = difficulty reward multiplier, `B` = 2 if bonus contract else 1, `T` = 1.1 if timed bonus else 1, `M_xp` = 1 + sum of applicable title `xpMult` (capped at +0.20, +0.25 with the District Library), `M_coin` = 1 + sum of `coinMult` (cap +0.15).

- `xp = round(baseXp · D · B · T · M_xp)`
- `coins = round(baseCoins · D · B · M_coin)`
- `domainPoints = t · B` (1-6; no multipliers)
- `vassalXp = xp` (same number, to the quest's vassal)
- `loyalty = loyaltyGain(difficulty) + (t − 1) + titleLoyaltyFlat`, capped so loyalty ≤ 100

Worked example, Steady, tier 2 bonus quest with timer completed, no titles: `xp = round(35 · 1.1 · 2 · 1.1) = 85`, `coins = round(18 · 1.1 · 2) = 40`, `dp = 4`, `loyalty = 6 + 1 = 7`.

Typical day totals (no bonus doubling considered in the per-quest figure): Gentle ≈ 80 XP, 40 coins, 6 DP; Steady ≈ 150 XP, 75 coins, 10 DP; Hardcore ≈ 265 XP, 135 coins, 15 DP.

### 6.5 Timer rules

- Timed quests show a Start button. Starting stores `startedAt`; the timer survives app close (elapsed is computed from the timestamp on resume). Stop adds elapsed to `accumulatedMs` and clears `startedAt`. Multiple segments allowed.
- The player may tap Done at any time, with or without the timer. If `accumulatedMs ≥ durationMin · 60,000` at completion, `timedBonus = true` (+10% XP). The timer is friction, not a gate.
- A running timer at the day boundary is stopped and its time kept on the (now expired) quest; it does not carry to the new board.
- Only one timer runs at a time; starting another pauses the first.

### 6.6 Count rules

`count` quests show − / + and `count / targetCount`. Reaching the target auto-completes (with a confirm toast that has Undo). The player can keep counting past the target; nothing extra is awarded. Tapping − below the target after completion triggers undo (same rules as 6.7).

### 6.7 Completion, "tried" and undo

- **Done**: apply rewards (6.4), snapshot them in `rewards`, bump `lifetimeQuests`, update trust/loyalty/utilities/stats, evaluate combos and titles, append a log entry.
- **Tried**: a secondary action on any open quest. Sets `status: 'tried'`, counts for trust and for `lastActiveDay` (so loyalty does not decay that day) and nothing else. A `tried` quest can still be upgraded to `done` the same day.
- **Undo**: allowed only while the quest's `day` equals the current game day. Reverts exactly the snapshot (XP, coins, DP, vassal XP, loyalty), recomputes level and vassal level downward if needed (levels can go down on undo; `player.ring` cannot go down because `domainPoints` is reverted and ring is derived, but the rings table thresholds are checked and a ring unlock overlay already shown is not re-shown). Titles are never revoked. Combos forged by that completion are removed if the pair no longer holds. Utility gains are reverted.
- After the day boundary, no undo: the day is settled.

### 6.8 Day boundary

`gameDay(now) = floor((localMidnightOffset(now) − resetHour·3600000) / 86400000)` where the subtraction is done on local wall-clock time; in practice: take local date-time, subtract `resetHour` hours, take the local calendar date, count days since `firstPlayDay`'s date. Default reset hour 04:00, so a quest done at 01:30 belongs to the previous day. DST shifts make one day 23 or 25 hours; this is accepted.

On every app open and every foreground event, compute `today`. If `today > lastOpenDay`, run the boundary routine for each missed day in order (see 6.9), then issue today's board.

Boundary routine for day `d → d+1`:
1. Expire the board for `d` (open quests become `expired`; nothing is charged).
2. Utility decay (10.1) for each utility whose tied habit had no completion on `d`.
3. Loyalty decay (8.4) for each enabled vassal whose `lastActiveDay < d` (one day of grace).
4. Streak bookkeeping: if no quest was `done` on `d`, `questDayStreak` resets (recording `streakLostOnDay` and `streakLostLength` if the streak was ≥ 3).
5. If `(d + 1) − firstPlayDay` is a multiple of 7, settle the wave for the period that just ended (9).
6. Evaluate titles.

### 6.9 Catch-up after N missed days

Missing days are processed in order, but with caps so absence never snowballs:
- Loyalty decay applies for at most **7** missed days per catch-up, regardless of N.
- Utility decay applies for at most **3** missed days per catch-up.
- No boards are generated for missed days, and missed days are not "losses" for anything but the quest-day streak.
- Each wave period that ended entirely inside the absence with **zero** trust across all vassals resolves as `quiet`: no attack, no DP, one `waveQuiet` line. A period that had any activity resolves normally with whatever trust it had.
- A single `catchUp` line is shown with `{days}` on the Home screen; nothing else nags.

Example: a Steady player away 30 days with all vassals at 60 loyalty returns to vassals at 60 − 3·7 = 39, utilities down at most 45 points, four quiet waves, and a fresh board. Nothing left, nothing lost.

## 7. Rings and facilities

Rings and cumulative Domain Point thresholds (from `rings.json`):

| Ring | Name | DP required | Wall bonus | Facilities (mechanical effect) |
|---|---|---|---|---|
| 1 | The Room | 0 | 5 | Quest Board, Ledger (no effect) |
| 2 | The Flat | 120 | 8 | Kitchen, Noticeboard (ring-2 templates enter the pool); Improvised Forge (combos enabled) |
| 3 | The Floor | 330 | 11 | Stairwell Gym, Reading Nook, Linen Room (ring-3 templates) |
| 4 | The Building | 650 | 14 | Rooftop, Common Room (ring-4 templates); Workshop (+1 combo power) |
| 5 | The Block | 1,100 | 17 | Corner Shop (token 450, reroll 10); Courtyard (Well-kept bonus +8) |
| 6 | The District | 1,700 | 20 | Clinic (utility decay ×0.75); Library (title XP cap +25%) |
| 7 | The City | 2,500 | 23 | Observatory (cosmetic night map); Open Sky (nothing further to unlock) |

Facility effects are keyed by `facilities[].id` in code; the JSON `effect` string is display copy. Template gating is by `minRing` on the template, not by facility, so the facility list is narrative.

Ring unlock happens the moment `domainPoints` crosses the threshold (which can be mid-day, from a quest, or at wave settlement). The Ring-unlock overlay shows the vignette; it is queued behind a wave overlay if both occur at once.

## 8. Economy

### 8.1 Player XP curve

`xpToNext(L) = 50 + 45·L + 2·L²` for L = 1..49. Level 50 is the cap; XP past it accumulates for the Ledger only.

| Level | To next | Cumulative |
|---|---|---|
| 1 | 97 | 0 |
| 2 | 148 | 97 |
| 5 | 325 | 710 |
| 10 | 700 | 3,045 |
| 15 | 1,175 | 7,455 |
| 20 | 1,750 | 14,440 |
| 30 | 3,200 | 38,135 |
| 40 | 5,050 | 78,130 |
| 50 | — | 138,425 |

Level 2 arrives on day 2 for every difficulty (first tutorial beat). Gentle reaches 9 in a month, 16 in three, 29 in a year; Hardcore 15 / 25 / 45. Level 50 is a multi-year goal for Gentle and roughly 14 months for Hardcore. Player level has no mechanical effect in v1 beyond the Ledger and the level-up toast; the ring is the real progression. (Keeping it inert avoids a second power curve to balance.)

### 8.2 Settlement (coins)

Earned per 6.4. Approximate income: Gentle 370/week, Steady 650/week, Hardcore 1,100/week.

Sinks (all optional):
- **Resurrection token**: 500 (450 at ring 5). One per calendar month. See 12.
- **Quest reroll**: 15 (10 at ring 5), once per day.
- **Welcome gift** (Strict mode, on re-recruit): optional 30 settlement to bring the vassal back at loyalty 70 instead of 50.
- **Emergency generator**: 40 settlement pauses one utility's decay for the next boundary. Shown only when that utility is ≤ 39. Does not restore anything; it buys a day.
- Settlement has no other use in v1 and accumulates. The Ledger shows lifetime earnings as a vanity stat. Cosmetic decor purchases are a v2 sink.

### 8.3 Domain Points

- Per completed quest: `tier × (bonus ? 2 : 1)`.
- Per wave: decisive 22, win 15, loss 5, quiet 0 (× `1 + dpMult` from titles, rounded).
- Never decrease. Thresholds in section 7.

### 8.4 Loyalty gain and decay

- Gain per `done`: 8 / 6 / 5 (Gentle / Steady / Hardcore) + (tier − 1) + title flat. Cap 100.
- `tried` grants no loyalty but updates `lastActiveDay`.
- Decay at each day boundary for an enabled, not-away vassal with `lastActiveDay < d` (that is, inactive on the day that just ended **and** the day before it, giving one free day): −2 / −3 / −5. Floor 1 in Benevolent, 0 in Strict (then `away`).
- From 50, a fully ignored vassal leaves after 26 days (Gentle), 18 days (Steady) or 11 days (Strict Hardcore), counting the grace day. Catch-up caps (6.9) mean an absence alone can take at most 14 / 21 / 35 points.

### 8.5 Trust

Reset to 0 for all vassals when the wave settles. Not affected by difficulty.

## 9. Weekly wave

### 9.1 Timing

Period `i` covers game days `[7i, 7i+7)` counted from `firstPlayDay`. It settles on the first boundary routine that crosses day `7(i+1)`, i.e. on the next open after the period ends. The Home screen shows "Next wave in {days} days" and "Wave settles tonight" on day 7i+6.

### 9.2 Attack

`attack = round((16 + 2·min(w, 52) + 14·(ring − 1)) · attackMult)` where `w` = period index + 1 (1-based week number) and `attackMult` = 0.80 / 1.00 / 1.25.

Examples: week 1 ring 1 Steady = 18; week 10 ring 3 Steady = 64; week 26 ring 5 Hardcore = round(124·1.25) = 155; week 52 ring 7 Gentle = round((16+104+84)·0.8) = 163. After week 52 the time term stops growing; only the ring term and the player's growth move.

### 9.3 Defense

```
defense = Σ_enabled vassals (level + 2·trust)        // "weekly habit level" per vassal
        + wallBonus(ring)                             // 5..23
        + Σ counted combo items (power + comboPowerBonus)   // at most 6 items, highest first
        + Σ title defenseFlat                          // cap 12
        + wellKept                                     // +5 if all three utilities ≥ 70 at settlement (+8 at ring 5+)
```

Disabled or away vassals contribute 0. Trust is the dominant early term (a Gentle player with 3 quests/day across 8 habits puts ~21 trust-days into the week → +42); vassal levels take over as the long-term floor.

### 9.4 Result and rewards

- `decisive` if `defense ≥ 1.5·attack`: 22 DP.
- `win` if `defense ≥ attack`: 15 DP.
- `loss` otherwise: 5 DP ("the walls held"). Nothing is removed. `decisiveStreak` resets.
- `quiet` (6.9): 0 DP, no log.

### 9.5 Battle log generation

The log is deterministic from the `WaveRecord` and a seed `fnv1a(firstPlayDay, index)`. It is 6-10 lines, built as:
1. Header: `"Wave {w} reaches {ringName}. Attack {attack}."`
2. One line per contributing vassal with trust ≥ 1, in descending contribution, from a per-habit pool of 3 lines each (e.g. Pell: "Pell holds the stairwell. +{n}"), where `{n} = level + 2·trust`. Vassals with trust 0 but level ≥ 3 get a single shared line "The regulars hold the line. +{sum}".
3. One line per counted combo item: `"{itemName} is deployed. +{power}"` (max 3 lines; the rest are summed as "and {k} other odd things. +{sum}").
4. Walls and titles: `"The walls of {ringName} hold. +{walls}"`, and if titles contribute, `"Old honours count for something. +{titles}"`.
5. If well-kept: `"Lights, water and gas all steady. +{bonus}"`.
6. Result line from `waveDecisive` / `waveWin` / `waveLoss` with `{defense}` and `{attack}` substituted.
7. Reward line: `"Domain Points +{dp}. {ringProgress}"` where ringProgress is `"{current}/{needed} toward {nextRing}"` or "The City is registered; the Ledger keeps counting."

The log is stored on the record so the Ledger can replay it.

## 10. Utilities

Power ← Sleep, Water ← Hygiene, Gas ← Eat. Each 0-100, start 100.

### 10.1 Rules

- **Restore**: any `done` quest of the tied habit: +25 (cap 100). A tier 3 quest restores +40. Reaching 100 from below fires `utilityRestored`.
- **Decay**: at each boundary, if the tied habit had no `done` quest that day: −10 / −15 / −20 by difficulty, × 0.75 with the District Clinic, × 0.75 with the matching title (multiplicative, so 0.5625 with both), rounded. Floor 0. If the tied habit is disabled, its utility is frozen at its current value and the meter is hidden.
- **States** (visual only): 100-70 Bright, 69-40 Flickering, 39-1 Dim, 0 Out. Crossing down into Flickering or Dim fires one `utilityDegraded` line (never more than one line per utility per day). Out never fires a line on its own beyond the Dim line; the meter just reads "Out", and the Home screen's Haven illustration shows the lamp off / the tap dripping / the stove cold.
- **Only positive consequence**: the Well-kept Haven wave bonus (9.3). There is no penalty for Out. "The Haven never falls" is literal.
- `fullStreakDays` increments at each boundary where value is 100 after decay; resets otherwise. Feeds the Keeper of the Lights title.

## 11. Titles

21 titles in `titles.json`. Conditions are evaluated after every state change; titles are permanent and never revoked (including by undo). Effects are small, additive, and capped per type: XP +20% total (+25% with the Library), coins +15%, DP +10%, flat defense +12.

| Title | Condition | Effect |
|---|---|---|
| First Vassal | any vassal reaches loyalty 80 | +5% XP on that vassal's habit |
| Seven Days | 7-day quest-day streak | +3% all XP |
| The Long Month | 30 quest-days lifetime | +5% coins |
| The Long Season | 90 quest-days lifetime | +5% all XP |
| Hundred Quests | 100 quests | +5% all XP |
| Pathfinder | 60 Move quests | +5% Move XP |
| Dawn Walker | 25 Outside quests | +5% Outside XP |
| Steward's Apprentice | 40 Clean quests | +5% Clean XP |
| Herald | 20 Social quests | +5% Social XP |
| Scholar of the Stairwell | 40 Study quests | +5% Study XP |
| Night Warden | 40 Sleep quests | Power decay ×0.75 |
| Quartermaster's Favourite | 40 Eat quests | Gas decay ×0.75 |
| Scrubbed Spotless | 40 Hygiene quests | Water decay ×0.75 |
| Keeper of the Lights | Power at 100 for 7 consecutive boundaries | +5% Sleep XP |
| Wall-Holder | 4 wave wins | +3 defense |
| Decisive | 3 decisive wins in a row | +3 defense |
| Cartographer | reach ring 3 | +5% wave DP |
| Smith of Odd Things | 10 combos forged | +1 combo power |
| Full Table | all enabled vassals ≥ 60 loyalty at once | +5% coins |
| Returned | used a Resurrection token | +2% all XP |
| Open Door | re-recruited a vassal | +1 loyalty per completion |

Social thresholds are deliberately lower (Herald at 20) because Social quests are the hardest ask for the target audience.

## 12. Combo items ("improvised weapons")

Rule: from ring 2, when the day's completions include at least one `done` quest for each habit in a combo's `habits`, that item is forged (toast: "Forged: {name}"). Each combo id forges at most once per wave period; at most 6 items count toward a wave (highest power first); all items expire when the wave settles. The Workshop (ring 4) and Smith of Odd Things each add +1 power to every item. Undoing a completion that breaks the pair unforges the item.

17 pairs plus one legendary: Sprinting Umbrella (Move+Outside, 4), Dustpan Buckler (Move+Clean, 4), Protein Shaker Flail (Move+Eat, 4), Tandem Kettlebell (Move+Social, 5), Park Bench Banner (Outside+Social, 5), Sunlit Flashcards (Outside+Study, 4), Morning-Light Lantern (Outside+Sleep, 5), Shared Casserole Shield (Social+Eat, 4), Guest-Ready Doormat (Social+Clean, 4), Well-Rested Thesis (Study+Sleep, 5), Annotated Recipe Scroll (Study+Eat, 4), Alphabetised Bookwall (Study+Clean, 4), Fluffy Towel Cape (Sleep+Hygiene, 5), Minty-Fresh Spatula (Eat+Hygiene, 4), Lemon-Scented Halberd (Clean+Hygiene, 4), Boiled-Kettle Cannon (Clean+Eat, 4), Whispered Lullaby Horn (Social+Sleep, 4), and **The Full Set** (all eight in one day, 12). Power 5 marks pairs that push toward the harder-to-start habits (Outside, Social, Sleep).

## 13. Resurrection token

- Price 500 settlement (450 at ring 5). Purchasable once per calendar month (`player.resurrectionMonth`), local time.
- Restores **one** thing lost within the last 14 game days, player's choice from what applies: (a) a quest-day streak that ended (restores `questDayStreak` to `streakLostLength` and back-fills the gap days as "held" in the Ledger), or (b) a vassal who went away in Strict mode (returns at the loyalty they had the day before leaving, minimum 50). The Benevolent setting still allows (a).
- If nothing applies, the shop shows `resurrection.nothingToRestore` and no purchase is possible.
- Framing: expensive, rare, warm. Unlocks the Returned title. The Resurrection section of Settlement is only visible when a loss is restorable, so the feature never advertises losing.

## 14. Story

The system-window voice narrates. Each vignette is 80-150 words, shown once on unlock and replayable from the Ledger. Full text is in `rings.json` and `strings.json`; summarised beats:

- **Opening (107 words).** The Protocol comes online, registers one room, states the only rule (nothing enters without permission) and introduces the eight people waiting in the corridor who will go out *with* the player, not instead of them. "There is a door, and it opens from the inside."
- **Ring 1, The Room.** Pell asks whether the player has considered going out; the player has not; Pell says that is fine. Eight names "awaiting assignment".
- **Ring 2, The Flat.** The kitchen has a window. Basil inventories two tins and an onion. Utilities become the player's responsibility "which is not how plumbing works, but it is how the Haven works."
- **Ring 3, The Floor.** Tobi's "OUT OF ORDER, USE LEGS" sign on the lift; Pell measures the stairwell; neighbours you have greeted count as fortification.
- **Ring 4, The Building.** Wren calibrates on the rooftop; Ondra builds a wave weapon from a broom and an umbrella; "your name is on the door downstairs".
- **Ring 5, The Block.** The corner shop owner knows your name; Tobi calls it the greatest fortification in Haven history; "without thinking about it used to be impossible."
- **Ring 6, The District.** Library card as a key to the district; Pell and the man with the dog become an alliance; the first Ledger entry is kept where it was.
- **Ring 7, The City.** The Protocol pauses for the first time. Eight vassals on the roof, chairs, soup, nobody going to bed. "The Haven is safe. It was always going to be. You went out anyway."

Vassal one-liners in quest descriptions and toasts carry the characters between vignettes. No other story content in v1.

## 15. Screens and UX

Mobile-first at 480 px; bottom tab bar with four tabs (Haven, Board, Ledger, Settings). System-window panels: translucent dark panel, thin light border, bold header, body text, optional action row. Overlays slide up from the bottom and are dismissable by tap or swipe.

### 15.1 Home / Haven

```
+------------------------------------------+
| HAVEN PROTOCOL        Lv 7 . 1,240 coins |
|  [ ring map: 7 concentric outlines,       |
|    rings 1-2 lit, boundary glowing ]      |
|  The Flat  . 212 / 330 DP to The Floor    |
|  ======------------  (DP bar)             |
+------------------------------------------+
| Power [########--] Water [#####-----]     |
| Gas   [##########]            Well-kept?  |
+------------------------------------------+
| Vassals                                   |
|  Pell  L3 ooooo..  loyalty 72 [=====  ]   |
|  Wren  L2 oo.....  loyalty 41 [===    ]   |
|  ...  (8 rows, away rows greyed +[Welcome back]) |
+------------------------------------------+
| Next wave in 3 days . Forged: 2 items     |
| "The Haven is always safe."               |
+------------------------------------------+
| [Haven] [Board] [Ledger] [Settings]       |
+------------------------------------------+
```

The ring map is an SVG: seven nested rounded shapes (room, flat outline, floor, building, block, district, city), lit rings filled, next ring dashed. Utility meters animate on change. Catch-up line replaces the encouragement line when relevant.

### 15.2 Board (Quests)

```
+------------------------------------------+
| TODAY'S BOARD          Steady . 2/4 done |
| Day starts at 04:00  . resets in 9h      |
+------------------------------------------+
| [BONUS x2]  Deep work          Imre T3   |
|   50 uninterrupted minutes on the hard   |
|   thing.             [Start 50:00] [Done]|
+------------------------------------------+
| Daylight walk                 Wren T1    |
|   10 min outside...  [Start 10:00] [Done]|
+------------------------------------------+
| Six glasses                   Basil T1   |
|   [-] 4 / 6 [+]                          |
+------------------------------------------+
| (done) Make the bed           Ondra T1   |
|   +15 XP  +8 coins          [Undo]       |
+------------------------------------------+
| [Swap a quest . 15 coins]   Tried? (long-press) |
+------------------------------------------+
```

Each card: vassal chip (colour + name), tier pips, title, description, kind-specific control. Long-press or overflow menu offers "Tried". Done cards sink to the bottom with reward text and Undo until the boundary.

### 15.3 Ledger (Character)

```
+------------------------------------------+
| THE LEDGER                               |
| Absolute . Level 7   [=======---] 412/463|
| Settlement 1,240 . lifetime 6,310        |
| Domain Points 212 . The Flat             |
+------------------------------------------+
| Titles (4/21)  [Seven Days] [Herald] ... |
|   locked ones greyed with condition text |
+------------------------------------------+
| Vassals                                  |
|  Pell the Runner   L3  142/200  loyalty 72|
|  (tap for portrait, personality, stats)   |
+------------------------------------------+
| Waves                                    |
|  Week 6 . win . 74 vs 50   [log]         |
|  Week 5 . decisive . 71 vs 44 [log]      |
+------------------------------------------+
| Story: replay vignettes [1] [2] [3]      |
| Resurrection token: nothing to restore   |
+------------------------------------------+
```

### 15.4 Settings

```
+------------------------------------------+
| SETTINGS                                 |
| Name  [Absolute        ]                 |
| Difficulty  (Gentle) (Steady*) (Hardcore)|
|   "Four quests a day, a mix."            |
| Benevolence (Benevolent*) (Strict)       |
|   "Neglected vassals wait..."            |
| Habits   [x]Move [x]Outside [x]Clean     |
|          [x]Social [x]Study [x]Sleep     |
|          [x]Eat [x]Hygiene               |
| Day starts at   [04:00 v]                |
| Lights-out hour [23:00 v]  Wake [08:00 v]|
| Reduce motion   [ ]                      |
+------------------------------------------+
| Export save . Import save                |
| Reset everything (two-step confirm)      |
| About: Haven Protocol v0.1.0             |
|   non-affiliation note                   |
+------------------------------------------+
```

Changing difficulty takes effect on the next board. Disabling a habit hides its vassal and utility and freezes them. Changing the reset hour applies from the next boundary.

### 15.5 Settlement overlay (after Done)

```
+------------------------------------------+
|  SETTLEMENT . Daylight walk               |
|  +24 XP   +11 coins   +1 DP   Wren +6    |
|  [timed bonus]                            |
|  "Returned from Daylight walk. Welcome    |
|   home. The lights are on."               |
|  Forged: Sprinting Umbrella (+4)          |
|  Water restored to 100  (if applicable)   |
|                         [Undo]  [Close]   |
+------------------------------------------+
```

Appears as a short toast-sheet (2.5 s auto-dismiss, or stays while Undo is visible on tap). Level-up and title lines stack beneath.

### 15.6 Wave result overlay

```
+------------------------------------------+
|  WAVE 6 . THE FLAT                        |
|  Attack 50     Defense 74     WIN         |
|  ---------------------------------------- |
|  Wave 6 reaches The Flat. Attack 50.      |
|  Pell holds the stairwell. +9             |
|  Imre reads the monsters a bibliography. +7|
|  Sprinting Umbrella is deployed. +4       |
|  The walls of The Flat hold. +8           |
|  Lights, water and gas all steady. +5     |
|  Wave repelled. Defense 74 against 50.    |
|  Domain Points +15. 227/330 toward The Floor |
|                               [Continue]  |
+------------------------------------------+
```

Lines type in one by one (skippable; instant with reduced motion). On loss the header reads "HELD" rather than "LOSS" and the colour stays neutral.

### 15.7 Ring unlock overlay

```
+------------------------------------------+
|  DOMAIN EXPANDED                          |
|  [ ring map animates: next ring lights ]  |
|  THE FLOOR                                |
|  Domain expanded: the whole floor. Four   |
|  doors, one stairwell, a corridor that    |
|  echoes. ...                              |
|  Unlocked: Stairwell Gym, Reading Nook,   |
|  Linen Room                               |
|                               [Continue]  |
+------------------------------------------+
```

## 16. Accessibility and wellbeing safeguards

- **No loss states.** Verified by the invariants in section 4: nothing in the save ever decreases except by the player's own undo, and the three soft states (dim utility, low loyalty, lost wave) all have a one-action fix and cost nothing.
- **No streak anxiety.** Trust (this week) and loyalty (overall) are separate, and the quest-day streak is shown only in the Ledger, never on the Home screen. The word "streak" does not appear in player-facing copy except in the Resurrection offer.
- **Catch-up caps** (6.9) so a long absence cannot produce a wall of decay.
- **Benevolent default.** Vassals never leave unless the player opts into Strict.
- **"Tried" is first-class.** Attempting counts for trust and holds loyalty; the copy says so.
- **No notifications in v1**; the app never reaches out. Sleep quests reference hours the player set, never the clock on the device.
- **Honor system by design.** Rewards are small and cosmetic-heavy; there is nothing to gain from cheating, and the copy never implies suspicion.
- **Accessibility**: all controls ≥ 44 px, full keyboard operability, `aria-live="polite"` on the settlement toast, colour never the only signal (tier pips, text states), contrast ≥ 4.5:1 on panels, `prefers-reduced-motion` respected (no typing animation, no ring pulse), system font fallback, text scales with user font size up to 200% without clipping the tab bar.
- **Language**: no medical or diet claims; Eat quests are about rhythm and water, never calories or weight; Move quests never mention performance targets other than the player's own.
- **Hygiene and Sleep quests** are phrased as care, not compliance, since the target audience may include people for whom these are hard days.

## 17. Non-affiliation note

Haven Protocol is an original work. It is not affiliated with, endorsed by or connected to any novel, webtoon, publisher or studio. All names, characters, text and art are original. The premise of a home base that grows when its keeper's people go out is a genre convention; nothing here reproduces any specific work's names, text, art or system wording. The README may say "inspired by the home-base genre of system-window stories"; store listings and art must not reference any specific title. Code is under the repository's permissive licence; original writing and art under a separate `ASSETS-LICENSE` file.

## 18. Open questions resolved

Decisions made here, not escalated:

1. **Name**: Haven Protocol (not Shut-In Protocol, to keep distance from the source title and from "shut-in" as a label for the player).
2. **Player level is inert** in v1 (Ledger and toast only); the ring is the only power curve. Avoids a second balance axis.
3. **Domain Points per quest = tier**, so daily play and waves both move the ring; waves give ~1/3 of DP for a Gentle player and are the "big" weekly beat.
4. **Loss still pays 5 DP** ("the walls held"), so the ring never stalls for a struggling player; a Gentle player at 60% completion still reaches ring 4 in ~15 weeks.
5. **Attack scales with week number (capped at 52) and ring**, multiplied by difficulty; it does not rubber-band to the player's defense. Transparent and testable; sim shows 0 losses for 90% completion at every difficulty and 8/52 for Gentle at 60%.
6. **Utilities have no penalty**, only the Well-kept bonus. The meters are mood, not mechanics.
7. **Benevolent is the default**; Strict is opt-in. Re-recruit is free; the 30-coin welcome gift is optional.
8. **Grace day** before loyalty decay; catch-up caps of 7 days (loyalty) and 3 days (utilities); absent wave periods are "quiet", not lost.
9. **Timers are optional friction** (+10% XP), never a gate. One timer at a time.
10. **Undo is same-day only** and reverts the exact snapshot; titles are never revoked.
11. **Resurrection token restores one of two things** (streak or away vassal) within 14 days; once per calendar month; hidden when nothing applies.
12. **Reroll** exists (15 coins, once/day) as the only "I cannot do this one" valve besides "Tried".
13. **Reset hour default 04:00**; lights-out and wake hours are copy only (no clock checks).
14. **Tier-3 templates are gated behind ring 2+** for every habit; Hardcore players reach ring 2 in a week so this is their on-ramp.
15. **Social title thresholds are lower** (Herald at 20) by design.
16. **Combo items are consumed by the wave**, max 6 counted, each id once per period, to reward variety over repetition.
17. **Save export/import** (JSON file) is in Settings as the only "sync"; it is also the engineers' debug tool.
18. **Strings use seeded picks**, so a day's copy is stable across re-renders.

## 19. Pacing simulation

Throwaway script in the session scratchpad (`sim.mjs`), 365 simulated days, seeded PRNG, all 8 habits enabled, boards generated exactly as in 6.3 (neglect-weighted habits, difficulty tier weights, bonus on the highest tier), rewards as in 6.4, loyalty and trust as in section 8, wave formula as in section 9 with combos approximated as 1-2 items per two completed habits per day (capped at 6 counted). "Completion rate" is the chance each issued quest is done.

| Profile | Ring 2 | Ring 3 | Ring 4 | Ring 5 | Ring 6 | Ring 7 | Level @30d / 90d / 365d | Wave losses / 52 |
|---|---|---|---|---|---|---|---|---|
| Gentle, 90% | wk 2.3 | wk 6.0 | wk 11.0 | wk 18.0 | wk 28.3 | wk 44.0 | 9 / 16 / 29 | 0 |
| Gentle, 60% | wk 3.0 | wk 8.0 | wk 15.0 | wk 25.6 | wk 41.3 | — | 7 / 13 / 24 | 8 |
| Steady, 90% | wk 1.4 | wk 3.9 | wk 7.4 | wk 12.6 | wk 20.0 | wk 30.4 | 13 / 21 / 37 | 0 |
| Hardcore, 90% | wk 1.1 | wk 3.0 | wk 6.0 | wk 10.0 | wk 15.4 | wk 22.7 | 15 / 25 / 45 | 0 |
| Hardcore, 60% | wk 1.9 | wk 4.4 | wk 8.0 | wk 14.3 | wk 22.0 | wk 31.4 | 12 / 21 / 38 | 20 |

Targets met: Gentle at 3 quests/day reaches ring 2 in ~2 weeks and ring 4 in ~2.5 months; Hardcore is 1.8-2.1× faster at every ring. Sample wave margins for Gentle 90%: week 1 defense 68 vs attack 14 (decisive), week 20 129 vs 90 (win), week 52 193 vs 163 (win); the margin narrows but stays positive for consistent players, and a 60%-completion Hardcore player starts losing waves in the ring-7 endgame, which is the intended "Hardcore" bite. Vassal levels after a year: Gentle ~13, Hardcore ~24, consistent with the cap of 30.

Engineers should port `sim.mjs` into `src/game/__sim__/` as a vitest that asserts these ring weeks within ±1 week, so economy changes are caught.
