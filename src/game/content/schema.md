# Content schema (`src/game/content/*.json`)

All files are plain JSON, loaded at build time (`import x from './x.json'`). Every file has a top-level `version: number` (currently `1`) so a loader can migrate if a shape changes. Ids are stable strings; never rename an id once shipped, since player saves reference them.

Cross-file references:
- `quests[].habit`, `combos[].habits[]`, `titles[].condition.habit`, `titles[].effect.habit` must be a `habits[].id`.
- `quests[].minRing`, `titles[].condition.ring` must be a `rings[].id` (1-7).
- `habits[].utility`, `titles[].effect.utility` must be `"power" | "water" | "gas"` or `null`.
- `strings.proposals.footInDoor.titles` must have a key for every habit id.

## habits.json

```
{ version, habits: Habit[] }   // exactly 8 entries, order = display order
```

| Field | Type | Meaning |
|---|---|---|
| `id` | `"move" \| "outside" \| "clean" \| "social" \| "study" \| "sleep" \| "eat" \| "hygiene"` | Habit track id. Used everywhere else. |
| `label` | string | Full UI label ("Hygiene"). |
| `shortLabel` | string | Label for narrow chips (≤ 6 chars). |
| `vassal.name` | string | The vassal's given name (original). |
| `vassal.epithet` | string | "the Runner" etc. Shown as `{name} {epithet}`. |
| `vassal.pronouns` | string | For UI copy that needs them. |
| `vassal.personality` | string | Two sentences; design reference and tooltip copy. |
| `vassal.portrait` | string | Art brief for the asset artist. Not shown in-game. |
| `color` | hex string | Accent color for the track. |
| `icon` | string | Icon key the asset artist implements (`boot`, `sun`, `broom`, `horn`, `book`, `lantern`, `pot`, `drop`). |
| `utility` | `"power" \| "water" \| "gas" \| null` | Utility this habit feeds (`sleep→power`, `hygiene→water`, `eat→gas`). |
| `defaultEnabled` | boolean | Enabled on a fresh save. |
| `description` | string | One-line settings description. |

## quests.json

```
{ version, tierDefaults: Record<"1"|"2"|"3", {baseXp, baseCoins, domainPoints}>, quests: QuestTemplate[] }
```

`tierDefaults` documents the canonical reward per tier; individual templates carry their own `baseXp`/`baseCoins` (±5 around the default for variety). `domainPoints` per completed quest is always the tier value (1/2/3), read from `tierDefaults`, not from the template.

| Field | Type | Meaning |
|---|---|---|
| `id` | string `"<habit>.<slug>"` | Unique template id. |
| `habit` | habit id | Which vassal issues and receives XP for it. |
| `title` | string | Short title (≤ 28 chars recommended). |
| `description` | string | One or two sentences, warm, may name the vassal. |
| `tier` | `1 \| 2 \| 3` | Effort tier. Drives rewards and Domain Points. |
| `minRing` | `1..7` | Template enters the pool once the player's ring ≥ this. |
| `kind` | `"check" \| "timer" \| "count"` | Completion UI: single tap; optional timer; +/- counter. |
| `durationMin` | integer, only when `kind === "timer"` | Suggested minutes. Timer is optional (honor system); running it to completion grants the +10% timed bonus. |
| `targetCount` | integer, only when `kind === "count"` | Count needed. Completion fires when count ≥ target. |
| `baseXp` | integer | XP before multipliers. The vassal receives the final post-multiplier `xp` the player gets (GDD 6.4), not `baseXp`. |
| `baseCoins` | integer | Settlement before multipliers. |
| `tags` | string[] | Free-form hints: `gentle`, `quick`, `morning`, `evening`, `outdoor-friendly`, `social-friendly`, `long`, etc. Used by the generator for soft variety only (never required). |

Invariants: ≥ 7 templates per habit; every habit has ≥ 3 templates with `minRing: 1` so a fresh board can always be filled; `check` templates have neither `durationMin` nor `targetCount`.

## rings.json

```
{ version, rings: Ring[] }   // exactly 7, ascending id
```

