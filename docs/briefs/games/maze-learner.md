# Game: Maze Learner (`maze-learner`)

| | |
| --- | --- |
| Category | `ai-learning` |
| Minimum ring | 2 |
| Roster | 1 to 8 |
| Estimated minutes | 4 |
| Priority | 6 |

## Learning goal

Understand reinforcement learning by playing the teacher: reward and penalty, trial and error, exploration versus exploitation, a policy, a value estimate, discounting, **reward shaping**, and **reward hacking** (an agent exploiting a loophole in the reward you wrote).

## Idea

A small creature (the learner) lives in a grid maze. It does not know the map. The player places **rewards** (cheese, a bonus) and **penalties** (traps, a puddle) and starts training: the creature wanders, learns and gets better episode after episode. The player watches arrows (its policy) and a heat map (its value estimates) form, and can change the rewards to teach it something else.

## Levels (five, shorter on low difficulty)

1. **First lesson.** One reward at the exit. Watch the creature wander, then find a path. The arrows appear.
2. **Traps.** Add penalties; the creature learns to avoid them. The player must reach a success rate of 90 percent over the last 20 episodes within an episode budget.
3. **Explore or exploit.** An `epsilon` slider: too low and it never finds the better, farther reward; too high and it never settles. Two exits, a near small one and a far big one; the goal is to teach it to take the big one.
4. **Reward shaping.** A long corridor where a single exit reward is too sparse to learn within the budget; the player adds small "breadcrumb" rewards to guide it, then must remove them to see it still works.
5. **Reward hack.** A level with a loophole (a respawning bonus tile next to the start). If the player rewards the bonus, the creature loops on it forever instead of exiting. The player must fix the reward layout so it exits. Explains why specifying goals is hard.

Each level ends with a one-sentence "what you just saw" note (`learned`, in en and fr).

## Engine

- Tabular Q-learning on a grid up to 8x8 with seeded exploration. Deterministic: use exact arithmetic (a fixed-point integer scale, for example values in thousandths) so a seed replays identically on every device. No `Math.exp` or fractional `Math.pow`.
- Actions: `placeReward`, `placePenalty`, `erase`, `train(episodes)`, `setEpsilon`, `setDiscount`, `reset`, `nextLevel`. Training runs in bounded chunks per animation frame in the screen, but the engine call is a pure function of an explicit episode count so tests and the bot are exact.
- `botPlay` places a sensible reward layout and trains.
- Score 0 to 1000 from success rate, efficiency (episodes used) and levels cleared. `result`: won if the last level is passed, lost if the budget runs out on a level after three tries, fled on exit.

## Party and buffs

Study shows the value heat map for free (otherwise a toggle costs nothing, the party adds a second overlay showing visit counts); Move speeds up training playback; Social adds a second learner in level 3 for comparison (optional). `time` buff raises the episode budget; `hint` highlights a good tile for a reward; `luck` improves the first exploration; ignore `attack`, `defense`, `revive` and say so.

## Acceptance

- Unit tests: the learner reaches the exit on level 1 within the budget for 100 seeds; traps are avoided on level 2; level 3 with a low epsilon is stuck on the near reward and with a good epsilon finds the far one (asserted); the loophole in level 5 is real and the fix works (asserted); determinism across a thousand episodes.
- The grid is keyboard operable (arrows move a cursor, keys place rewards and traps, Enter trains) and announces the changes. Colour is never the only signal (patterns and icons for rewards and traps). Reduced motion: no creature animation, only the arrows and heat map update.
- `docs/games/maze-learner.md` lists each concept, each fact stated and how to verify it.

## Cut line

Level 5, then level 4, then the party overlays, then the second learner.
