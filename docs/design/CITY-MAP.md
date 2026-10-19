# Haven Protocol: City Map and Outposts

Version 1.0, 2026-10-19. Scope: milestone M3 (after custom quests). Companion to `GDD.md` (rules), `ART.md` (look) and `RESPONSIVE-RULES.md` (layout). Prototype: `docs/design/prototypes/city-map.html` (self-contained; URL params `?dp=650`, `&list=1`, `&compare=1`, `&week=1`, `&panel=zone:3|pin:0|new`, `&rm=1`); screenshots `docs/design/prototypes/city-map-*.png`; icon drafts `docs/design/prototypes/assets/*.svg`.

The GDD has no explicit "out of v1" list; source hook 15 (outposts and corridors) was simply not adopted in v1, and GDD 15.1 promised a ring map that shipped as a single scene header. This document brings both into the game. Where it touches existing rules (reroll price, settlement, wave defense, save schema) the change is spelled out in section 4.

---

## 1. Purpose and player fantasy

GDD pillar 3 says growth is visible on a map. Today the player sees one illustration per ring and a Domain Points bar: a number, not a place. The City Map turns the number into territory.

The fantasy: **"I keep a small lit district in a dark city, and every week my light reaches further."** The map is the Absolute's war-room table; the Vassal self walks to the gym and the library, and those trips leave marks on it.

Each visit to the Map tab should give these feelings, in order:

1. **"It moved."** On open, the wall animates from where it stood at the last look to where it stands now, and newly lit buildings switch on in a ripple outward. A chip says "+38 DP since your last look".
2. **"It is bigger than last week."** *7 days* draws last week's wall as a dashed ghost and hatches the new ground. The ghost comes from a recorded snapshot, so it is honest.
3. **"These places are mine."** Pins are the player's own named places, earned up through four states by going there; the busiest pull the wall toward themselves.
4. **"The walls held."** Last week's wave left scorch marks and a shield flag on the wall line, fading over two weeks. Every wave, won or lost, counts as "walls held".

The map is not geographic, never asks for a location, and never shows anything the player could lose. Fog means "not yet".

## 2. The City Map screen

### 2.1 Layout grammar

The city is a stylised isometric island, built on a square grid of cells (17 x 17, cell `(0,0)` at the centre, cells kept when `hypot(x, y) <= 8.25`, 221 cells). Seven concentric zones are rings of cells by distance from the centre, matching the seven rings of `rings.json`:

| Zone | Ring | Cell distance `d` | Cells | What stands there |
|---|---|---|---|---|
| 1 | The Room | `d <= 0.62` | 1 | The Haven tower, violet, beacon on top |
| 2 | The Flat | `<= 1.62` | 8 | low violet rooms hugging the tower |
| 3 | The Floor | `<= 2.62` | 12 | taller violet annexes |
| 4 | The Building | `<= 3.82` | 24 | mid-rise blocks, the first streets |
| 5 | The Block | `<= 5.02` | 36 | low shops with coloured awnings, courtyard trees |
| 6 | The District | `<= 6.52` | 56 | the park with its pond, the library, the clinic |
| 7 | The City | `<= 8.25` | 84 | towers, the river arc, the hills at the edge |

Rules of the grammar:

- **Zones nest by distance, not geography.** The Flat is the next circle out, not a real street. Ground in zones 1-3 is violet-tinted (home); zones 4-7 are night ground.
- **Streets** run along every fourth row and column from zone 4 out, radiating from the Haven; claimed streets have amber lamps; streets over the river are bridges.
- **Landmarks are fixed by zone**: library, clinic, park and pond in zone 6 (the District's facilities), river and hills at the edge of zone 7 ("the boundary runs along the river, the hills and the last bus stop"). Lot buildings come from a seed (`fnv1a(firstPlayDay)`), so each player's city differs and never changes.
- **Claimed** cells (zone <= current ring): lit windows (violet in zones 1-3, amber beyond), awnings, trees, lamps.
- **Unclaimed** cells are in "static": the same buildings, filled with dark noise, no windows, a few flickering pixels. The shape of what is coming is always visible.
- **The wall** is the dashed amber ellipse of the ring scenes, on the ground at the boundary radius, glowing, dashes marching slowly. A faint dotted ellipse marks the next ring's edge.

### 2.2 Progress inside the current ring (boundary creep)

The wall does not jump once per ring; it creeps with every Domain Point.

```
f      = (DP - threshold[ring]) / (threshold[ring+1] - threshold[ring])     // 0..1
wallR  = R[ring] + 0.2 + (R[ring+1] - R[ring] - 0.2) * 0.85 * f             // in cells
wallR  = R[7] + 0.2                                                          // at The City
```

`R[k]` is the outer radius of zone k. The 0.85 factor keeps the wall short of the next zone until the threshold is crossed, so crossing stays an event: the ring-unlock overlay plays, then the wall moves to the new zone's edge and the zone lights up.

Next-zone cells already inside `wallR` are **dawn** cells: out of the static, dim bodies, one window in four lit. The week before an unlock looks like a neighbourhood waking up.

### 2.3 Tapping a zone

A tap on any cell or building opens its zone's sheet (hit-testing by the element's cell, not screen position, so a tall tower's top opens the tower's zone). Keyboard and screen-reader users use seven focusable zone bands (5.3). The sheet:

