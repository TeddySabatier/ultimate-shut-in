# Brief E: French localisation groundwork

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Base branch | `main` |
| Branch | `feat/E-i18n-groundwork` |
| PR title | `feat(i18n): translation catalog, French strings and hook, not wired yet [E]` |
| Reserved save version | none (the locale lives in `localStorage` key `haven.locale`, not in the save) |
| Size | medium, new files only |

## Goal

Prepare French (the main player is French) without touching any screen. Brief M wires it later, alone, once this has merged. Everything here is new files, so it cannot conflict with other work.

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/PARALLEL-WORK.md` (section 4), `src/game/content/strings.json` and `schema.md`, `src/game/content/titles.json`, `docs/design/GDD.md` (tone: warm, slightly dry), `src/game/compose/keywords.ts` (the parser already understands French).

## You may create or edit

- `src/i18n/**` (new)
- `src/game/content/strings.fr.json` (new)
- `src/game/content/schema.md`: append an "i18n" section only
- `docs/I18N.md` (new)
- `docs/review/notes/E.md`

## Hands off

Every file under `src/screens/`, `src/components/`, `src/state/`, `src/App.tsx`, and every existing JSON file except the schema append. Do not edit `strings.json`.

## Deliverables

1. `src/i18n/index.ts`: `t(key, params?)`, `setLocale`, `getLocale`, `detectLocale()` (reads `haven.locale` from `localStorage` first, then `navigator.language`, default `en`; wrap storage in try/catch), `{param}` interpolation, simple plural rules for `en` and `fr` (`{n, plural, one {...} other {...}}` style or a documented equivalent).
2. `src/i18n/useT.ts`: a React hook that re-renders on locale change.
3. `src/i18n/catalog.ts`: loads `strings.json` (English, existing) and `strings.fr.json` (new).
4. `src/game/content/strings.fr.json`: a natural French translation of every key that exists in `strings.json` today: the opening, the seven ring vignettes, every toast pool, compose, proposals, map and reminders copy. Keep the warm, slightly dry tone. Use "tu". "Haven" and the vassal names stay unchanged. Titles get French names in a `titlesFr` map inside this file; do not edit `titles.json`.
5. `src/i18n/ui.en.json` and `ui.fr.json`: every hard-coded UI string you can find in `src/screens` and `src/components` (read-only pass: JSX text, `aria-label`, `placeholder`, `title`), keyed by screen, so brief M can replace them mechanically.
6. `docs/I18N.md`: how the catalog works, the key naming rules, how to add a string, and the file-by-file wiring plan for brief M.
7. `npm run i18n:check` (script in `package.json`, code in `scripts/i18n-check.mjs`): prints keys missing from French, keys in French that do not exist in English, and `{param}` mismatches.

## Parity rule (important, it prevents a merge trap)

Other briefs will add English keys while this one is open. So the unit test must **fail** only on: keys present in French but absent in English, and interpolation parameter mismatches. Keys missing from French are a **warning list** (printed by `i18n:check` and by the test, not failing). Brief M turns missing keys into a failure.

## Acceptance

- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass.
- Tests: interpolation, plurals (0, 1, 2, 21 in French), locale detection and persistence fallback, key-tree parity as described above.
- No screen renders differently; the bundle grows only by the catalog and the hook.

## Prompt

> You are agent E. Read `AGENTS.md`, then follow `docs/briefs/E-i18n-groundwork.md` exactly, and the PR rules in `docs/PARALLEL-WORK.md` section 4. Branch from the latest `main`, open a draft PR against `main` after your first commit, and mark it ready when every acceptance item passes.
