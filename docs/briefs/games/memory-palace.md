# Game: Memory Palace (`memory-palace`)

| | |
| --- | --- |
| Category | `self-development` |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Estimated minutes | 3 |
| Priority | 7 |

## Skill practised

Working and short-term memory through the method of loci: attach each item to a distinctive place in an imagined building, then walk the building to recall them.

## Idea

The player walks through a small palace of illustrated rooms (a gate, a hall, a kitchen, a library, a garden, a tower: original SVG scenes). In the **memorise** phase, items appear one by one, each placed in a room with a short vivid prompt ("a giant lantern wedged in the kitchen door"). In the **recall** phase the palace returns empty and the player must place each item back into the right room, or pick the right item for a room, in any order. Then a second, longer round.

## Rules

- Items are words (concrete nouns, from a seeded list of 150 original words per language, en and fr, checked for no duplicates and no confusable pairs in one round). Round 1: 4 items, round 2: 6, round 3: 8; `run.difficulty` shifts the counts, the display time and the number of distractors. The display time per item is shown as a draining bar (static text alternative for reduced motion).
- The prompt for each item is generated from a template bank (original, vivid, humorous, never offensive) and is exactly the technique the game teaches: "picture it in the room".
- Recall: tap a room, then choose the item (a grid of the items plus distractors); or drag an item to a room (also keyboard: select the item, arrow to a room, Enter).
- Score 0 to 1000: correct placements across rounds, bonus for no hints. `result`: won if at least 70 percent are correct across the rounds, lost otherwise, fled on exit.
- `learned`: "You can hold more when each thing has a place" with the tip of the round (en and fr).

## Party and buffs

The Study troop reveals the first letter of a forgotten item once per round; the Sleep troop extends the display time (flavour: "a rested mind holds more"); the Social troop adds a tip. `hint` buff gives extra first letters; `time` extends display time; `revive` allows one retry of the worst round; `luck` removes one distractor; ignore `attack` and `defense`.

## Acceptance

- Unit tests: the seeded word picker never repeats within a round and never mixes confusable words, scoring is exact for perfect, partial and empty recalls, difficulty scaling, determinism, the bot recalls perfectly on difficulty 1 and imperfectly on 5 (a seeded error model), word lists have no duplicates and equal sizes in both languages.
- The scenes are original SVG, each readable at 320px; the palace can be navigated by keyboard; every item and room has a text label (colour is never the only signal).
- `docs/games/memory-palace.md` explains the technique and cites the method's name only (no copied text).

## Cut line

Round 3, then the generated prompts (use plain labels), then the drag interaction (keep tap and keyboard).
