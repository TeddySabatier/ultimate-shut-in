# Haven Rush (`gate-runner`)

A lane-runner with maths gates. The squad runs forward on its own; you steer left or right into the better operation, shoot crowds and walls, and bring a boss down before it reaches you. About two minutes. Original rules, art and copy.

| Field | Value |
| --- | --- |
| Category | arcade |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Length | about 2 minutes |

## How to play

The lane is split in two halves. Gates arrive in pairs, one operation per half (`x2`, `+10`, `-5`, `÷2`, plus rarer `x3` and `+25`). Passing a gate applies that operation to the squad count (the squad's health and its damage). Integer divide rounds down and stays at least 1 while anyone remains; subtract is the only op that can drop the squad to 0.

Crowds and walls sit on a half or in the centre. Shooting peels them while they are in range; on contact each remaining hit point costs one member. Pickups in the centre add members or a five-second fire-rate boost. At the end a boss with a seeded HP bar walks toward the squad; you win if it falls first, lose if the squad reaches 0, and flee if you forfeit.

Touch: hold the left or right half of the lane, or the Left / Right buttons. Keyboard: arrows or A and D. **Pause** stops the clock. **Slow lane** halves speed (accessibility; does not stack with the `time` buff). **Forfeit** ends as `fled` and keeps the lane on screen; **Leave** is a separate button.

Reduced motion: no camera shake, no particle bursts, no dashed-line animation. The lane still scrolls (that is the game) and interpolation is skipped.

Score: 0 to 1000 from members left, remaining boss distance and pickups taken. A loss still scores a little for distance travelled. A forfeit scores less. A failed run is "the troops come home", never a punishment.

## Gate probabilities

The generator draws each non-trap, non-Social op with these weights (out of 100):

| Op | Weight |
| --- | --- |
| `x2` | 28 |
| `+10` | 24 |
| `-5` | 12 |
| `÷2` | 12 |
| `x3` | 12 |
| `+25` | 12 |

Difficulty 1–2 has four pairs; difficulty 3–5 has five. A Social vassal prepends a free `+3` / `+3` pair.

## Fairness margins

Every seed is proven winnable: the solver enumerates every left/right path with perfect steering, measures the damage that path would deal to the boss, and sets boss HP so the **best** path beats it with a margin that shrinks with difficulty.

| Difficulty | Margin |
| --- | --- |
| 1 | 40% |
| 2 | 32% |
| 3 | 23% |
| 4 | 14% |
| 5 | 5% |

`margin = 40 - floor(35 × (d − 1) / 4)`. On difficulty 3–5 the generator also requires that the greedy "always take the larger immediate result" path is **not** optimal: a tempting `x3` or `+25` sits in front of a heavy side wall, so the modest `+10` is the real line. Tested over 300 seeds.

## Party

Starting squad is 5 plus the number of members, plus `floor(total power / 40)`, then grown by the `defense` buff. A level-12 full party is visibly larger than three level-1 starters.

- **Move**: faster steering (a wider correction window).
- **Social**: a free `+3` gate pair at the start.
- **Study**: the next two pairs show their results (`x2 → 16`) on the HUD.
- **Eat**: a one-time shield that absorbs 5 losses.

Titles are not used. Playable with `parties.starter`.

## Buffs

- `attack`: percentage more damage per shot.
- `defense`: percentage more starting members.
- `time`: halves lane speed for that many seconds at the start (does not stack with Slow lane).
- `hint`: a faint arrow toward the better next gate, for that many pairs.
- `revive`: once, five members return when the squad would hit 0.
- `luck`: more centre pickups, and extra members on them.

## Determinism

The level comes from `mulberry32(fnv1a('gate-runner:<seed>'))`. Time is a count of 50 ms ticks. The same seed, party and run always give the same lane. The locale changes only the language of the log.

## Bot

`botPlay` follows the solver's best remaining path, with a seeded error rate by difficulty (about 26% wrong gates at difficulty 3). It wins about 60 percent of those runs with the full party.

## Screenshots

Written by `e2e/games/gate-runner.spec.ts` (`shootGame`, mobile project).

| Start | Play | End |
| --- | --- | --- |
| ![Haven Rush at the start](img/gate-runner-start.png) | ![Haven Rush in play](img/gate-runner-play.png) | ![Haven Rush at the end](img/gate-runner-end.png) |
