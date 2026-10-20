# Haven Protocol: The Arena

Version 1.0, 2026-10-20. Scope: brief G, delivered as G1 (this document, content, engine) and G2 (screens, mini-game host). Companion to `GDD.md`, `GDD-errata.md` (entries 24 to 26), `games/CONTRACT.md` and `RESPONSIVE-RULES.md`. Every number below was computed from `src/game/arena/*.ts` and `src/game/content/arena.json`; if they disagree with this page, the code wins.

---

## 1. Purpose, fantasy and tone

Settlement coins have had almost nothing to buy (GDD 8.2), and the mini games need a home. The Arena answers both: **coins become the Arena currency**, spent in an Armory and on run entry fees, and the mini games are the rooms of those runs.

The fantasy: **"My vassals are good at what they practise, so I send them out to test it."** The troops are the vassals levelled through real habits; the Arena only adds gear and a little training. A run is a short outing from room to room, each room a mini game, with a small blessing from the Lottery after every win. The troops come home when the player says so, or when a room beats them.

Tone rules, all enforced by the engine:

- **Never punitive.** Losing is "the troops come home", with a quarter of the spoils. Gear, training, decor and anything banked earlier always stay.
- **No real money**, ever. The only currency is settlement coins earned from habits.
- **Domain Points are untouchable.** The Arena never writes DP, the ring or `highestRing`. Banked defense can help a wave, which awards its own DP as before.
- **Results never touch streaks, loyalty or utilities** (`run.test.ts`: "never touches streaks, loyalty, utilities, Domain Points, XP or the board").
- **Coins cannot replace habits.** Every price is a share of what habits earn (section 3); training is capped at a quarter of a habit week.
- **A daily cap is suggested, never forced** (5.5).

## 2. Vocabulary

| Word | Meaning |
| --- | --- |
| **Troop** | A contract `PartyMember`: an active vassal today, a citizen later (4.1). |
| **Armory** | The permanent shop: gear, training, Haven decor. |
| **Gear** | One item per slot (`weapon`, `armor`, `charm`) per vassal. Tiers 1 to 3 are sold; tier 4 is rare and only won. |
| **Stash** | Rare items won but not worn yet. |
| **Training** | Small permanent power bumps per vassal, weekly capped. |
| **Run** | An entry fee, then a chain of games until a loss, leaving, or banking. |
| **Room** | One game of a run, numbered from 0; at most 10. |
| **Spoils** | `run.pending`: coins and wins at risk until banked. |
| **Lottery** | After a win, three buffs drawn, one kept. |
| **Buff** | A contract `RunBuff`, kept in `run.buffs` for the run only. |
| **Bank** | End the run on purpose: coins, wave defense or a rare item. |
| **Carry home** | What a loss pays: 25% of the spoils' coins, rounded down. |

## 3. The economy

Prices derive from `economy.ts` (`DIFFICULTY`, `questRewards`) and `arena.json` through `arena/economics.ts`. The typical day is `questsPerDay × adherence × expected coins per quest`, the expected quest being tier-weighted base coins times the difficulty multiplier (GDD 6.2, 6.4).

| Difficulty | Expected coins per quest | Full day (100%) | Typical day (90%) | Typical week (90%) |
| --- | --- | --- | --- | --- |
| Gentle | 13.8 | 41.4 | 37.26 | 260.8 |
| Steady | 19.8 | 79.2 | 71.28 | 499.0 |
| Hardcore | 27.12 | 135.6 | 122.04 | 854.3 |

### 3.1 The entry fee

`run.feeByRing` at the ring of entry, capped at one typical day (`floor(typicalDailyCoins(difficulty, 0.9))`), never below 1:

| Ring | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Steady (cap 71), Hardcore (cap 122) | 20 | 26 | 32 | 38 | 44 | 50 | 56 |
| Gentle (cap 37) | 20 | 26 | 32 | 37 | 37 | 37 | 37 |

The cap only bites for Gentle, from ring 4.

### 3.2 The win payout

Each won game adds to the spoils:

```
winCoins = max(1, round(fee × (0.4 + 0.6 × score / 1000) × (1 + 0.25 × room)))
```

`score` is `Outcome.score` (0 to 1000), `room` is 0-based. A perfect first room returns the fee, a zero score 40% of it, and each later room adds 25% of the first room's value.

Worked example, Steady at ring 1 (fee 20), every game scored 700:

| Room | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Win coins | 16 | 21 | 25 | 29 | 33 |
| Spoils so far | 16 | 37 | 62 | 91 | 124 |

Two wins return 37 for a fee of 20 (1.85 times), five wins 124 (6.2 times). At ring 7 (fee 56): 46, 57, 69, 80, 92.

### 3.3 Carry home

A loss, or leaving a game, ends the run and pays `floor(pending coins × 0.25)`. In the example, losing the third room after 37 coins of spoils carries 9 coins home. A first-game loss costs the fee and nothing else.

### 3.4 The proof

