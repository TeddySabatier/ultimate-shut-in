# Haven Protocol: The Arena

Version 1.0, 2026-10-20. Scope: overnight program on `integration/arena` (save version 5). Companion to `docs/design/games/CONTRACT.md` (mini-game plug-in), `GDD.md` (economy and tone), `ART.md` and `RESPONSIVE-RULES.md`.

Settlement coins finally have a home. Domain Points stay sacred. The Arena spends coins on permanent Armory upgrades, runs a chain of registered mini games, and returns more coins or a one-wave defense bump. Nothing here touches streaks, loyalty decay, utilities, or real money.

---

## 1. Purpose and player fantasy

The fantasy: **"My habits fund a training yard; the yard sends my vassals through little trials; we come home richer or wiser, never punished."**

Entering the Arena should feel like:

1. **Investment.** Gear and training are bought with settlement the player already earned on the quest board. Prices scale gently with ring so late-game costs stay honest.
2. **A sortie, not a second job.** One run costs less than a full day of typical Steady earnings at 90% adherence. A patient player can afford a run every two days without skipping habits.
3. **Visible troops.** The same vassals from the Ledger appear as `PartyMember`s in every mini game. Gear and training change their power and traits on the wire.
4. **Come home warm.** Losing a run clears run buffs and unpicked loot, but keeps purchased gear and anything already banked. Copy says the troops came home, not that the Haven failed.

The Arena is **not** a sixth tab. It is a card on the Haven screen below the recent log, routing to `#/arena`.

---

## 2. Currencies and boundaries

| Currency | Role in Arena |
| --- | --- |
| Settlement coins | Entry fees, Armory gear, training, decor. Only sink that spends them in bulk. |
| Domain Points | Untouched. Never awarded directly from Arena outcomes. |
| Run buffs | Temporary, live only inside an active run, passed through `RunContext`. |

Arena results never mutate quest streaks, vassal loyalty, utilities, or wave trust. A daily time cap is suggested in copy, not enforced in v1.

---

## 3. Troops and the party builder

**Troops** are enabled, present vassals today. `rosterFor(save)` lists them in habit order with stable ids equal to habit ids (`move`, `outside`, …).

**Citizens (future).** When brief F lands, citizens append to the roster with their own ids and `habit: null`. The Arena engine never imports citizen code; it only reads whatever `rosterFor` returns.

`buildParty(save)` maps each roster row to the contract shape:

```typescript
interface PartyMember {
  id: string;
  name: string;
  habit: HabitId | null;
  level: number;
  loyalty: number;
  power: number; // 1..100
  traits: string[]; // title ids + gear trait ids
}
```

Power starts at `derivePower(level, loyalty)` from the contract, then adds:

- **Training:** sum of diminishing steps from `arena.json` (`powerSteps`, default `[2,1,1,1,0]`).
- **Gear:** sum of `power` fields on equipped items in three slots.

Traits are earned title ids for that habit plus optional gear trait ids (for passives inside games). Final power is clamped to 1..100.

The host calls `fitParty(party, manifest.rosterSize)` before mounting a game screen.

---

## 4. Armory catalogue

Three slots per vassal: **blade**, **mail**, **charm**. One item per slot; buying replaces the slot.

Prices: `round(basePrice * (1 + 0.12 * (ring - 1)))`. Catalogue lives in `src/game/content/arena.json`.

| Tier | Blade example | Mail example | Charm example | Base price band |
| --- | --- | --- | --- | --- |
| 1 | Practice Blade (+2 power) | Quilted Vest (+2) | Lucky Charm (+1, luck trait) | 28–35 |
| 2 | Patrol Saber (+4) | Haven Mail (+4) | Signal Whistle (+3, hint trait) | 55–70 |
| 3 | Ledger Rapier (+7) | Bulwark Coat (+6) | Revive Token (+2, revive trait) | 95–120 |

**Training:** costs `baseCost + costPerRing * (ring - 1)` (22 at ring 1). Each purchase increments `trainingSessions[habit]` and applies the next `powerSteps` entry. After the steps run out, further purchases are refused (`arena.trainingDiminished`).