```
ZONE 6 OF 7
THE DISTRICT
[NEXT] 200 DP to go
[==========------] 67%
The wall creeps toward The District with every quest. It crosses at 1,700 DP.
FACILITIES
 (lock) District Clinic. Opens with The District.
 (lock) District Library. Opens with The District.
OUTPOSTS HERE
 Hollow Park . Corridor
 Marta's place . Scouted
VIGNETTE
 | The Protocol has not written this page yet. It will, the day the wall gets here.
```

- Status: *Claimed* (registered at N DP), *Current ring* (walls +wallBonus), *Next* (N DP to go, creep meter) or *Beyond the wall* (registers at N DP).
- Facilities: claimed zones show name and effect from `rings.json`; unclaimed zones show names only ("Opens with The District").
- Vignette: claimed zones show the first sentence and *Replay vignette* (typed; instant with reduced motion); unclaimed zones show the placeholder line.
- Outposts in the zone, each linking to its sheet.

### 2.4 Weekly wave residue

Each settled, non-quiet wave leaves marks on the wall as it stood at settlement (from the domain snapshot, 4.1), at seeded angles (`fnv1a(firstPlayDay:periodIndex:scorch)`):

- **Scorch marks**: 2 (decisive), 3 (win) or 4 (loss) dark blotches with a red-brown rim and ember pixels that flicker for 7 days. Opacity `1 - age/14`; gone after 14 days. As the wall moves on, old scorch ends up inside claimed ground: where the line used to be.
- **"Walls held" flag**: a shield on a pole at the first scorch, for 7 days: a check for a win, a star for decisive, a neutral bar for a loss (never red). The Domain card shows *Walls held: N*, counting every non-quiet wave.
- Quiet periods leave nothing.

### 2.5 The rest of the screen

Below the map: the **Domain** window (ring name, DP meter, "The wall is 67% of the way there", tiles for Walls held, Wall bonus, Outposts n/cap) and the **Outposts** window (a row per outpost: state badge, visit meter, one-tap *I was there*; then *Mark an outpost* and the cap line). The HUD holds the next-wave chip, the *7 days* and *List* toggles, and the "since your last look" chip.

## 3. Outposts

An outpost is a real place the player keeps going back to, entered by name only. Outposts make the map the player's own city and reward what the game cares about most: going out, repeatedly, to the same good places.

### 3.1 Creating an outpost

*Mark an outpost* opens a form:

- **Name**, 1-24 characters, unique among active outposts (case-insensitive); placeholder from the type ("Riverside Gym").
- **Type**, one of 11 icons (4.4). The type sets the default **related habits** (1-2), which the player may change; "somewhere else" requires picking one.
- **How far does it feel?** A zone from The Flat to The City: "No address, no GPS: put it as far from home as it feels." Any zone is allowed, beyond the wall included; the Room is the Haven and holds none.
- **Which way?** One of eight directions. `suggestOutpostCell` picks the free cell in that zone nearest that direction and the zone's middle. *Place on map* is an optional extra (free cells show as amber dots; tap one); the selects are the default, accessible path.
- **Note**, optional, 0-80 characters.

Nothing else is collected: no address, coordinates, photo or time.

### 3.2 Logging a visit

Two routes, counted the same:

1. **From a quest.** After *Done*, the settlement overlay offers "Where were you?" with up to three related outposts (most visited first) and *Elsewhere*. One tap tags the quest; it never blocks the overlay. A custom quest (CUSTOM-QUESTS.md) with a default `outpostId` is tagged automatically.
2. **"I was there."** One tap on the pin's sheet or the outpost's row. Ten minutes on a park bench counts.

**One counted visit per outpost per game day.** Later logs that day are kept for the Ledger ("Daylight walk at Hollow Park") but do not count. Undoing a tagged quest (same day, GDD 6.7) removes its visit; a check-in can be undone the same day. Visits pay **no XP, settlement or DP** themselves, keeping the honour system cheap; the states pay.

### 3.3 Progression per outpost

| State | Visits | Unlocks | On the map |
|---|---|---|---|
| **Marked** | 0 | Nothing yet; it is on the map. | grey plaque on a post |
| **Scouted** | 3 | **Short trip**: rerolling a quest of a related habit costs 5 less settlement (15 -> 10; 10 -> 5 with the Corner Shop). | amber-outlined plaque |
| **Corridor** | 10 | **Supply corridor**: quests of related habits return +10% settlement. The wall reaches out to it (3.4). | filled amber plaque, glow, small amber waystation |
| **Stronghold** | 30 | **Stronghold**: +2 defense in every weekly wave (cap +6 across all strongholds) and a Haven annex: a small violet keep with battlements replaces the lot, a crown on the plaque, and its own little wall ring. | violet plaque with amber rim and crown |

- Each outpost keeps a `peak` state that never drops (as `highestRing`, errata 15). Perks read `peak`, so an undo never takes one away, and `outpostStateReached` fires only when `peak` rises.
- Perks are per habit, best outpost wins: two Scouted gyms give one Move discount; two Corridors give +10%, not +20%.
- The +10% is its own term (`1 + titleCoinMult + outpostCoinMult`), outside the title cap.
- Defense is a new `outposts` breakdown term with one log line: "The Riverside Gym stronghold holds. +2" ("Three strongholds hold the outer line. +6").

