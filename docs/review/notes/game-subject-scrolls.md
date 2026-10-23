# Notes: Scroll Room (`game-subject-scrolls`)

Decisions taken unattended while building the subject-learning game and its two decks. PR: feat/game-subject-scrolls against `integration/arena`.

## Files outside the game folder, and why

- `src/games/shared/scheduler.ts`, `src/games/shared/typedAnswer.ts`: Word Forge's in-run spaced repetition and typed-answer checker, lifted so both games share them. `src/games/word-forge/engine.ts` now imports them (and re-exports the checker, so its tests and Screen are untouched); its 50 tests stay green and its behaviour is unchanged.
- `src/games/shared/decks/`: the deck schema, the validator, its tests and the two decks. Content, not code, reusable by the Archivist room later.
- The branch was fast-forwarded to `origin/main`, three documentation commits ahead of `integration/arena`, because the decks are authored from `docs/learning/sources/` and the validator's allow-list test reads those files. Nothing in them was edited.

## Needs a maintainer (not edited here)

- **`eslint.config.js`:** `src/games/shared/` is a reserved folder in CONTRACT.md section 2, but the cross-game import rule (`OTHER_GAMES` regex, "a game imports only its own folder, ../contract, ../ui and ../testing") does not allow `../shared/`. Suggested one-line change: `regex: '^\\.\\./(?!(ui|testing|shared)/|contract(\\.ts)?$)[^./]'`. Until then, the four imports of `../shared/...` (Word Forge engine, Scroll Room engine, progress and Screen, plus the engine test) carry a commented `eslint-disable-next-line no-restricted-imports`. Remove the comments once the config lists `shared`.
- **Storage.** The brief asks for deck selection and per-card progress in localStorage under the game's own key (`haven.games.subject-scrolls`) for v1, with no SaveFile change. The games ESLint rule forbids `localStorage` ("mini games are offline and stateless"), so the two accesses in `Screen.tsx` carry a commented `eslint-disable-next-line no-restricted-globals`. The engine stays pure: the Screen reads the key at mount and dispatches a `setup` action with the selection and the history; it writes the key once when the outcome appears. Follow-ups below move this into the save.

## Design decisions

- **Deck format** (`src/games/shared/decks/schema.ts`): id, subject, topic, tier 1 to 3, prompt, answer, three distractors, explanation under 240 characters, `source` (the attribution string of the sources file, starting with `sourceUrl`), `sourceUrl` (host in a per-subject allow-list; a test proves every allowed host appears in `docs/learning/sources/<subject>.md`), optional `accept` (other typed spellings) and optional `steps` (2 to 5 steps for ordered-answer cards). Every card is playable as multiple choice; from difficulty 3 a card with steps is "put in order" and a short answer is typed.
- **Cards are in English**, the language of their sources; the UI is in English and French. A French card layer is a follow-up.
- **Draw:** 15 to 20 cards (15, 16, 17, 18, 20 by difficulty) weighted by tier (recall at 1, puzzles at 5) and by history (missed last time x3, never seen x1.5, mastered x0.4). `luck` swaps that percentage of the hardest picks for easy cards.
- **Score** = 700 x accuracy + 300 x recall. Accuracy as in Word Forge (last credit, 0.6 for a card missed in the run, unless a `revive` forgave it). Recall = share of weak cards (weak coming in, or missed in the run) that ended right; 1 when there is none. Win at 70 percent accuracy.
- **Explanation step:** after every answer the engine waits in `explaining` until `next`, so the explanation and source link are part of the deterministic game, and the bot replays them.
- **Party:** Study shortens the final check (6 instead of 8) and helps the bot (+0.03); Social gives one hint; average power gives `floor(power / 25)` hints. Buffs: `hint` (remove a wrong option, first letters, first step), `revive` (forgives one miss for the score), `luck` (easier draw); `attack`, `defense`, `time` ignored (no fight, no clock).
- **Typed grading:** case, accents, spaces, dashes and underscores ignored; `accept` alternatives; one edit is "almost" (two on answers of 12 characters or more).

## Deck authoring and fact-check

Filled in after the agents report (card counts per deck before and after the fact-check, pages opened, cards fixed or deleted).

## Follow-ups (not in this PR)

1. **Armory "Study table" entry:** a list of installed decks with a progress ring (cards seen, cards mastered) and the deck selection, instead of the game's own lobby.
2. **Save array:** move the per-card record (`id`, `seen`, `wrongs`, `lastRight`) and the deck selection from `localStorage['haven.games.subject-scrolls']` into the SaveFile (one array, with a migration), so progress survives a cleared site storage and syncs with the rest of the save. The engine's `setup` action already takes the history as plain data, so only the Screen's two accesses change.
3. The Archivist room in Roguelike Chess and subject-flavoured upgrades (design doc 4b, ideas 2 and 3) can reuse `cardsOf()` and `getCard()`.
4. A French card layer (prompt, options and explanation in French) once the decks are stable.

## Cut line

Nothing cut.