**Weekly training cap:** spend on training in the current wave period may not exceed `weeklyCapFraction` (25%) of expected habit settlement for the player's difficulty. Tracked in `arena.trainingCoinsThisPeriod` against `arena.trainingPeriodIndex === week.index`. Habits remain the main coin source.

**Haven decor:** cosmetic purchases of combo item names from `combos.json` (`decor` list in arena.json). No stat effect; warm flavour in the Armory panel.

Engine entry points: `buyGear`, `buyTraining`, `buyDecor` in `src/game/arena/armory.ts`.

---

## 5. Runs and the game chain

### 5.1 Entry

`startRun(save, now)` charges `entryFee(ring)`:

```
raw = entry.base + entry.perRing * (ring - 1)
cap = expectedDailyCoins('steady', 0.9) * entry.maxDailyFraction
fee = min(raw, cap)
```

At defaults (`base 36`, `perRing 4`, `maxDailyFraction 1`), ring 1 fee is 36 while Steady 90% daily expectation is about 72 coins, so **one run every two days** is affordable with margin.

Refusal codes: `arena.runActive`, `arena.shortCoins`.

### 5.2 Picking the next game

The UI/host passes eligible `{ id, minRing }[]` from `listGames()` (hiding `devOnly` unless debug). Engine function `pickNextGame(lastGameId, eligible, seed, roomIndex)`:

- Filters by ring on the host side (`minRing <= player.ring`).
- Never picks the same id twice in a row when at least two games qualify.
- Uses `mulberry32(fnv1a(seed:pick:roomIndex))`.

Difficulty in `RunContext` rises slowly: `min(5, 1 + floor(roomIndex / 2))`.

### 5.3 Outcomes

`applyRunOutcome(save, { gameId, result, score, learnedTopic? })`:

| Result | Effect |
| --- | --- |
| `won` | Add score to `pendingScore`, increment `roomIndex`, set `lotteryChoice` to three buff ids. |
| `lost` | Clear buffs and pending score; end run (`arenaRunEnded`, banked false). Gear kept. |
| `fled` | Same as lost for buffs/pending; end run. |

After a win the player must `pickLotteryBuff` before the next game.

### 5.4 Lottery

Weighted table in `arena.json` (`lottery.buffs`). `drawLotteryOptions(seed, roomIndex)` returns three distinct buffs deterministically. Weights favour small attack/defense/time bumps; revive is rarer.

Kinds match the contract: `attack`, `defense`, `time`, `hint`, `revive`, `luck` with amounts as defined in CONTRACT.md.

### 5.5 Banking

While a run is active and no lottery is pending, `bankRun(save, choice)` converts `pendingScore`:

| Choice | Conversion |
| --- | --- |
| `coins` | `round(pendingScore * coinsPerScore * coinScoreShare)` added to player coins |
| `defense` | Sets `waveBoost.bonus` from defense formula; `forWeekIndex = week.index` for the next wave settlement |
| `gear` | If `pendingScore >= rareGearMinScore`, grants a tier-3 gear piece into the first enabled habit's matching slot |

Defaults: `coinsPerScore 0.08`, shares 55% / 35% / 10%, rare threshold 850.

Banking ends the run and clears buffs. Already-equipped Armory gear is never removed.

---

## 6. Wave interaction

`WaveBreakdown.arena` holds the banked defense bonus while `waveBoost.forWeekIndex === week.index`. `waveDefense` adds it to total defense and logs "Arena troops still have wind in their sails."

After settlement, if the boost was consumed, reset `waveBoost` to zero.

---

## 7. Ask for a game

`submitArenaRequest(save, text, now)` appends to `arena.requests` (max 20, text max 500). Copy promises engineers are reading. Stored locally only.

**Agent template for turning a request into a module:**

1. Read `docs/design/games/CONTRACT.md` and copy `src/games/sample/`.
2. Create `src/games/<kebab-id>/` with `manifest.ts`, `engine.ts`, `Screen.tsx`, `strings.ts`.
3. Set `category`, `minRing`, `rosterSize`, `learning` if AI/self-development.
4. Add Playwright spec under `e2e/games/<id>.spec.ts`.
5. No registry edit: manifest glob picks it up.

---

## 8. Save schema (TypeScript)

