# Notes: Memory Palace (`game-memory-palace`)

Decisions taken with nobody available to ask. Brief: `docs/briefs/games/memory-palace.md`.

## Time buff scaling

CONTRACT.md says a `time` buff of `amount` seconds is `amount * 1000 / FIXED_DT_MS` ticks on a global clock. Memory Palace times *each card*, so adding 20 wall-clock seconds to every card would push buffed bot walks near the 20,000-step cap. Decision: each point of `time` adds **one 50 ms tick** of look time per card, capped at 40 ticks. Sleep still adds `floor(power / 4)` ticks. The difference is visible (starter vs full, plain vs buffed) and the kit stays fast. Documented under `## Buffs` in `docs/games/memory-palace.md`.

## Hint shape

The brief says Study “reveals the first letter of a forgotten item”. Item names are on the recall grid (you are remembering *where*, not the word). A bare letter would not help. Decision: a hint names the **room and the prefix** (“In the kitchen, something starts with L”). That is the method of loci in reverse: the place cues the thing. High Study power (40+) reveals two letters.

## Revive

After every round has been filled once, one `revive` restarts the weakest round (lowest accuracy, later round on a tie) from its look phase, same items. Automatic, so the bot uses it. Only once (`reviveUsed`).

## Cut line

Nothing cut. Round 3, generated prompts (eight original templates), and drag-and-drop on top of tap and keyboard are all in.

## Word list

150 original concrete nouns, en and fr, no room names, no trademarks. Confusable groups cover lookalikes, close meaning, and a few French collisions (`dé` / `dé à coudre`, `pomme` kept off pinecone by using `cône`). The picker refuses a pair from the same group in one round (items plus distractors). Unused words can repeat across rounds of different games; they do not repeat inside one game.

## Bot error stream

The kit's `botRng` does not depend on the game seed. A pure `rng() < rate` check therefore rolled the same sequence on every seed, and difficulty 2 looked unbeatable. Decision: mix the roll with the word id (`(floor(rng()*100) + wordId) % 100`) so different palaces miss different cards. Difficulty 1 still has rate 0 (perfect). Documented in the engine.

## Lab: Bot play after Replay

`LabGame.botPlay` always does `setPrevious(result)` before recording the bot outcome. "Replay same seed" nulls `result`, so a following Bot play wipes `previous` and the Lab never shows "Matches the previous run." I do not own `src/games/lab/`. Decision: the replay e2e test walks the real UI (one place + Forfeit). Full games still use Bot play. Request: `botPlay` should keep `previous` when `result` is already null.

## Files not owned

`src/games/lab/LabGame.tsx`: see "Lab: Bot play after Replay". Worked around in `e2e/games/memory-palace.spec.ts`.

## PR

Branch `feat/game-memory-palace` (pushed), base `integration/arena`.

This subagent does not have the `ManagePullRequest` tool, and `gh` / the GitHub API return 403 (`Resource not accessible by integration`) on `pulls#create`. The parent agent should open the draft PR with:

- title: `feat(games): Memory Palace [game-memory-palace]`
- base: `integration/arena`
- head: `feat/game-memory-palace`
- draft first, then mark ready (acceptance list below is green)

Do not merge from this agent.