| Field | Type | Meaning |
|---|---|---|
| `id` | `1..7` | Ring index. Player state stores this number. |
| `key` | string | Stable slug for CSS/asset lookup. |
| `name` | string | Display name ("The Flat"). |
| `domainPointsRequired` | integer | Cumulative Domain Points at which this ring unlocks. Ring 1 is 0. Strictly increasing. |
| `wallBonus` | integer | Flat defense added in the weekly wave while this ring is current. |
| `facilities[]` | `{id, name, effect}` | Facilities unlocked with this ring. `effect` is display copy; the actual mechanics are implemented in code keyed by `facilities[].id` (see GDD "Rings and facilities"). |
| `vignette` | string | 80-150 words, original, shown in the Ring-unlock overlay in system-window voice. |

## titles.json

```
{ version, stackCaps: {xpMult, coinMult, dpMult, defenseFlat}, titles: Title[] }
```

`stackCaps` are the maximum total bonus from all titles of that effect type combined (e.g. all `xpMult` effects on a given scope add up to at most +20%; the District Library facility raises the xp cap to 0.25).

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique. |
| `name` | string | Display name. |
| `flavor` | string | One line shown on unlock and in the Ledger. |
| `condition` | object | See below. Evaluated after every state change that could satisfy it; once earned, permanent. |
| `effect` | object | See below. Permanent, small. |

Condition types (`condition.type`):
- `questsTotal {count}`: lifetime completed quests ≥ count.
- `questsOfHabit {habit, count}`: lifetime completed quests of that habit ≥ count.
- `questDaysTotal {count}`: lifetime days with ≥ 1 completion ≥ count.
- `questDayStreak {count}`: consecutive game days with ≥ 1 completion ≥ count.
- `anyVassalLoyaltyAtLeast {value}`: any vassal reaches loyalty ≥ value. The habit of the first vassal to do so is recorded in `earnedTitles[].habit`.
- `allVassalsLoyaltyAtLeast {value}`: every *enabled* vassal at loyalty ≥ value simultaneously.
- `utilityFullStreak {utility, days}`: that utility at 100 at every day boundary for `days` consecutive days.
- `waveWins {count}`: lifetime wave wins (win or decisive) ≥ count.
- `decisiveWinStreak {count}`: consecutive decisive wins ≥ count.
- `ringReached {ring}`: current ring ≥ ring.
- `combosForged {count}`: lifetime combo items forged ≥ count.
- `resurrectionUsed {count}`: lifetime tokens used ≥ count.
- `vassalReRecruited {count}`: lifetime re-recruitments ≥ count.

Effect types (`effect.type`):
- `xpMult {scope: "all" | "habit", habit?, habitFrom?: "conditionVassal", value}`: additive XP multiplier. `habitFrom: "conditionVassal"` means the habit recorded when the condition fired.
- `coinMult {scope: "all", value}`: additive settlement multiplier.
- `dpMult {value}`: additive Domain Point multiplier (applied to wave DP only, rounded).
- `defenseFlat {value}`: flat defense in the wave.
- `utilityDecayMult {utility, value}`: multiplies that utility's daily decay (0.75 = 25% slower).
- `comboPower {value}`: added to every combo item's power.
- `loyaltyGainFlat {value}`: added to loyalty gained per completion.

## combos.json

```
{ version, rules: {minRing, oncePerWeekEach, maxCountedPerWave, expiresAtWave}, combos: Combo[] }
```

| Field | Type | Meaning |
|---|---|---|
| `rules.minRing` | integer | Combos forge only from this ring (the Improvised Forge, ring 2). |
| `rules.oncePerWeekEach` | boolean | Each combo id forges at most once per wave period. |
| `rules.maxCountedPerWave` | integer | At most this many items (highest power first) count in a wave. |
| `rules.expiresAtWave` | boolean | Items are consumed when the wave settles. |
| `id` | string | Unique. |
| `name` | string | Silly item name. |
| `habits` | habit id[] (2, or 8 for the legendary) | All listed habits must have ≥ 1 completed quest on the same game day. |
| `power` | integer | Defense added in the wave. |
| `flavor` | string | One line. |
| `legendary` | boolean, optional | Shown with special styling; still obeys the rules. |

