# Brief J: Weekly recap card (shareable image)

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Base branch | `main` |
| Branch | `feat/J-weekly-recap-card` |
| PR title | `feat(recap): shareable weekly recap card from the wave result [J]` |
| Reserved save version | none |
| Size | medium |

## Goal

After each wave, the wave result window offers "Save recap": the app draws a recap image on the device (canvas, no network) and lets the player save it or share it with the Web Share API. It shows the ring and its scene, attack against defense, the defense breakdown, vassal levels, the result and the Domain Points earned.

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/PARALLEL-WORK.md` (section 4), `docs/RESPONSIVE-RULES.md`, `docs/design/ART.md` (palette), `src/components/overlays/WaveResultWindow.tsx` and its CSS, `src/game/wave.ts` (the wave record and breakdown, including the outposts term), `src/assets/index.ts`.

## You may edit

- `src/components/recap/**` (new): a pure `buildRecap(record, save)` that turns data into a list of draw commands (unit-testable, no DOM), a thin canvas renderer, the share helper
- `src/components/overlays/WaveResultWindow.tsx` and its CSS: add the button and nothing else
- `src/game/content/strings.json`: **only your own top-level key `recap`**, inserted immediately before the existing `"map"` key (your anchor)
- `e2e/recap.spec.ts` (new)
- `docs/PLAYER-GUIDE.md`: a `### The weekly recap card` subsection at the end of `## The weekly wave` (your anchor)
- `docs/review/notes/J.md`

## Hands off

`src/game/**` other than reading, `src/state/**`, `src/components/map/**`, all other overlays, `e2e/helpers.ts`.

## Requirements

1. 1080 x 1350 PNG, palette from `docs/design/ART.md`, fonts already bundled (wait for `document.fonts.ready` before drawing). No text baked from the source work.
2. **Privacy.** The player's name is off by default and a toggle ("Include my name") turns it on. Nothing is uploaded. The card contains no free-text the player wrote (no quest notes, no custom quest titles).
3. Fallbacks: `navigator.canShare({ files })` then share; otherwise a download link; if canvas is unavailable, hide the button.
4. Works offline and with reduced motion (the card is static anyway). Large text and 320px width do not break the button row in the window (see the responsive rules: overlays scroll internally and the primary action stays reachable).
5. Warm copy, one line per outcome (decisive, win, held, quiet).

## Acceptance

- `buildRecap` has unit tests for each of the four results and for a long vassal name.
- A canvas renderer test with a mocked 2D context asserts call order and that no network request is made.
- e2e: reach a wave result with the debug clock helpers in `e2e/helpers.ts` (do not edit them), click "Save recap", expect a download of a PNG with the expected dimensions (Playwright `download` event), and run axe on the window.
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass; the new e2e passes on both projects.
- One new screenshot of the window with the button is enough; do not regenerate others.

## Prompt

> You are agent J. Read `AGENTS.md`, then follow `docs/briefs/J-weekly-recap-card.md` exactly, and the PR rules in `docs/PARALLEL-WORK.md` section 4. Branch from the latest `main`, open a draft PR against `main` after your first commit, and mark it ready when every acceptance item passes.
