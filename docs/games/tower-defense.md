# Hold the Haven (`tower-defense`)

Monsters walk a winding path to the Haven; the troops are the towers. Each vassal unlocks the tower of its habit, and its `power` makes it stronger. Clear every wave to win.

Category `defense`, minimum ring 2, roster 3 to 8, about 5 minutes.

Build spec and player doc. The balanced values of the *tunable* numbers are written back here (HP and count percentages in sections 4 and 5).

## 1. Conventions

- **Tick** = `FIXED_DT_MS` (50 ms); 20 ticks = 1 s.
- **Fixed point:** 1 cell = **1000 units (u)**. Every number in the state is an integer (`Number.isInteger`); no `Math.sqrt`, `Math.sin`, `Math.pow`. Distances compare squares: `dx*dx + dy*dy <= r*r`. Floor after every division, in the order written.
- **Grid:** 9 columns (`x` 0..8) by 7 rows (`y` 0..6). Cell index `i = y*9 + x`. Cell centre in units: `(x*1000 + 500, y*1000 + 500)`.
- **Setup rng:** `mulberry32(fnv1a('tower-defense:' + (seed >>> 0)))`. Draw order: `layout = rngInt(rng, 3)`, `mirror = rngInt(rng, 2) === 1`, then the wave picks (section 5) in wave order. `reduce` needs no randomness.

## 2. Maps

`S` start, `=` path, `H` the Haven (path end), `o` pad, `.` grass. Pads are numbered row-major after mirroring. The path joins the waypoints with straight runs.

**Mirror rule:** `mirror` maps every cell `x -> 8 - x`; path order unchanged (start on the right).

**Map 0, Switchback** (23 path cells, 10 pads). Waypoints `(0,1) (6,1) (6,3) (1,3) (1,5) (8,5)`.

```
y0 .........
y1 S======..
y2 .oo.oo=o.
y3 .======..
y4 .=oo.oo..
y5 .=======H
y6 ....o....
```

**Map 1, Two Hairpins** (21 path cells, 10 pads). Waypoints `(0,1) (1,1) (1,5) (4,5) (4,1) (7,1) (7,5) (8,5)`.

```
y0 .....o...
y1 S=..====.
y2 .=..=..=.
y3 o=oo=oo=o
y4 .=..=..=.
y5 .====oo=H
y6 ..o......
```

**Map 2, The Stairwell** (24 path cells, 11 pads). Waypoints `(0,0) (3,0) (3,3) (0,3) (0,6) (5,6) (5,3) (8,3)`.

```
y0 S===.....
y1 .o.=o....
y2 ..o=..oo.
y3 ====o===H
y4 =o...=oo.
y5 =.o.o=...
y6 ======...
```

Path position `pos` runs from 0 (centre of the first cell) to `END = (cells - 1) * 1000`. Point of `pos`: `k = floor(pos / 1000)`, `f = pos % 1000`, point = `centre(k) + (centre(k+1) - centre(k)) * f / 1000` (exact). `pos >= END` reaches the Haven.

## 3. Towers

A member with a habit gives one **tower card**; `habit: null` members give none (the log says "Ada cheers from the wall."). A card can be placed any number of times, one tower per pad. A tower keeps its member's `power` `p`.

| Kind | Habit | Damage | Range (u) | Interval (ticks) | Cost | Special |
| --- | --- | --- | --- | --- | --- | --- |
| Runner | move | 4 | 1500 | 5 | 30 | targets the first enemy |
| Lantern | outside | 14 | 2800 | 24 | 40 | ignores armour |
| Sweeper | clean | 5 | 1200 | 12 | 35 | hits every enemy in range |
| Chorus | social | 0 | adjacent pads | none | 30 | damage boost to adjacent towers |
| Archivist | study | 3 | 2200 | 20 | 35 | marks its target |
| Lull | sleep | 0 | 1600 | none | 30 | slows every enemy in range |
| Hearth | eat | 0 | none | 400 | 45 | repairs the Haven |
| Bubble | hygiene | 8 | 1800 | 18 | 40 | splash and knock-back |

