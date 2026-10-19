# Game: Reading Race (`reading-race`)

| | |
| --- | --- |
| Category | `self-development` |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Estimated minutes | 4 |
| Priority | 10 |

## Skill practised

Reading speed **with comprehension**: finding the pace where you still understand. The game teaches that speed without comprehension is worthless.

## Idea

A short original passage is shown one word (or a small phrase) at a time at a pace the player controls (a race track metaphor: the reading speed is the runner's pace). After each passage three comprehension questions appear. The faster the player reads, the more the race advances, but only comprehension counts the finish.

## Rules

- **Content is the work here.** Write **10 original passages in English and 10 in French**, each 110 to 170 words, on varied topics (a short story beat, a science explainer, a how-it-works piece, a historical anecdote told in your own words, a nature note), different from each other in difficulty (a reading-level tag 1 to 3). No copying from any book, article or website; facts must be correct and general. Each passage has three questions (one literal, one inference, one detail) with four options and exactly one correct answer. Put them in a content file inside your game folder, validated by tests (counts, lengths, one correct answer per question, no duplicate questions).
- Pace: words per minute from 180, adjustable in steps of 20 by the player between passages and by an auto-ramp mode. Display: one word at a time centred with a fixed focus point (RSVP) or a three-word phrase mode, a toggle. A "tap to pause and re-read the last sentence" button costs 5 points.
- Three passages per game (difficulty and ring choose reading levels), chosen and ordered from the seed. Score 0 to 1000 = comprehension percentage times a speed factor capped so that very high speed with poor comprehension scores low (assert it). `result`: won at 70 percent comprehension or better, lost otherwise, fled on exit.
- `learned`: the player's best "comprehension-safe" speed (words per minute at 80 percent or better), as a number and a sentence (en and fr).
- Reduced motion: the word display is a static one-word-at-a-time swap with no animation. A "show the whole sentence" accessibility mode lets people read at their own pace and records pace by tap.

## Engine

Time is explicit (the standard 50 ms `tick`). The passage reveal state machine, the pace, the question phase and scoring are pure and deterministic. The bot reads at a configured pace and answers with a comprehension probability that falls as the pace rises (seeded), which is also used to assert the scoring shape.

## Party and buffs

The Study troop highlights the topic sentence of each passage; the Sleep troop slows the first word of each sentence slightly ("rested eyes"); the Social troop reveals one wrong option per question. `hint` buff removes a wrong option; `time` buff lets one passage be re-read free; `luck` swaps in an easier passage; ignore `attack`, `defense`, `revive` and say so.

## Acceptance

- Unit tests for the content files (counts, word counts in range, answer validity, equal structure in both languages), pace timing exactness, scoring monotonicity (faster with the same comprehension never lowers the speed factor; lower comprehension never raises the score), determinism, bot behaviour.
- Fully keyboard operable (space pause, arrows pace, number keys answer). Text is large and readable at 150 percent; contrast 4.5:1.
- `docs/games/reading-race.md` states that the passages are original and lists their topics.

## Cut line

Phrase mode, then the auto-ramp, then passages 8 to 10 in each language (keep 6 each, never fewer).
