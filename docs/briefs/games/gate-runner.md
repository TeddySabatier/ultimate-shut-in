# Game: Haven Rush (`gate-runner`)

| | |
| --- | --- |
| Category | `arcade` |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Estimated minutes | 2 |
| Priority | 2 (trending: keep) |

## Idea

The popular lane-runner with maths gates, made fair and original. A **squad** runs forward automatically and shoots. The lane is split in two halves; ahead are **gates** with operations (`x2`, `+10`, `-5`, `÷2`, and a few `x3`, `+25`). The player steers left or right to pick the better gate. The squad's size is its health and its damage. Enemy crowds and walls cost squad members; at the end a **boss** with a big HP bar must be shot down before it reaches the squad.

## Rules

- **Lane:** automatic forward motion at a fixed speed. Steer left and right: drag or tap-and-hold on touch, arrow keys or A and D on keyboard, optional tilt is out of scope. The squad is drawn as a small crowd (cap the drawn sprites at 40 and show the true number in a big counter).
- **Gates** come in pairs, one per half of the lane. Applying an operation changes the squad count: multiply, add, subtract, integer-divide (round down, minimum 1 while any member remains; a gate that would drop below 1 kills the squad at 0 only for subtract). Show the result of the maths briefly on the squad.
- **Enemies:** groups with a visible number that fight on contact (each enemy removes one squad member and dies), shooting also removes enemies in range at a fixed rate; walls with a number must be shot down; pickups (a few extra members, a fire-rate boost for 5 seconds). The **boss** has HP = a level-seeded number; shooting rate scales with the squad count.
- **Fair level generation (the heart of this brief):** levels come from the seed with `run.difficulty`. The generator must **prove every level is winnable**: simulate the best path through the gates with the solver and require the best path to beat the boss with a margin that shrinks with difficulty (a 40 percent margin at 1, 5 percent at 5). Also require that the greedy "always take the larger result" path is *not* always optimal on difficulty 3 to 5 (a tempting-but-bad gate exists), so there is a decision, not just a reflex. Test both properties over 300 seeds.
- `result`: won when the boss dies, lost when the squad reaches 0, fled on exit. Score 0 to 1000 from squad members left, boss time and pickups. Buffs: `attack` more damage, `defense` start squad +, `time` slows the lane for the first seconds, `hint` shows a faint arrow toward the better gate for the next pair, `revive` brings back 5 members once, `luck` biases pickups.
- Reduced motion: no camera shake, no big particle bursts; counters and the lane still move (the game is about moving), plus a "slow lane" accessibility toggle that halves the speed.

## Engine

Pure, fixed 50 ms `tick` (`FIXED_DT_MS`, interpolate positions in the Screen with `onFrame(alpha)` so 60 fps looks smooth), integer positions, no `Math.random`. State: squad count, lane x, position along the level, enemies, gates, boss HP, time. `botPlay` follows the solver's best path, with a seeded error rate by difficulty. The solver and the generator live in `engine.ts` or a sibling file and are unit-tested.

## Party and buffs

The starting squad is 5 plus the number of party members. Move increases lane speed control precision (a wider steering window), Social adds a free `+3` gate once, Study shows the gate results of the next two pairs, Eat adds a one-time shield that absorbs 5 losses. Declare `luck`/`revive` handling per the list above.

## Acceptance

- Unit tests: every gate operation exactly (including divide rounding and the subtract floor), collisions and shooting rates, boss HP scaling, the fairness properties over 300 seeds (each level winnable, tempting-but-bad gates on difficulty 3 to 5), determinism over a full run, the bot wins about 60 percent on difficulty 3.
- Canvas sized to its container with device pixel ratio, 60 fps target with the cap on drawn sprites; fits 320x568 portrait (the natural orientation) and 844x390 landscape; touch controls 44px or larger; pause on tab hidden; keyboard play.
- `docs/games/gate-runner.md` has the gate probabilities and the fairness margins.

## Cut line

Pickups, then the `x3` and `+25` gates, then the fire-rate boost, then the slow-lane toggle (keep pause). Never cut the fairness proof.
