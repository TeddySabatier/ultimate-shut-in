# Brief L: Polish pack (import preview, calmer toasts)

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Base branch | `main` |
| Branch | `feat/L-polish-pack` |
| PR title | `feat(ux): import preview and calmer toasts [L]` |
| Reserved save version | none |
| Size | small |

## Goal

Close two gaps listed in the QA report's known issues.

1. **Import preview.** Today Settings import replaces the save after a confirm, with no preview of the file. Show what the file contains before replacing: player name, level, ring, days played, number of vassals and custom quests, save version, and the date it was exported if known; warn when the file is older than the current save and when it would replace a save that is further along. A file that fails `migrate` or is not a Haven save shows a clear, warm error and changes nothing.
2. **Calmer toasts.** Toasts auto-dismiss after a fixed 3.2 seconds with no way to pause. Pause the timer while the toast is hovered or focused (and while the window is not visible), keep the message readable for at least a minimum time proportional to its length, never auto-dismiss error toasts (they need a tap), and make sure each toast is announced once by assistive technology (`role="status"` or `alert` as appropriate, no duplicate announcements).

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/PARALLEL-WORK.md` (section 4), `docs/RESPONSIVE-RULES.md`, `src/screens/SettingsScreen.tsx` (import and export), `src/game/save.ts` (`migrate`, `exportSave`), `src/components/overlays/Toast.tsx`, `OverlayHost.tsx` and their tests, `docs/review/qa-report.md` (known issues).

## You may edit

- `src/screens/SettingsScreen.tsx` and its CSS and test: the import flow only
- `src/components/ImportPreview.*` (new)
- `src/components/overlays/Toast.tsx` and its CSS and test: timing and live-region behaviour only
- `src/game/content/strings.json`: **only your own top-level key `polish`**, inserted immediately before the existing `"reminders"` key (your anchor)
- `e2e/polish.spec.ts` (new)
- `docs/PLAYER-GUIDE.md`: extend the existing `## Export and import` section with the preview (your anchor); nothing else in the file
- `docs/review/notes/L.md`

## Hands off

`src/notifications/**` (the reminders section of Settings belongs to a merged feature; do not move or restyle it), `src/state/**`, `src/game/save.ts` (call `migrate`, do not change it), every other screen.

## Acceptance

- Unit tests: the preview summary function on v2, v3, v4 files and on garbage input; toast timing with fake timers (pause on hover, resume, error toast stays).
- e2e: import a valid exported file and see the preview, cancel, then confirm; import a corrupt file and see the error with the save unchanged; hover a toast and see it stay.
- axe passes on the preview dialog; tap targets 44px; the dialog follows the overlay rules (scrolls internally, primary action reachable at 320px and 844x390).
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass; e2e for your spec on both projects.

## Prompt

> You are agent L. Read `AGENTS.md`, then follow `docs/briefs/L-polish-pack.md` exactly, and the PR rules in `docs/PARALLEL-WORK.md` section 4. Branch from the latest `main`, open a draft PR against `main` after your first commit, and mark it ready when every acceptance item passes.