Pacing: a gym visited twice a week is Scouted in under 2 weeks, a Corridor in 5, a Stronghold in about 15, around ring 4-5 for a Gentle player, where extra defense starts to matter (GDD 19).

### 3.4 Outposts and rings

- An outpost in a zone beyond the current ring is **beyond the wall**: a dotted amber trail runs from the wall to its pin, "the way you walk there". Nothing about it is worse.
- At **Corridor**, an outpost beyond the wall **pulls the boundary toward it**: a strip about one cell wide runs from the wall to the pin, edged with the wall's marching dashes, its cells lit warm amber. Visual only: DP and ring are untouched, so the pacing simulation is unchanged.
- At **Stronghold**, cells within 1.35 of the pin light up inside a small dashed wall ring: a satellite of the Haven.
- Corridors and Strongholds inside the wall get a faint supply line from the Haven instead.
- When a ring unlock takes an outpost inside the wall, `outpostWithinWalls` fires and the overlay adds "The wall now reaches Hollow Park."

### 3.5 Caps

- **Active outposts: 3 + ring** (4 at the Room, 10 at the City); each ring makes room for one more.
- **At most 3 per zone**, pins **at least 3 cells apart**, which keeps every 44 px target clear at 320 px.
- **Retired** outposts do not count. Retiring is the player's choice ("Retired to the Ledger. Its visits are kept."); restoring needs a free slot and re-checks spacing (the engine suggests a new cell).
- **Forget** (Ledger, retired only, two-step confirm) deletes an outpost and its visits. It exists for privacy, since these name real people's homes, and is never suggested.

### 3.6 Warm failure modes

- No visit for 14 game days (or none 7 days after creation) makes an outpost **quiet**: dimmed pin, a "zz", a dashed *Quiet* badge, and "Hollow Park is quiet. It keeps; nothing here fades. One visit wakes it."
- Quiet never lowers visits, state or perks. Nothing decays.
- Copy never says "missed", "lost" or "abandoned"; the sheet shows "Last visit 19 days ago" once, muted.
- Waves never touch outposts; scorch only marks the main wall.

## 4. Data model

### 4.1 SaveFile additions (version 4)

Custom quests already moved the save to version 3 in the working tree; the map is version 4.

```ts
export type OutpostTypeId =
  | 'gym' | 'park' | 'library' | 'friend' | 'family' | 'cafe'
  | 'clinic' | 'market' | 'pool' | 'class' | 'other';
export type OutpostState = 'marked' | 'scouted' | 'corridor' | 'stronghold';
export type VisitSource = 'quest' | 'checkin';
export type Compass = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface MapCell { x: number; y: number }      // integers, -8..8

export interface Outpost {
  id: string;                    // `op${seq}`, never reused
  name: string;                  // 1..24, trimmed, unique among active (case-insensitive)
  type: OutpostTypeId;
  habits: HabitId[];             // 1..2, defaults from the type
  note: string;                  // 0..80
  cell: MapCell;
  createdAt: number;
  createdDay: number;
  visits: number;                // counted visits, at most one per game day
  lastVisitDay: number | null;
  peak: OutpostState;            // highest state ever reached; never drops
  stateDays: Partial<Record<OutpostState, number>>; // first day each state was reached
  retired: boolean;
}

export interface OutpostVisit {
  outpostId: string;
  day: number;
  at: number;
  source: VisitSource;
  instanceId: string | null;     // tagged quest, source 'quest' only
  counted: boolean;              // false for the 2nd+ log of the same day
}

export interface DomainSnapshot {
  periodIndex: number;           // wave period that settled (quiet included)
  day: number;                   // game day of the boundary that settled it
  domainPoints: number;          // after the wave award
  ring: RingId;
  result: WaveResult;
}

export interface MapState {
  outposts: Outpost[];           // active and retired, creation order
  visits: OutpostVisit[];        // newest last, capped at 400
  snapshots: DomainSnapshot[];   // newest last, capped at 104 (= WAVE_HISTORY_MAX)
  lastSeen: { day: number; domainPoints: number } | null;
  nextSeq: number;
}

export interface SaveFile {
  version: 4;
  // ...existing fields...
  map: MapState;
}

export interface WaveBreakdown {
  // ...existing fields...
  outposts: number;              // new: strongholds, capped
}

// CustomTemplate (CUSTOM-QUESTS.md) gains one optional field:
//   outpostId?: string;          // auto-tag completions at this outpost
```

**Migration (v3 -> v4).** `map = { outposts: [], visits: [], snapshots: [seed], lastSeen: null, nextSeq: 1 }`, where `seed` is a snapshot of the current state (`periodIndex: week.index - 1`, `day: lastOpenDay`, DP, ring, last result or `'quiet'`) so *7 days* has a baseline. Every `WaveRecord.breakdown` gets `outposts: 0`. `migrate()` normalises a damaged `map` like boards: drop outposts with invalid cells or types, clamp text, set `peak = max(peak, stateFor(visits))`, rebuild `nextSeq`, drop orphan visits. Tests: v2 and v3 saves load with an empty map; a v4 save round-trips through `exportSave`/`migrate`.

### 4.2 Invariants (assert in tests)

