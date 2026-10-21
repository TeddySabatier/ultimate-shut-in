# Notes: Sudoku (`game-sudoku`)

PR #34 (draft until every acceptance item passed), base `integration/arena`. This file records the decision on the earlier Cursor build, the design decisions, what was cut and what is needed from files this brief does not own.

## Decision on the earlier Cursor build

`origin/feat/game-sudoku` (5 commits, 8 files, no PR) and `origin/cursor/sudoku-game-1aa5` were read first, read-only. The first was then adopted into the worktree on trial (`git checkout origin/feat/game-sudoku -- src/games/sudoku`) and run: its own 43 tests and the contract kit passed. It was **not kept**, because reading it against the brief found:

- The manifest renamed the game "Quiet Lattice"; the brief and the PR title say Sudoku.
- The grade was relabelled when the generator fell short ("keep uniqueness, label at least the requested grade"), so a puzzle marked hard could be one that needs nothing beyond singles. The brief wants the grade to be the hardest technique the solver needs and a puzzle below the request to be regenerated.
- "Hard" was only "singles and pairs are not enough" (no locked candidates), and every board was carved to a fixed clue count.
- No `check` action and no `erase` action (a write of 0 stood for it); the selected cell and the notes switch lived in the engine state; undo history kept whole-state copies including message text.
- Cells were plain divs with a custom label and no real roving focus contract.
- Its e2e used a workaround for a Lab limitation instead of the required three tests.

**Kept from it: nothing, no file and no line.** The new files were written from the brief (`grid.ts`, `logic.ts`, `generator.ts`, `engine.ts`, `messages.ts`, `strings.ts`, `manifest.ts`, `Screen.tsx`, `Screen.module.css`, tests). The adoption was reverted before the first commit, so the branch history does not contain the Cursor files.

**Maintainer, after this PR merges:** close `origin/feat/game-sudoku` and `origin/cursor/sudoku-game-1aa5` (delete the branches); they are superseded.

## Decisions

- **Name.** "Sudoku" in both languages, as the brief and the PR title say. The word is generic for the puzzle; there is no copied art, text or level.
- **Cells are ARIA grid cells, not `<button>`s.** Nine 44 px columns need 396 px; the screen is 320 px (the frame leaves about 250 px for the board, so cells are about 28 px). The grid is `role="grid"` / `row` / `gridcell` with `aria-rowindex`, `aria-colindex`, a name "Row 3, column 5, box 2: 7, given", a roving tab stop and arrow, Home and End keys. Everything else (pad, tools, switches, Stop, Leave) is a real button of at least 44 px, and the 6x6 board has cells of about 42 px. The Lab's responsive helper checks `button, a, input, select`, so it does not count grid cells; the limit is written in `docs/games/sudoku.md` under "Known limits".
- **Grades from a technique ladder** (naked single, hidden single, naked pair, locked candidates, guess), easiest first, so the grade is what the puzzle needs. Difficulty 1 and 2 are 6x6 easy and medium; 3 to 5 are 9x9 easy, medium and hard. A 6x6 board is too small for most puzzles to need locked candidates, so 6x6 hard is not offered by the game; `generate` takes it as best effort and returns the true grade (never a relabelled one).
- **Easy tiers stop at a clue floor** (14 on 6x6, 34 on 9x9) so they stay gentle; medium and hard carve as far as their ceilings and floors allow. Numbers are in the doc.
- **No selection in the engine.** Selecting a cell, the notes switch and the conflict highlight are display state in the Screen; the engine's actions carry the cell. Undo and redo restore digits and notes; slips, hints and checks that were counted stay counted.
- **Hints.** Fill the next ladder step and name the technique; if a typed digit is wrong, the hint points at it instead. The first free hints (Study, hint buff) cost 5 points, others 20. At a "guess" step the hint says plainly that nothing simpler is left.
- **Luck** reveals `min(4, 1 + floor(amount / 10))` more digits (the ones the ladder struggles with first) rather than regenerating from another seed: same solution, unique, easier-feeling, and the shown grade is recomputed.
- **Bot** is timed (85 percent of the base par over a grid) so party and buffs change its score; it wins every game (you cannot lose, so the brief's "40 to 70 percent" does not apply).
- **Extras beyond the brief's list**, all small: Hygiene makes the first check free; the pad shows digit counts with Social; Pause hides the board; Shift plus a digit writes a note; pressing a cell's own digit again erases it.
- **Notes font** is 9 to 11 px on 9x9 at 320 px (container-relative), the smallest that still fits three columns; the rest of the text is 14 px or more.

## What was cut

Nothing from the brief's cut line: the technique-explaining hints, medium-versus-hard grading and auto-remove notes are all in. Not built (not in the brief): X-wing and chain techniques, a daily puzzle, hints that highlight instead of filling.

## Files needed but not owned

- `src/games/testing/` and `lab/`: none needed. `expectResponsiveGame` only measures `button, a, input, select`; grid cells are outside it by design (see above). If the maintainer wants cells measured too, a 28 px cell on 9x9 would fail at 320 px by design.
- `docs/design/games/CONTRACT.md` section 5.5 asks the Leave button to call `exit()` from a separate press: done (`Stop here` dispatches `forfeit`, `Leave` is a separate button).

## Open questions for the reviewer

- Whether 9x9 on a 320 px phone should be allowed to scroll the board sideways to get 44 px cells. It was not done: a board that scrolls sideways is worse than small cells with a roomy pad.
