# Brief F: Citizens design (docs and prototype only)

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Base branch | `main` |
| Branch | `docs/F-citizens-design` |
| PR title | `docs(design): citizens, needs and gifts, with prototype [F]` |
| Reserved save version | plans for **v6** (the build brief N will implement it) |
| Size | medium, new files only, no code |

## Goal

Design the Citizens feature so engineers can build it in brief N without asking questions. Citizens are original NPCs who move into the Haven as rings unlock, each with one gentle need tied to a habit and one gift when it is met.

## Read first

`AGENTS.md`, `docs/design/GDD.md` (vision, core loop, rings, vassals, utilities, wave, screens, tone and wellbeing), `docs/research/source-analysis.md` section 9 hook 9 and section 10 (everything must be original), `docs/design/CITY-MAP.md` (so citizens fit the map and outposts), `docs/design/ART.md`, `docs/RESPONSIVE-RULES.md`, `src/game/types.ts` (SaveFile v4), `src/game/content/rings.json`, `src/game/economy.ts`.

## You may create

- `docs/design/CITIZENS.md`
- `docs/design/prototypes/citizens.html`, `docs/design/prototypes/citizens-*.png`
- `docs/design/prototypes/assets/citizens/**`
- `docs/review/notes/F.md`

## Hands off

Everything under `src/`, `e2e/`, `.github/`, and every existing doc.

## Content of the design (decisions already made, elaborate them)

- Two citizens per ring from ring 2, twelve in total. Each has a name, a two-line personality, a portrait description for the artist, one need tied to a habit (the children need a tidy common room: Clean; the night nurse needs you asleep on time: Sleep; the retired runner needs company on walks: Move plus Social), and one gift when the need has been met for N days: a resource, a small permanent buff, a decor piece, or a story beat.
- Needs are gentle. An unmet need makes the citizen "waiting", never leaving, never scolding. Strict mode may let a citizen "visit elsewhere" for a while.
- Arrival rules and vignettes (80 to 150 words each, system-window voice).
- Need tracking over rolling 7-day windows, reusing the existing activity archive in the save.
- Gifts table with exact numbers consistent with the GDD economy: nothing stronger than a title.
- A "Residents" panel on the Haven screen and a citizen detail window.
- Interaction with outposts: a citizen can be linked to an outpost (the doctor's clinic).
- SaveFile additions as TypeScript (version 6), engine functions in the existing contract `(save, now, ...) => { save, events, error? }`, events, content JSON schema (`citizens.json`), wireframes at 390 and 768 widths, accessibility, and an ordered implementation plan with tests.

## Deliverables

1. `docs/design/CITIZENS.md` (3000 to 6000 words) covering the list above.
2. A self-contained HTML prototype (`citizens.html`, inline CSS and JS, Google Fonts allowed) showing the Residents panel at three rings in waiting and content states, plus the detail window. Screenshot it with Playwright at 320, 390 and 1024 widths, look at the screenshots, iterate until it reads as a finished game screen. Keep images under 1.5 MB in total.

## Acceptance

- A table proving gifts cannot out-earn habits, using real numbers from `src/game/economy.ts`.
- Every number in the document is consistent with the GDD.
- The implementation plan lists the exact files brief N will create and edit, and which of them are hot files (see `docs/PARALLEL-WORK.md` section 4.4).
- Nothing copies a name, quote or art from the source work.

## Prompt

> You are agent F. Read `AGENTS.md`, then follow `docs/briefs/F-citizens-design.md` exactly, and the PR rules in `docs/PARALLEL-WORK.md` section 4. Branch from the latest `main`, open a draft PR against `main` after your first commit with the label `docs-only`, and mark it ready when every acceptance item passes.
