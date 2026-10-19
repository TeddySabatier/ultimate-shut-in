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
| `compose.*` | object | The Compose sheet (custom quests, see `docs/design/CUSTOM-QUESTS.md`). `open`, `title`, `intro`, `textLabel`, `textPlaceholder`, `speak`, `stop`, `listening`, `hearing`, `heard`, `parsedHeading`, `emptyHint`: sheet copy. `voicePrivacy`: the privacy line next to the microphone (must say that the browser vendor's speech service may hear the audio, in Chrome while online, that Haven records nothing, and that nothing else leaves the device). `unsupported`, `denied`, `noMic`, `noSpeech`, `offline`: the voice fallbacks, each ending in the way forward (type it). `labels.*` field labels, `kinds.*` (`check`, `timer`, `count`), `slots.*` (`any`, `morning`, `afternoon`, `evening`), `tiers[]` (names of tiers 1 to 3), `tierSuggested`, `tierCap` (`{kind}`, `{max}`), `questions.*` (`habit`, `amount`, `title`, `empty`: what the parser asks when unsure), `actions.*` (`board`, `recurring`, `later`, `cancel`), `notes.*` (`full`, `habitOff` with `{habit}`, `away` with `{name}`), `toasts.*` (`saved`, `boarded`, `updated`, `archived`, all with `{title}`), `myQuests.*` (the Ledger section: `title`, `empty`, `addToday`, `onBoard`, `archive`, `stats` with `{issued}`, `{done}`, `{tried}`, `archiveTitle`, `archiveBody`, `sources.*` for `voice`, `text`, `proposal`). |
| `proposals.*` | object | "The Haven notices". `heading`, `intro`, `accept`, `dismiss`: section copy. `titles.*`: card headings per rule (`smaller`, `stepUp`, `makeRecurring`, `footInDoor`, `pinWeekday`). `reasons.*`: per rule, a pool of reason sentences picked with a seed (placeholders `{vassal}`, `{habit}`, `{quest}`, `{n}`, `{recurrence}`, `{weekday}`; never a verdict, always a way forward or "no pressure"). `footInDoor.titles.<habit>`: the 5-minute check quest title per habit (Title Case, at most 40 characters); `footInDoor.description`. `toasts.accepted` (`{title}`), `toasts.dismissed`. |
