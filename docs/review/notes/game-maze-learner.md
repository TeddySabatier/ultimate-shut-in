# Notes: Maze Learner (`game-maze-learner`)

Decisions taken unattended. Nothing here needs a shared-file edit.

## Decision on the earlier Cursor build

An unreviewed build sits on `origin/feat/game-maze-learner` (2 commits, 14 files, no PR, never run by anyone). It was evaluated read-only (`git diff --stat`, `git show`), then tried: its `src/games/maze-learner` folder was checked out into this branch with `git checkout origin/feat/game-maze-learner -- src/games/maze-learner` (the branch itself was never merged). `npx vitest run` of the game, the contract kit, `lint.test.ts`, `budget.test.ts` and the registry test passed except the two files that build did not provide here (the docs page and the e2e spec, which are mine to write). So it was technically adoptable.

**It was not adopted. Nothing of it was kept verbatim**; the folder was removed again before the first commit and the game was built from the brief. Why, after reading the engine and the Screen against the brief's rules and learning goals:

- **The player did not write the reward.** The exit paid +50 whatever the player did, and the near, far and bonus exits had fixed values too, so cheese and puddle marks were mostly decoration; lesson 1 even pre-placed the cheese. The brief's idea is "you write what the creature feels", and its lesson 5 ("if the player rewards the bonus, the creature loops") only works if the exit is as silent as any other tile until the player rewards it.
- **No seeded maze generation:** ten hand-drawn 5x5 to 7x5 mazes, two per lesson, chosen by the seed. The brief allows grids up to 8x8 and the task asks for solvability across seeds.
- **No visible learning in time.** `train` ran 10 or 20 episodes in one dispatch; the Screen showed only the last tile of the last route. The brief asks for training in bounded chunks per animation frame so the player can watch the arrows form.
- **Weak pass rules:** lesson 1 passed if the greedy walk reached the exit *or* 50 percent of episodes did; no arrow check elsewhere.
- Its balance had never been measured (no bot statistics) and lessons 3 and 4 were not tuned against the brief ("too sparse to learn within the budget").

Ideas that match mine and were therefore not new: five lessons as in the brief, a once-per-episode crumb rule, a respawning bonus tile, Study and Social perks, `time` as extra episodes, `hint` as highlighted tiles. They were re-derived from the brief, not copied.

The maintainer should **close `origin/feat/game-maze-learner` after this PR merges** (it is superseded; it was never a PR).

## Design decisions

- **Tabular Q-learning in thousandths.** Values, alpha, epsilon and the discount are integers; the update never stalls one thousandth short of its target (without that, a faint positive residue after an erased reward kept the creature in a loop: found by the lesson 5 "fix it" test).
- **The exit is silent until rewarded.** Exits pay what the player writes (cheese +10, puddle -10). Lesson 3's two exits are fixed on purpose (small +4 near, big +30 far); lesson 5 opens with the bonus tile and the exit both already rewarded (the "first draft" that hacks).
- **Passing needs the arrows, not only luck.** The success window must be met *and* following the learned arrows from home must lead to the lesson's goal (the far cheese in lesson 3, dry floor in lesson 2, no crumbs in lesson 4). The first build of the check read the Q-table from before the training call; the 100-seed lesson 4 test caught it.
- **Lesson 4 needs a dense trail.** Crumbs are eaten once per episode while the creature only knows its tile, so a sparse trail leaves stale pull-back values; measured: a crumb on every other tile works for a trained party, a trail with a gap of three does not. The doc says so. The corridor has no side pockets (an early version had pockets that were really shortcuts).
- **Lesson 5's bonus tile is a dead-end pocket beside home.** A bonus tile that sits on the way out is not a hack (the creature can collect it once and leave); a pocket is.
- **Forget keeps your rewards.** A first version also restored the lesson's rewards; that undid the player's fix in lesson 5.
- **Party:** power sets alpha (`320 + 2 x average power`), two episodes per member, Move +30 alpha and double playback, Study the Visits overlay (Values on from the start), Social a friend learner in lesson 3, Sleep a replay of each episode (about half the episodes). Buffs: `time` (+1 episode per 2 s), `hint` (highlighted tiles), `luck` (first three episodes of a try lean toward a goal); `attack`, `defense` and `revive` ignored (no fighting).
- **Balance** (bot, seeds 1 to 100, full party): d1 99%, d2 97%, d3 63%, d4 57%, d5 17%; first-time party (starter) at d1 62%. The bot is unadaptive on purpose; a human adapts.
- **Difficulty** changes the budget of each lesson, the maze sizes and, from 4, adds slip (random steps, 5% and 10%).

## Cut line

Nothing was cut: all five lessons, the party overlays (Values, Visits) and the second learner (the Social friend) are in. Not built: a dedicated D-pad (the tiles are tappable and keyboard-operable, and Shift+arrow paints), a heat map of the friend, sound.

## Files not owned

None needed. `src/games/maze-learner/**` (a `maze.ts` and a `Glyphs.tsx` next to the usual files), its e2e spec, its doc, three screenshots and this notes file.

## Observations about shared code (not edited)

- `docs/design/games/CONTRACT.md` says `rosterSize.min` is at most 3; this game uses 1 (a lone vassal plays), which the kit accepts.
- The Games Lab's Bot play plays from the initial state and shows only the outcome, so a screenshot of a late lesson has to be reached by hand through the UI.