- The map never changes `player.domainPoints` or `player.ring`.
- Outpost ids are unique and `< op${nextSeq}`.
- Active outposts: count `<= 3 + player.ring`, `<= 3` per zone, none in zone 1, cells unique and pairwise distance `>= 3`, every cell inside the island.
- `peak >= stateFor(visits)` and `peak` never decreases across any action.
- At most one `counted` visit per outpost per game day in `visits`; `lastVisitDay` equals the day of the newest counted visit (or `null`).
- Retired outposts contribute nothing to caps, perks, defense or the map.
- `snapshots` have strictly increasing `periodIndex`.
- Every mutator returns a new save and leaves its input untouched (existing contract).

### 4.3 Engine functions

New module `src/game/outposts.ts` (all `(save, ..., now, opts?) => ActionResult` unless marked as a selector):

| Function | Does | Errors (warm copy lives in `strings.json`) |
|---|---|---|
| `createOutpost(save, input, now, opts?)` | `input = { name, type, habits?, note?, cell }`. Validates, appends, emits `outpostCreated`. | `name required`, `name taken`, `cap reached`, `zone full`, `cell taken`, `cell invalid` |
| `suggestOutpostCell(save, zone, dir)` *selector* | Free cell in `zone` nearest the `dir` ray and the zone's middle radius, or `null`. | |
| `editOutpost(save, id, patch, now)` | Name, type, habits, note. Visits and state stay. | as create |
| `moveOutpost(save, id, cell, now)` | Re-validates spacing and zone cap. | as create |
| `retireOutpost` / `restoreOutpost(save, id, now)` | Toggle `retired`; restore re-checks caps. | `cap reached`, `cell taken` |
| `forgetOutpost(save, id, now)` | Retired only. Removes the outpost and its visits. | `not retired` |
| `logOutpostVisit(save, id, now, opts?)` | Check-in. One counted visit per day; raises `peak`. Emits `outpostVisited`, maybe `outpostStateReached`. | `already logged today`, `retired` |
| `tagQuestAtOutpost(save, instanceId, outpostId, now)` | Quest must be `done` today and untagged. Counted if no visit today, else uncounted record. | `quest not done`, `already tagged` |
| `undoOutpostVisit(save, id, now, opts?)` | Same-day check-in only, and only when no tagged quest shares that day. Emits `outpostVisitUndone`. | `nothing to undo` |
| `markMapSeen(save, now, opts?)` | Sets `lastSeen` to today and current DP. No events. | |

Selectors: `outpostStateFor(visits)`, `outpostZone(cell)`, `outpostCap(ring)`, `isOutpostQuiet(outpost, today)`, `outpostRerollDiscount(save, habit)`, `outpostCoinMult(save, habit)`, `outpostDefense(save)`, `compareSnapshot(save, today)` (newest with `day <= today - 7`, else the oldest, else DP 0), plus `wallRadius(dp)` and `zoneOfCell(cell)` in `src/game/mapGeometry.ts`, shared with the UI.

Changes to existing code:

- `board.ts`: `rerollQuest` price `max(0, rerollPrice(ring) - outpostRerollDiscount(save, q.habit))`; `undoQuest` calls `untagQuestDraft` (removes the visit, decrements a counted one, keeps `peak`).
- `economy.ts`: `questRewards` gets `ctx.outpostCoinMult`; `recomputeRingDraft` emits `outpostWithinWalls` when `highestRing` rises over an outpost's zone.
- `wave.ts`: `waveDefense` fills `breakdown.outposts` and adds the log line; `settleWaveDraft` and the quiet path in `tick.ts` append a `DomainSnapshot`.
- `custom.ts`: completing a custom quest with `outpostId` tags it in the same draft.

Events added to `GameEvent`:

```ts
| { type: 'outpostCreated'; outpostId: string }
| { type: 'outpostVisited'; outpostId: string; visits: number; source: VisitSource; counted: boolean }
| { type: 'outpostVisitUndone'; outpostId: string }
| { type: 'outpostStateReached'; outpostId: string; state: OutpostState }
| { type: 'outpostRetired'; outpostId: string }
| { type: 'outpostRestored'; outpostId: string }
| { type: 'outpostWithinWalls'; outpostId: string; ring: RingId }
```

### 4.4 Content: `src/game/content/outposts.json`