**Scaling** (`lvl` is 1, 2 or 3; arrays are indexed by `lvl - 1`):

- `damage = max(1, floor(floor(base * [100,150,220][lvl-1] / 100) * (100 + p) / 100))` for kinds with base damage > 0.
- `range = base + 5p + [0,250,500][lvl-1]`.
- `interval = max(3, base - floor(p / 30))` (Hearth: below).
- `cost = base + floor(p / 5)`. Upgrade to level 2 costs `cost`, to level 3 costs `2 * cost`. `invested` = glow spent on that tower. **Sell** refunds `floor(invested * 70 / 100)` and frees the pad; a tower that is jammed (`tick < jamUntil`) cannot be sold.

**Firing.** Every tick a non-jammed tower does `cd = max(0, cd - 1)`; at `cd === 0` with a target it fires and sets `cd = interval`. New towers start at `cd = 0`. **Target "first"** = the enemy in range with the highest `pos`, ties to the lowest enemy `id`.

**Hit damage** on enemy `e` from a tower with `damage`: `d = floor(damage * (100 + attackPct + chorus) / 100)`; if `e` is marked, `d = floor(d * (100 + e.markPct) / 100)`; unless the tower is a Lantern, `d = d - e.armour`; `d = max(1, d)`. The member's `dealt` adds `min(d, e.hp)`.

Specials (Runner and Lantern: single target, first):

- **Sweeper:** fires when any enemy is in range and hits each one.
- **Chorus:** never fires. `chorus` for a tower = the **highest** boost among non-jammed Chorus towers at Chebyshev distance 1 on the grid (`max(|dx|,|dy|) === 1`, the 8 neighbours). Boosts never add up. `boost = [25,40,60][lvl-1] + floor(p / 4)` percent. Recomputed every tick, so selling or jamming a Chorus removes it at once.
- **Archivist:** single target: the first **unmarked** enemy in range, else the first enemy. On hit: `e.markUntil = max(e.markUntil, tick + [60,80,100][lvl-1])`; `e.markPct = max(e.markPct if still marked else 0, [25,35,45][lvl-1] + floor(p / 5))`. Marked while `tick < markUntil`; applies to later hits from every tower.
- **Lull:** never fires. Every tick, each enemy in range of a non-jammed Lull gets `slow = min(50, [30,35,40][lvl-1] + floor(p / 5))`; with several Lulls the highest applies. Silence Specter: slow 0. The Static: `floor(slow / 2)`.
- **Hearth:** `interval = max(100, [400,300,220][lvl-1] - 2p)`. When `cd === 0` and `havenHp < havenMax`: `havenHp += 1`, `cd = interval`. At full Haven it waits ready at `cd = 0`. A Hearth acts after the leaks of its tick and cannot save a Haven that reached 0 (the loss is settled first, see Tick order).
- **Bubble:** single target, first. The target takes hit damage; every other enemy within `[700,700,900][lvl-1]` u of the target's point takes `max(1, floor(dSplash * 50 / 100) - armour)`, where `dSplash` is the hit damage before armour with that enemy's own mark. Knock-back: if the target is not the Static and `tick >= e.knockUntil`, `e.pos = max(0, e.pos - [250,300,350][lvl-1])` and `e.knockUntil = tick + 40`.

## 4. Enemies

Ids and names from `MONSTERS` in `src/game/wave.ts`. Speed in u per tick.

| Id | HP | Speed | Armour | Glow | Leak | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `clutter-blob` | 60 | 30 | 0 | 4 | 1 | |
| `dust-bunny` | 24 | 44 | 0 | 2 | 1 | spawns at half interval |
| `procrastination-moth` | 40 | 52 | 0 | 3 | 1 | |
| `junk-food-imp` | 55 | 40 | 1 | 4 | 1 | |
| `fog-wraith` | 75 | 34 | 0 | 5 | 1 | |
| `couch-leech` | 130 | 20 | 2 | 7 | 2 | |
| `snooze-golem` | 170 | 18 | 4 | 9 | 2 | |
| `silence-specter` | 85 | 38 | 1 | 6 | 1 | cannot be slowed |
| `doomscroll-wyrm` | 320 | 24 | 2 | 18 | 3 | mid-boss |
| `the-static` | 800, scaled like every monster | 16 | 3 | 0 | 5 | boss, see below |

