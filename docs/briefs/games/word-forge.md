# Game: Word Forge (`word-forge`)

| | |
| --- | --- |
| Category | `self-development` |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Estimated minutes | 3 |
| Priority | **11 (the cut candidate if the program must end at ten games)** |

## Skill practised

Vocabulary in a second language with spaced repetition inside a run. The target language is **the other one**: a player whose app language is French practises English words, a player whose app language is English practises French words. The player can switch the direction in the game.

## Idea

A forge turns words into steel. A word card shows in the language the player knows and the player forges the matching word in the language they are learning: choose from four options (easy), or type it (hard, with an accent tolerance toggle). Words answered wrongly come back sooner; words answered right come back later: a tiny spaced-repetition scheduler inside a three-minute run. Streaks heat the forge.

## Rules

- **Content is the work here and accuracy matters.** Four decks of 40 words each (food and drink, travel and places, work and study, feelings and people), each entry has the French word, the English word, a part of speech, and an example sentence in each language (original, short). Words are common vocabulary (about A2 to B1 level). Tests validate: no duplicate entries, both fields non-empty, no entry whose two sides are identical unless it is a true cognate listed on an allow-list, accents present and normalised, a gender tag for French nouns. **Write a second pass reviewing every translation for correctness and list the doubtful ones in your notes file.** When unsure, drop the word.
- A run shows 20 cards drawn from the decks with the scheduler: new card, wrong answers return after 2 cards then 5, right answers return once more after 8 cards for the final check. `run.difficulty` moves from multiple choice (1 to 2) to typed answers with accent tolerance (3) to strict typing (4 to 5) and mixes decks.
- Typed answers use normalised comparison (case, spaces, accents toggle) with a small edit-distance allowance reported as "almost" (counts as half).
- Score 0 to 1000 from accuracy, streak and speed. `result`: won at 70 percent or better, lost otherwise, fled on exit. `learned`: the three hardest words of the run with their translations (en and fr), a vocabulary takeaway.
- Reduced motion: no forge sparks, only a text and bar streak indicator.

## Engine

Pure scheduler and scoring; seeded card order; typed answer checker with exact specified normalisation (write it down in the docs and test it with accents, apostrophes, hyphens, uppercase and trailing spaces). Bot answers with a seeded accuracy by difficulty.

## Party and buffs

The Study troop shows the example sentence for free; the Social troop shows the first letter on typed cards once per game; the Eat troop adds a food-deck bonus (flavour). `hint` buff reveals the first letter; `time` buff gives extra seconds if a timer mode exists (optional); `revive` forgives one wrong answer in the streak; `luck` swaps in an easier card; ignore `attack` and `defense`.

## Acceptance

- Unit tests for the decks (counts, duplicates, normalisation, genders), the scheduler's exact card order for a fixed seed and answer script, the answer checker table, scoring, determinism and the bot.
- Keyboard first (type, Enter, number keys for options). Readable at 150 percent text.
- `docs/games/word-forge.md` lists the decks, the level, the normalisation rules and the review of doubtful entries.

## Cut line

Typed strict mode, then the fourth deck, then the "almost" scoring. Never cut the review of the translations.