These are asserted in `src/game/arena/economy.test.ts`, which recomputes the day from `questRewards` itself (test names quoted).

| Claim | Number | Test (short name) |
| --- | --- | --- |
| Steady at 90% earns about 71 coins a day (`questRewards`: 11, 20, 33 coins for tiers 1 to 3, within half a coin per quest of 19.8) | 71.28 a day, 143 over two days | "the typical day is computed from questRewards..." |
| One run every two days fits at every ring, using at most half of those two days | fee 20 to 56 against 143 | "a Steady player at 90% adherence affords one run every two days..." |
| The fee never exceeds one typical day | Gentle capped at 37 | "the fee is never more than one day of typical earnings..." |
| Weekly training stays at or under 25% of a habit week (and above 20%) | 65 / 124 / 213 of 260.8 / 499.0 / 854.3 | "weekly training can never exceed 25% of what habits give..." |
| The engine reports that cap and two bumps a week at ring 7 | `weekCap`, `weekBumpsMax` 2 | "even the most expensive allowed training week stays under the cap..." |
| Every bump fits one week's cap, even Gentle at ring 7 | dearest bump 54 against 65 | "every training bump is reachable under the weekly cap..." |
| Price per point of training grows more than four times | 7, then 37 | "training has steep diminishing returns..." |
| A full sold gear set for one vassal costs weeks | 1,420 at ring 1 prices, 19.9 Steady days | "a full set of gear for one vassal costs weeks of habits, not days" |
| A short run roughly pays its fee back; a long chain pays well but the Armory stays the sink | two wins 37, five wins 124 | "the expected run roughly pays its fee back..." |
| Difficulty rises every other room, one more from ring 4, capped at 5 | see 5.4 | "difficulty rises every other room..." |

Realistically a player buys tier 1 at ring 1, tier 2 at ring 2 and tier 3 at ring 4: 160 + 450 + 1,170 = 1,780 coins for one vassal, about 25 Steady days. Eight vassals take months: the Armory is the long sink.

## 4. The Armory

### 4.1 Troops and the roster

`rosterFor(save)` (`roster.ts`) is the one place that knows where troops come from. Today it returns `vassalMembers(save)`: every active vassal (enabled and present, habit order) built with `makeMember`: `id` the habit id, the vassal's name, own `level` and rounded `loyalty`, `power = derivePower(level, loyalty)`, and `traits` the earned titles of that habit (a habit title, or a title of the habit's utility).

**Extension point for citizens.** Brief F writes `citizenMembers(save): PartyMember[]` next to the citizen code and adds it to `ROSTER_SOURCES` in `roster.ts`. Nothing else changes: `buildParty`, the host and the games accept `habit: null`, and `equipMember` passes such members through ungeared. The Arena never imports citizen code.

### 4.2 Gear

Three slots per vassal. A purchase must be an upgrade (strictly higher tier) and replaces the slot's item; each purchase is per vassal. Prices scale by `1 + 0.12 × (ring − 1)`, rounded to 5 (`gearPrice`).

| Item | Id | Slot | Tier | Min ring | Price ring 1 | Price ring 7 | Power |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Practice Baton | `practice_baton` | weapon | 1 | 1 | 60 | 105 | 2 |
| Tempered Walking Staff | `walking_staff` | weapon | 2 | 2 | 150 | 260 | 4 |
| Starlit Pike | `starlit_pike` | weapon | 3 | 4 | 320 | 550 | 6 |
| Quilted Vest | `quilted_vest` | armor | 1 | 1 | 60 | 105 | 2 |
| Waxed Cloak | `waxed_cloak` | armor | 2 | 2 | 150 | 260 | 4 |
| Lantern-Plate Mantle | `lantern_mantle` | armor | 3 | 4 | 320 | 550 | 6 |
| Knotted Cord | `knotted_cord` | charm | 1 | 1 | 40 | 70 | 1 |
| Brass Compass | `brass_compass` | charm | 2 | 2 | 100 | 170 | 2 |
| Haven Seal | `haven_seal` | charm | 3 | 4 | 220 | 380 | 3 |

Tier 2 and 3 items are on sale only from their `minRing`; their "ring 1" price is the base. A tier 3 set adds 15 power.

**Rare items** are tier 4, price 0, never sold (`rare item`), only won by banking (5.3): weapons Moonlit Pike (`moonlit_pike`, 9) and Ladle of Ages (`ladle_of_ages`, 8); armor Dawnbreak Mantle (`dawnbreak_mantle`, 9) and Quiet Plate (`quiet_plate`, 8); charms Heart of the Haven (`heart_of_the_haven`, 5) and Sun-Crow Feather (`sun_crow_feather`, 5).

A won rare item goes to the **stash**. `equipRare` puts it on one vassal; the slot's previous rare item returns to the stash, and a sold item there is given up. Each rare item exists once. No sold item is an upgrade over a rare one.

### 4.3 Training