```jsonc
{
  "version": 1,
  "rules": {
    "baseCap": 3, "capPerRing": 1, "maxCap": 10, "perZone": 3, "minSpacing": 3,
    "quietAfterDays": 14, "quietIfNeverVisitedAfterDays": 7,
    "rerollDiscount": 5, "corridorCoinMult": 0.10,
    "strongholdDefense": 2, "strongholdDefenseCap": 6,
    "nameMax": 24, "noteMax": 80, "visitLogMax": 400
  },
  "states": [
    { "id": "marked",     "minVisits": 0,  "label": "Marked",     "perk": "On the map." },
    { "id": "scouted",    "minVisits": 3,  "label": "Scouted",    "perk": "Swapping {aHabits} quest costs {discount} less settlement." },
    { "id": "corridor",   "minVisits": 10, "label": "Corridor",   "perk": "{habits} quests return +10% settlement. The wall reaches out to it." },
    { "id": "stronghold", "minVisits": 30, "label": "Stronghold", "perk": "+2 defense in every weekly wave. A Haven annex stands here." }
  ],
  "types": [
    { "id": "gym",     "label": "Gym",            "icon": "gym",     "habits": ["move", "hygiene"],   "placeholder": "Riverside Gym",
      "visitLines": ["Pell signs the book at {name}. {visits} visits.", "{name}: the lockers know you now."] },
    { "id": "park",    "label": "Park",           "icon": "park",    "habits": ["outside", "move"],   "placeholder": "Hollow Park", "visitLines": ["..."] },
    { "id": "library", "label": "Library",        "icon": "library", "habits": ["study"],             "placeholder": "Central Library", "visitLines": ["..."] },
    { "id": "friend",  "label": "Friend's home",  "icon": "friend",  "habits": ["social"],            "placeholder": "Marta's place", "visitLines": ["..."] },
    { "id": "family",  "label": "Family home",    "icon": "family",  "habits": ["social", "eat"],     "placeholder": "Mum's", "visitLines": ["..."] },
    { "id": "cafe",    "label": "Cafe",           "icon": "cafe",    "habits": ["social", "eat"],     "placeholder": "The Corner Cafe", "visitLines": ["..."] },
    { "id": "clinic",  "label": "Clinic",         "icon": "clinic",  "habits": ["hygiene", "sleep"],  "placeholder": "The clinic", "visitLines": ["..."] },
    { "id": "market",  "label": "Market",         "icon": "market",  "habits": ["eat"],               "placeholder": "Saturday market", "visitLines": ["..."] },
    { "id": "pool",    "label": "Pool",           "icon": "pool",    "habits": ["move", "hygiene"],   "placeholder": "Northside Pool", "visitLines": ["..."] },
    { "id": "class",   "label": "Class or club",  "icon": "class",   "habits": ["study", "social"],   "placeholder": "Tuesday choir", "visitLines": ["..."] },
    { "id": "other",   "label": "Somewhere else", "icon": "other",   "habits": [],                    "placeholder": "The bench by the canal", "visitLines": ["..."] }
  ]
}
```

`validateContent()` checks: type ids match `OutpostTypeId`; habits valid (none only for `other`, else 1-2); `states` ascending from 0; an icon exists for each type (`src/assets/outposts/<icon>.svg`, drafts in `docs/design/prototypes/assets/`). Document it in `schema.md`; all copy goes in `strings.json` under a new `map` key.

## 5. Interaction and UX

### 5.1 Tab placement: a fifth tab, "Map", in the middle

Decision: **five tabs, Haven - Board - Map - Ledger - Settings**, Map in the centre.

- The map is a destination with its own interactions; under Haven it would be a second scrolling world inside the Haven scroll, or behind a button to find.
- *I was there* is daily and deserves one tap from anywhere; the centre slot is the easiest thumb target. Pillar 3 says the map is the payoff, and the tab bar is where the game says what matters.
- Moving Settings to a header gear was rejected: it breaks muscle memory and every e2e path for no player benefit.
- Five 64 px columns at 320 px are still 44 px targets. Labels: Press Start 2P 9 px from 375 px; below that, Inter 10 px weight 800 uppercase ("SETTINGS" is about 55 px), per RESPONSIVE-RULES 14. Below 360 px at 150% text, labels hide and links keep `aria-label`s.
- Haven keeps its scene header and gains a *Map* chip; the ring-unlock overlay gains *See it on the map*.

### 5.2 Wireframes

Phone, 390 x 844 (prototype screenshot `city-map-390-dp1500.png`):

```
+------------------------------------------+
| CITY MAP                     [gem] 1,500 |
| Ring 5 of 7 . The Block              DP  |
+------------------------------------------+
| [NEXT WAVE 3 DAYS]     [(o) 7 DAYS][LIST]|
|            .  *      ||                  |
|    (pin)        __###||###__     (crown) |
|   [park]  ..  /####[HAVEN]###\  [gym]    |
|  [shield] .  | ### lit ### ##  |         |
| (zz)(+)....  \___ ##### ____/  [lib]     |
|              - - wall - - (home)         |
|  static static static static static      |
| [+38 DP since your last look]            |
+------------------------------------------+
| DOMAIN                         Ring 5 / 7|
| The Block                                |
| [##############--------]                 |
| 1,500 / 1,700 DP to The District. The    |
| wall is 67% of the way there.            |
| [WALLS HELD 27][WALL BONUS +17][OUTPOSTS 6/8]
+------------------------------------------+
| OUTPOSTS            places you go back to|
| [ico] Riverside Gym              [ I WAS |
|       STRONGHOLD [=====] 40 visits THERE]|
| [ico] Hollow Park  BEYOND        [  v   ]|
|       CORRIDOR   [=-----] 15/30          |
| ...                                      |
| [ + MARK AN OUTPOST ]                    |
| Room for 2 more at The Block.            |
+------------------------------------------+
| [Haven] [Board] [*MAP*] [Ledger] [Settings]
+------------------------------------------+
```

Sheets (zone, outpost, new outpost) slide up, fit `calc(100dvh - safe areas)`, scroll inside, close on X, Escape or backdrop, and return focus to their opener (`city-map-390-pin.png`, `-zone.png`, `-new.png`).

Tablet and desktop, 768 px and up (`city-map-1024-dp1500.png`): the frame widens to 980 px in two columns; the map gets the room.

