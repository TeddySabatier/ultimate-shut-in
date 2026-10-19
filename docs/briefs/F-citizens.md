# Brief F: Citizens (design, engine and UI)

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Deliverable | **two pull requests**, in two agent runs: **F1** (design and engine), then **F2** (UI) started from F1's branch and stacked on it |
| F1 branch and base | `feat/F1-citizens-engine`, base `main` |
| F2 branch and base | `feat/F2-citizens-ui`, base `feat/F1-citizens-engine` (declared stack, see `docs/PARALLEL-WORK.md` 4.3) |
| PR titles | `feat(citizens): design, content and engine [F1]` and `feat(citizens): residents panel and citizen window [F2]` |
| Reserved save version | **v6** (F1 bumps `SAVE_VERSION` to 6) |
| Merge order | after brief H (v5) and before brief G (v7). See `docs/PARALLEL-WORK.md` 3. |
| Size | large |

## Goal

Original NPCs move into the Haven as rings unlock. Each has one gentle need tied to a habit and gives a gift when the need has been met for a while. This turns "keep all habits balanced" into a story, and it is the roster the Arena (brief G) will use later. Ship it fully: the spec, the engine, the content, the screens, the tests.

## Decisions already made (elaborate them, do not re-litigate)

- Two citizens per ring from ring 2: twelve in total. Each has a name, a two-line personality, a portrait description, one need tied to a habit (the children need a tidy common room: Clean; the night nurse needs you asleep on time: Sleep; the retired runner needs company on walks: Move plus Social), and one gift when the need has been met for N days: a resource, a small permanent buff, a decor piece, or a story beat.
- Needs are gentle. An unmet need makes the citizen **waiting**, never leaving, never scolding. In Strict mode a citizen may be "visiting elsewhere" for a while, and comes back when the need is met again.
- Needs are tracked over rolling 7-day windows from the existing activity archive in the save.
- Gifts are small: nothing stronger than a title. A table with real numbers from `src/game/economy.ts` must prove that citizens cannot out-earn habits.
- Citizens can be linked to an outpost on the Map (the doctor's clinic); the link is optional and only changes where they are shown.
- Everything is original: names, text, art. Nothing from the source work.

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/PARALLEL-WORK.md` (section 4), `docs/RESPONSIVE-RULES.md`, `docs/design/GDD.md` (vision, rings, vassals, utilities, wave, tone and wellbeing), `docs/design/CITY-MAP.md` (how a feature spec and its engine fit together here), `docs/design/ART.md`, `docs/research/source-analysis.md` section 10 (originality), `src/game/README.md`, `src/game/types.ts`, `src/game/tick.ts`, `src/game/wave.ts`, `src/game/economy.ts`, `src/game/content/rings.json`, `src/game/outposts.ts`.

## F1: design, content and engine

You may edit:

- `docs/design/CITIZENS.md` (new, 2000 to 4000 words): the spec, with the economy proof table, wireframes of the two screens at 390 and 768 widths, the SaveFile addition, the events, the content schema, accessibility notes. No HTML prototype is needed: the real screens in F2 are the prototype.
- `src/game/citizens.ts` and `src/game/citizens.test.ts` (new): pure functions in the engine contract `(save, now, ...) => { save, events, error? }`: arrival at ring unlock, need windows, waiting and visiting states, gifts, claiming, linking to an outpost.
- `src/game/content/citizens.json` (new): the twelve citizens with arrival vignettes (80 to 150 words, system-window voice), needs, gifts. Document every field in `src/game/content/schema.md` (append a section) and validate it in `src/game/content/index.ts` and `content.test.ts` (additive).
- `src/game/types.ts` and `src/game/save.ts`: add `citizens` to `SaveFile` **right after the existing `activity` field** (your anchor), bump `SAVE_VERSION` to 6, write the migration for 4 and 5 (a v5 save has `notes` from brief H; the migration must work with or without it), and the events you need. Tests for every earlier version.
- `src/game/tick.ts`: hook arrival and need tracking into the day boundary. `src/game/wave.ts`: if citizen buffs touch wave defense, add one `citizens` term to the breakdown next to the `outposts` term and note it in the errata.
- `src/game/index.ts`: additive exports.
- `src/game/content/strings.json`: **only your own top-level key `citizens`**, inserted immediately before the existing `"compose"` key (your anchor).
- `docs/design/GDD-errata.md`: append entries for anything that departs from the GDD.
- `docs/review/notes/F.md`

## F1 hands off

Every file under `src/screens/`, `src/components/`, `src/state/`, `e2e/`, `.github/`, and everyone else's keys and sections.

## F1 acceptance

- Engine tests: arrival at each ring, no arrival twice, need windows across day boundaries and long absences (the catch-up caps), waiting versus visiting, gifts claimed once, undo of a quest that moves a need, migration from v4 and v5, determinism, input never mutated.
- A simulation test shows a Steady player at 90% adherence meets most needs and a Gentle player at 60% meets some, and that gift value per week stays under the cap you document.
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass.

## F2: screens (stacked on F1)

Start F2 once F1 has its first green CI run; branch from F1's branch and set the PR base to it (label `stacked`, first line of the description `Stacked on #<F1 number>. Merge that one first.`). You may edit:

- `src/components/citizens/**` (new): the Residents panel, the citizen window, claim and link actions
- `src/screens/HomeScreen.tsx`: add the Residents panel as one block **between the utilities panel and the vassal strip** (your anchor), nothing else
- `src/components/overlays/eventText.ts` and `OverlayHost.tsx`: additive cases for your events only
- `src/assets/citizens/**` (new): twelve original SVG portraits at 128x128 in the style of the vassal portraits (read `docs/design/ART.md` and look at `src/assets/vassals/`), plus a silhouette; `src/assets/index.ts` and `src/assets/assets.test.ts`: additive block for your assets
- `src/state/gameStore.ts`: your actions as one block placed **right after the outpost actions** (your anchor)
- `e2e/citizens.spec.ts` (new); add the Residents panel to `e2e/responsive.spec.ts` as one additional case
- `docs/PLAYER-GUIDE.md`: a new `## Citizens` section **right after `## The City Map and outposts`** (your anchor)
- `docs/review/notes/F.md`

Hands off: the engine files (they belong to F1; if F2 needs an engine change, push it to F1's branch, never to F2's), every other screen.

## F2 acceptance

- Every string comes from `strings.json` under `citizens`; no hard-coded text in JSX (the French wiring depends on it).
- Follows `docs/RESPONSIVE-RULES.md` at 320x568, 390x844 at 150% text and 844x390, with screenshots in the PR description; the window scrolls internally and its primary action stays reachable.
- Waiting citizens read warm, never as a failure. Reduced motion respected. Keyboard and screen reader complete.
- e2e: a ring unlock brings the first citizens, a met need shows content, the gift can be claimed once, axe passes on the panel and the window.
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass and the specs above pass on both projects.

## Prompts

Run 1, starting branch `main`:

> You are agent F1 on Haven Protocol. Read `AGENTS.md`, then `docs/PARALLEL-WORK.md` sections 1 and 4, then follow `docs/briefs/F-citizens.md`, section "F1" only, exactly. Open a draft PR against `main` after your first commit using the PR template, and mark it ready only when the F1 acceptance list passes. Do not merge anything and do not start F2.

Run 2, started after F1 has a first green CI run, **starting branch `feat/F1-citizens-engine`**:

> You are agent F2 on Haven Protocol. Read `AGENTS.md`, then `docs/PARALLEL-WORK.md` sections 1 and 4, then follow `docs/briefs/F-citizens.md`, section "F2" only, exactly. Your starting branch is F1's branch: create `feat/F2-citizens-ui` from it, open a draft PR whose base is `feat/F1-citizens-engine` (not `main`) with the label `stacked` and the first line `Stacked on #<F1 PR number>. Merge that one first.`, and mark it ready only when the F2 acceptance list passes. Merge F1's branch into yours whenever F1 changes. Do not merge anything.