Up to six bumps per vassal. Price: `14 + 2n + 0.5n²` (`n` = bumps taken) times `1 + 0.08 × (ring − 1)`, rounded to the coin (`trainingPrice`).

| Bump | Power added | Total power | Price ring 1 | Price ring 7 | Cumulative ring 1 | Cumulative ring 7 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 2 | 14 | 21 | 14 | 21 |
| 2 | 2 | 4 | 17 | 24 | 31 | 45 |
| 3 | 1 | 5 | 20 | 30 | 51 | 75 |
| 4 | 1 | 6 | 25 | 36 | 76 | 111 |
| 5 | 1 | 7 | 30 | 44 | 106 | 155 |
| 6 | 1 | 8 | 37 | 54 | 143 | 209 |

After six bumps a vassal is fully trained (`training maxed`); the curve has no seventh or eighth entry.

**The weekly cap**, per wave period (`week.index`), across all vassals: at most **2 bumps** (`training week full`) and at most **`trainingWeeklyCap(difficulty)`** coins, a quarter of a 90% habit week rounded down: Gentle **65**, Steady **124**, Hardcore **213** (`training week cap`). Fully training eight vassals takes 24 periods at best. For Steady the bump limit binds first (two sixth bumps at ring 7 cost 108); for Gentle at high rings the coin cap can.

### 4.4 The party builder

`buildParty(save)` (`party.ts`) is what the host gives a game:

```
power  = clamp(derivePower(level, loyalty) + gear power + training power, 1, 100)
traits = [earned title ids of the habit..., 'gear:<slot>:<tier>' per worn item (slot order), 'training:<n>' when n > 0]
```

A vassal with the Practice Baton and three bumps carries `gear:weapon:1` and `training:3` and gains 2 + 5 = 7 power. Level and loyalty stay its own; the clamp holds even for a level 30, loyalty 100 vassal in rare gear. Members are sorted strongest first (ties keep roster order) because `fitParty` takes the first `rosterSize.max`. Games ignore unknown trait ids. `party.test.ts` asserts ranges, trait order and contract validity.

### 4.5 Haven decor

Decor gives a combo item's name a place in the Haven. It is cosmetic only (GDD 8.2 promised decor as a later sink). Price is `power × 30`, rounded to 5 (`decorPrice`), bought once per combo id (`already owned`). Any combo in `combos.json` can be bought; the engine does not require having forged it.

| Combo power | Price | Combos |
| --- | --- | --- |
| 4 | 120 | twelve combos, from Sprinting Umbrella to Whispered Lullaby Horn |
| 5 | 150 | Tandem Kettlebell, Park Bench Banner, Morning-Light Lantern, Well-Rested Thesis, Fluffy Towel Cape |
| 12 | 360 | The Full Set |

The whole collection costs 2,550 coins.

## 5. Runs

### 5.1 The state machine

A run lives in `arena.run` and moves through three phases:

```
             enterRun (fee paid)
                    |
                    v
   +---------->  PLAYING  ---- lost / fled ------------------+
   |                |                                         |
   |              won (spoils += winCoins)                    |
   |                |                                         v
   |                +-- 10th win --------+            RUN ENDS: LOSS
   |                v                    |            carry home 25%,
   |             LOTTERY  -- bankRun --+ |            buffs cleared,
   |                |                  | |            troops come home
   |            pickBuff               | |
   |                v                  | |
   +-continueRun- DECIDE <-------------|-+
                    |                  |
                 bankRun               |
                    v                  v
             RUN ENDS: BANKED (coins | defense | item), buffs cleared
```

`playing` has `run.current` (game id, seed, room, difficulty); `lottery` has three `run.offers`; in `decide` the player banks or continues. Banking from the Lottery skips the pick. The tenth win opens no Lottery and leaves only banking (`chain complete`). A run has no clock: it waits across days.

### 5.2 The Lottery

After a win in room `r` (not the tenth), `drawOffers(run.seed, r, run.buffs)` draws three distinct definitions by weight, without replacement. The pick enters `run.buffs` as `<definition id>@<room>`, so ids stay unique.

| Id | Name | Kind | Amount | Weight | Rare | First-draw chance (no luck) |
| --- | --- | --- | --- | --- | --- | --- |
| `attack-s` | Sharpened Resolve | attack | +10% | 12 | no | 15.4% |
| `attack-l` | Battle Hymn | attack | +20% | 5 | yes | 6.4% |
| `defense-s` | Steady Footing | defense | +10% | 12 | no | 15.4% |
| `defense-l` | Shield Wall | defense | +20% | 5 | yes | 6.4% |
| `time-s` | A Few Extra Minutes | time | +10 s | 10 | no | 12.8% |
| `time-l` | The Long Afternoon | time | +25 s | 4 | yes | 5.1% |
| `hint-s` | A Whispered Tip | hint | 1 | 10 | no | 12.8% |
| `hint-l` | Margin Notes | hint | 2 | 4 | yes | 5.1% |
| `revive-s` | Second Wind | revive | 1 | 5 | yes | 6.4% |
| `luck-s` | Lucky Penny | luck | +10% | 8 | no | 10.3% |
| `luck-l` | Four-Leaf Banner | luck | +25% | 3 | yes | 3.8% |

