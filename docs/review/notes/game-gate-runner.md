# Notes: game-gate-runner (Haven Rush)

Nobody answers while this runs, so every decision below was taken alone. The brief calls the game Haven Rush; the id is `gate-runner` and the manifest keeps the brief's name (the PR title says "Gate Runner" as asked).

## The earlier Cursor build: evaluated, adopted as a base, then reworked

`origin/feat/game-gate-runner` (2 commits, 14 files, no PR, never reviewed) was read first and, as the instructions allowed, its files were adopted with `git checkout origin/feat/game-gate-runner -- ...` (never merged). Result of the evaluation:

- **Passed as it stood:** `npx vitest run src/games` was green for its files (contract kit 10/10, lint, budget, its 42 tests). The decision to adopt it as the starting commit (`ad62778`) was taken on that basis.
- **But it did not match the brief's spirit.** A full run lasted about 14 seconds (the boss fight was 4 or 5 shots), the boss hit points came from a game in which the party and the buffs were folded into the proof (so a stronger party or an `attack` buff just made a bigger boss: the party and buffs did not matter), the "tempting" gates were walls placed between gates that a player could dodge by switching half, the solver cloned the whole state every tick with 64 paths of full simulations, and the Screen read the colour tokens with `getComputedStyle` about 30 times per frame, drew flat rectangles and had no interpolation between ticks.
- **Kept:** the six operations and their weights as a starting point, the idea of the party mapping (start squad from members and power, Social gate, Study preview, Eat shield, Move steering), the `outcomeLog` shape, the score idea, the e2e and doc outline.
- **Rewritten:** `engine.ts` (now `rules.ts`, `level.ts`, `engine.ts`), `strings.ts`, `Screen.tsx`, `Screen.module.css`, a new `draw.ts`, all tests, the e2e spec and the doc. The git history keeps the adopted commit, so the old files are readable at `ad62778`.
- **The Cursor branch `feat/game-gate-runner` should be closed by the maintainer after this PR merges** (nothing here deletes or touches it).

## Design decisions

1. **Side intent, not a held key.** The player asks for a half (`side` action: arrows, A and D, two buttons, tap or drag on the lane) and the squad slides there. The only moment the half matters is a gate line, so the proof can be exact.
2. **One rule set for the live game and the proof.** `rules.ts` has a single `tickMut`; the engine clones the state and ticks, the solver clones once per branch and ticks in place. A level of 8 pairs is solved in about 2 ms.
3. **The proof is for the weakest legal squad (6, no perk, no buff)** and the layout never depends on the party or the buffs. Following the same path with a bigger squad can only deal more damage (tested), so every party and every buff makes the same proven level easier and the score higher. This is how "party and buffs matter" stays visible: the first brief draft would have rescaled the boss to the party.
4. **Guards on the gate line.** A wall or crowd on a gate's half is met in the same tick, after the gate. That keeps the tempting gate (`x3` in front of a wall) exact for the solver and impossible to dodge by switching half after the gate.
5. **Fairness rules beyond the brief's.** Difficulty 1 and 2 also require that the greedy path wins (gentle: the larger number wins); difficulty 3 that greedy deals at most 90% of the best; difficulty 4 and 5 that greedy loses. The brief only asked for "greedy is not always optimal on 3 to 5", which holds for all 300 seeds of each.
6. **Boss walk.** 7 seconds of boss at a fixed damage per member, so the boss number is "big" (thousands) and the margins are resolvable down to 5% without integer granularity trouble.
7. **`time` buff and the slow-lane toggle** both halve the lane speed and do not stack; neither slows the boss. `revive` is a count (each one brings 5 members), `hint` a count of gate pairs, as CONTRACT section 7 says.
8. **Hint arrow = live solver** from the squad as it is, once per gate pair (a few milliseconds), so it follows the player's mistakes. The bot uses the stored proof path instead (cheap, per tick).
9. **Reduced motion:** no shake, no bullets, no moving popups; the lane scrolls (essential) and ticks are drawn as they are, with no interpolation.
10. **Name:** `Haven Rush` / `Ruée du Haven` (brief), id `gate-runner`.

## Verification notes

- Playwright specs were run under the shared lock (`mkdir C:/Users/Lenovo/Storage/Work/.e2e-lock`), 2 workers, one spec only.
- The e2e uses Playwright's fake clock (`page.clock`) to fast-forward a real run; the Lab's `Bot play` covers the outcome and replay tests.
- `docs/games/img/gate-runner-*.png`: three screenshots, written by `shootGame`.

## Files outside my list

None. Nothing needed from a file I do not own. One observation for the maintainer: `.pad .btn`-style selectors in a CSS module silently miss the global `.btn` class (CSS modules hash it); `:global(.btn)` is needed. The Hold the Haven module uses `.padBar .btn` and `.controls .btn` for `min-width: 0` and would not match either (cosmetic: the buttons still fit).