```
+----------------------------------------------------------------------------+
| CITY MAP  Ring 5 of 7 . The Block                              [gem] 1,500 |
+----------------------------------------------+-----------------------------+
| [NEXT WAVE]               [7 DAYS] [LIST]    | OUTPOSTS                    |
|                                              | [ico] Riverside Gym   [v]   |
|            (the map, ~560 px wide,           | [ico] Hollow Park     [v]   |
|             sticky while the right           | [ico] The Corner Cafe [v]   |
|             column scrolls)                  | ...                         |
|                                              | [ + MARK AN OUTPOST ]       |
| [+38 DP since your last look]                +-----------------------------+
+----------------------------------------------+   sheets open here, docked  |
| DOMAIN  The Block  [######----]  stats       |   right, 400 px wide,       |
+----------------------------------------------+   full height               |
|              [Haven] [Board] [MAP] [Ledger] [Settings]                     |
+----------------------------------------------------------------------------+
```

Landscape (`max-height: 500px`, `city-map-844x390-dp1500.png`): the map is capped at `100dvh - 7rem`, the ring line hides, the tab bar drops to 3.25 rem with icon and label side by side.

The settlement overlay gains one row when related outposts exist:

```
|  SETTLEMENT . Daylight walk                |
|  +24 XP  +11 coins  +1 DP  Wren +6         |
|  Where were you?  [Hollow Park] [Elsewhere]|
```

### 5.3 Gestures and accessibility

- **Tap is enough for everything**: no pinch, pan, long-press or drag. The fixed scale fits the whole city at every width, and keeps week-to-week comparison honest.
- **Keyboard.** Tab order: HUD buttons, the seven zone bands (1 to 7), the pins (zone, then name), then the windows below. Enter or Space opens a sheet, Escape closes it; focus is trapped in the sheet and returns to its opener. Focused bands get an amber outline, focused pins a white rim and dashed ring.
- **Screen readers.** The SVG is `role="group"` with a label explaining the controls. Bands are `role="button"` ("Zone 6, The District, next ring, 200 DP to go"), as are pins ("Hollow Park, Park, Corridor, zone 6, beyond the wall, 15 visits"). Decoration is `aria-hidden`; toasts are `aria-live="polite"`; the Domain meter is a `progressbar` with `aria-valuetext`.
- **List view.** *List* swaps the map for seven zone rows (number, name, threshold, *Claimed / Current / N DP to go / Beyond the wall*), each followed by its outposts; every map action is reachable from it. Remembered per device (localStorage).
- **Colour is never the only signal**: text badges and distinct plaques (outline, filled, crown); quiet has "zz"; the loss flag is a bar.
- **Reduced motion**: no marching dashes, breathing, static, embers or ripple; the wall moves instantly; vignettes appear in full. Same layout.

### 5.4 Performance budget

- **One inline SVG, at most 60 KB serialized and 1,500 elements** worst case (ring 7, 10 outposts, two waves of residue). No canvas, `<image>` or SVG filters; one 2-stop radial gradient; at most 16 patterns.
- The prototype measures 54.3 KB / 1,291 elements at DP 0 and 59.9 KB / 1,375 at DP 1,500 with six outposts and residue, with techniques the component must keep: each box is three relative `<path>`s styled by position (`:nth-child(3n+1)`...); windows are patterns inside the side fills, with the face colour as background; ground cells are `<use>`s of one tile; no `data-*` attributes (a `WeakMap` maps elements to cells); integer anchors, one-decimal deltas.
- Static layers are generated once per layout seed and memoised; a DP change only rewrites class strings (221 ground and about 160 building groups) and the small dynamic layers.
- Only `opacity`, `stroke-dashoffset` and three ellipses' `rx`/`ry` animate. Target 60 fps on a mid-range phone, no task over 50 ms on a DP change.

## 6. Visual spec

### 6.1 Palette use

Colours come from ART.md plus derived steps of the same hues (as the ring scenes already do), kept as custom properties in `CityMap.module.css`, not `tokens.css`:

| Use | Colour |
|---|---|
| Sky, outlines | bg `#0f0f14` |
| Claimed ground / home ground (zones 1-3) | `#20202c` / `#29214e` |
| Building faces, claimed (top / left / right) | `#37374e` / `#2a2a3d` / `#1f1f2d` |
| Home buildings (zones 1-3) | `#4e3f97` / `#3c3079` / `#2c235b`, windows accent light `#b9a8ff` |
| Haven tower and annexes | accent light `#a08cff` / accent `#7c5cff` / accent dark `#4a36a8`, windows text `#efeaff` |
| Lit windows, lamps, wall, corridors | amber `#ffb84d` (dim step `#c98a35`) |
| Corridor-lit ground and buildings | warm `#2e2516`, tops `#463a26` |
| Dawn (next zone inside the wall) | `#2c2c3c` / `#222230` / `#191925`, one window in four |
| Fog (static) | noise patterns on `#1a1a23` / `#14141c` / `#101016`, dots `#2b2b3a` and `#4a4a5c` |
| Water | `#1d3a66`, ripples `#5ba7d9` (the Outside habit colour) |
| Trees | `#3f9a63` / `#2f7a4c` / `#225a37` |
| Shop awnings | habit colours (move, outside, social, hygiene, eat, study) |
| Scorch | `#3a1a1e` rim, `#050507` core, embers danger `#ff6b85` and amber |
| Walls-held flag | panel `#1a1a24`, amber rim, success `#4dff9a` check |

