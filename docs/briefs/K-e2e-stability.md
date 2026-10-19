# Brief K: Stop the end-to-end navigation hangs

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Base branch | `main` |
| Branch | `chore/K-e2e-stability` |
| PR title | `chore(e2e): stop navigation hangs in the shared helper [K]` |
| Reserved save version | none |
| Size | small, but needs patient measuring |

## Goal

Playwright navigations (`goto` then `reload` in `freshApp`) sometimes never reach `domcontentloaded`: they wait 20 to 60 seconds, in bursts, and the test dies in its `beforeEach`. The test-suite diet (PR #2) contained the damage with a 20 second navigation cap and retries but could not find the cause. Find it and fix it, so that retries are no longer needed to get a green run.

## Read first

`AGENTS.md`, `docs/PARALLEL-WORK.md` (section 4), `docs/review/wave-1-merge-notes.md` section D (the full investigation: what was ruled out and the remaining suspect), `e2e/helpers.ts`, `playwright.config.ts`, `src/pwa/registerSW.ts`, `vite.config.ts` (the PWA block), `e2e/pwa.spec.ts`.

## You may edit

- `e2e/helpers.ts`: **you are the only brief allowed to change existing helpers.** Other briefs may only append new exports. Keep every exported name and signature backward compatible, because all other briefs call it. Change internals only; add new helpers if useful.
- `playwright.config.ts`: navigation and service-worker settings only
- `e2e/pwa.spec.ts`: only if a change here is needed to keep it testing the real service worker
- `docs/review/notes/K.md`, and a "Findings" section appended to `docs/review/qa-report.md`

## Hands off

Every other spec file, `src/**`, `.github/**`.

## What to try (in this order, measuring each)

1. The suspect from the investigation: the service worker taking over the reloaded page while its precache settles. Test with `serviceWorkers: 'block'` for every spec except `pwa.spec.ts` (a dedicated project, or a per-file `test.use`), and drop the reload plus the wait-for-active step in `freshApp` for those specs. Seed `localStorage` with an init script instead of reload (guard with `sessionStorage` so it runs once per test).
2. If hangs persist with the worker blocked, capture a trace and `chrome://net-export`-style timing for a stalled navigation and look at the pending request.
3. Check for the Google Fonts request: the preview server serves the page but the font stylesheet is preloaded non-blocking; confirm no navigation waits on it.
4. Check the vite preview server (a stuck keep-alive socket) by running the suite against a plain static server on the built `dist/`.

## Acceptance (measured, write the numbers in `docs/review/notes/K.md`)

- Five consecutive full local runs (`npm run e2e`, 4 workers) with **zero retries used** and no test above 30 seconds.
- Three consecutive green CI runs on the PR's own branch with `retries` set to 0 in CI.
- If both hold, drop the local retries to 0 as well and lower `navigationTimeout` back to the default.
- `pwa.spec.ts` still proves the service worker installs and the app reloads offline.
- The e2e count does not drop (98 tests at the time of writing; compare before and after).

## Prompt

> You are agent K. Read `AGENTS.md`, then follow `docs/briefs/K-e2e-stability.md` exactly, and the PR rules in `docs/PARALLEL-WORK.md` section 4. Branch from the latest `main`, open a draft PR against `main` after your first commit, and mark it ready only when the measured acceptance numbers are in the PR description.
