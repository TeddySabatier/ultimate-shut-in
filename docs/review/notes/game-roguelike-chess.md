# Notes: Roguelike Chess (`game-roguelike-chess`)

## Decision on the Cursor build

An earlier Cursor build sits on `origin/feat/game-roguelike-chess` (no PR, never reviewed). It was evaluated read-only, then its `src/games/roguelike-chess` folder was adopted into this branch with `git checkout origin/feat/game-roguelike-chess -- src/games/roguelike-chess` (never merged). Adoption test: `npx vitest run src/games` passed for this game (contract kit, lint, budget, 39 engine tests); the only failures in the run were the missing docs and e2e files (not adopted yet) and two timeouts in other games under load. The engine matched the brief's structure (habit-to-piece map, capture rule, 10 monsters, 12 upgrades, eight passives, three rooms, turn cap, score, forfeit).

The maintainer should close `origin/feat/game-roguelike-chess` after this PR merges.

Work in progress: this file is completed at the end of the build.
