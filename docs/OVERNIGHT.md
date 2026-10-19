# Overnight program: the Arena and eleven mini games

One night, many Cursor cloud agents, one branch. In the morning `integration/arena` should hold the Arena and the mini games, each with tests, all merged by CI-green automation, and **`main` untouched**. A person (and Claude) reviews the whole branch before it goes to `main`.

## What to expect

- **Realistic outcome:** most or all of the eleven games present, playable from the Games Lab, each with passing tests and its own docs. Some will be rougher than others. Anything that did not finish is a draft PR you can see in the morning, never a broken `main`.
- **Not independently reviewed yet.** Overnight, a PR merges into `integration/arena` after green CI only. The independent review (the same kind that found real defects in every earlier PR) happens in the morning, on the integration branch, before it merges to `main`. Plan one to two hours for that pass.
- **It costs money.** Cursor bills cloud agents at API pricing for the model chosen. Twelve long runs add up. Set a spend limit when Cursor asks for it, and use the priority order below if you want to start fewer agents.

## How it is wired

| Piece | What it does |
| --- | --- |
| `integration/arena` | The branch every overnight agent starts from and opens its PR against. `main` is never a target. |
| Games foundation (merged) | The plug-in contract (`src/games/contract.ts`), the registry that discovers `src/games/*/manifest.ts` with **no shared edits**, the Games Lab at `#/lab`, and the contract test kit. Eleven agents can work at once without touching the same file. |
| Auto-merge workflow | `.github/workflows/integration-automerge.yml`: a PR whose base is an `integration/*` branch merges itself when it is ready (not a draft), mergeable, and all four CI jobs are green. A stacked PR is retargeted when its parent merges. Tested end to end on a throwaway branch. |
| The Arena agent | Builds the economy, the run loop and the screens that host the games, in two stacked PRs. |
| Eleven game agents | One game each, in `src/games/<id>/`, with its own tests, e2e spec and docs. |

**Stop switch.** To stop all merging at any time:

```bash
gh variable set INTEGRATION_AUTOMERGE --body off --repo TeddySabatier/ultimate-shut-in
```

(`--body on` or deleting the variable turns it back on.) A label `hold` on a single PR skips just that PR.

## Before you go to bed

1. Cursor is connected to `TeddySabatier/ultimate-shut-in` with read and write access, and a spend limit is set.
2. `integration/arena` exists on GitHub and the foundation is merged to `main` (the maintainer checks this before handing over; see "Status" below).
3. Start the agents in the table below, **all with starting branch `integration/arena`**. The Arena agent and the eleven game agents are independent, so start them together.
4. Optional, independent of this program: agents E, J, K, L from `docs/PARALLEL-WORK.md` can start too, with starting branch `main`. They open PRs to `main` that wait for your review; they do not touch the games.
5. Do not start H (quest notes) or F (citizens) tonight: they change the save format and would collide with the Arena's version 5.

## The agents

Start order does not matter. Prompts: for the Arena use the prompt at the end of `docs/briefs/G-arena.md`; for every game use this one, replacing `<id>` and `<file>`:

> You are the agent for the mini game `<id>` on Haven Protocol. Read `AGENTS.md`, then `docs/briefs/games/README.md`, then `docs/briefs/games/<file>.md`, then `docs/design/games/CONTRACT.md` and `src/games/sample/`. Follow them exactly. Your starting branch and your PR base are `integration/arena`. Open a draft PR after your first commit, push after every milestone, mark the PR ready when every acceptance item passes, and do not merge anything. Nobody is available to answer questions: decide yourself and write the decision in your notes file.

| Priority | Agent | `<id>` and `<file>` | Kind |
| --- | --- | --- | --- |
| (platform) | Arena | brief `docs/briefs/G-arena.md` | economy, run loop, screens, host (two stacked PRs) |
| 1 | Roguelike Chess | `roguelike-chess` | strategy, the party as pieces |
| 2 | Haven Rush | `gate-runner` | arcade: runner with multiply, add, divide and subtract gates |
| 3 | Hold the Haven | `tower-defense` | defense, real time |
| 4 | Sudoku | `sudoku` | puzzle, generated with a unique solution |
| 5 | Weight Garden | `weight-garden` | **AI learning**: how a neural network learns |
| 6 | Maze Learner | `maze-learner` | **AI learning**: reinforcement learning and reward design |
| 7 | Memory Palace | `memory-palace` | **self-development**: memory (method of loci) |
| 8 | Still Water | `still-water` | **self-development**: calm focus and breathing rhythm |
| 9 | Decision Dungeon | `decision-dungeon` | **self-development**: constructive responses to everyday friction |
| 10 | Reading Race | `reading-race` | **self-development**: reading speed with comprehension |
| 11 | Word Forge | `word-forge` | **self-development**: vocabulary with spaced repetition. The cut candidate. |

**On the count.** Your list was chess, two AI-learning games, five self-development games, sudoku, tower defense and the shooter, which is **eleven**, not ten. All eleven are in the table. If you want exactly ten, drop the last row (Word Forge needs the most content and the most accuracy checking) and nothing else changes. Starting fewer agents to save money: start in priority order and stop where you like.

## Status (the maintainer fills this in before handing over)

- **Foundation merged to `main`** (PR #20, independently reviewed by following its own recipe with two throwaway games; 3 critical and 8 major findings fixed before merge). CI and deploy green on `main`.
- **`integration/arena` exists** and is kept identical to `main` at launch time. Agents read their briefs from this branch, so any change to a brief, `AGENTS.md` or `OVERNIGHT.md` must be merged into `integration/arena` too (do not edit docs once agents are running).
- **The auto-merge workflow was tested end to end** on a throwaway integration branch: it merged a PR and retargeted and merged a PR stacked on it.

## What can go wrong, and what to do

| Problem | What happens | What you do |
| --- | --- | --- |
| An agent stalls or produces something bad | Its PR stays draft or merges a weak game | Nothing at night. In the morning the review decides: fix, drop, or revert that PR's merge commit. |
| Two PRs conflict | The second PR stays open, not merged | Nothing at night. In the morning it is merged by hand. |
| CI is red on a PR | It does not merge | The agent usually fixes it; otherwise morning. |
| Something goes wrong everywhere | Merges keep landing in `integration/arena` | Run the stop switch above. `main` is untouched; the integration branch is disposable. |
| An agent edits a file it should not | Possible, rules are written but not enforced by software | The morning review checks every PR's file list against its brief. |

## Morning checklist

1. `gh pr list --repo TeddySabatier/ultimate-shut-in --base integration/arena --state all` and `git log --oneline origin/integration/arena`: what merged, what is still draft or open.
2. Tell Claude "morning review". It will: run lint, typecheck, unit and e2e on the integration branch; walk every game in the Games Lab (`npm run dev`, then open `#/lab`); run an independent reviewer per game against its brief and the quality bar in `docs/briefs/games/README.md`; have fix agents repair the majors; check the file ownership of every PR; run the responsive sweep; then open a PR `integration/arena` to `main`.
3. You play each game for a minute or two. Anything that is not fun is a note, not a blocker.
4. Merge to `main` with a merge commit, tag `v0.4.0`, and the deploy follows by itself.
5. Delete the integration branch and the merged feature branches.

## If you want to change the plan tonight

Edit nothing under `.github/` or `docs/briefs/` by hand while agents run. To drop a game: do not start its agent. To add one later: write its brief in `docs/briefs/games/` using the same shape and start it the same way.