## outposts.json

```
{ version, rules: OutpostRules, states: OutpostState[], types: OutpostType[] }
```

The City Map's outposts (`docs/design/CITY-MAP.md` sections 3 and 4.4). `validateContent()` checks the 11 type ids against `OutpostTypeId`, the habits (none only for `other`, else 1-2 distinct habit ids), an icon key per type (`src/assets/outposts/<icon>.svg`), the four states in engine order with `minVisits` ascending from 0, and that the rules are consistent (caps, spacing, defense cap at or above one stronghold).

| Field | Type | Meaning |
|---|---|---|
| `rules.baseCap`, `rules.capPerRing`, `rules.maxCap` | integer | Active outposts allowed: `min(maxCap, baseCap + capPerRing * ring)` (4 at The Room, 10 at The City). |
| `rules.perZone`, `rules.minSpacing` | integer | At most this many active outposts per zone; pins at least this many cells apart. |
| `rules.quietAfterDays`, `rules.quietIfNeverVisitedAfterDays` | integer | Days without a visit (or after creation, never visited) before an outpost is shown as quiet. Quiet changes nothing but the look. |
| `rules.rerollDiscount` | integer | Settlement taken off a swap for a related habit once an outpost is Scouted. |
| `rules.corridorCoinMult` | number | Settlement multiplier term for related quests once an outpost is a Corridor (its own term, outside the title cap, never stacked). |
| `rules.strongholdDefense`, `rules.strongholdDefenseCap` | integer | Wave defense per Stronghold and the cap across all of them (`breakdown.outposts`). |
| `rules.nameMax`, `rules.noteMax`, `rules.visitLogMax` | integer | Text limits and the size of the visit log kept in the save. |
| `states[].id` | `"marked" \| "scouted" \| "corridor" \| "stronghold"` | In engine order. |
| `states[].minVisits` | integer | Counted visits needed (0 / 3 / 10 / 30). States never drop (`peak`). |
| `states[].label`, `states[].perk` | string | Display copy; `perk` placeholders `{aHabits}`, `{discount}`, `{habits}`. |
| `types[].id` | `OutpostTypeId` | One of `gym`, `park`, `library`, `friend`, `family`, `cafe`, `clinic`, `market`, `pool`, `class`, `other`. |
| `types[].label`, `types[].icon`, `types[].placeholder` | string | Form label, icon key, name placeholder ("Riverside Gym"). |
| `types[].habits` | habit id[] | Default related habits (1-2; empty for `other`, which asks the player). |
| `types[].visitLines` | string[] | Flavour pool for visits (`{name}`, `{visits}`). |

## strings.json

UI copy. Every array is a pool; the UI picks with a seeded index (e.g. `hash(gameDay + eventIndex) % pool.length`) so the same event shows the same line on re-render. Placeholders are listed in `placeholders` and are replaced with simple string substitution (no plural logic in v1).

