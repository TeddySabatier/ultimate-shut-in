# Notes: Word Forge (`game-word-forge`)

## Decisions (nobody was available)

- **Branch and PR.** Started from `origin/integration/arena` as `feat/game-word-forge`. Draft PR against that same branch. Will not merge, will not push to `main` or `integration/arena`.
- **ManagePullRequest.** This cloud run's tool catalog has no `ManagePullRequest` (cursor, cursor-cloud, and the rest). `gh pr create --draft` failed with `Resource not accessible by integration (createPullRequest)`. The branch is pushed; the PR must be opened with the dedicated write tool or by the parent run. Work continues on the branch.
- **Timer.** The brief marks a timer as optional and maps `time` buffs to extra seconds when one exists. A coarse `{ type: 'second' }` clock is included so speed can score and the `time` buff is honoured by the contract kit. Base par is 180 seconds plus the buff plus `floor(avgPower / 11)`. Seconds do not advance the deal RNG (that would make two real-time plays of the same seed diverge). The e2e replay pauses the clock so wall time cannot change the speed score either.
- **Run length.** "20 cards" is 20 unique words drawn at the start. Reviews from the scheduler are extra presentations (first right → back after 8, or 6 with Study; first miss → after 2; later miss → after 5). A word is done after its final check, or after at most four shows, so the game stays bounded.
- **Party vs starter.** `parties.starter` has Move, Outside and Clean only. Eat / Study / Social perks are engine-visible (deck bias, shorter right-interval, one auto first-letter on a typed card) so full and starter play differently even though the starter troop has none of those habits. Higher power also adds a few par seconds.
- **Ignored buffs.** `attack` and `defense` do nothing: there is no combat. Said so under `## Buffs`.
- **Cognates.** Identical en/fr strings are allowed only on the allow-list in `words.ts`.
- **Epicene French nouns** (`élève`, `collègue`, `enfant`) are tagged `n` (no single gender), same as non-nouns.
- **Accent toggle.** Difficulty 3 starts tolerant, 4–5 start strict; the player may still toggle. Ligatures `œ`/`æ` fold to `oe`/`ae` only in the tolerant path, with accents stripped via NFD.
- **Content split.** Spellings, POS and gender live in `words.ts` (engine). Example sentences live in `examples.ts` (Screen + tests only) so the long lines stay out of the registry chunk.
- **Bot.** Seeded per-card accuracy by difficulty, interleaved `second` actions. Never forfeits, never flips direction, never spends a hint.
- **French "email".** Used *e-mail* (metropolitan A2) rather than *courriel*.

## Translation review

Second pass over all 160 pairs. Nothing doubtful was kept; when unsure, the word was not used.

Kept with a note, not a doubt:

- *professeur* — masculine citation form; used for any teacher in everyday French.
- *élève*, *collègue*, *enfant* — epicene, tagged `n`.
- *gare* for “station”, *partir* for “leave”, *droite*/*gauche* as directions.
- *pause* / *cours* / *date limite* / *week-end* / *s'il te plaît* / *œuf* / *sœur* as documented in `docs/games/word-forge.md`.

Cognates on the allow-list (identical spelling): orange, dessert, restaurant, sandwich, train, bus, village, taxi, question, parent.

Dropped rather than guessed: false friends (*librairie*), slang, medical terms, and any pair I could not stand behind.

## Files needed that this brief does not own

- Opening the draft PR: `ManagePullRequest` is missing in this run (cursor tools are AwaitShell, Delete, EditNotebook, FetchMcpResource, GenerateImage, ReadLints, TodoWrite, WebFetch, WebSearch). `gh pr create --draft` and `POST /repos/.../pulls` both return `403 Resource not accessible by integration`. Branch `feat/game-word-forge` is on origin, base should be `integration/arena`, title `feat(games): Word Forge [game-word-forge]`, draft until this body is pasted, then **ready** (acceptance below is green). Do not merge from this agent.

## Acceptance (green on `31f2466`)

```
npm run lint        clean
npm run typecheck   clean
npm test            838 passed, 62 files
npm run build       ok
npx playwright test e2e/games/word-forge.spec.ts --workers=2
                    11 passed, 1 skipped (axe desktop), both projects
```

Contract kit 10/10. Engine tests 36. Screen tests 3. Screenshots: `docs/games/img/word-forge-{start,end}.png`, 22.3 KB.

## PR body to paste

## Brief

Brief id and file: `game-word-forge`, `docs/briefs/games/word-forge.md`
Wave: overnight / Arena program

## What and why

Adds **Word Forge**, a self-development mini game: spaced-repetition vocabulary in the player's other language (English practises French, French practises English, with an in-game switch). Four A2–B1 decks of 40, multiple-choice then typed answers, a tiny scheduler, party perks (Study / Social / Eat) and Arena buffs (`hint`, `time`, `revive`, `luck`).

## Base and stacking

- [x] Base branch is the one my brief names (`integration/arena`)
- [x] Stacked on another PR: no

## Scope check

- [x] Every changed file is in my brief's "You may edit" list
- Files outside that list: none
- Files I needed but do not own: opening the PR (see notes)

## Save format

- Save version before and after: unchanged

## Tests

```
npm run lint        clean
npm run typecheck   clean
npm test            838 passed
npm run build       ok
npx playwright test e2e/games/word-forge.spec.ts --workers=2
                    11 passed, 1 skipped, both projects
```

- [x] New logic has tests that fail without it
- [ ] CI is green on the head commit (pending the PR)

## Screenshots (UI changes)

`docs/games/img/word-forge-start.png`, `docs/games/img/word-forge-end.png` (22.3 KB). 320x568 and 844x390 checked by `expectResponsiveGame`.

- [x] Responsive checklist in `docs/RESPONSIVE-RULES.md` passed
- [x] No horizontal scroll, nothing clipped, tap targets 44px

## Notes

Notes file: `docs/review/notes/game-word-forge.md`
Open questions or risks for the reviewer: translation review is in the notes and in `docs/games/word-forge.md`. `attack`/`defense` ignored (no combat).

---
- [x] I did not merge, close, retarget or force-push anything, and I did not touch another agent's branch
