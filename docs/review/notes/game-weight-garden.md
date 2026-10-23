# Notes: Weight Garden (`game-weight-garden`)

Branch `feat/game-weight-garden-v2`, PR base `integration/arena`.

## Decision on the earlier Cursor build (`origin/feat/game-weight-garden`)

Evaluated read-only (`git diff --stat`, `git show`), then adopted into this branch with `git checkout origin/feat/game-weight-garden -- src/games/weight-garden` to run the contract kit, lint and budget tests. **Not kept.** The kit and budget tests passed (only the missing docs page and e2e spec failed, files that branch had on its own), but the code did not match the brief's learning goals:

- On the XOR and ring plots, adding a hidden layer installed a hand-built network that already solved the task (`structuredNet`), so "adding a neuron makes it work" was scripted, not learned by gradient descent. That breaks the learning goal (why depth matters, shown by training).
- A divergence cost a strike and wiped the network, which punishes the very experiment the learning-rate plot asks for.
- No explanation of what weights, bias, loss or the boundary are on screen, no network drawing, no train/test curves, no hint of what the player should try; the Study, Sleep and Move troops changed nothing a player could see.
- The plot goals could be skipped (the boss "Next plot" button was always enabled).

So the folder was rebuilt from the brief. What was kept is the shape, not the code: a state machine of explicit actions (`step`, `setWeight`, `setLearningRate`, `addNeuron`, `removeNeuron`, `nextRoom`, `forfeit`), the five-plot ladder, mean squared loss, and the idea of a gradient check by hand in the unit tests. Everything else is new (`net.ts`, `data.ts`, `engine.ts`, `Screen.tsx`).

**The maintainer should close the Cursor branch `feat/game-weight-garden` after this PR merges.**

## Departures and decisions

- ReLU is a *leaky* ReLU (slope 0.1 below zero) so no hidden neuron dies; only add, multiply, divide, compare and `Math.sqrt` are used.
- "Steps" are grouped: one Train press is a few gradient steps (4 on the auto-train plot, 10 to 12 on the others, plus the Move troop's bonus). The try's budget is counted in presses.
- A try that runs out of presses without meeting the goal costs one of three tries on that plot (the boss plot has the same three tries). A learning rate that makes the weights fly apart does not cost a try: the net is replanted and the press is spent.
- The bot is a "casual competent" gardener: it grows 3 hidden neurons on XOR and the ring (4 is more comfortable), so it wins about 60 to 70 percent at difficulty 3 and a human who picks 4 neurons does better.
- `attack` and `defense` buffs are ignored (nothing in a gardener's work is attacked or defended).
- No file outside the owned list was needed.

## Result

- Code 59 KB of 150 KB, no assets; three screenshots 134 KB in total.
- Unit tests: 52 in `engine.test.ts` (hand-computed 2-2-1 forward and backward pass, XOR unsolvable with one neuron and solvable with a hidden layer, divergence at a too-high rate, a train-test gap on the noise plot, rules, party, buffs, scoring, determinism, bot), 9 in `Screen.test.tsx`, 10 in the contract kit.
- Bot over 100 seeds on difficulty 3: first four plots settled 98 percent (starter party), wins 55 percent (starter) and 77 percent (full party).
- Nothing was cut: all five plots, the hidden-layer size choice (2 to 4) and the boss plot are in.
- The bot's rng argument is unused (its choices are rule based); the kit's seed check still passes because the seeds on the plots differ.
