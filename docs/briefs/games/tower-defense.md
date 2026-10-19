# Game: Hold the Haven (`tower-defense`)

| | |
| --- | --- |
| Category | `defense` |
| Minimum ring | 2 |
| Roster | 3 to 8 |
| Estimated minutes | 5 |
| Priority | 3 (trending: keep) |

## Idea

A tower defense on a short winding path. **The troops are the towers**: each habit gives a differently behaving tower, so a varied party plays differently. Monsters (the wave monsters) walk to the Haven; if enough reach it, the run is lost.

## Rules

- **Map:** a path across a grid with 8 to 12 build pads, three seeded layouts (the seed picks and mirrors one). The Haven has HP (10 at difficulty 3). Eight waves (fewer on low difficulty) ending with the Static as a boss.
- **Towers, one per habit, available only if that troop is in the party:** Move (Runner: fast, weak, short range), Outside (Lantern: long range, slow), Clean (Sweeper: short-range area damage), Social (Chorus: boosts the damage of adjacent towers), Study (Archivist: marks an enemy so it takes extra damage from everything), Sleep (Lull: slows enemies in range), Eat (Hearth: repairs the Haven slowly), Hygiene (Bubble: splash and a small knock-back). Damage, range and cost scale with the troop's `power`. Each tower can be upgraded twice.
- **Economy:** the player earns "glow" from kills and a trickle over time and spends it to place and upgrade towers. A tower that is sold returns 70 percent. Wave 1 is generous so a first-time player is never stuck.
- **Real time, deterministic:** the engine advances in fixed 50 ms steps (`tick` action), no wall-clock reads, so replays are exact. The screen runs the steps from `requestAnimationFrame` with an accumulator; controls: pause, speed x1 and x2, "send next wave early" for a bonus. Pausing is allowed at any time and placing while paused is allowed.
- `result`: won when the last wave is cleared, lost when the Haven reaches 0, fled on exit. Score 0 to 1000 from Haven HP left, waves cleared, speed bonus. Buffs: `attack` +damage, `defense` +Haven HP, `time` slows the first two waves, `revive` restores the Haven once, `hint` highlights the best pad for the selected tower, `luck` improves kill rewards.

## Interface

Canvas or SVG rendering, sprites drawn in code, the path and pads clearly visible with patterns and icons (not colour alone). **Keyboard play:** arrows move a pad cursor, number keys pick a tower, Enter places or upgrades, Escape cancels, P pauses. Touch: tap a pad, tap a tower card. A text feed (`aria-live`, polite) announces waves, losses and wins. Reduced motion: no screen shake, no particles, enemy movement still visible.

## Engine

Pure: `initial(seed, party, run)`, `reduce(state, action)` with `tick`, `place`, `upgrade`, `sell`, `callWave`, `setSpeed`. Integer maths for positions (fixed-point), no floating drift. `botPlay` places towers by a simple priority and calls waves when idle.

## Acceptance

- Unit tests: path following exactness, each tower's behaviour (slow, splash, mark, boost adjacency, repair), economy accounting (never negative), wave generation from the seed, boss behaviour, win and loss conditions, determinism over a full game, `tick` count independence from frame rate.
- The bot wins 40 to 70 percent on difficulty 3 across 100 seeds and always terminates; difficulty 1 is winnable with the starter party by a naive strategy (assert with a naive bot).
- 60 fps target on a mid-range phone (cap entities, reuse objects, no per-frame allocations in the hot loop); the canvas handles resize and device pixel ratio; fits 320x568 and 844x390.
- `docs/games/tower-defense.md` has the tower table and the wave table.

## Cut line

Tower upgrades (keep one level), then the third map, then speed x2, then sell. Never cut keyboard play or pause.
