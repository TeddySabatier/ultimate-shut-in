# Mini-game briefs: shared requirements

Every game brief in this folder builds **one self-contained mini game** for the Arena. You work alone, unattended, probably overnight, so these rules are written to leave no question open. Read this whole file, then your game's file. If the two disagree, your game's file wins for game design and this file wins for process and quality.

## What you are building on

Phase 0 is done and merged: the plug-in contract, the auto-discovering registry, the Games Lab and the contract test kit. **Read `docs/design/games/CONTRACT.md` completely (its recipe, "What the test kit enforces" and "Real-time games" sections) and copy `src/games/sample/` (the reference game "Coin Duel") before you write anything.** Your game appears in the Arena and in the lab with no edits to any shared file. The kit enforces more than this file repeats (for example the required `## Party` and `## Buffs` headings in `docs/games/<id>.md`, `rosterSize.min` at most 3, `learning` required for AI-learning games, a bot that wins at least once, no unknown fields): when CONTRACT.md and this file differ on a mechanical rule, CONTRACT.md wins.

## Process (non-negotiable)

- **Starting branch and PR base: `integration/arena`**, never `main`. Create your branch from it: `git fetch origin && git checkout -b feat/game-<id> origin/integration/arena`.
- Open a **draft PR against `integration/arena`** after your first commit, title `feat(games): <Name> [game-<id>]`, using the PR template. Push after every milestone so nothing is lost.
- When every acceptance item passes, **mark the PR ready for review. That is all**: a workflow merges it into `integration/arena` by itself once CI is green. Never merge anything yourself, never push to `main` or to `integration/arena` directly, never touch another agent's branch.
- If CI fails on your PR, fix it with new commits (no force-push, no rebase). If `integration/arena` moved and your PR conflicts, merge `origin/integration/arena` into your branch.
- **Ship a complete smaller game rather than an ambitious broken one.** Cut features in the order your brief lists under "Cut line". A game that is finished, tested and fun for two minutes beats one that is half of a great idea.

## Files you own (and nothing else)

- `src/games/<id>/**`: `manifest.ts`, `engine.ts`, `strings.ts`, `Screen.tsx`, `Screen.module.css`, tests, assets, content
- `e2e/games/<id>.spec.ts`
- `docs/games/<id>.md`: rules, how the party and buffs matter, learning goals if any, tuning numbers, known limits
- `docs/games/img/<id>-*.png`: at most three screenshots, 150 KB in total, taken with the `shootGame` helper from the games e2e helpers (see `docs/design/games/CONTRACT.md`)
- `docs/review/notes/game-<id>.md`: departures, open questions, anything you needed from a file you do not own

**Keep your game's TypeScript files flat** directly in `src/games/<id>/` (assets and content data may sit in sub-folders): the lint rule that stops games importing each other would flag a `.ts` file in a sub-folder that imports `../engine`.

**Hands off:** `scripts/**`, `package.json` and the lockfile (**no new dependencies**, use the platform), `src/games/contract.ts`, `registry.ts`, `lab/`, `testing/`, `sample/`, `src/game/**`, `src/state/**`, `src/screens/**`, `src/components/**` (you may import presentational components, you may not edit them), `strings.json`, `.github/**`, configs, `docs/PARALLEL-WORK.md`, other games. If you need a change in a file you do not own, write it in your notes file and work around it.

## Quality bar

