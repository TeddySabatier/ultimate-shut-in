# Notes: Word Forge (`game-word-forge`)

## Decision on the earlier Cursor build

A Cursor agent had pushed an unreviewed build to `origin/feat/game-word-forge` (4 commits, 15 files, no PR). I evaluated it read-only, then adopted its files with `git checkout origin/feat/game-word-forge -- ...` (the branch itself was never merged). Adoption test: `npx vitest run src/games` including the contract kit, lint and budget tests passed on the adopted files unchanged, and the engine already followed the brief's scheduler and checker. **Kept:** the decks (160 entries, structure, cognate allow-list), the example sentences, the engine skeleton (seeded card draw, scheduler gaps 2 / 5 / 8, typed checker with Levenshtein "almost", buffs and party hooks, `learned`), the strings, the Screen and CSS layout, the Lab e2e structure.

**Changed in my review pass:**

- **Translations.** Second pass over all 160 pairs; eight single-answer problems replaced (list in `docs/games/word-forge.md`): left/right, river, weekend, student/élève, email, neighbour, please, angry. Doubtful entries that stay are listed there with reasons. No native-speaker review was possible overnight.
- **Balance.** The Cursor bot won 100 percent of games on every difficulty because the contract kit's bot stream does not depend on the seed and the "last mark per word" scoring forgave every early miss. Now: a word that needed the forge again is worth 0.6 of its final credit; `botPlay` mixes in a stream derived from the game seed; hit rates retuned. Result over 100 seeds with the full party: difficulty 1 100, 2 62, 3 60, 4 47, 5 24 wins.
- **Speed is a bonus, not a deadline.** The Cursor build ended the game as lost when the 180 s par ran out, which punishes slow typing and contradicts "the troops come home" being warm. Now only the speed points are lost.
- **Learning.** After every answer the live line shows the answer (`Answer: water = eau`); before, a miss never told the player the word. Typed cards focus the field automatically (keyboard-only play). Pausing hides the card (it used to let the player read it for free).
- **Checker.** `œ`/`æ` fold to `oe`/`ae` always (strict mode made `œuf` impossible on most keyboards); in strict mode, missing accents give "almost". The progress line now says "Strike 4: 2 of 20 words forged" instead of an unbounded card counter. The heat bar has a visible label.
- **Tests.** 37 engine tests to 53 (plus 3 Screen tests to 5): exact miss-return order, recovered-word scoring, deck quality and ambiguity checks, bot win-rate bands, party effect on the bot, checker table with ligatures, accents, apostrophes, hyphens, upper case and trailing spaces.
- **e2e.** The replay test uses `replaySameSeedWithBot` (the speed bonus reads real seconds); added a keyboard-only typed test and a pause test; third screenshot (`typed`).

## Other decisions

- "20 cards" is 20 unique words drawn at the start; reviews are extra presentations (a run is about 35 to 45 cards).
- Study: example sentence plus a shorter review gap. Social: one auto first letter on typed cards. Eat: food deck bias and a small bonus (flavour). `attack` and `defense` ignored (no combat).
- Epicene French nouns (*collègue*, *enfant*) are tagged `n`.
- The `time` buff and party power only add seconds of speed par.

## Needs from files I do not own

None.

## Cleanup for the maintainer

The Cursor branches `origin/feat/game-word-forge`, `origin/cursor/game-word-forge-0a34` and `origin/cursor/game-word-forge-bfbd` are superseded by this PR and should be closed by the maintainer after it merges. I did not touch them.
