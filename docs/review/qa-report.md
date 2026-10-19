# QA report: Haven Protocol v0.1.0

Date: 2026-10-19. Verified on the main branch at tag v0.1.0.

## What was tested

| Layer | Tool | Count | Result |
| --- | --- | --- | --- |
| Engine unit tests (src/game) | vitest | 155 | pass |
| Store, components, screens | vitest + testing-library | 115 | pass |
| End-to-end (mobile + desktop chromium) | Playwright, 8 spec files | 62 tests | pass (local and CI) |
| Accessibility | axe-core on onboarding, Haven, Board, Ledger, Settings | serious/critical = 0 | pass |
| PWA | manifest, service worker registration, offline reload | 1 spec | pass |
| Visual | 46 screenshots in e2e/__screenshots__ | reviewed by the orchestrator | ok |

End-to-end coverage: onboarding (name, habits, difficulty, reload keeps save), quests (check, timer survives reload, count stepper, I tried, undo, reroll, disabled habits hidden after a day change), progression (8 simulated days via the debug clock: wave window, Domain Points, level up, utility decay and restore), character (vassal detail, locked titles, inline rename), settings (min one habit, reset hour keeps today's board, export/import JSON, type-to-confirm reset, benevolence copy), PWA (manifest name, icons, service worker, offline), a11y (axe, button names, 44px tap targets).

## Bugs found and fixed during QA

- Onboarding name input was prefilled with "Absolute", so a typed name became "AbsoluteTeddy" (src/screens/OnboardingScreen.tsx). Now a placeholder with fallback on empty submit.
- Habit checkboxes exposed the accessible name "on"; labels are now associated with their inputs (OnboardingScreen, SettingsScreen).
- Scroll-to-top on route change threw in jsdom because scrollTo is undefined there (src/components/AppShell.tsx). Guarded.
- Toast and overlay layering, quest card spacing and dialog backdrop adjusted after screenshot review (overlays.module.css, QuestCard.module.css, ConfirmDialog.module.css).
- Store clock extracted to src/state/clock.ts so e2e tests can shift time; the window.__haven debug hook only exists in dev or with localStorage haven.debug = 1.
- Pacing simulation test given a 120s timeout; it timed out under parallel load.

Engine findings from the adversarial review (16) were all fixed earlier and each has a regression test in src/game/review.test.ts; see engine-review.md.

## Known issues and gaps (not blocking v0.1.0)

- Toasts auto-dismiss after a fixed 3.2s with no pause on hover; overlays queue rather than stack.
- Import replaces the save after a confirm but shows no preview of the file.
- Install button appears only when the browser fires beforeinstallprompt; iOS gets a text hint.
- GitHub Pages deploy is manual and needs the repo to be public or a paid plan (see docs/DEPLOY.md).
- Out of scope for v1 by design: citizens, shop registration, familiars, notifications, sync.

## How to reproduce

```bash
npm ci && npx playwright install chromium && npm run lint && npm run typecheck && npm test && npm run e2e
```
