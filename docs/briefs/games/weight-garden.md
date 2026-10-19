# Game: Weight Garden (`weight-garden`)

| | |
| --- | --- |
| Category | `ai-learning` |
| Minimum ring | 2 |
| Roster | 1 to 8 |
| Estimated minutes | 4 |
| Priority | 5 |

## Learning goal

Understand, by playing, how a neural network learns: weights and bias, a decision boundary, loss, learning rate, why a hidden layer is needed (XOR), and the difference between memorising the training points and generalising to new ones (overfitting).

## Idea

A garden has two kinds of seeds scattered on a plot (two colours). The player grows a "gardener" (a tiny neural network) that must draw the line between them. Seeds are dots on a 2D plane; the network is drawn beside it with its weights as sliders; the decision boundary and the loss update live.

## Levels (five rooms, shorter on low difficulty)

1. **One neuron.** Two clusters, separable by a line. The player turns two weights and a bias by hand and watches the boundary move and the loss fall. Goal: accuracy at least 95 percent.
2. **Auto-train.** Same task. A "Train" button runs gradient descent steps; a learning-rate slider; too low is slow, too high makes the loss jump and diverge (show it). Goal: reach the target loss in few steps.
3. **XOR.** Points in four quadrants that no single line separates. One neuron fails; the player adds a hidden layer (2 to 4 neurons) and trains. Explains why depth matters.
4. **Noise and overfitting.** A noisy dataset split into train and hidden test dots. A big network can reach 100 percent on train and do worse on test; the player stops training at the right moment ("early stopping") or shrinks the network. Goal: best test accuracy.
5. **Boss field.** A spiral or ring pattern, a mix of everything learned, three attempts.

Each room ends with a one-sentence "what you just saw" note (the `learned` outcome field, in en and fr).

## Engine

- A tiny multilayer perceptron in pure TypeScript with seeded initialisation and seeded dataset generation, forward and backward passes, hard-tanh or ReLU activations and a squared or hinge loss. **Use only exact operations** (add, multiply, divide, comparison, `Math.sqrt` is allowed, avoid `Math.exp`, `Math.tanh`, `Math.pow` with fractions) so a seed replays identically on every device. Fixed-point or plain float arithmetic is fine if the operations are deterministic.
- Training is a state machine of explicit actions (`step`, `setWeight`, `setLearningRate`, `addNeuron`, `nextRoom`), so the lab's bot and the tests can drive it. `botPlay` trains with a sensible learning rate and stops by a rule.
- Score 0 to 1000 from accuracy on the hidden test points and steps used. `result`: won if the final room is passed, lost if the garden "wilts" (too many failed attempts), fled on exit.

## Party and buffs

The Study troop reveals the loss curve's trend as a hint; the Sleep troop adds extra training steps ("rest consolidates learning", flavour text only); Move adds a speed-up of the animation. `hint` buff reveals a good learning rate; `time` adds steps; `luck` gives a better starting initialisation; ignore `attack` and `defense` and say so.

## Acceptance

- Unit tests: forward and backward pass against hand-computed values on a 2-2-1 network, determinism, XOR solvable with a hidden layer and unsolvable with one neuron (asserted), too-high learning rate diverges (asserted), overfitting scenario produces a train-test gap (asserted).
- The bot clears rooms 1 to 4 on difficulty 3 for at least 80 percent of 100 seeds.
- Visuals are an SVG or canvas plot with accessible text alternatives: a live `aria-live` summary ("accuracy 82 percent, loss 0.31") and keyboard-operable sliders. Reduced motion: no animation between steps, the boundary just updates.
- `docs/games/weight-garden.md` lists each concept shown, each fact stated, and how to verify it.

## Cut line

The boss room, then the noise room (keep a simple overfitting demo as a text-and-graph note), then the hidden-layer size choice (fix it at 3).
