# Word Forge (`word-forge`)

A forge turns words into steel. A card shows in the language you know; you forge the matching word in the language you are learning. The target language is the other one (English app → French words, French app → English words), and you can switch direction during a run. Misses come back sooner, hits come back once more: a tiny spaced-repetition scheduler inside about three minutes.

| Field | Value |
| --- | --- |
| Category | self-development |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Length | about 3 minutes |
| Learning | second-language vocabulary (spaced repetition, A2–B1) |

## How to play

A run draws **20 unique words** from the decks below. Each word is shown, then scheduled again:

- a wrong answer returns after **2** further cards, then after **5** if it is missed again
- a first right (or “almost”) returns once more after **8** cards (after **6** if the Study troop is present) for a final check
- a word stops after that final check, or after four shows

Difficulty:

| `run.difficulty` | Input | Accents | Decks |
| --- | --- | --- | --- |
| 1 | four options | — | food |
| 2 | four options | — | food, travel |
| 3 | typed | flexible | food, travel, work |
| 4 | typed | strict (toggle still available) | all four |
| 5 | typed | strict | all four, biased toward longer words |

Touch: tap an option, or type and press **Forge**. Keyboard: `1`–`4` pick an option (ignored while a field is focused); Enter submits a typed answer. **Forfeit** ends as `fled` and keeps the board; **Leave** is a separate button that calls `exit()`. **Pause** stops the one-second clock.

Reduced motion: forge sparks are omitted; the heat bar and streak number stay.

### Normalisation (typed answers)

1. Unicode NFC
2. Trim, collapse inner spaces to one, lower case (`toLowerCase`, not locale-dependent)
3. Fold apostrophes `‘’ʼ\`` to `'`, dashes `‐‑‒–—−` to `-`
4. If accents are flexible: fold `œ`/`æ` to `oe`/`ae`, then NFD and strip combining marks
5. Exact match → right. Else if the expected form is at least 3 characters and Levenshtein distance is 1 → **almost** (half credit). Else wrong.

Score 0–1000 from accuracy (last credit per word over 20), max streak, and time left against a 180 s par (plus the `time` buff and a little party power). **Won** at 70% accuracy or better, **lost** otherwise, **fled** on forfeit. `learned` lists the three hardest words of the run with both English and French.

## Decks

Four decks of 40 A2–B1 entries. Each has English, French, part of speech, a gender tag for French nouns (`m` / `f`; `n` for non-nouns and three epicene nouns: *élève*, *collègue*, *enfant*), and a short original example sentence in each language.

- **Food and drink** — meals, produce, the kitchen. Cognates: orange, dessert, restaurant, sandwich.
- **Travel and places** — transit, directions, landscape. Cognates: train, bus, village, taxi. Hyphen: *week-end*.
- **Work and study** — school and the desk. Cognate: question. Hyphen: *e-mail*, *emploi du temps*.
- **Feelings and people** — moods, family, greetings. Cognate: parent. Apostrophe: *s'il te plaît*. Ligatures: *œuf*, *sœur*.

Identical English/French spellings are allowed only on the cognate allow-list in `src/games/word-forge/words.ts`.

## Translation review

A second pass over every pair. Kept:

- *e-mail* (French) rather than *courriel*, which is more Quebec French than metropolitan A2.
- *professeur* tagged masculine (common dictionary citation; the word is used for any teacher).
- *élève*, *collègue*, *enfant* tagged unmarked (`n`) because they are epicene.
- *gare* for “station” (train station, not a metro *station*).
- *partir* for “leave” (to depart).
- *droite* / *gauche* as direction adjectives.
- *pause* for a work “break”; *cours* for a “class”.
- *date limite* for “deadline”.
- *week-end* with a hyphen on the French side.

Dropped rather than guessed: no medical or slang items, no false friends (*library* is *bibliothèque*, not *librairie*). Nothing on this list was left in with a doubtful gloss.

## Party

Every member stands at the forge (`troopsUsed` is the whole fitted party). Habits the player can notice:

- **Study** — the example sentence is shown; the “right” review gap shortens from 8 to 6, so checks come back sooner. A level-12 Study troop (power 44) also adds a few seconds of par through average party power.
- **Social** — on typed difficulties, the first letter of one card is revealed automatically.
- **Eat** — food-deck words are drawn more often, and each fully correct food word adds a small score bonus that scales with Eat power.

`parties.starter` (Move, Outside, Clean) has none of those habits, so a new player still gets a fair forge, just without the extra example, letter, or pantry bias. Titles are not used.

## Buffs

- `hint` — each point is one press that reveals the first letter of the current target.
- `time` — each point is one extra second on the 180 s par.
- `revive` — each point forgives one miss in the streak (the word still returns to the fire).
- `luck` — percentage points: that share of the 20 cards is swapped for a shorter unused word.
- `attack` and `defense` are ignored: there is no combat.

## Determinism

Setup uses `mulberry32(fnv1a('word-forge:<seed>'))`. Option shuffles use `turnRng(seed, marks.length)` so the one-second clock cannot change the card order. The same seed, party, run and locale replay identically. Locale chooses the target language (and so the typed strings); multiple-choice indices stay the same when luck is not mixing lengths.

## Bot

`botPlay` interleaves a `second` every three steps and otherwise answers with a seeded hit rate by difficulty (about 90% down to 40%). On a miss it picks a wrong option or a mutated spelling. It never forfeits, never flips direction, never spends a hint.

## Screenshots

Written by `e2e/games/word-forge.spec.ts` (`shootGame`, mobile project).

| Start | End |
| --- | --- |
| ![Word Forge at the start](img/word-forge-start.png) | ![Word Forge at the end of a run](img/word-forge-end.png) |
