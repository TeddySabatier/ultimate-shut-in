<!-- Fill every section. A PR with an empty description is not reviewed. Delete this comment. -->

## Brief

Brief id and file: <!-- e.g. J, docs/briefs/J-weekly-recap-card.md -->
Wave: <!-- 2 or 3 -->

## What and why

<!-- Two to five sentences: what changes for the player or the codebase, and why. -->

## Base and stacking

- [ ] Base branch is `main`
- [ ] Stacked on another PR: <!-- if yes, "Stacked on #N. Merge that one first." and add the `stacked` label; otherwise write "no" -->

## Scope check

- [ ] Every changed file is in my brief's "You may edit" list
- Files outside that list (should be none, explain each): <!-- none -->
- Files I needed but do not own, and where I described the need: <!-- none, or docs/review/notes/<ID>.md -->

## Save format

- Save version before and after: <!-- unchanged, or 4 -> 5 -->
- [ ] Migration and tests for every earlier version I support (only if the version changed)

## Tests

Commands run and results (counts):

```
npm run lint        <!-- clean -->
npm run typecheck   <!-- clean -->
npm test            <!-- N tests pass -->
npm run build       <!-- ok -->
npx playwright test <specs>   <!-- N passed, both projects -->
```

- [ ] New logic has tests that fail without it
- [ ] CI is green on the head commit (lint/typecheck/test/build, E2E mobile 1/2, mobile 2/2, desktop)

## Screenshots (UI changes)

<!-- 320x568, 390x844 at 150% text, 844x390. Only screens I changed. Total image size committed under 0.5 MB. -->

- [ ] Responsive checklist in `docs/RESPONSIVE-RULES.md` passed
- [ ] No horizontal scroll, nothing clipped, tap targets 44px

## Notes

Notes file: `docs/review/notes/<ID>.md`
Open questions or risks for the reviewer: <!-- none -->

---
- [ ] I did not merge, close, retarget or force-push anything, and I did not touch another agent's branch
