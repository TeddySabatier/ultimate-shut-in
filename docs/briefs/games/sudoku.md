# Game: Sudoku (`sudoku`)

| | |
| --- | --- |
| Category | `puzzle` |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Estimated minutes | 5 |
| Priority | 4 |

## Idea

The classic number-place puzzle with a **generator that guarantees a unique solution** and an honest difficulty grading, seeded so a seed always gives the same puzzle. Small boards for the early game, the full board later.

## Rules

- **Sizes by difficulty:** 1 and 2 use a 6x6 grid (2x3 boxes), 3 uses 9x9 easy, 4 uses 9x9 medium, 5 uses 9x9 hard. `estMinutes` is 5; a player can leave with a partial score.
- **Generator:** build a full valid grid from the seed (seeded randomised backtracking, no `Math.random`), then remove clues in a seeded order while a solver confirms the puzzle keeps exactly **one** solution (count up to two). Grade the puzzle by the **hardest technique the solver needs**: easy = naked singles only, medium = plus hidden singles and pairs, hard = needs deeper logic or limited guessing. The target clue ranges are documented; a puzzle whose grade is lower than requested is regenerated from the next derived seed (bounded attempts).
- **Play:** select a cell, enter a digit, toggle pencil notes, erase, undo and redo (unlimited), highlight same digits, optional conflict highlight (default on at difficulty 1 to 3, off above), a number pad on touch, full keyboard (arrows, 1 to 9, N notes, Backspace, Ctrl+Z, Ctrl+Y, H hint).
- **Hints:** `hint` buff and the Study troop give hints: a hint explains the technique ("this cell is the only place for a 7 in its row") and fills or highlights the cell; every hint lowers the score a little.
- Win when the grid is complete and correct. `result`: won on completion, lost never (a player cannot lose; leaving early is `fled` with a partial score), so the game is relaxing; the **`time` buff** extends the "par time" used for the speed bonus, and a mistake counter feeds the score. Score 0 to 1000 from speed against par, mistakes and hints.
- `learned` optional: the technique used most (en and fr), one sentence.

## Engine

Pure functions: `generate(seed, size, grade)`, `solve(grid)` with technique tracing, `countSolutions(grid, limit)`, `reduce` for play actions (including notes and undo history as part of the state). `botPlay` fills the grid with the solver's technique order, so it always finishes and always replays identically. Performance: generation under 150 ms on a mid-range phone for the 9x9 hard case (assert a bound on operation counts in tests, not wall-clock).

## Party and buffs

Study: free first hint; Sleep: adds par time; Clean: auto-removes impossible pencil notes (a toggle); Social: shows how many cells remain per digit. Declare `attack`, `defense`, `revive` ignored; `luck` regenerates once to an easier-feeling puzzle.

## Acceptance

- Unit tests: 200 seeds per size and grade produce a uniquely solvable puzzle (asserted), the grade is at least the requested one, the solution is valid, a generated puzzle is never already solved, undo and redo are exact, conflict detection is exact, determinism, the bot solves all of them.
- Responsive: the 9x9 grid and the number pad fit at 320x568 with 44px minimum targets (the pad may be a single row) and in landscape 844x390 (grid left, pad right). Accessible: each cell has an `aria-label` ("row 3, column 5, 7, given" or "empty, notes 1 4"), roving focus, live announcements for conflicts and completion.
- `docs/games/sudoku.md` documents the grading table and the clue ranges.

## Cut line

The technique-explaining hints (keep plain hints), then medium-versus-hard grading (keep clue-count based), then auto-remove notes.