**HP at spawn:** `hp = max(1, floor(floor(base * HP_PCT[d] / 100) * (100 + 6 * (n - 1)) / 100))`, `n` = the wave's number in this game (1..total); in wave 1, then `hp = max(1, floor(hp * 80 / 100))`. `HP_PCT = [220, 310, 410, 470, 520]` *balanced* (a leaking monster is simply removed, so the Haven's hit points are the only loss and the win rate is steep in monster hit points; see section 13 for the win rates). The Static is scaled like every monster (about 4,700 hit points on wave 8 at difficulty 3).

**Speed at spawn:** waves 1 and 2: `floor(speed * (100 - min(40, timeSeconds)) / 100)`. Each tick: `eff = max(1, floor(speed * (100 - slow) / 100))`; `pos += eff`. Net progress stays positive: a fully slowed Golem gains 360 u per 40-tick knock-back cooldown against 350 u of push.

**The Static (boss):** spawns last in the last wave with `pulseAt = spawnTick + 100`. When `tick >= pulseAt`: the nearest tower (squared distance from the Static's point to the pad centre, ties to the lowest pad) within 3000 u that is not jammed gets `jamUntil = tick + 60`; then `pulseAt += 100`. A tower is jammed while `tick < jamUntil`: no firing, no `cd` countdown, no aura. Immune to knock-back; Lull slow halved.

**Entity cap:** at most 48 enemies alive. A spawn due while 48 are alive stays in the queue until a slot frees.

## 5. Waves

Total waves: `[5, 6, 8, 8, 8][d-1]`. A game plays the templates d1 `1,2,3,4,8`; d2 `1,2,3,4,5,8`; d3 to d5 `1..8`. Template 8 is always last.

| Template | Groups in spawn order (count at d3) | Interval |
| --- | --- | --- |
| 1 | Clutter Blob 6 | 40 |
| 2 | Clutter Blob 5, then pick {Dust Bunny 6 \| Procrastination Moth 4} | 32 |
| 3 | pick {Junk-Food Imp 6 \| Fog Wraith 5}, then Dust Bunny 6 | 30 |
| 4 | Couch Leech 3, then pick {Procrastination Moth 6 \| Junk-Food Imp 5} | 28 |
| 5 | Clutter Blob 6, Doomscroll Wyrm 1, then pick {Silence Specter 3 \| Fog Wraith 4} | 26 |
| 6 | Snooze Golem 3, then pick {Dust Bunny 10 \| Procrastination Moth 7} | 24 |
| 7 | two different picks, in pick order, from {Silence Specter 4 \| Couch Leech 4 \| Fog Wraith 6 \| Junk-Food Imp 7} | 22 |
| 8 | Clutter Blob 4, Dust Bunny 6, The Static 1 | 24 |

- A pick is `rngInt(rng, options)` on the setup rng, in order. Template 7: `a = rngInt(rng, 4)`, `b = rngInt(rng, 3)`, and `b >= a` means `b + 1`.
- Count at difficulty `d`: `ceil(count * CNT_PCT[d] / 100)`, `CNT_PCT = [90, 100, 110, 115, 120]` *balanced*; the Static and the Wyrm stay 1.
- Interval at `d`: `interval + [6, 3, 0, -2, -4][d-1]`.
- Spawn offsets: first enemy at 0, each next at `previous + interval` (a Dust Bunny: `previous + floor(interval / 2)`).
- Waves are generated in `initial` and stored in the state.

**Timing:** wave 1 starts at tick `[400, 340, 300, 300, 300][d-1]` (the build phase). When a wave is cleared and no later wave has started, the next one is scheduled `BREAK = [260, 230, 200, 200, 200][d-1]` ticks later (`waveAt`). A wave is **cleared** once started with nothing queued or alive; `cleared` counts them.

**callWave** is valid when a next wave exists and the queue is empty (overlap allowed); it starts that wave now (its first monster spawns on the next tick, so the gaps match a scheduled wave). `saved = waveAt - tick` when a start is scheduled, else `BREAK`. Then `glow += floor(saved / 10)`, `earlyTicks += saved`, `waveAt = -1`.

## 6. Economy

- Start glow: `[120, 110, 100, 95, 90][d-1]` (kept as first written).
- Trickle: `+1` glow every tick where `tick % 20 === 0`, until the end.
- Kill: `floor(glow * (100 + luckPct) / 100)`, doubled for wave-1 enemies.
- Place and upgrade are refused (state unchanged) when `glow < cost`, so glow is never negative. `glowEarned` sums income.

## 7. Haven, end and score

- `havenMax = HAVEN[d] + ceil(HAVEN[d] * defensePct / 100)`, `HAVEN = [20, 15, 10, 8, 6]`. Starts full.
- A leaking enemy is removed; `havenHp = max(0, havenHp - leak)`.
- **Revive:** when `havenHp` is 0 right after the leaks of a tick and `revivesLeft > 0`: `revivesLeft -= 1`, `havenHp = ceil(havenMax / 2)`.
- **Lost:** `havenHp === 0` at the end of a tick, after revives. Checked **before** won.
- **Won:** `cleared === total`.
- **Fled:** the `forfeit` action.
- **Guard:** at tick 18 000 the game ends, won if `havenHp > 0` (never expected; tested).
- After the end every action returns the same state.

**Score** (`clampScore`): won `400 + floor(400 * havenHp / havenMax) + min(200, floor(earlyTicks / 10))`; lost `floor(300 * cleared / total)`; fled `floor(200 * cleared / total)`.

**Outcome:** `log` in the state's locale: map line; `{name}'s {tower}: {kills} defeated.` for the top 4 members by `dealt`; a cheer per habit-less member; Haven line; result line. `troopsUsed`: members who placed a tower, party order. `stats`: `{ map, waves, cleared, haven, kills, leaks, glowEarned }`.

## 8. Engine interface

```ts
export type TowerKind = 'runner' | 'lantern' | 'sweeper' | 'chorus' | 'archivist' | 'lull' | 'hearth' | 'bubble';
export type MonsterId = 'clutter-blob' | 'dust-bunny' | 'procrastination-moth' | 'junk-food-imp' | 'fog-wraith'
  | 'couch-leech' | 'snooze-golem' | 'silence-specter' | 'doomscroll-wyrm' | 'the-static';
export interface Member { id: string; name: string; kind: TowerKind | null; power: number; kills: number; dealt: number; placed: boolean }
export interface Tower { pad: number; member: string; kind: TowerKind; level: 1 | 2 | 3; power: number; cd: number; invested: number; jamUntil: number }
export interface Enemy { id: number; kind: MonsterId; wave: number; hp: number; maxHp: number; pos: number; speed: number;
  armour: number; glow: number; leak: number; markUntil: number; markPct: number; knockUntil: number; pulseAt: number }
export interface Spawn { at: number; kind: MonsterId; wave: number }       // `at` is an absolute tick
export interface Shot { pad: number; x: number; y: number; kind: TowerKind } // fired this tick, for drawing
export interface FeedLine { seq: number; key: string; params: Record<string, string | number> }
export interface TDState {
  seed: number; locale: Locale; difficulty: 1 | 2 | 3 | 4 | 5; layout: 0 | 1 | 2; mirror: boolean;
  path: number[]; pads: number[]; members: Member[]; towers: Tower[];        // towers sorted by pad
  waves: Array<Array<{ offset: number; kind: MonsterId }>>; started: number; waveAt: number; // -1: none scheduled
  queue: Spawn[]; enemies: Enemy[]; nextId: number; tick: number; cleared: number; total: number;
  glow: number; glowEarned: number; havenHp: number; havenMax: number; revivesLeft: number; hintsLeft: number;
  attackPct: number; luckPct: number; timePct: number; earlyTicks: number; kills: number; leaks: number;
  speed: 1 | 2; shots: Shot[]; feed: FeedLine[]; feedSeq: number; result: 'won' | 'lost' | 'fled' | null;
}
export type TDAction =
  | { type: 'tick' } | { type: 'place'; pad: number; member: string; hinted?: boolean } | { type: 'upgrade'; pad: number }
  | { type: 'sell'; pad: number } | { type: 'callWave' } | { type: 'setSpeed'; speed: 1 | 2 } | { type: 'forfeit' };
```

`pad` is an index into `pads`. `setSpeed` only stores `speed` (the Screen dispatches `speed` ticks per step). `feed` keeps 6 lines. A `place` with `hinted: true` on the member's `bestPad` spends one hint (the Screen sets it only when it showed that star; the bot never does). Exported selectors: `towerStats(tower)`, `placeCost(member)`, `upgradeCost(tower)`, `refund(tower)`, `bestPad(state, memberId)`, `enemyPoint(state, enemy)`, `padCell(state, pad)`, `isOver(state)`.

**Tick order:** (1) `tick += 1`, `shots = []`; (2) start the scheduled wave when `tick === waveAt` (its spawns enter the queue at `tick + offset`; a called wave at `tick + 1 + offset`); (3) spawn due queue entries (cap); (4) move enemies with slow, leaks, then settle a Haven at 0: a revive, or the game is **lost** and the rest of the tick is skipped; (5) Static pulses; (6) towers act in pad order; (7) remove dead enemies (`hp <= 0`), pay glow, count kills; (8) trickle; (9) update `cleared`, schedule the next wave; (10) won, guard.

**`bestPad(state, memberId)`:** the free pad whose range covers the most path cell centres (Chorus: most adjacent damage towers; Hearth: lowest free pad); ties to the lowest pad.

## 9. Bot

`botPlay(state, rng)` returns `null` only when over; one action per call.

1. **Place** when a free pad exists and fewer than 7 towers stand. The desired kind is the first that applies: (a) no tower yet: the first present of Lantern, Bubble, Sweeper, Runner, Archivist; (b) Chorus present, none placed, and a free pad adjacent to 2 or more damage towers; (c) Lull present, none placed, `started >= 2`; (d) Hearth present, none placed, `havenHp < havenMax`; (e) Archivist present, none placed; (f) the present damage kind (Runner, Lantern, Sweeper, Bubble) with the fewest towers, ties in that order. Pad: `rng` picks among the pads tied with `bestPad`'s score. Place if affordable, else go to 3.
2. **Upgrade** when 7 towers stand or no pad is free: the cheapest affordable upgrade of a damage tower, ties to the lowest pad.
3. **callWave** when no enemy is alive, the queue is empty and 1 or 2 found nothing affordable.
4. Otherwise `tick`.

**Naive bot** (tests only): cycles the party's cards in order, places on the lowest free pad when affordable, never upgrades, never calls a wave.

## 10. Screen

- **Layout:** `h2` title; HUD text (wave n/total, Haven hp/max, glow; `data-testid="td-hud"`); board; tower cards; pad controls; game controls; feed. The canvas (`role="img"`, `aria-label` = cursor pad and key help) sits in a focusable wrapper (`tabIndex=0`, visible focus ring). Portrait: one column, canvas `width: 100%; aspect-ratio: 9 / 7`. `max-height: 500px`: two columns `minmax(0, 1.1fr) minmax(0, 1fr)`, canvas height capped at `calc(100dvh - 5rem)`. Cards `repeat(auto-fill, minmax(min(100%, 4.9rem), 1fr))` (4 on a phone, 3 in the landscape column), 2 columns under 360px. Every control is a `<button>`, at least 44x44 px.
- **Cards:** a button each (glyph, name, cost). A tap places it on the free cursor pad if affordable, else selects it (`aria-pressed`). Unaffordable: dimmed, not `disabled`; the feed says why.
- **Controls:** Previous pad, Next pad, Upgrade (cost), Sell (refund); Pause (`aria-pressed`), Speed x1/x2, Next wave (bonus), Give up (`forfeit`), Leave (`exit()`, own handler).
- **Keyboard** (on the game root, ignored in text fields): arrows move the cursor to the nearest pad strictly in that direction (smallest `10 * primary + secondary` distance, else stay); `1`-`8` = the n-th card; Enter or Space place the selected card on a free pad or upgrade an occupied one; `S` or Delete sell; Escape clears the selection; `P` pause; `N` next wave; `X` speed.
- **Touch and mouse:** a tap on the canvas moves the cursor to that pad.
- **Clock:** `useFixedStep(() => { for (let i = 0; i < state.speed; i++) dispatch({ type: 'tick' }) }, { running: outcome === null && !paused, onFrame })`. Place, upgrade and sell work while paused.
- **Feed:** `aria-live="polite"`, last 4 lines of `state.feed` plus Screen lines (paused, resumed, speed, not enough glow). Engine keys: `waveStart` "Wave {n} of {total}: {monsters}.", `bossArrives` "The Static crackles onto the path.", `waveCleared` "Wave {n} cleared. Next wave in {s} s.", `leak` "{monster} reached the Haven. Haven {hp} of {max}.", `jam` "The Static jams {name}'s {tower}.", `revive` "Second wind: the Haven stands again at {hp}.", `placed`, `upgraded`, `sold`, `won` "The Haven holds. All {total} waves cleared.", `lost` "The troops come home after wave {n}. The Haven stands, as it always does.", `fled` "The troops head home early."
- **Not colour alone:** a glyph and letter per tower (chevrons, rays, fan, notes, book, crescent, flame, rings); dashed path line; dotted pad rings; bracket cursor; hint star; ring on marked enemies, "z" on slowed ones, cross-hatch on jammed towers.
- **Rendering:** Canvas 2D via `useCanvas` (DPR capped at 3, resize). `cell = floor(min(w / 9, h / 7))`, board centred. Static layer drawn once per size into an offscreen canvas. Token colours read once. No allocation in the frame loop: iterate state arrays, one reusable `Map` of previous enemy positions rebuilt on state change, a pool of 32 particles. Enemies drawn at `prev + (cur - prev) * alpha`.
- **Reduced motion:** `alpha = 1`, no particles, shake or pulsing; enemies still step per tick.
- **Hint:** with `hintsLeft > 0`, tapping a card (or its key) only selects it and moves the cursor to its `bestPad`, which gets the star and is announced in text (feed, pad status, board label); a second tap or Enter places it, and a hint is spent only when the tower lands on the starred pad that was shown. With no hint left a card tap places at once on a free cursor pad.
- **Text mirrors the canvas:** the pad status says if the tower is jammed and shows the description of the selected card; a jammed tower cannot be sold (the feed says why).

## Party

Each habit adds its tower card: the starter party (Move, Outside, Clean) builds Runners, Lanterns and Sweepers. `power` adds `p` percent damage, `5p` u range, Chorus, mark, slow and Hearth strength, shorter intervals, and `floor(p / 5)` cost. A level 12 party (power 44) hits 1.44 times as hard and brings all eight specials. Habit-less members cheer in the log.

## Buffs

- `attack` (points): `+attackPct` percent on every hit.
- `defense` (points): `+ceil(HAVEN * pct / 100)` Haven HP.
- `time` (seconds): waves 1 and 2 move `min(40, s)` percent slower.
- `revive` (count): Haven back to half HP, once per count.
- `hint` (count): stars the best pad for the selected card (a tap selects and shows it, a second tap places); placing on the shown star uses one.
- `luck` (points): kill rewards `+luckPct` percent.

## 11. Test plan

`engine.test.ts` (25 or more), `contract.test.ts` (as copied), `Screen.test.tsx`, the e2e spec.

| Acceptance item | Tests |
| --- | --- |
| path following | maps have 8-12 pads touching a connected path; mirror is `x -> 8 - x`; speed `s` reaches the Haven in exactly `ceil(END / s)` ticks through every cell centre |
| each tower | Runner first target; Lantern ignores armour; Sweeper hits all in range; Chorus adjacent only, highest boost, gone on sell; Archivist mark extra damage until `markUntil`; Lull exact slow, cap 50, Specter immune, Static halved; Hearth +1 per interval, never above max; Bubble splash radius, knock-back once per 40 ticks, not the Static |
| power, levels | power scales damage, range, interval, cost; upgrade costs `cost` then `2 * cost`, stops at 3 |
| economy | refused without glow; sell 70 percent; trickle; luck and wave-1 double; glow never negative over 200 random-action games |
| waves from the seed | same seed same layout, mirror, waves, 5 seeds give 3+ different; counts, intervals, totals per difficulty; one Static, last |
| boss | pulse jams the nearest tower in 3000 u for 60 ticks every 100; immune to knock-back; leaks 5 |
| win and loss | won on the last clear; lost at 0, before won; revive half HP per count; forfeit fled; no change after the end; callWave bonus and refusal; tick guard |
| determinism | two bot games identical; JSON round trip mid-game continues identically; every state number is an integer |
| frame rate | ticks in batches of 1, 2, 5 give the same state; Screen (fake `requestAnimationFrame`): 1 s is 20 ticks at 30 and 60 fps, 40 at x2 |
| bot | wins 40-70 percent of seeds 1..100, difficulty 3, full party; terminates on every difficulty and fixture party |
| difficulty 1 | naive bot wins with the starter party on 45+ of seeds 1..50 |
| 60 fps, fit | at most 48 enemies alive, shots at most towers; Screen draws after a resize at DPR 2; e2e fit |

e2e, each under 20 s: loads, axe (shot `start`); keyboard place (arrow, `1`: glow drops, feed says placed) and `P` freezes the HUD (shot `play`); difficulty 1 by Bot play (shot `end`); same-seed replay; French; `expectResponsiveGame`.

## 12. Cut line

In order, only if time runs short: (1) level 3 upgrades (keep level 2), (2) Map 2, (3) speed x2, (4) sell. Never cut keyboard play, pause, the feed or reduced motion.

## 13. As built

- **Balance.** Damage grows with `(100 + p)` percent (power 44: 1.44). `HP_PCT = [220, 310, 410, 470, 520]` and `CNT_PCT = [90, 100, 110, 115, 120]` (no step above 1.45 times); start glow and the Static's 800 are as first written. Wins of the bot of section 9 (no buffs; "mid" is 8 members at power 20, `makeMember` level 6, loyalty 20):

| Difficulty | full party (power 44) | mid party (power 20) | starter party (power 8) |
| --- | --- | --- | --- |
| 1 | 30 of 30 | 30 of 30 | 30 of 30 |
| 2 | 30 of 30 | 20 of 30 | 24 of 30 |
| 3 | 16 of 30 (51 of 100) | 11 of 30 | 0 of 30 |
| 4 | 12 of 30 | 0 of 30 | 0 of 30 |
| 5 | 3 of 30 (5 of 50) | 0 of 30 | 0 of 30 |

  The naive player (cycle the cards, never upgrade, never call a wave) with the starter party wins 50 of 50 seeds on difficulty 1. Each of these is asserted in `engine.test.ts`: full d3 seeds 1..100 between 40 and 70; mid d3 seeds 1..30 at least 3; starter d2 seeds 1..30 from 18 to 29; naive d1 seeds 1..50 at least 45; full d5 seeds 1..50 at least 1.
- **Rules the spec left open:** towers skip a monster that is already down this tick; a kill goes to the member whose blow drops the monster; `cleared` is the oldest wave still queued or alive, minus one (so overlapping waves clear together); `glowEarned` includes the next-wave bonus; a Haven at 0 is settled right after the leaks (so a Hearth or a kill in the same tick cannot undo it); the bot builds its Archivist as the damage kind when the party has no Runner, Lantern, Sweeper or Bubble.
- **Feed:** the engine writes lines as a key plus parameters already in the player's language; a `waveDone` line says "Wave n cleared." when a later wave is already on its way.
- **Size:** about 46 KB of code (manifest, engine, strings, Screen, drawing, CSS) before gzip.
- **Screenshots:** `docs/games/img/tower-defense-start.png`, `-play.png`, `-end.png`.