```typescript
interface SaveFile {
  // ...
  map: MapState;
  arena: ArenaState;
}

interface ArenaState {
  gear: Record<HabitId, [string | null, string | null, string | null]>;
  trainingSessions: Record<HabitId, number>;
  decor: string[];
  trainingCoinsThisPeriod: number;
  trainingPeriodIndex: number;
  activeRun: ArenaRun | null;
  waveBoost: { bonus: number; forWeekIndex: number | null };
  requests: ArenaRequest[];
  totalRuns: number;
}

interface ArenaRun {
  seed: number;
  roomIndex: number;
  lastGameId: string | null;
  buffs: RunBuff[];
  pendingScore: number;
  bankedCoins: number;
  log: ArenaRunLogEntry[];
  startedAt: number;
  entryFee: number;
  lotteryChoice: string[] | null;
}
```

`SAVE_VERSION` 5. Migration from v4 fills defaults via `defaultArenaState()`.

---

## 9. Engine API summary

| Function | Module |
| --- | --- |
| `rosterFor`, `buildParty` | roster.ts, party.ts |
| `buyGear`, `buyTraining`, `buyDecor` | armory.ts |
| `startRun`, `applyRunOutcome`, `bankRun`, `pickNextGame`, `runContextFor` | run.ts |
| `drawLotteryOptions`, `pickLotteryBuff` | lottery.ts |
| `submitArenaRequest` | requests.ts |
| `entryFee`, `expectedDailyCoins`, `maxTrainingSpendPerPeriod` | economy.ts |

All follow `(save, now, ...) => { save, events, error? }`, input never mutated.

Events: `arenaRunStarted`, `arenaRunEnded`, `arenaGearBought`, `arenaTrainingBought`, `arenaDecorBought`, `arenaRequestSent`, `arenaBuffPicked`.

---

## 10. Host mapping of `Outcome` to rewards

The host validates with `outcomeProblems` before calling `applyRunOutcome`:

- `won` / `lost` / `fled` map directly.
- `score` scales pending banked value; never grants DP.
- `learned`, when present, is shown in the results panel and stored as `learnedTopic` on the log entry.
- Invalid outcomes log and count as `fled` with score 0.

---

## 11. Economy proof (G1 acceptance)

Using only `src/game/economy.ts` tier weights and `arena.json` fees:

- **Steady, 90% adherence:** expected daily coins ≈ 72; entry fee 36; two days ≈ 144 ≥ fee.
- **Training cap:** 25% × 7 × 72 = 126 coins per wave period maximum on training purchases.

These are asserted in `src/game/arena/arena.test.ts`.

---

## 12. Wireframes (390px and 768px)

**390 (portrait):** Haven card full width below log → Arena route with stacked sections: Run status chip, Armory tabs (Gear / Training / Decor), Start run CTA, game list, request form at bottom. Run screen: header with room index, embedded game host (flex 1, min-height 0), lottery sheet slides over lower third, bank/continue actions in safe area.

**768 (tablet):** Two columns: left Armory catalogue scroll, right run/host. Game list grid `minmax(0, 1fr)` two columns. Lottery as side panel instead of overlay when width ≥ 768.

Tap targets 44px; no fixed pixel heights on content regions; overlays align `flex-start` with internal scroll.

---

## 13. Accessibility

- All strings from `strings.json` key `arena`.
- Focus order: card → Armory → run → host exit → lottery choices → bank.
- Lottery options as radio group with visible labels from buff kind.
- Reduced motion: host passes `reducedMotion` to games; Arena chrome skips slide transitions.
- Screen reader: announce run start, lottery prompt, bank result, "troops come home" on loss.

---

## 14. Tone

Warm, never punitive. Loss copy: "The troops come home." No shame counters. Engineers "reading" requests, not rejecting them.

Everything is original; no borrowed names or systems from the work that inspired Haven Protocol.

---

## 15. Lottery buff table (weights at ship)

| Id | Kind | Amount | Weight | Player-facing gist |
| --- | --- | --- | --- | --- |
| strike-10 | attack | +10% | 22 | Small opening pressure |
| strike-15 | attack | +15% | 12 | Sharper opening |
| guard-10 | defense | +10% | 22 | Hold the line |
| guard-15 | defense | +15% | 12 | Sturdy formation |
| time-20 | time | +20s | 18 | Breathing room |
| time-30 | time | +30s | 8 | Generous clock |
| hint-1 | hint | 1 | 16 | One nudge |
| hint-2 | hint | 2 | 6 | Two nudges |
| revive-1 | revive | 1 | 10 | Second chance |
| luck-10 | luck | +10% | 18 | Favourable odds |
| luck-15 | luck | +15% | 8 | Strong luck |

