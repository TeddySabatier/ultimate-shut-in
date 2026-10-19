# Game: Decision Dungeon (`decision-dungeon`)

| | |
| --- | --- |
| Category | `self-development` |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Estimated minutes | 4 |
| Priority | 9 |

## Skill practised

Choosing a constructive response to everyday friction: noticing the first reaction, reframing, setting a boundary, taking the small next step. A gentle practice of ideas from cognitive reframing and stoic practice. It is a **game, not therapy**: no diagnosis, no medical advice, say so in the docs and in a one-line note.

## Idea

Each room of a small dungeon is a short everyday situation (the bus left early, a blunt message from a colleague, putting off a task for the third day, an awkward silence, a friend cancelling, a mistake at work). The player chooses a response from three or four. The doors that open depend on the *quality* of the choice, and a short reflection follows. Rooms chain into a path through the dungeon; the monsters are only the reactions in disguise (flavour).

## Rules

- **Content is the work here.** Write **18 original scenarios in English and 18 in French** (not translations of each other word for word, but the same structure), each: a 25 to 50 word situation, a mood tag, and 3 or 4 options. Every option has a hidden style tag: `reactive`, `avoidant`, `constructive`, `boundary`, `curious`; exactly one or two options per scenario are constructive. After the choice a 20 to 40 word reflection explains the effect warmly, never shaming a reactive choice ("Understandable. Here is another way to see it..."). Tests validate counts, lengths, tags and that every scenario has at least one constructive option and never only constructive ones.
- Topics are ordinary: transport, work friction, procrastination, social situations, small failures, money annoyance, family logistics. **Forbidden:** self-harm, abuse, trauma, medical or legal advice, politics, religion, anything a vulnerable player could find triggering. When in doubt, leave it out; list the topic list in the docs.
- A game is 5 to 7 rooms drawn from the seed, ordered by mood variety, easier ones first; `run.difficulty` makes choices subtler (less obvious wording).
- Score 0 to 1000 from the share of constructive and boundary choices, with a bonus for variety of styles (practice the full toolbox). `result`: won at 60 percent or better, lost otherwise (warm copy), fled on exit.
- `learned`: the player's strongest style this run and one practical tip for the weakest (en and fr), phrased as a suggestion.
- Reduced motion: no door animation, just a cross-fade or none.

## Engine

Pure and deterministic: scenario selection and option order from the seed, option shuffling stable, scoring exact. `botPlay` picks constructive options with a seeded error rate.

## Party and buffs

The Social troop reveals the style tag of one option per room; the Sleep troop adds a "sleep on it" action that shows the reflection of one option before choosing (once per run); the Study troop shows the reframing question. `hint` buff reveals a tag; `revive` lets one choice be re-picked; `luck` surfaces a gentler scenario; ignore `attack`, `defense`, `time`.

## Acceptance

- Unit tests for the content (counts, lengths, tags, no forbidden topics via a keyword guard list, structure parity en and fr), scoring maths, determinism, bot behaviour, no scenario repeated within a game.
- Fully keyboard operable (number keys choose), readable at 150 percent text, contrast 4.5:1.
- `docs/games/decision-dungeon.md` lists the topics, the tag definitions, the not-therapy note and who to ask for help (a generic "talk to someone you trust or a professional" line, no phone numbers).

## Cut line

Scenarios 13 to 18 in each language (keep 10 each, never fewer), the sleep-on-it action, the variety bonus.
