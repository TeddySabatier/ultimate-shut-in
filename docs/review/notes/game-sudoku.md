# Notes: Sudoku (`game-sudoku`)

Work in progress: filled in as the build goes. The final version records the decision on the Cursor build, what was kept, what was cut and what is needed from files this brief does not own.

## Decision on the earlier Cursor build

`origin/feat/game-sudoku` (5 commits) and `origin/cursor/sudoku-game-1aa5` were read first. The first was adopted into the worktree and run (`git checkout origin/feat/game-sudoku -- src/games/sudoku`): its own 43 tests and the contract kit passed. It was then **not kept**, for these reasons found by reading the code against the brief:

- The manifest renamed the game "Quiet Lattice"; the brief and the PR title say Sudoku.
- The grade was relabelled when the generator fell short ("keep uniqueness, label at least the requested grade"), so a puzzle marked hard could be one that needs nothing beyond singles. The brief wants the grade to be the hardest technique the solver needs, and a puzzle below the request to be regenerated.
- Hard was "needs a guess after singles and pairs" only, with no locked-candidates step; "hard" 6x6 and 9x9 boards were removed to a fixed target clue count.
- No `check` action, no `erase` action (a write of 0 stood for it), notes mixed with selection in the engine state, history of whole-state copies including text messages.
- Cells were `role="gridcell"` divs with a custom fill; no row, column and box announcement beyond the generic label.

Nothing of it is copied; the new files were written from the brief. The two Cursor branches should be closed by the maintainer after this PR merges.
