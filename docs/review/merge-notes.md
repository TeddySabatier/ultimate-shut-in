# Merge notes (wave 1)

Needs and departures the briefs could not resolve inside the files they own. One section per brief letter; the merger applies them.

## B. Edit and restore custom quests

Two files outside the brief's list had to change for the feature to work at all. Both edits are small and additive; if brief A (or anyone) changed the same lines, keep both sides.

- `src/state/gameStore.ts`: the only place that may call engine mutators (CLAUDE.md), so the two new engine functions need store actions. Added `editCustom(templateId, draft)` (calls `updateCustomTemplate`, returns false with a notice when refused) and `restoreCustom(templateId)` (calls `restoreCustomTemplate`), next to `archiveCustom`, plus the two imports and the two lines in `GameActions`.
- `src/game/index.ts`: re-exports `restoreCustomTemplate`, `customTitleTaken` and `customCopyInProgress` next to the other `./custom` names.
- `src/screens/CustomQuests.test.tsx` (an older screen test, not in the list): one assertion changed. It expected an archived quest's heading to vanish from the Ledger; archived quests now sit under the collapsed "Archived" group, so it checks the empty note and the group instead. New screen tests are in `src/components/CustomQuests.test.tsx`, as the brief says.

Departures from the brief:

- **No `customRestored` event.** `GameEvent` lives in `src/game/types.ts`, which this wave does not edit, so `restoreCustomTemplate` reports `customUpdated` (the existing event; its toast reads "<name> is updated.", like an edit's). The log entry has kind `customRestored`. If brief A ever extends the event union, switching restore to its own event is a three-line change (`custom.ts`, `eventText.ts`, `gameStore.ts` `SHOWN_EVENTS`).
- **Today's copy keeps its shape while it is in progress, not by a frozen copy.** The board quest has no tier, duration or count of its own and `BoardQuest` is in `types.ts`. So a change to habit, kind, length, count or tier is refused only while today's copy is in progress (running timer or time on it, counter above zero, or tried); an untouched copy takes the new shape in place and a settled one keeps its stored snapshot. A daily quest is therefore editable every day. Name, note, time slot, recurrence and outpost always change at once. One deviation from the review's suggestion: a *tried* copy is held too (the review text says "settled (done or tried)"), because a tried copy has no reward snapshot and would pay the new tier if finished later.
- **Out-of-date proposals.** Accepting a recurrence proposal for a quest that is no longer "once" lets the card go (answered "not now") instead of overwriting the player's edit. Proposals are still not retired the moment the player edits the quest; they leave on accept or at the next day boundary.
- **Duplicate names** compare after Unicode normalisation with case, accents and invisible characters ignored ("Cafe" and "Café" clash); this also applies to adding a new quest.

Review items not done: none skipped. The "restore toast reads like an edit" point (m4) stays as a documented departure.

`src/game/README.md` (module map, `custom.ts` row) could list `restoreCustomTemplate`, `customTitleTaken` and `customCopyInProgress`; it is not in this brief's list.

## C. Reminders and app shortcuts

The compose deep link is wired: `src/screens/QuestsScreen.tsx` calls `useComposeDeepLink(() => setComposing(true));` right below the `composing` state (screen test and e2e cover `#/quests?compose=1`). If another branch rewrites `QuestsScreen`, keep that one call (plus its import from `../notifications/useDeepLink`) after the `composing` state and before any early return.

Other things to know when merging:

- `src/game/content/strings.json`: the `reminders` key is appended after `map`. If another branch also appends at the end of the file, keep both keys; nothing else in that file changed.
- `src/main.tsx` and `src/App.tsx` are untouched. The reminder runtime starts from `registerSW()` in `src/pwa/registerSW.ts`, which `main.tsx` already calls.
- Reminder preferences are device-level and live in `localStorage` key `haven.reminders`, not in the SaveFile (`types.ts` and `save.ts` are reserved), so there is no migration. They are not part of Export save.
- "Wave tomorrow" fires at its time on the calendar day before the wave settles (the wave settles at the reset hour after the last game day of a period), for every reset hour.
- `public/sw-notify.js` adds a `notificationclick` handler to the generated service worker through `workbox.importScripts`; `vite.config.ts` only gained that option and the manifest `shortcuts`.
- The Notification Triggers path was removed (it could not cancel what it scheduled). Reminders only fire while the app is open.
- The `Map` shortcut targets `#/map`, which exists on main since the Map tab merged.

Review minors from PR #1 that were all done in the follow-up pass; none skipped except: reminders are not kept in an in-memory copy when storage refuses writes. The switch stays off with a note instead, which is simpler and never leaves a hidden "on" state.

## D. Test-suite diet

- **`e2e/helpers.ts` (brief A owns it): navigations hang in bursts.** `freshApp` (`goto`, then a `reload`) sometimes never reaches `domcontentloaded`: the reload sits for 20 to 60 s, then the test times out in its `beforeEach` hook. It comes in bursts (the suite runs clean for several minutes, then four workers stall together) and mostly hits the tests that start first. What was ruled out, with a probe outside the test runner (4 Chromium processes, 8 fresh contexts each, same `goto` + service-worker wait + `reload` sequence): the font CDN (a dead `HTTPS_PROXY` made `route.fetch` fail instantly and the stalls stayed), `vite preview` (a plain Node static server stalls too), worker count (2 workers stalled more than 4), IPv6 (`--dns-result-order=ipv4first --no-network-family-autoselection` made no difference once the run order was swapped), a cold start (a warm-up page did nothing). Trace of a stalled test: `Page.reload` is waiting for `navigated to http://localhost:4273/` and nothing else; in one probe the pending request was a 5 KB SVG of the app itself. Suspects left: the service worker taking over the reloaded page while the precache is settling. Suggested for the helper owner: after the first `goto`, unregister the worker (`navigator.serviceWorker.getRegistrations()` then `unregister()`) in every spec except `pwa.spec.ts` and skip the reload (the init script already sets the debug flag; `localStorage.clear()` can run in an init script guarded by `sessionStorage`), or run the non-PWA specs in a project with `use.serviceWorkers: 'block'` and drop the wait-for-active step that would then time out. Until then `playwright.config.ts` caps navigations at 20 s and retries twice locally (once in CI) so a stall costs seconds, not a failed run.
- **`e2e/pwa.spec.ts` (brief C owns it) hard-codes `localhost:4273`.** The config keeps the port fixed for that reason. Two Playwright suites cannot run side by side on this machine (brief C and D share that port; `reuseExistingServer` makes the second run use the first run's preview server).
- **`e2e/responsive.spec.ts` (brief A owns it)** now runs on the mobile project only (config `testIgnore` on the desktop project): it sets its own viewports, the desktop project produced the same contact sheets again. If A wants the desktop project back, remove the `responsive` entry from `testIgnore` in `playwright.config.ts` and run `npm run screenshots:dedupe`.
- **Adding a screenshot to `e2e/visual.spec.ts`**: keep the call literal, `shoot(page, p, 'NN-name')`, so `scripts/screenshots-dedupe.mjs` can read it; `npm run screenshots:check` fails when the folder holds files no spec writes.
