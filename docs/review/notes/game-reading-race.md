# Notes: Reading Race (`game-reading-race`)

## The Cursor build: evaluated, adopted as a base, then reworked

`origin/feat/game-reading-race` (2 commits, never reviewed, no PR) was evaluated read-only first. Its files were taken with `git checkout origin/feat/game-reading-race -- src/games/reading-race` (the branch itself was never merged), and the game plug-in tests, lint and budget tests passed on it (`npx vitest run src/games`: only the missing docs page and e2e spec failed). It was then **reviewed against the brief and changed substantially**:

Kept from it: the tick accumulator (a word costs 1200 units, so timing is exact integer arithmetic), the phase machine (`ready`, `reading`, `questions`, `interlude`, `done`), sentence mode with pace measured from taps, phrase mode, the `reread` action, the score formula (speed factor held under a cap that rises with comprehension), the 7-of-9 win line, the learned-note shape, and the idea of the SystemWindow screen with Forfeit and Leave as separate buttons.

Replaced or fixed:

- **Content.** The passages were readable but the wrong answers were jokes ("The queen requires entertainment", "Fireworks from the quay"), so a reader could answer without reading, which defeats a comprehension game; the correct answer was at position 2 in most questions; some French was stiff or wrong ("d'un seul pose"). All 20 passages and 60 questions were **rewritten from scratch** (English and French separately, not translated), with plausible distractors of similar length, the right answer spread over the four positions, and tests for all of it (`passages.test.ts`).
- **Content layout** (CONTRACT.md 4.13). The engine imported the passage texts, so every game's Arena chunk carried ~40 KB of text. The words now live in `content/en.json` and `content/fr.json` (counted as assets, loaded only by the Screen); the engine reads a small generated `meta.ts` (word counts, sentence starts, topic sentence, right answers), and a test fails if they ever drift apart.
- **Difficulty** now also raises the slowest allowed pace (180 to 260 wpm), not only the reading levels.
- **Party.** Study still lingers on the topic sentence, and now also shows it again during the questions; a strong Social troop (power 30 or more) hides two wrong options on the first question; Sleep and Study scale with power.
- **Buffs.** `time` now frees every re-read of one passage (the brief: "lets one passage be re-read free"), not a single sentence; `hint` is a button the player presses (the old build spent hints automatically at the start of each passage); a hint never leaves fewer than two options.
- **Auto-ramp** also eases back one step after a poor passage (0 or 1 right), so it finds the safe pace instead of only pushing.
- **Bot.** It used to answer wrongly whenever it did not "know" (never a lucky guess), so hidden options did not matter; it now guesses among the options still shown. Its knowledge table was retuned: full party wins 100, 60, 47, 38, 34 percent at difficulties 1 to 5 (100 seeds each), the starter party 100, 32, 8, 6, 6.
- **Screen.** Added the race track (a runner that follows the words read), a fixed focus point (the eye's resting letter, centred between two ticks), a live feed line, a topic-sentence label (so Study is not signalled by colour alone), focus management (reading area, question, Next passage, result), Space/R/arrows/1-4/H/Enter keys with Space left to focused buttons, shorter pixel-font labels, the 150 percent text check. One real bug in the old screen design (shown options and hidden options mixed up) was caught by the Screen tests.
- **Tests.** 76 engine tests, 18 content tests, 26 Screen tests, the contract kit (10), and a 16-test e2e (8 per project). The old build had about 20 engine tests and 3 Screen tests.
- **Docs, e2e and screenshots** of the branch were not adopted (they described the old game); all three are new and match this build.

The two Cursor branches (`origin/feat/game-reading-race` and `origin/cursor/game-reading-race-63e0`) can be **closed by the maintainer after this PR merges**; nothing from them is needed any more.

## Decisions

- Branch `feat/game-reading-race-v2`, PR #37, base `integration/arena`.
- Passages are drawn from the seed and the difficulty (levels 1 to 3); 10 per language, 4 / 2 / 4 by level so that difficulties 1 and 5 still have a pool of four to draw three from.
- Re-read is one engine action that goes back to the start of the sentence on screen (or the previous one when already on its first word); it does not pause by itself.
- A paused game keeps the word on screen (looking is not cheating); the tab being hidden pauses through `useFixedStep`.
- Win at 7 of 9; "comprehension-safe" is a whole passage right (3 of 3 is the only way to reach 80 percent with three questions).
- The `hint` count is spent only when the player presses the button (or `H`).
- Attack, defense and revive are ignored (nothing to attack or defend; a wrong answer is not a failure to revive). Said in `docs/games/reading-race.md`.
- Luck needs a harder passage in the draw to do anything, so it does nothing at difficulty 1.
- CRLF: the working tree here is Windows; git normalises line endings, so the "CRLF will be replaced by LF" warnings are harmless.

## Needs from files I do not own

Nothing. (The old notes said the Lab's "Matches the previous run" chip did not show after Bot play; `replaySameSeedWithBot` now covers that and passes.)

## Open questions

- None. French was proofread for natural tutoiement; a native reader's pass on the 10 French passages is welcome but not needed to merge.