Draw three without replacement per win. Weights are not shown in UI; the player sees names from `strings.arena.buffs.*` (G2).

---

## 16. Worked example: two-room run

1. Player has 80 settlement, ring 2. Entry fee = min(36+4, 72) = 40. After start: 40 coins, active run seed S.
2. Host picks game A (`pickNextGame(null, eligible, S, 0)`), mounts with `buildParty` and `runContextFor` → room 0, difficulty 1.
3. Win score 600 → pendingScore 600, lottery options drawn. Player picks `guard-10`.
4. Host picks game B (different from A). Win 300 → pendingScore 900.
5. Player banks coins: about round(900 × 0.08 × 0.55) = 40 coins returned (exact values in tests).
6. Run ends; gear unchanged; buffs cleared.

If the player had lost on game B instead, pending 900 would vanish, buffs clear, gear remains, no coin refund of entry fee.

---

## 17. Host sequence (G2)

```
ArenaScreen
  lazy import host
  host mount:
    listGames({ includeDev: debugEnabled() })
    party = buildParty(save)
    run = runContextFor(save)
    loadScreen(gameId) → GameScreen
    onFinish(outcome):
      if outcomeProblems(outcome) → treat as fled
      applyRunOutcome via store
      if lotteryChoice → show LotteryPanel
    onExit → fled if not finished
```

The store block at the end of `gameStore.ts` wraps engine mutators only.

---

## 18. Responsive checklist (Arena-specific)

- Grids: `grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr))` for game cards.
- Host container: `flex: 1; min-height: 0; overflow: auto`.
- Lottery overlay: `margin-top: auto` on sheet, `max-height: min(70vh, 100%)`, scroll inside.
- Safe areas: padding on outer screen once; inner panels do not double-pad.
- 320×568: single column, Armory collapses to accordion.
- 390×844 @ 150% text: lottery buttons stack, no clipped buff text.
- 844×390: host and sidebar share row; game list hidden behind toggle to save height.

---

## 19. Content validation

`validateContent()` in `content/index.ts` checks arena.json: positive entry base, at least three gear rows, duplicate gear ids rejected, at least three lottery buffs.

---

## 20. Testing map

| Area | File |
| --- | --- |
| Economy proof | `arena/arena.test.ts` |
| Migration v5 | `save.test.ts`, `arena.test.ts` |
| Party ranges | `arena/arena.test.ts` |
| Wave arena term | `arena/arena.test.ts`, `wave.test.ts` |
| Host + games | G2: `e2e/arena.spec.ts`, host contract test |

---

## 21. FAQ for reviewers

**Does Arena replace habits?** No. Training cap and entry fee pacing keep quests primary.

**Can runs grant DP?** No. Banking never touches `player.domainPoints`.

**What happens mid-run when the app closes?** Active run persists on the save; buffs and pending score remain until win/loss/bank.

**Dev sample game?** Listed only when `haven.debug` is set; e2e uses this path.

**Empty registry?** Host shows `strings.arena.noGames` gracefully while overnight agents land games.

---

## 22. Art notes (see ART.md)

Arena card icon: pennant and small shield, violet accent. Buff icons: simple geometric glyphs in `src/assets/arena/`. No realistic weapons; shapes suggest gear tiers.

---

## 23. Strings anchor

All player-facing Arena copy lives under the top-level `arena` key in `strings.json`, inserted immediately before `benevolence`. Other briefs must not edit this key.

---

## 24. Version history

| Version | Change |
| --- | --- |
| 1.0 | Initial Arena on save v5, overnight program |

---

## 25. GDD cross-reference

| GDD topic | Arena behaviour |
| --- | --- |
| 6.4 settlement | Quest coins fund Arena; Arena does not change quest formulas |
| 6.2 shops | Corner Shop discounts do not apply to Arena fees (Arena is not the shop) |
| 9.3 wave defense | Optional `arena` breakdown term from banked runs |
| 10 tone | Loss is neutral; troops return |
| 15 mini-games (future) | Registered games plug in via CONTRACT |