1. **Contract.** `contract.test.ts` calls `describeGameContract` and passes: determinism, termination, purity, valid outcomes, seeds differ, buffs and party honoured or explicitly declared ignored with a reason.
2. **Engine.** A pure seeded engine that takes the player's language as `initial(seed, party, run, locale)` when it needs it (word lists, passages, scenarios; never read `navigator`), and a **fixed 50 ms tick** for anything real-time (`FIXED_DT_MS`; if a game brief says 20 ms it means 50 ms). A pure seeded engine (`src/game/rng.ts`, no `Math.random`, no `Date.now`, no floating-point functions whose results differ across browsers such as `Math.sin`, `Math.exp` or `Math.pow` with non-integers: use integer or rational arithmetic, tables, or exactly specified operations so a seed replays identically on any device). At least 25 meaningful unit tests of rules, edge cases and balance (a bot should win 40 to 70 percent on normal difficulty).
3. **Difficulty.** `run.difficulty` 1 to 5 scales the challenge visibly. Difficulty 1 is gentle and winnable by a first-time player.
4. **Party and buffs.** The party changes play in a way a player can notice (stronger members, a specific habit unlocks a perk). Map the six buff kinds (`attack`, `defense`, `time`, `hint`, `revive`, `luck`) to something sensible in your game, or declare which you ignore and why. Always playable with `parties.starter` (three level-1 members).
5. **Screen.** Keyboard, mouse and touch all work. Every control is at least 44px. Follows `docs/RESPONSIVE-RULES.md`: no horizontal scroll and no clipping at 320x568, at 390x844 with 150% text and at 844x390; real-time canvases fit their container and handle device pixel ratio and resize. `reducedMotion` is honoured (no flashing, shake or auto-moving decoration; the game stays fully playable). A visible Exit and a pause for anything real-time. Everything announces its state to assistive technology (`aria-live` for the log, labelled controls, visible focus). Colours meet 4.5:1 contrast on the dark theme in `src/styles/tokens.css`.
6. **Language.** `strings.ts` has `en` and `fr` with the same keys; the French is natural (tutoiement), not machine-sounding. All visible text comes from strings, none hard-coded in JSX.
7. **Offline and light.** No network, no external fonts or images, no analytics. Art is SVG, CSS or canvas drawn in code. The game (engine plus screen) stays under 150 KB minified before gzip, loaded lazily by the registry. Cancel animation frames and timers on unmount and pause when the tab is hidden.
8. **Originality.** Original name, art, text and rules. No trademarks, no copied level designs or assets. Generic mechanics are fine.
9. **Honesty and wellbeing.** Learning games state facts correctly and say so in `docs/games/<id>.md`. Self-development games are practice, not therapy: no medical or diagnostic claims, warm tone, never shaming a loss. A failed game is "the troops come home", never a punishment.
10. **Tests.** `engine.test.ts` (25 or more), `contract.test.ts`, and `e2e/games/<id>.spec.ts` with three tests through the Games Lab at `#/lab/<id>`: it loads and axe finds no serious violations; a full game can be played to an outcome through the real UI (or through the lab's "Bot play" button where a human run would be too slow); replaying the same seed gives the same outcome. Take at most three screenshots of your own game with `shootGame` (it writes `docs/games/img/<id>-<name>.png`; keep them under 150 KB in total). **Each e2e test must finish in under about 20 seconds**: play long or real-time games to the end with the Lab's **Bot play** button and use the real UI for a few inputs only, because a slow spec can time out a CI shard and stall every other PR. Open your game at several difficulties with `#/lab/<id>?difficulty=4` (the Lab accepts `difficulty=1..5`, `run=hard`, `party=single|starter|full|mixed`, `lang=en|fr`, `seed=`). The sample's spec `e2e/games/sample.spec.ts` is the full template for the three tests.
11. **Docs.** `docs/games/<id>.md` is complete and matches what you built.

## Leaving early

To end a game with a score (for example Sudoku with a partly filled grid), dispatch your engine's own leave action and keep showing the board; call `onExit` only from a separate Leave press, never in the same handler, otherwise the host records an empty `fled` result. Time-scored turn-based games use a coarse `second` tick (see CONTRACT.md); the engine never reads a clock.

## Verification before marking ready

```bash
npm run lint && npm run typecheck && npm test && npm run build
npx playwright test e2e/games/<id>.spec.ts --workers=2
```

All green, then fill the PR template (brief id `game-<id>`, base `integration/arena`, files outside your list: none) and mark the PR ready. Do not wait for a reply.

## When you are blocked

Do not stop. Write the blocker in your notes file, take the simplest reasonable decision, say so in the PR description, and continue. Nobody will answer until the morning.

## Prompt (replace `<id>` and `<file>`)

> You are the agent for the mini game `<id>` on Haven Protocol. Read `AGENTS.md`, then `docs/briefs/games/README.md`, then `docs/briefs/games/<file>.md`, then `docs/design/games/CONTRACT.md` and `src/games/sample/`. Follow them exactly. Your starting branch and your PR base are `integration/arena`. Open a draft PR after your first commit, push after every milestone, mark the PR ready when every acceptance item passes, and do not merge anything. Nobody is available to answer questions: decide yourself and write the decision in your notes file.