Weights total 78. Units follow CONTRACT.md section 7: `attack`, `defense`, `luck` in percentage points, `time` in seconds, `hint` and `revive` as counts.

**Caps per run**: attack 60, defense 60, time 90, hint 5, revive 2, luck 50. A definition that would push its kind over the cap is left out of the draw; if fewer than three remain, fewer are offered, and with none the win goes straight to `decide`.

**The luck rule.** Rare weights are multiplied by `1 + luck / 50` (the run's total luck): 1.5 times at luck 25 (Battle Hymn rises from 6.4% to 8.2%), double at the cap. Common weights never change. Games may also use luck for their own dice.

**Determinism.** The draw uses `mulberry32(fnv1a("<run seed>:lottery:<room>"))`, so a reload shows the same offers (`lottery.test.ts`: weights, determinism, caps, luck).

### 5.3 Banking, and how the host maps an `Outcome`

`bankOptions(save)` feeds the buttons. The choices are exclusive: defense or an item gives up the pending coins.

| Choice | Gives | Condition | Refusal |
| --- | --- | --- | --- |
| `coins` | all pending coins | always | |
| `defense` | +1 wave defense per win, up to 6 per wave period across all runs | room left under the period's cap | `defense capped` |
| `item` | one rare item the player does not own yet, seeded by `fnv1a("<run seed>:item")`, into the stash | at least 3 wins, and a rare item left | `chain too short`, `no rare item left` |

**Wave defense** is stored in `arena.defense` with the current `week.index` and becomes the `arena` term of `waveDefense` (`WaveBreakdown.arena`), logged as "The Arena spoils reinforce the gate. +N". That period's settlement spends it; a **quiet week** carries it to the next period; a bonus from an older period is replaced, not added to, and dropped when a later wave settles. It never grants DP or coins by itself.

**`Outcome.score`** scales only the coins (3.2). Defense counts wins and the item needs three wins, whatever the scores.

**How the host applies an `Outcome`** (G2, `src/components/arena/host/`):

1. Mount the Screen with `fitParty(buildParty(save), manifest)`, seed `run.current.seed` and `runContext(run)`.
2. Validate with `outcomeProblems(outcome, partyIds)` (`src/games/testing/validate.ts`). An invalid outcome is logged and applied as `{ result: 'fled', score: 0 }`, never trusted.
3. Pass `{ result, score, learned }` to `resolveGame` through the store. The engine cleans them again: an unknown result reads as `fled`, the score is rounded and clamped to 0..1000, `learned` is kept only with both languages non-empty (topic up to 80 characters, note up to 240).
4. Show `learned` after the game; it stays in the game record and the run log.
5. Exit without `onFinish` records `fledOutcome()`; an `onFinish` after `onExit` in the same task wins (CONTRACT.md 5). `abandonRun` equals resolving `fled`.
6. `resolveGame` refuses with no game in progress, so a double apply never pays twice.

### 5.4 Game selection and difficulty

The engine never imports a game. The host lists `listGames({ includeDev: debugEnabled() })` (dev-only games such as Coin Duel appear only in debug and tests) and passes `{ id, minRing, rosterMin: rosterSize.min }`. `pickGame` keeps games with `minRing <=` the run's ring and `rosterMin <=` the troop count, sorted by id; drops the previous game when more than one is eligible; and picks with `mulberry32(fnv1a("<run seed>:game:<room>"))`. With no eligible game, `enterRun` refuses before any coin moves (`no games`); mid-run, `continueRun` refuses and banking stays open. Seeds: run `fnv1a("<firstPlayDay>:arena:<seq>")`, game `fnv1a("<run seed>:seed:<room>")`.

Difficulty (`roomDifficulty`) is `1 + floor(room / 2)`, plus 1 from ring 4, capped at 5:

| Room | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rings 1 to 3 | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 |
| Rings 4 to 7 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 | 5 | 5 |

### 5.5 The daily suggestion

`arena.today` counts runs started per game day. `overDailySuggestion(save, day)` is true from the fifth run of the day (`suggestedRunsPerDay: 5`). The screen shows a soft line and keeps every button working. Nothing in the engine refuses a sixth run.

## 6. Data model

### 6.1 SaveFile addition (version 5)

`arena` sits right after `map` in `SaveFile`; `SAVE_VERSION` is 5.

```ts
export type GearSlot = 'weapon' | 'armor' | 'charm';
export type ArenaBuffKind = 'attack' | 'defense' | 'time' | 'hint' | 'revive' | 'luck';
export interface ArenaBuff { id: string; kind: ArenaBuffKind; amount: number } // a contract RunBuff
export type ArenaPhase = 'playing' | 'lottery' | 'decide';
export type ArenaGameResult = 'won' | 'lost' | 'fled';
export type ArenaEnd = 'lost' | 'fled' | 'banked';
export type ArenaBankChoice = 'coins' | 'defense' | 'item';
export type ArenaDifficulty = 1 | 2 | 3 | 4 | 5;

export interface ArenaLearned { topic: { en: string; fr: string }; note: { en: string; fr: string } }

export interface ArenaGameRecord {
  gameId: string;
  room: number;
  result: ArenaGameResult;
  score: number;
  coins: number;               // added to the spoils (0 unless won)
  learned?: ArenaLearned;
}

export interface ArenaRun {
  id: string;                  // `r${seq}`, never reused
  seed: number;
  startedDay: number;
  startedAt: number;
  ring: RingId;                // ring at entry: fixes fee and difficulty curve
  fee: number;
  phase: ArenaPhase;
  room: number;                // games won so far = next room index
  buffs: ArenaBuff[];
  pending: { coins: number; wins: number };
  current: { gameId: string; seed: number; roomIndex: number; difficulty: ArenaDifficulty } | null;
  offers: ArenaBuff[];
  games: ArenaGameRecord[];
  lastGameId: string | null;
}

export interface ArenaRunRecord {
  id: string; day: number; at: number; ring: RingId; fee: number; wins: number;
  end: ArenaEnd;
  bank: ArenaBankChoice | null;
  coins: number;               // banked coins, or the share carried home
  defense: number;
  itemId: string | null;
  games: ArenaGameRecord[];
}

export interface ArenaRequest { id: string; at: number; day: number; text: string; source: 'text' | 'voice' }

export interface ArenaStats { runs: number; gamesWon: number; gamesLost: number; bestChain: number; coinsBanked: number }

export interface ArenaState {
  gear: Record<HabitId, Record<GearSlot, string | null>>;
  stash: string[];
  training: Record<HabitId, number>;
  trainingWeek: { period: number; spent: number; bumps: number };
  decor: string[];             // combo ids
  defense: { period: number; amount: number } | null;
  run: ArenaRun | null;
  log: ArenaRunRecord[];       // newest last, capped at 30
  stats: ArenaStats;
  today: { day: number; runs: number };
  requests: ArenaRequest[];
  nextSeq: number;             // shared by runs (r1) and requests (q2)
}

export interface SaveFile { version: 5; /* ...existing fields... */ map: MapState; arena: ArenaState; /* ... */ }
export interface WaveBreakdown { /* ...existing fields... */ outposts: number; arena?: number } // absent before v5, read with ?? 0
```

The brief's top-level `arenaRequests` is **`arena.requests`** here: one field and one migration for the whole feature.

### 6.2 Invariants

- The Arena never changes DP, ring, XP, streaks, loyalty, trust, utilities or the board.
- `run.current` is set exactly in `playing`; `run.offers` is non-empty exactly in `lottery`; `run.room == run.pending.wins <= 10`.
- Each kind's buff total stays within its cap; buffs live only in `run`, so ending a run clears them.
- A rare item is owned at most once; `gear` holds only known items in their own slot.
- `training[h]` is 0 to 6; per period, at most 2 bumps and the coin cap; `defense.amount` is 1 to 6.
- `log` and `requests` hold at most 30 each; ids are unique and below `nextSeq`.
- Mutators never touch their input; a refusal returns the input save, no events and a code.

### 6.3 Migration (v4 to v5)

`migrate` gives v2, v3 and v4 saves `emptyArena()` and fills `arena: 0` in every stored `WaveRecord.breakdown`. A stored v5 `arena` is normalised by `migrateArena`:

- **dropped**: unknown gear ids, items in the wrong slot, a rare item already worn by an earlier vassal; stash entries that are not known, unworn rare items; unknown decor; a run whose id is not `r<n>`, whose phase is unknown, or that is `playing` without a game or in `lottery` without offers; buffs with an unknown definition or kind; log records with an unknown end; requests under 3 characters or with a duplicate id;
- **clamped**: training to 0..6, defense to 0..6 (dropped at 0), stats (`bestChain` at most 10), the week counter; buff amounts are reset from the content;
- **trimmed**: 11 game records per run, 30 log records, 30 requests;
- **rebuilt**: a banked record without a choice reads as `coins`; `nextSeq` is above every stored run and request id.

## 7. Engine functions

Mutators follow `(save, now, ...) => { save, events, error? }`. Refusal codes have warm copy under `strings.arena.errors`. Everything is exported from `src/game/index.ts` except `dayOf`, `runBuffTotal`, `sanitizeLearned`, `ringFactor` and `REQUEST_MIN_LENGTH`.

| Function | Module | Does | Refusals |
| --- | --- | --- | --- |
| `enterRun(save, now, candidates, opts?)` | run | Pays the fee, starts a run with its first game | `run in progress`, `no troops`, `no games`, `not enough coins` |
| `resolveGame(save, now, outcome, opts?)` | run | Applies an outcome: a win adds spoils and opens the Lottery; a loss or `fled` ends the run | `no game in progress` |
| `abandonRun(save, now, opts?)` | run | `resolveGame` with `fled`, score 0 | `no game in progress` |
| `pickBuff(save, now, buffId)` | run | Keeps one offer, moves to `decide` | `no lottery open`, `not on offer` |
| `continueRun(save, now, candidates)` | run | Picks and mounts the next game | `nothing to continue`, `chain complete`, `no games` |
| `bankRun(save, now, choice, opts?)` | run | Ends the run with coins, defense or a rare item | `nothing to bank`, `defense capped`, `chain too short`, `no rare item left` |
| `buyGear(save, now, habit, itemId)` | armory | Buys a sold item for one vassal's slot | `unknown item`, `rare item`, `unknown troop`, `ring too low`, `not an upgrade`, `not enough coins` |
| `equipRare(save, now, habit, itemId)` | armory | Wears a stash item | `unknown item`, `unknown troop`, `not in the stash` |
| `trainVassal(save, now, habit)` | armory | Buys one training bump | `unknown troop`, `training maxed`, `training week full`, `training week cap`, `not enough coins` |
| `buyDecor(save, now, comboId)` | armory | Buys decor | `unknown decor`, `already owned`, `not enough coins` |
| `requestGame(save, now, text, source = 'text', opts?)` | requests | Saves a game request | `request too short`, `request limit` |

Selectors (no refusals):

- **run**: `eligibleGames(candidates, ring, rosterSize)`, `pickGame(candidates, ring, rosterSize, runSeed, room, lastGameId)`, `bankOptions(save)` (`{ coins, defense, item }` or null), `carriedHome(pendingCoins)`, `runContext(run)` (the contract `RunContext`, or null).
- **armory**: `soldItems(slot?)`, `rareItems()`, `wornItems`, `gearPower`, `trainingBonus`, `armoryTraits` (all `(save, habit)` but the first two), `unownedRareItems(save)`, `trainingWeek(save)`, `trainingStatus(save, habit)` (`{ bumps, maxBumps, price, nextPower, weekSpent, weekCap, weekBumps, weekBumpsMax }`), `gearRefusal(save, habit, itemId)` and `trainingRefusal(save, habit)` (a code or null).
- **lottery**: `buffFromDef(def, room)`, `eligibleBuffs(buffs)`, `buffWeight(def, buffs)`, `drawOdds(buffs)`, `drawOffers(runSeed, room, buffs)`.
- **requests**: `requestsOn(save, day)`, `requestsLeft(save, now, opts?)`, `cleanRequestText(text)`.
- **roster, party**: `rosterFor`, `vassalMembers`, `titleTraitsOf(save, habit)`, `troopLabel(member)`, `ROSTER_SOURCES`; `buildParty(save)`, `equipMember(save, member)`, `POWER_MIN` (1), `POWER_MAX` (100).
- **economics**: `expectedQuestCoins`, `typicalDailyCoins`, `typicalWeeklyCoins`, `entryFee`, `trainingWeeklyCap`, `gearPrice`, `trainingPrice`, `trainingPower`, `decorPrice`, `winCoins`, `roomDifficulty`.
- **state**: `emptyArena()`, `migrateArena(raw)`, `arenaDefense(save, period?)`, `runsToday(save, day)`, `overDailySuggestion(save, day)`, `ownedRareItems(arena)`.

Integrations: `wave.ts` adds `arenaDefense(save, period)` to `waveDefense` and handles the carry-over in `settleWaveDraft`; `save.ts` creates and migrates `arena`.

## 8. Events

Added to `GameEvent`:

```ts
| { type: 'arenaRunStarted'; runId: string; fee: number }
| { type: 'arenaGameResolved'; runId: string; gameId: string; result: ArenaGameResult; score: number; coins: number }
| { type: 'arenaBuffPicked'; runId: string; buffId: string }
| { type: 'arenaBanked'; runId: string; choice: ArenaBankChoice; coins: number; defense: number; itemId: string | null }
| { type: 'arenaRunEnded'; runId: string; end: ArenaEnd; wins: number; coins: number }
| { type: 'arenaGearBought'; habit: HabitId; slot: GearSlot; itemId: string; price: number }
| { type: 'arenaGearEquipped'; habit: HabitId; slot: GearSlot; itemId: string }
| { type: 'arenaTrained'; habit: HabitId; bumps: number; price: number }
| { type: 'arenaDecorBought'; decorId: string; price: number }
| { type: 'arenaRequestSaved'; requestId: string }
```

A win emits `arenaGameResolved`; a loss or leaving adds `arenaRunEnded`; banking emits `arenaBanked` then `arenaRunEnded`; `continueRun` emits nothing. Every run end writes one Haven log line of kind `arena` from `strings.arena.log.<end>` (`{wins}`, `{coins}`). G2 toasts come from `strings.arena.toasts`.

## 9. Requests: "Ask for a game"

**Flow.** *Ask for a game* on the Arena home opens a short form: a text area and a microphone, reusing the compose input of `ComposeQuestSheet` (speech, fallbacks, privacy line). *Send* calls `requestGame`; the toast says "Request saved. The engineers are reading."

**Limits.** 3 to 400 characters after cleaning (white space collapsed, trimmed); 3 per game day (`requestsLeft`); the newest 30 kept; ids `q<n>` from the runs' counter.

**Privacy.** A request is stored locally in the save, with its date and source (typed or spoken), and sent nowhere. Voice uses the same compose input as quests, with the same caveat: the browser's speech service may hear the audio. Requests reach the engineers only if the player shares a save export.

**Request template.** An agent turning a request into a game fills this in, then follows the ten-step recipe in `docs/design/games/CONTRACT.md` section 14:

```markdown
# Game request <q-id>: <working name>

Request (verbatim, from arena.requests): "<text>" (<date>, <text|voice>)

| Field | Decision |
| --- | --- |
| id | <kebab-case, at most 32 characters, not reserved> |
| category | <strategy / ai-learning / self-development / puzzle / arcade / defense> |
| learning | <skill and concepts; required for ai-learning> |
| minRing | <1..7, and why> |
| rosterSize | <min 1..3, max <= 8> |
| estMinutes | <1..5> |
| Party use | <how power, habit and traits matter; or the ignoresParty reason> |
| attack | <what +1 percentage point does, or "ignored because..."> |
| defense | <same> |
| time | <what +1 second does> |
| hint | <what one hint reveals> |
| revive | <what one revive forgives> |
| luck | <which dice lean> |
| Difficulty 1..5 | <what changes at each step; roomIndex is information only> |
| Score 0..1000 | <how it is computed; it scales the Arena's coin payout> |
| learned | <topic and note, en and fr, or none> |
| Strings | <every word in strings.ts, en and fr, same placeholders> |
| Tests | <engine rules in engine.test.ts; contract.test.ts as copied; e2e/games/<id>.spec.ts with the three required tests> |
| Docs | <docs/games/<id>.md with "## Party" and "## Buffs"; at most three screenshots> |

Original: no names, art or text from any existing game.
```

## 10. Interaction

Sketches only; G2 builds them. The Arena is not a sixth tab but a Haven card, below the recent log, opening `#/arena`.

Phone, 390 x 844:

```
HAVEN (below the recent log)          ARENA HOME
+------------------------------------+ +------------------------------------+
| THE ARENA               [coin] 312 | | < Haven   THE ARENA     [coin] 312 |
| Send the troops out. Fee 20.       | +------------------------------------+
| Best chain 4 . 2 runs today        | | [ ENTER A RUN . 20 coins         ] |
| [ OPEN THE ARENA                 ] | | Wave defense banked: +3            |
+------------------------------------+ | 5 runs today. Maybe rest them?     |
                                       +------------------------------------+
                                       | GAMES                              |
                                       | [ico] Name          Strategy       |
                                       |       tagline . teaches ...        |
                                       | (No games yet, when the list is    |
                                       |  empty)                            |
                                       +------------------------------------+
                                       | [ ARMORY ]  [ ASK FOR A GAME ]     |
                                       | RECENT RUNS  r12 banked 3 wins ... |
                                       +------------------------------------+

RUN                                    LOTTERY (after a win)
+------------------------------------+ +------------------------------------+
| Run r12 . Room 3 . Difficulty 2    | | A WIN. Room 2, +25 coins           |
| Spoils 62 coins . 3 wins           | | Learned: <topic>  <note>           |
| Buffs: [atk +10] [time +10s]       | | Pick one:                          |
| [ Leave ]                          | | [ Sharpened Resolve  attack +10% ] |
+------------------------------------+ | [ A Whispered Tip    1 hint      ] |
|                                    | | [ Second Wind  RARE  1 revive    ] |
|   (the game's Screen, h2 inside)   | | [ Bank now instead ]               |
|                                    | +------------------------------------+
+------------------------------------+

BANK OR CONTINUE                       ARMORY
+------------------------------------+ +------------------------------------+
| 3 wins . 62 coins at risk          | | [Gear] [Training] [Decor]          |
| If the troops lose: 15 come home   | | Troop: [Pell (Move)        v]      |
| [ NEXT ROOM ]                      | | Power 44, with the Armory 46       |
| Bank:                              | | WEAPON  Practice Baton  T1  +2     |
| [ 62 coins ]                       | |   [ Staff T2 +4 . 150 ]            |
| [ +3 wave defense ]                | | ARMOR   (empty)  [ Vest T1 . 60 ]  |
| [ A rare item ]                    | | CHARM   (empty)  [ Cord T1 . 40 ]  |
+------------------------------------+ | STASH   Moonlit Pike  [ Wear ]     |
                                       +------------------------------------+
ASK FOR A GAME
+------------------------------------+
| Describe the game you would like.  |
| [ text area ................... ]  |
| [mic] Speak   (privacy line)       |
| 2 requests left today              |
| [ SEND ]                           |
+------------------------------------+
```

Tablet and desktop, 768 px and up: two columns. The run screen gives the game the left column and keeps the run panel (spoils, buffs, Lottery, bank) docked on the right.

```
+--------------------------------------------------------------------------+
| < Haven   THE ARENA                                          [coin] 312  |
+-------------------------------------------+------------------------------+
| [ ENTER A RUN . 20 coins ]                | ARMORY                       |
| GAMES                                     | [Gear] [Training] [Decor]    |
| [ico] Name     category  tagline          | Troop [Pell v]  Power 46     |
| [ico] Name     category  tagline          | WEAPON / ARMOR / CHARM rows  |
| ...                                       | STASH                        |
| RECENT RUNS                               +------------------------------+
| r12 banked . 3 wins . 62 coins            | ASK FOR A GAME (form)        |
+-------------------------------------------+------------------------------+
```

## 11. Accessibility and responsive

- Follow `docs/RESPONSIVE-RULES.md` (`minmax(0, 1fr)`, `flex: none` on icons, no fixed px heights, the three breakpoints, safe areas once) and check 320x568, 390x844 at 150% text and 844x390. Sheets align `flex-start`, push down with `margin-top: auto` and scroll inside.
- Tap targets of at least 44 x 44 px, Lottery cards and slot buttons included.
- The screen owns the `h1`; a game's title is an `h2` (CONTRACT.md 5).
- Results go to an `aria-live="polite"` region: the win and its coins, the learned note, "The troops are home" and what came back, the bank result.
- Colour is never the only signal: rare things say *Rare*, tiers are written (T1 to T4), a capped choice says why in text.
- Reduced motion: no coin showers, flips or shakes; same layout, results at once. The host passes `reducedMotion` to every game.
- Keyboard order: header, *Enter a run*, games list, Armory, *Ask for a game*; in a run, the game then *Leave*; in the Lottery, the three cards then *Bank now*. Escape closes a sheet and returns focus to its opener. Every control is a real button with an accessible name.
- Every word comes from `strings.arena`.

## 12. Implementation plan and file map

**G1: design, content and engine** (this branch, `feat/G1-arena-engine`):

- `src/game/content/arena.json`, with its loader and `validateArenaContent()` in `content/index.ts`, tests in `content.test.ts`, documented in `schema.md`;
- `src/game/arena/`: `state.ts` (empty state, migration, shared selectors), `economics.ts` (section 3), `armory.ts`, `lottery.ts`, `run.ts`, `requests.ts`, `roster.ts`, `party.ts`, and the tests `economy`, `armory`, `lottery`, `run`, `requests`, `party`;
- `src/game/types.ts`, `save.ts`, `wave.ts`, `index.ts`: `arena` after `map`, v5, the `arena` wave term, events, exports;
- `src/game/content/strings.json`: `arena.errors`, `arena.log`, `arena.toasts`;
- `docs/design/GDD-errata.md` entries 24 to 26, and this document.

**G2: screens and host** (`feat/G2-arena-ui`, stacked on G1): `ArenaScreen.tsx` (lazy route `#/arena`), `src/components/arena/**`, the host in `src/components/arena/host/**` (5.3), the Haven card, store actions, toasts, SVG icons in `src/assets/arena/`, more `strings.arena` keys, `e2e/arena.spec.ts`, and `## The Arena` in `docs/PLAYER-GUIDE.md`.

## 13. Resolution and open questions

Decisions taken while building G1:

1. **`arena.requests`, not `arenaRequests`**: one save field for the whole feature.
2. **Banking is one choice**: defense or an item costs the pending coins, so it is a trade.
3. **Training is counted per wave period, across all vassals**, like the wave itself.
4. **Decor needs no forge**: any combo name, at `power × 30`.
5. **Rare items are tier 4 and unique**, two per slot; the item bank needs three wins.
6. **The tenth win opens no Lottery**: only banking remains.
7. **A run waits** across days; the ring at entry fixes its fee and difficulty.
8. **`log.learnedKeep` (8)** is validated but not read by the engine; it is reserved for the screen (how many recent learned notes to list).

Open, answered by playtesting rather than by this page:

- **Balance.** The fees, the 0.4 / 0.6 / 0.25 payout terms, the 25% carry-home, the three-win item threshold and the training curve are first guesses that pass the proof in 3.4. Whether a run feels worth its fee and gear progress feels steady is a playtest question.
- **Defense cap of 6 per period**, the stronghold cap's size; it may be strong next to early-ring trust.
- **No selling or unequipping**: a sold item given up for a rare one is gone.
- **Decor placement** in the Haven is for G2 and ART.md.
- **Requests** stay on the device; an opt-in "send" needs its own privacy review.