### 6.2 Zone shapes and buildings

Isometric, ART.md helper (`p(x, y, z) -> [cx + (x - y) * s, cy + (x + y) * s/2 - z * s]`), `s = 14.5`, viewBox `360 x 264`, centre `(180, 158)`; a ground circle of radius `r` cells is the ellipse `rx = r * s * sqrt(2)`, `ry = rx / 2`. Painter's order: ground (by `x + y`), Haven glow and wall fill, buildings (by `x + y`), sparks, residue, guides, compare, wall, corridors, flags, pins. Front-edge cells get a 0.3-cell skirt. Heights in cells: rooms 0.4-0.7, annexes 0.7-1.25, blocks 1.25-2.25, shops 0.55-1.05, district 0.9-2.2, towers 1.9-4.1; the Haven 3.5 plus antenna and blinking amber beacon.

### 6.3 Pins

A 16-unit post on a ground shadow, topped by a chamfered plaque (16 x 14, 45-degree corners like the panel frame) with the type icon at 11 units (`currentColor`, `src/assets/outposts/`).

- Marked: panel plaque, muted rim, grey icon. Scouted: amber rim and icon.
- Corridor: amber plaque, dark icon, breathing halo, raised 8 units on an amber waystation.
- Stronghold: violet plaque, amber rim, white icon, crown, violet halo, raised 14 units on a violet keep with battlements, inside a small dashed wall ring.
- Quiet: 55% opacity and "zz". Focused or selected: white rim and dashed ring.
- Hit area: a transparent 17-unit circle (44 px at 390 px wide).

### 6.4 Boundary animation (CSS only)

```css
.wall      { fill: none; stroke: #ffb84d; stroke-width: 1.7; stroke-dasharray: 5 3.5;
             animation: march 1.8s linear infinite;
             transition: rx 1.4s cubic-bezier(.2,.8,.2,1), ry 1.4s cubic-bezier(.2,.8,.2,1); }
.wallglow  { fill: none; stroke: #ffb84d; stroke-width: 7; opacity: .13; animation: breathe 3.2s ease-in-out infinite; }
@keyframes march   { to { stroke-dashoffset: -17; } }
@keyframes breathe { 50% { opacity: .26; } }
.pop > path { animation: winOn .9s steps(3, end) both; animation-delay: var(--dl); }  /* newly lit buildings */
```

`--dl` is `(cellDistance - previousWallRadius) * 140 ms`: buildings light in a ripple following the wall. `rx`/`ry` are set as attributes and inline styles so the transition runs.

### 6.5 Fog and static

Unclaimed faces use 9 x 9 noise patterns (6-7 one-unit dots; one per face orientation, plus ground and water). About 35 one- or two-unit sparks on fog cells flicker with `steps(1)` opacity at three staggered rates (`:nth-child` delays); sparks on lit cells hide. No masks or filters: the static belongs to each unclaimed shape, so tall buildings are never fogged on the wrong side of the wall.

### 6.6 Progress compare

*7 days* draws the compare snapshot's wall as a white dashed ellipse (`#e8e8f0`, 75%) and hatches the band to the current wall in 30-degree amber. The legend chip ("-- 7 days ago /// new ground") replaces the "since" chip, and the Domain line reads "+78 DP in 7 days. The wall moved 0.4 streets." (one cell is one street). A band crossing a zone guide reads as "a whole new neighbourhood".

## 7. Implementation plan

Each step merges green (`npm run lint && npm run typecheck && npm test && npm run build`).