This keeps the Ledger honest: Domain Points still come from quests and waves only, rings still advance at the same pacing table, and the Arena is an optional layer for players who want tactile feedback between waves.

---

## 26. Run state machine (engine)

States are implied by `activeRun` and its fields:

1. **Idle:** `activeRun === null`. Player may start a run or edit Armory.
2. **In game:** `activeRun` set, `lotteryChoice === null`, host mounted. Only one game at a time.
3. **Lottery pending:** `lotteryChoice` is a three-id array. Host hidden or dimmed; UI must pick before `pickNextGame`.
4. **Bank window:** After at least one win and no lottery pending, player may `bankRun` or continue to another game.

Transitions:

- Idle → In game: `startRun`.
- In game → Lottery: `applyRunOutcome` with `won`.
- Lottery → In game: `pickLotteryBuff` then host picks next game.
- In game → Idle (loss): `applyRunOutcome` with `lost`.
- In game → Idle (bank): `bankRun`.
- In game → Idle (flee): `applyRunOutcome` with `fled` or host exit before finish.

Invalid transitions return stable errors (`arena.noRun`, `arena.lotteryPending`, etc.) without mutating input.

---

## 27. Armory UI notes (G2)

The Armory panel lists each roster member as a row: portrait, name, three slot buttons, training button with next gain preview. Prices update when ring changes (after wave). Decor is a horizontal scroller of combo names not yet owned; owned items show a check.

Training button disabled states: insufficient coins, weekly cap, diminished returns, max sessions. Gear button disabled: wrong slot occupied by same tier upgrade path is allowed (replace).

Confirm dialogs use warm copy: "Equip for Pell?" not "Purchase confirmed."

---

## 28. Privacy and offline behaviour

Arena requests stay in local storage. Voice compose for requests reuses ComposeQuestSheet privacy lines. No analytics, no upload, no account.

---

## 29. Parallel overnight games

Eleven agents add `src/games/<id>/` independently. The Arena host must tolerate zero games (empty state), one game (no repeat rule trivial), and many games (weighted pick without loading all screens upfront). Registry lazy loading keeps main bundle small; only manifests load until the player enters a run.

---

## 30. Extended banking reference

The player always chooses one payout shape when banking; there is no automatic split. The engine computes all three potentials from the same `pendingScore` but applies only the chosen lane:

| pendingScore | Coins lane (~55%) | Defense lane (~35%) | Gear lane |
| --- | --- | --- | --- |
| 400 | ~18 | ~6 | locked |
| 700 | ~31 | ~10 | locked |
| 900 | ~40 | ~13 | tier-3 item if gear chosen |
| 1200 | ~53 | ~17 | tier-3 item |

Exact rounding uses `Math.round` on each term. Gear lane refuses when score below `rareGearMinScore` (`arena.noRareGear`). Defense lane writes `waveBoost` immediately; coins lane credit `player.coins`. Gear lane overwrites the target slot for the first enabled habit only in v1 (maintainer may extend pickers later).

---

## 31. Copy pool guidelines (`strings.arena`)

- Headlines are short (≤ 40 chars) for narrow screens.
- Error lines propose the next step ("Save more settlement", "Pick a buff first").
- Win/Loss never mention "failed" or "mistake".
- Request confirmation thanks the player for specifics; never promise a delivery date.
- Buff names are metaphorical (Tailwind, Second wind) not mechanical labels, while a11y labels include kind and amount.

French strings arrive with brief M; keys must exist in English first.

---

## 32. Migration notes

v4 saves load with empty gear, zero training, no active run, empty requests. Wave history records gain `arena: 0` in breakdown on migrate. Export round-trip preserves full run state including partial lottery. Downgrading to v4 is unsupported (expected for integration branch).

---

## 33. Maintainer checklist at merge to main

- Confirm `SAVE_VERSION` 5 migrates in production saves.
- Run responsive sweep on `#/arena` and Games Lab with debug off.
- Verify main chunk script still excludes registry manifests.
- Update `docs/PARALLEL-WORK.md` section 2 save version row.
- Fold architecture paragraph from this spec into `docs/ARCHITECTURE.md`.

