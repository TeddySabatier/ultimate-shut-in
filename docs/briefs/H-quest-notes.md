# Brief H: "What I learned" notes on quests (finish an existing branch)

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Base branch | `main` |
| Branch | **continue `cursor/quest-learned-notes-40d2`** (do not start a second branch) |
| PR title | `feat(notes): save what you learned on each quest [H]` |
| Reserved save version | **v5** (`SAVE_VERSION` 4 to 5) |
| Size | medium, 24 files already changed |

## Goal

A short "What I learned" note on every quest card, kept per quest template so it survives the next board, and editable from the Ledger for quests that are not on today's board. A Cursor agent already built a first version in one commit (`6bcd201`) on top of the Map commit. Treat it as an unreviewed draft: review it critically, fix it, finish it, and land it.

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/PARALLEL-WORK.md` (section 4), `docs/RESPONSIVE-RULES.md`, `src/game/README.md`, then the draft: `git show 6bcd201 --stat` and the new files `src/game/notes.ts`, `src/components/LearnedField.tsx`, `src/components/LearnedShelf.tsx`.

## Step 0: bring the branch up to date

The branch forked from `31689ea` and conflicts with today's `main` in `docs/ARCHITECTURE.md`, `docs/design/GDD-errata.md` and `src/game/save.ts`. Run `git fetch origin && git merge origin/main` (a merge, not a rebase), resolve them: in `src/game/save.ts` keep both (the version is 5 on top of main's 4); in `docs/design/GDD-errata.md` keep both (append, renumber after main's last entry); in `docs/ARCHITECTURE.md` **take main's version** and move the draft's added text into your notes file. Then run the full checks and push. Do this first and mention it in the PR description.

## You may edit

- `src/game/notes.ts`, `src/game/notes.test.ts`
- `src/game/types.ts` and `src/game/save.ts`: only the notes addition and the version 5 migration
- `src/game/index.ts`: additive exports
- `src/components/LearnedField.*`, `src/components/LearnedShelf.*`, `src/components/QuestCard.tsx` (the note box only)
- `src/screens/QuestsScreen.tsx`, `src/screens/CharacterScreen.tsx` (the notes section only)
- `src/state/gameStore.ts`: add the notes actions next to the custom quest actions, nothing else
- `src/game/content/strings.json`: **only your own top-level key `notes`**, inserted immediately before the existing `"proposals"` key (your anchor; it keeps your edit away from other briefs' edits). Move any strings the draft put elsewhere into it.
- `e2e/notes.spec.ts` (new). The draft touched `e2e/helpers.ts` and `e2e/settings.spec.ts`: keep those edits minimal and backward compatible.
- `docs/PLAYER-GUIDE.md`: a new `## What I learned notes` section placed right after `## The board` (your anchor). Do **not** edit `docs/ARCHITECTURE.md` or `README.md`: write the architecture paragraph for version 5 in your notes file and the maintainer folds it in at the end of the wave.
- `docs/review/notes/H.md`

## Hands off

Everything else, especially `src/game/custom.ts`, `src/notifications/**`, `src/components/map/**`, `playwright.config.ts`, `.github/**`.

## Review checklist for the draft (fix what fails)

1. **Privacy and limits.** Notes are free text the player writes. Cap length (for example 500 characters), trim, never log note text in the activity archive or send it anywhere. Export and import must carry notes; the migration from version 4 must give an empty list.
2. **Identity.** One note per quest template id, including custom templates and archived ones; renaming or archiving a template must not orphan or duplicate its note. Deleting a template keeps the note readable in the Ledger.
3. **Undo and boards.** Writing a note never changes rewards, trust, loyalty or utilities. Undoing a quest keeps the note.
4. **Immutability.** The engine function follows the pure contract and does not mutate its input; add a test that fails if it does.
5. **UI.** Textarea has a visible label; the note saves on blur and on an explicit Save, with an unsaved-changes guard on the card; 44px targets; the responsive rules in `docs/RESPONSIVE-RULES.md` (320px width, 150% text, landscape). The shelf in the Ledger lists notes newest first and is keyboard reachable.
6. **Tone.** Copy is warm and short and lives under `notes` in `strings.json`.
7. **Save version.** `SAVE_VERSION` is 5, `STORAGE_VERSION` in the store is bumped only if the persisted envelope shape changed (it should not be), and `src/game/save.test.ts` covers 4 to 5 and 3 to 5.

## Acceptance

`npm run lint`, `typecheck`, `npm test`, `npm run build` pass; `npx playwright test e2e/notes.spec.ts e2e/quests.spec.ts e2e/settings.spec.ts` pass; screenshots only for screens you changed (see `docs/PARALLEL-WORK.md` section 4.7).

## Prompt

> You are agent H. Read `AGENTS.md`, then follow `docs/briefs/H-quest-notes.md` exactly, and the PR rules in `docs/PARALLEL-WORK.md` section 4. Work on the existing branch `cursor/quest-learned-notes-40d2`; merge the latest `main` into it first; open a draft PR against `main` immediately after that merge push, and mark it ready when every acceptance item passes.