1. **Content**: `content/outposts.json`, loader and `validateContent()` checks in `content/index.ts`, `schema.md`, `strings.json` `map.*`. Tests in `content.test.ts`.
2. **Schema**: `types.ts` (4.1); `save.ts` `SAVE_VERSION = 4`, empty map in `createNewSave`, `migrate` v3 -> v4 with normalisation. Tests in `save.test.ts` (v2, v3, damaged-map fixtures, round-trip).
3. **Geometry**: `src/game/mapGeometry.ts` (radii, `zoneOfCell`, `isIslandCell`, `wallRadius`, `cellDistance`). Tests: 7 zones, `wallRadius` monotonic and `< R[ring+1]` before the threshold.
4. **Engine**: `src/game/outposts.ts`, `src/game/map.ts` (snapshots, `markMapSeen`, `compareSnapshot`); integrations in `board.ts`, `economy.ts`, `wave.ts`, `tick.ts`, `custom.ts`; `index.ts` exports; README module map.
5. **Store**: `gameStore.ts` actions per mutator; `selectors.ts` `mapView(save, now)` (zone status, radii, dawn and corridor cells, pins, residue, compare, caps); `eventText.ts` toasts.
6. **Assets**: `src/assets/outposts/*.svg` (11, from the drafts) and `src/assets/ui/map.svg` (from `nav-map.svg`); register in `assets/index.ts` and `assets.test.ts`.
7. **Map component**: `src/components/map/layout.ts` (seeded city; port the prototype's `makeTiles` and `buildingFor`), `CityMapSvg.tsx` (memoised static layers), `OutpostPin.tsx`, `CityMap.module.css`. Tests: layout deterministic per seed; SVG under 60 KB on a ring-7, 10-outpost fixture.
8. **Screen**: `src/screens/MapScreen.tsx` (HUD, windows, `ZoneSheet`, `OutpostSheet`, `OutpostForm`, `MapListView`; `markMapSeen` on unmount); `/map` route; fifth tab in `TabBar.tsx` (`repeat(5, minmax(0, 1fr))`, labels per 5.1); *Map* chip in `RingHeader`; *See it on the map* in `RingUnlockWindow`; "Where were you?" in the settlement sheet; Ledger "Outposts" section with retired, restore, forget.
9. **E2E**: `e2e/map.spec.ts`; add Map to the responsive, axe and visual specs.

Engine tests (`outposts.test.ts`, `map.test.ts`):

- create: every refusal (empty or duplicate name, cap 4 at ring 1, fourth in a zone, zone 1, spacing < 3, off-island); success emits `outpostCreated`, ids `op1`, `op2`...; `suggestOutpostCell` nearest the direction, `null` when full.
- visits: one counted per day; second check-in refused; tag after check-in uncounted; check-in after a tag refused; 3 / 10 / 30 each emit `outpostStateReached` once.
- undo of a tagged quest removes its visit; `peak` stays; climbing back emits nothing.
- quiet after 14 days (7 if never visited); a visit clears it; nothing else changes.
- perks: reroll 15 -> 10 and 10 -> 5 (Corner Shop) for related habits only; +10% not stacked; defense +2 each, cap 6; retired give nothing.
- the map never moves DP or ring (property test over random action sequences).
- snapshots on every settlement incl. quiet, capped at 104; `compareSnapshot` picks correctly; `outpostWithinWalls` fires once, on the covering unlock.
- immutability: inputs deep-equal after every mutator.

E2E (`e2e/map.spec.ts`): five tabs, Map by click and keyboard, Settings intact; fresh save shows the lit Room; create an outpost via the form, log *I was there* ("Logged today", survives reload); tag a quest in the settlement sheet, undo it, count falls back; zone sheet from a building tap and from a band by keyboard, Escape restores focus; list view rows open sheets; 320x568, 390x844 at 150%, 844x390 and 1024x768 pass the responsive checks; reduced motion leaves `document.getAnimations()` empty; `#city-map` serializes under 60,000 characters on a ring-7 fixture.

Acceptance criteria:

- The wall follows `wallRadius(dp)` with dawn cells; crossing a threshold lights the zone after the unlock overlay.
- Opening the tab animates from `lastSeen` (static with reduced motion) and shows the DP delta; *7 days* shows a real snapshot.
- Outposts can be created, visited, tagged, edited, moved, retired, restored and forgotten within the caps, with warm copy for every refusal; perks apply as in 3.3 and show in the breakdown and log.
- Everything works by tap and keyboard; the list view is complete; axe is clean.
- SVG under 60 KB and 1,500 elements worst case; the RESPONSIVE-RULES checklist passes.
- v2 and v3 saves migrate to v4; `pacing.test.ts` passes unchanged.

## 8. Open questions resolved

1. **Tab placement**: fifth tab "Map" in the centre (5.1). Settings stays in the bar.
2. **Fixed scale, no zoom**: the whole city is always visible at one scale, so this week and last week are comparable at a glance. No pinch, no pan.
3. **Creep stops at 85%** of the gap to the next zone, so crossing a threshold is still a visible event.
4. **Corridors are visual only**: they never change DP or ring, so the economy and `pacing.test.ts` are untouched.
5. **Visits pay nothing directly**; states pay small, capped perks. Keeps the honour system cheap.
6. **One counted visit per outpost per game day**, from either route; extra logs are kept for the Ledger only.
7. **States never drop** (`peak`), mirroring `highestRing`; perks read `peak`.
8. **Thresholds 3 / 10 / 30** visits (Scouted / Corridor / Stronghold).
9. **"Discount" means reroll price** (-5) and **"cheaper trips" means +10% settlement** on related quests, since quests themselves cost nothing.
10. **Stronghold defense +2 each, cap +6**, in its own breakdown term and log line.
11. **Caps**: 3 + ring active outposts (4..10), 3 per zone, 3 cells apart, none in the Room.
12. **Placement by "how far it feels" and a direction**, not by geography; any zone is allowed, including beyond the wall. Tap-to-place is an optional extra.
13. **Quiet after 14 days** (or 7 days if never visited); quiet changes nothing but the look.
14. **Retire instead of delete**; **Forget** exists for privacy only, for retired outposts, with a two-step confirm.
15. **No location data ever**: no GPS, no address, no geofencing, not even as an option.
16. **Wave residue**: scorch marks fade over 14 days, the flag lasts 7; every non-quiet wave counts as "walls held", losses included.
17. **Snapshots per wave period** in the save (104 kept) power both the compare ghost and the residue placement.
18. **The city layout is seeded from `firstPlayDay`**, so each player's city is unique and stable; landmarks are fixed by zone.
19. **Save version 4**, since custom quests took version 3.
20. **Custom quests can default to an outpost** (`outpostId`), so "gym session" quests tag themselves.
21. **List view preference is per device** (localStorage), not in the save, like other view settings.
22. **Tablet layout is two columns** with docked sheets, not a phone frame in a void (RESPONSIVE-RULES 8).