| Key | Type | Used for |
|---|---|---|
| `app.name`, `app.tagline`, `app.nonAffiliation` | string | Title, subtitle, Settings "About". |
| `opening` | string | First-run vignette (ring 1 is shown immediately after). |
| `levelUp[]`, `questIssued[]`, `bonusContract[]`, `questDone[]`, `questTried[]`, `questUndone[]` | string[] | System-window toasts. |
| `utilityRestored[]`, `utilityDegraded[]` | string[] | Utility meter events (`{utility}` is the label). |
| `vassalLeaving[]`, `vassalReturning[]`, `vassalWaiting[]` | string[] | Strict-mode leave/return; Benevolent-mode idle line. |
| `waveWin[]`, `waveDecisive[]`, `waveLoss[]`, `waveQuiet[]` | string[] | Wave result overlay headline. |
| `ringUnlock[]` | string[] | Ring overlay headline (vignette body comes from rings.json). |
| `catchUp[]` | string[] | Shown when ≥ 2 game days passed since last open. |
| `encouragement[]` | string[] | Home screen footer line; rotates daily. |
| `resurrection.*` | object | Token offer / used / unavailable / nothing-to-restore. |
| `difficulty.*`, `benevolence.*` | object | Settings labels and blurbs. |
| `ui.*` | object | Button and label copy. |
| `compose.*` | object | The Compose sheet (custom quests, see `docs/design/CUSTOM-QUESTS.md`). `open`, `title`, `intro`, `textLabel`, `textPlaceholder`, `speak`, `stop`, `listening`, `hearing`, `heard`, `parsedHeading`, `emptyHint`: sheet copy. `voicePrivacy`: the privacy line next to the microphone (must say that the browser vendor's speech service may hear the audio, in Chrome while online, that Haven records nothing, and that nothing else leaves the device). `unsupported`, `denied`, `noMic`, `noSpeech`, `offline`: the voice fallbacks, each ending in the way forward (type it). `labels.*` field labels, `kinds.*` (`check`, `timer`, `count`), `slots.*` (`any`, `morning`, `afternoon`, `evening`), `tiers[]` (names of tiers 1 to 3), `tierSuggested`, `tierCap` (`{kind}`, `{max}`), `questions.*` (`habit`, `amount`, `title`, `empty`: what the parser asks when unsure), `labels.where` with `whereNone`, `whereHint` and `whereAt` (`{name}`: the outpost a custom quest defaults to, see `map.*`), `actions.*` (`board`, `recurring`, `later`, `cancel`), `notes.*` (`full`, `habitOff` with `{habit}`, `away` with `{name}`), `toasts.*` (`saved`, `boarded`, `updated`, `archived`, all with `{title}`), `myQuests.*` (the Ledger section: `title`, `empty`, `addToday`, `onBoard`, `archive`, `stats` with `{issued}`, `{done}`, `{tried}`, `archiveTitle`, `archiveBody`, `sources.*` for `voice`, `text`, `proposal`). |
| `map.*` | object | The City Map tab (`docs/design/CITY-MAP.md`). `title`, `ringLine` (`{ring}`, `{name}`), `chip` (the Haven header link), `seeOnMap` (ring-unlock overlay). `a11y.*`: `svg` (the map's spoken label), `zoneBand` (`{zone}`, `{name}`, `{status}`), `pin` (`{name}`, `{type}`, `{state}`, `{quiet}`, `{zone}`, `{beyond}`, `{visits}`). `hud.*`: `compare`, `compareLabel`, `list`, `listLabel`, `mapLabel`, `mapView`, `nextWave` (`{days}`), `waveTonight`. `since.*`: `gain` (`{dp}`), `same`, `legend`, `legendNew`, `compare` (`{dp}`, `{streets}`), `compareNone`. `domain.*`: the Domain window (`sub` with `{dp}`, `{next}`, `{name}`, `{pct}`; `subCity` with `{dp}`; tile labels). `outposts.*`: the Outposts window, rows, sheet, Ledger section and badges (`capRoom` with `{free}` and `{ring}`, `capFull` with `{cap}` and `{ring}`, `visitsOf` with `{visits}` and `{next}`, `toNext` with `{n}`, `{s}`, `{state}`, `lastVisit` with `{days}`, perk lines with `{aHabits}`, `{discount}`, `{habits}`, `related` with `{who}`, retire and forget copy with `{name}`). `zone.*`: the zone sheet (`kick` with `{zone}`, `claimedAt`, `toGo`, `registersAt` with `{dp}`, `wallsIn` with `{bonus}`, `creep` with `{name}` and `{dp}`, `opensWith` with `{name}`, `placeholder`). `list.*`: the list view rows. `form.*`: the add and edit form (labels, `editTitle` with `{name}`, `directions.<compass>`). `errors.<code>`: one warm line per engine refusal code (`name required`, `name taken`, `cap reached` with `{cap}` and `{ring}`, `zone full` with `{zone}`, `cell taken`, `cell invalid`, `no free cell` with `{zone}`, `pick a habit`, `already logged today`, `outpost is retired`, `not retired`, `quest not done`, `already tagged`, `nothing to undo`, `unknown outpost`; every line may use `{name}`). `toasts.*`: `created`, `visited` (`{name}`, `{visits}`, `{s}`, `{next}`), `visitedNext` (`{n}`, `{state}`), `visitedHold`, `visitedUncounted`, `undone`, `stateReached` (`{name}`, `{state}`, `{perk}`) with `stateScouted`/`stateCorridor`/`stateStronghold` and `perkScouted`/`perkCorridor`/`perkStronghold`, `retired`, `restored`, `forgotten`, `withinWalls` (`{name}`). `settlement.*`: `where`, `elsewhere` (the settlement toast's "Where were you?" row). |
| `proposals.*` | object | "The Haven notices". `heading`, `intro`, `accept`, `dismiss`: section copy. `titles.*`: card headings per rule (`smaller`, `stepUp`, `makeRecurring`, `footInDoor`, `pinWeekday`). `reasons.*`: per rule, a pool of reason sentences picked with a seed (placeholders `{vassal}`, `{habit}`, `{quest}`, `{n}`, `{recurrence}`, `{weekday}`; never a verdict, always a way forward or "no pressure"). `footInDoor.titles.<habit>`: the 5-minute check quest title per habit (Title Case, at most 40 characters); `footInDoor.description`. `toasts.accepted` (`{title}`), `toasts.dismissed`. |
| `arena.*` | object | The Arena (`docs/design/ARENA.md`). G1 ships three keys; G2 adds the screen copy. `errors.<code>`: one warm line per engine refusal code (`run in progress`, `no troops`, `no games`, `not enough coins`, `no game in progress`, `no lottery open`, `not on offer`, `nothing to continue`, `chain complete`, `nothing to bank`, `defense capped`, `chain too short`, `no rare item left`, `unknown item`, `rare item`, `unknown troop`, `ring too low`, `not an upgrade`, `not in the stash`, `training maxed`, `training week full`, `training week cap`, `unknown decor`, `already owned`, `request too short`, `request limit`). `log.lost[]`, `log.fled[]`, `log.banked[]`: the Haven log line written when a run ends, picked with `fnv1a(runId)` (`{wins}`, `{coins}`). `toasts.*`: `gearBought` and `gearEquipped` (`{troop}`, `{item}`), `trained` (`{troop}`, `{bumps}`), `decorBought` (`{decor}`), `requestSaved`, `runStarted`, `banked`, `runEnded`. |

## arena.json

```
{ version, run, bank, lottery, armory, training, decor, requests, log }
```

The Arena (`docs/design/ARENA.md`). Prices are derived in `src/game/arena/economics.ts` from these numbers and the difficulty table of `economy.ts`. `validateArenaContent()` (in `content/index.ts`) checks: seven positive fees that never drop with the ring; non-negative reward terms and `carryHome` in [0, 1); consistent bank limits; unique buff ids, known kinds, positive integer amounts within their cap, positive weights, a name and blurb, at least one buff and a positive cap per kind, at least `offers` buffs; slots exactly `weapon`, `armor`, `charm`; unique item ids, a known `minRing`, positive integer power, rare items tier 4 at price 0 and sold items tier 1 to 3 with a price; per slot, sold tiers 1, 2, 3 with price and power rising, and at least two rare items; a training curve of at least three positive integers that never rise; `weeklyShareOfHabitCoins` in (0, 0.25]; and the request and log limits.

| Field | Type | Meaning |
|---|---|---|
| `run.feeByRing` | integer[7] | Entry fee by ring (20 to 56). `entryFee` caps it at one typical day of the player's difficulty. |
| `run.feeAdherence` | number (0, 1] | Adherence behind the "typical day" of the fee cap (0.9). |
| `run.maxRooms` | integer | Most games in one run (10). The last win opens no Lottery. |
| `run.roomsPerDifficultyStep` | integer | Rooms per difficulty step (2): difficulty is `1 + floor(room / step)`. |
| `run.ringBoostFrom` | integer | From this ring (4) every room is one difficulty step harder. Difficulty is capped at 5. |
| `run.suggestedRunsPerDay` | integer | Runs per game day after which the screen suggests a rest (5). Never enforced. |
| `run.reward.base`, `run.reward.perScore`, `run.reward.growthPerRoom` | number | Win payout `fee × (base + perScore × score / 1000) × (1 + growthPerRoom × room)`, rounded, at least 1 (0.4, 0.6, 0.25). |
| `run.carryHome` | number [0, 1) | Share of the pending coins a loss or leaving still pays, rounded down (0.25). |
| `bank.defensePerWin` | integer | Wave defense banked per win (1). |
| `bank.defenseCapPerPeriod` | integer | Most Arena defense per wave period, across runs (6); `breakdown.arena`. |
| `bank.itemMinWins` | integer | Wins needed to bank a rare item (3). |
| `lottery.offers` | integer | Buffs offered after a win (3), drawn without replacement. |
| `lottery.luckBoostPer` | number | Points of run luck that double rare weights (50): a rare weight is `weight × (1 + luck / luckBoostPer)`. |
| `lottery.caps.<kind>` | integer | Most of each kind a run can hold (`attack` 60, `defense` 60, `time` 90, `hint` 5, `revive` 2, `luck` 50). A buff that would pass the cap is not offered. |
| `lottery.buffs[].id` | string | Unique; a picked buff is stored as `<id>@<room>`. |
| `lottery.buffs[].kind` | `"attack" \| "defense" \| "time" \| "hint" \| "revive" \| "luck"` | The contract `RunBuff` kind. Units: percentage points for `attack`, `defense`, `luck`; seconds for `time`; counts for `hint`, `revive`. |
| `lottery.buffs[].amount` | integer | Size of the buff, at most the kind's cap. |
| `lottery.buffs[].weight` | number | Draw weight (all weights total 78). |
| `lottery.buffs[].rare` | boolean | Rare buffs get heavier with luck. |
| `lottery.buffs[].name`, `lottery.buffs[].blurb` | string | Card title and one line. |
| `armory.ringPriceStep` | number | Gear price factor per ring above 1 (0.12); prices round to 5. |
| `armory.slots` | `["weapon", "armor", "charm"]` | The three gear slots, in this order. |
| `armory.items[].id` | string | Unique, stored in saves; never rename. |
| `armory.items[].slot` | `"weapon" \| "armor" \| "charm"` | The slot it fills. |
| `armory.items[].tier` | `1 \| 2 \| 3 \| 4` | 1 to 3 sold; 4 rare. A purchase must be a higher tier than what the slot holds. |
| `armory.items[].minRing` | `1..7` | Ring from which it is sold (rare items: 1). |
| `armory.items[].price` | integer | Price at ring 1, scaled by ring; 0 for rare items. |
| `armory.items[].power` | integer | Added to the troop's `power` in the party (clamped to 100). |
| `armory.items[].rare` | boolean, optional | `true` for items only won by banking a run. |
| `armory.items[].name`, `armory.items[].flavor` | string | Display name and one line. |
| `training.bumpPower` | integer[] | Power of each successive bump, never rising; its length is the most bumps per vassal (6). |
| `training.costBase`, `training.costStep`, `training.costSquare` | number | Price of the next bump after `n`: `(costBase + costStep × n + costSquare × n²)` times the ring factor, rounded to the coin (14, 2, 0.5). |
| `training.ringPriceStep` | number | Training price factor per ring above 1 (0.08). |
| `training.maxBumpsPerWeek` | integer | Bumps per wave period across all vassals (2). |
| `training.weeklyShareOfHabitCoins` | number (0, 0.25] | Weekly coin cap as a share of a typical habit week (0.25). |
| `training.weeklyAdherence` | number (0, 1] | Adherence behind that habit week (0.9). |
| `decor.pricePerPower` | number | Decor price per point of the combo's power (30), rounded to 5. |
| `requests.textMax` | integer | Longest request after cleaning (400); the shortest is 3 (`REQUEST_MIN_LENGTH` in code). |
| `requests.perDay` | integer | Requests per game day (3). |
| `requests.keep` | integer | Requests kept in the save, newest last (30). |
| `log.keep` | integer | Finished runs kept in `arena.log` (30). |
| `log.learnedKeep` | integer | Recent learned notes the screen may list (8). Validated; not read by the engine. |
| `log.noteMax` | integer | Longest `learned` note kept, per language (240). |
