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
- Out of scope for v1 by design: citizens, places/outposts, shop registration, familiars, notifications, sync.

## How to reproduce

```bash
npm ci && npx playwright install chromium && npm run lint && npm run typecheck && npm test && npm run e2e
```

## Suite performance

Brief D (test-suite diet), measured 2026-10-19 on the development machine (Windows 11, 16 cores, 4 workers locally). "Before" is `main` at `31689ea` with nothing changed; "after" is branch `chore/test-suite-diet`.

| | Before | After |
| --- | --- | --- |
| Full e2e, local wall time | 209 s (3.5 min), 99 passed and 1 failed by a navigation stall; runs hit by stall bursts took 4 to 11 min (a 2-worker mobile-only run took 644 s) | 93 s (1.5 min), 78 passed, none flaky |
| E2E tests | 100 (50 per project) | 78 (mobile 43, desktop 35) |
| Sum of test durations | 639 s (a11y on mobile alone: 290 s, four 64 to 90 s tests from stalls) | 250 s |
| CI Playwright job | 1 runner, 2 workers, whole suite | 3 runners in parallel; measured locally with 2 workers each: mobile 1/2 51 s, mobile 2/2 60 s, desktop 66 s of test time (55, 64, 73 s with the build and server start); CI adds checkout, `npm ci` and a cached Chromium |
| `e2e/__screenshots__` | 14.8 MB, 74 files | 2.5 MB, 58 files |
| Vitest | 31 s, 543 tests | 15 to 18 s, 543 tests (`pool: 'threads'`, `isolate: false`; green on 5 runs, one with `--sequence.shuffle`) |

What changed:

- **CI** (`.github/workflows/ci.yml`): the e2e job is a matrix of three runners, `mobile-chromium --shard=1/2`, `mobile-chromium --shard=2/2` and `desktop-chromium`, so mobile and desktop are separate shards. The unit job is untouched and e2e no longer waits for it (`needs: check` removed, the shards build the app themselves). Chromium is cached in `~/.cache/ms-playwright` keyed on `package-lock.json` (a hit only installs system packages). The report and `test-results/` are uploaded only on failure, one artifact per shard.
- **Visual spec**: each shot is captured at CSS pixels (no 2x duplicate), scaled to at most 480 px wide and written as a quantised PNG. One file per shot; a `-full` file only on mobile and only when the screen is taller than the viewport. The 8 images the README embeds keep their names (`mobile-chromium-04-onboarding-habits`, `-05-home`, `-06-board`, `-09-ledger`, `-10-settings`, `-12-level-up`, `-13-wave-result`, `-14-home-after-week`); they are 390x844 PNGs of 12 to 27 KB each (were 780x1688 at 120 to 400 KB), and the pixel font still renders.
- **`scripts/screenshots-dedupe.mjs`** (`npm run screenshots:dedupe`, `screenshots:check` for CI-style checking): lists what the specs can write (the `shoot()` calls of `visual.spec.ts` times the config's projects, the `VIEWPORTS` of `responsive.spec.ts`, literal `.png` names elsewhere) and deletes the rest of the folder. It removed the 16 files that no spec writes any more (the desktop `-full` files and the desktop viewport sheets).
- **a11y spec**: one test on the mobile project walks the three onboarding steps and the five tabs on a single save, runs axe once per screen with the same tags and the same serious/critical threshold, checks named buttons on each screen, the 44 px Board tap targets and the checkbox/radio names. `expect.soft` reports every failing screen in one run. It dropped from 16 tests (8 per project) and 312 s of test time to one test of 8 s.
- **Config**: the desktop project skips `a11y.spec.ts` and `responsive.spec.ts` (the sweep sets its own viewports and wrote the same sheets twice). The global timeout is 60 s (was 90 s) because the slowest test takes about 20 s; `visual.spec.ts` and `a11y.spec.ts` set their own limits (120 s) with `test.setTimeout`; other specs are not mine to edit. `fullyParallel` was already on and stays (every test starts from `freshApp` with empty storage). Navigations are capped at 20 s, retries are 2 locally and 1 in CI (see below). `E2E_WORKERS` overrides the worker count.

Known issue, not fixed here: navigations hang in bursts. `freshApp` in `e2e/helpers.ts` (not in this brief's files) sometimes waits 20 to 60 s on a `goto` or `reload` that never reaches `domcontentloaded`. This, not the amount of testing, is what turned a 3.5 minute suite into the 14 minute one. I traced it outside the test runner and ruled out the font CDN, `vite preview`, the worker count, IPv6 and a cold start; the suspect is the service worker taking over the reloaded page. Details and a suggested helper change are in `docs/review/merge-notes.md` under D. The config now limits the damage (20 s navigation cap, retries) but a run can still show flaky tests during a burst.

Reproduce the numbers: `npm ci && npx playwright install chromium && time npm run e2e`; per shard: `npx playwright test --project=mobile-chromium --shard=1/2`.
