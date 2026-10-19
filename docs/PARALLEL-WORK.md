# Team playbook: parallel work on Haven Protocol

This is the working agreement for every agent and person who ships code or docs here. Read sections 1 and 4 before you write anything. Your own task is in one file under `docs/briefs/`.

- **Maintainer:** Teddy (`TeddySabatier`), with Claude acting as orchestrator and reviewer. The maintainer reviews, merges, retargets and tags. **Agents never merge, never tag, never push to `main`.**
- **Agents:** Cursor agents and any other tool that takes a brief. One agent owns one brief and one PR.

## 1. The short version

1. Read `AGENTS.md`, then `CLAUDE.md`, then your brief in `docs/briefs/`.
2. Branch from the **latest `main`**. Name it as your brief says. Never branch from another agent's branch unless your brief says "Stacked on".
3. Open a **draft PR against `main` after your first commit**. Mark it ready only when every acceptance item in your brief passes.
4. Touch only the files your brief lists under "You may edit". If you need a file you do not own, **stop and ask** (section 4.4); do not edit it.
5. Put your notes in `docs/review/notes/<ID>.md`, never in a shared file.
6. Run `npm run lint && npm run typecheck && npm test && npm run build` before every push. UI work also runs the relevant Playwright specs and the responsive checklist.
7. Use the PR template. A PR without a filled description is not reviewed.
8. After review starts, fix with new commits. **Do not force-push and do not rebase.** If `main` moved, merge `main` into your branch.
9. Never merge, close, retarget or push to another agent's PR or branch.

## 2. Where `main` stands

Update this section in the same PR that changes it (the maintainer does it at merge time).

| Item | State |
| --- | --- |
| Latest tag | `v0.3.0` (City Map). `main` is ahead of it, see below. |
| Merged since the tag | #2 test-suite diet, #17 Map follow-ups, #3 edit and restore custom quests, #1 local reminders and app shortcuts |
| Live app | https://teddysabatier.github.io/ultimate-shut-in/ (deploys on every push to `main`) |
| Save format | `SAVE_VERSION` **4**, persist envelope `STORAGE_VERSION` **3** |
| Unit tests | 668 in 48 files (vitest) |
| End-to-end | 98 tests in 11 files (Playwright, mobile and desktop projects) |
| CI jobs | `Lint, typecheck, test, build`; `E2E mobile 1/2`; `E2E mobile 2/2`; `E2E desktop` (about 3.5 minutes) |
| Runtime | Node 24 |
| Closed, superseded | PRs #4 to #16 (a swarm of duplicate Map PRs). Their branches are kept for reference and will be deleted once nobody needs them. |
| Unmerged work with no PR | `cursor/quest-learned-notes-40d2`: quest notes, save version 5. This is brief H. |

The code layout and the contracts are in `CLAUDE.md`, `docs/ARCHITECTURE.md` and `src/game/README.md`. The layout rules are in `docs/RESPONSIVE-RULES.md`.

## 3. The backlog

### Wave 2: start now, all in parallel, all against `main`

Briefs edit different files. A few collision points are unavoidable and are listed after the diagram with a merge order. Development order does not matter; merge order does for the briefs that change the save format.

| ID | Brief | File | Save version | Size | Kind |
| --- | --- | --- | --- | --- | --- |
| E | French localisation groundwork (catalog, `t()`, French strings, not wired) | `docs/briefs/E-i18n-groundwork.md` | none | medium | new files only |
| F | Citizens. **F1:** design, content, engine. **F2:** residents panel and citizen window (stacked on F1) | `docs/briefs/F-citizens.md` | **v6** | large | feature, two PRs |
| G | The Arena. **G1:** design, Armory, runs, lottery, plug-in contract, Roguelike Chess rules. **G2:** Arena screen and mini-game host (stacked on G1) | `docs/briefs/G-arena.md` | **v7** | large | feature, two PRs |
| H | "What I learned" notes on quests (finish an existing branch) | `docs/briefs/H-quest-notes.md` | **v5** | medium | feature |
| J | Weekly recap card (shareable image) | `docs/briefs/J-weekly-recap-card.md` | none | medium | feature |
| K | Stop the end-to-end navigation hangs | `docs/briefs/K-e2e-stability.md` | none | small | test infrastructure |
| L | Polish pack: import preview, calmer toasts | `docs/briefs/L-polish-pack.md` | none | small | feature |

### Wave 3: do not start, they wait for merges

| ID | Brief | Waits for | Save version |
| --- | --- | --- | --- |
| M | i18n wiring (every screen) | E merged, and every wave 2 UI PR (H, J, L, F2, G2) merged or parked | next free |
| P | Roguelike Chess, the first plug-in game | G2 merged | none |

Details are in `docs/briefs/wave-3.md`. The maintainer writes each full brief when its prerequisites merge.

```
Wave 2 (start now, base main):   E    F1 -> F2    G1 -> G2    H    J    K    L
                                 (F2 and G2 are second runs, stacked on F1 and G1)
Wave 3 (base main):              M (after E and every wave 2 UI PR)      P (after G2)
```

**Merge order for wave 2.** K, E, J and L can merge in any order, any time. The briefs that change the save format merge in version order: **H (v5), then F1 and F2 (v6), then G1 and G2 (v7)**. Each later one will need `main` merged into its branch once the earlier one lands; the maintainer comments when it is time.

**Known collision points** (the later PR merges `main`, keeps both sides, re-runs the checks):

| Where | Why it collides |
| --- | --- |
| `src/game/save.ts` | The `SAVE_VERSION` line and the end of the migration chain change in H, F1 and G1. |
| `src/game/types.ts` | Each adds a field to `SaveFile` at its own anchor (H after `proposals`, F1 after `activity`, G1 after `map`), plus events; F1 and G1 may each add a term to `WaveBreakdown`. |
| `src/game/wave.ts` | The defense sum gains a `citizens` term (F1, only if citizen buffs touch defense) and an `arena` term (G1). |
| `src/state/gameStore.ts` | Each adds an action block at its own anchor. |
| `src/assets/index.ts`, `assets.test.ts`, `eventText.ts`, `OverlayHost.tsx`, `e2e/responsive.spec.ts` | Additive blocks from F2 and G2. |

Later ideas, not briefs yet: citizens joining the Arena roster (a small follow-up once F and G are merged), shop registration, a sun-crow familiar, optional cloud sync (`docs/design/GDD.md`, "Out of v1"), editing Map outposts from quests.

## 4. Rules of the road

### 4.1 Branches and commits

- Branch from the latest `main`: `git fetch origin && git checkout -b <branch> origin/main`.
- Branch name: `<type>/<ID>-<slug>`, for example `feat/J-weekly-recap-card`. Cursor's automatic `cursor/...` names are accepted when the brief says so (brief H continues an existing one). Types: `feat`, `fix`, `docs`, `chore`, `test`.
- Commit messages: conventional (`feat(recap): ...`), small and logical, in English, no ticket ids from other systems.
- One brief is one PR, except briefs F and G, which are written as two PRs each (engine, then screens; the second is stacked on the first and run by a second agent). Otherwise split only when a change is over about 1,500 lines **and** crosses two areas; then open two PRs, each green on its own, and say so in both descriptions.

### 4.2 Pull requests

- **Base is `main`.** Always, unless section 4.3 applies.
- Open a **draft** PR after your first commit. Mark it ready when the acceptance list in your brief passes.
- **Title:** `type(scope): summary [ID]`, for example `feat(recap): shareable weekly recap card from the wave result [J]`.
- **Description:** fill in `.github/pull_request_template.md` completely (GitHub loads it by itself). Opening a PR through an API? Paste the template's headings. Required: what and why, the brief id, base and stacking, files outside your "may edit" list (should be none), test evidence (the commands and counts), screenshots for UI changes, the save version impact, and the notes file.
- **Labels:** `docs-only` for docs-only PRs, `wave-2` or `wave-3`, `needs-maintainer` when you are blocked on a file you do not own, `stacked` when section 4.3 applies, `blocked` when waiting for another PR.
- Keep the PR current: when `main` moves, merge it in (4.8) and say so in a comment.
- A reviewer's comment is answered by a commit or a reply, never by silence. Resolve a thread only when the fix is pushed.

### 4.3 Stacking: when a PR is based on another PR

**Default: do not stack.** If your work needs code that is in an unmerged PR, wait for it to merge, then branch from `main`. The wave plan above is built so that no wave 2 brief needs this.

Stack only when the maintainer wrote "Stacked on <brief or PR>" in your brief. Then:

1. Branch from the dependency's **branch**, not from `main`. Set your PR **base to that branch**.
2. First line of the PR description: `Stacked on #<number>. Merge that one first.` Add the label `stacked`.
3. Your diff must show only your own commits. If it shows the dependency's commits, your base is wrong; fix the base, not the code.
4. Keep up with your dependency by merging its branch into yours (not rebase).
5. **Never stack more than two deep.**
6. The maintainer merges in dependency order with **merge commits** (never squash a branch that something is stacked on), then retargets your PR to `main` and asks you to merge `main` in. Do not retarget it yourself.
7. Never delete a branch that has an open PR on top of it.

### 4.4 Who may touch what

Your brief lists what you may edit. Everything else is off limits. These shared files get extra rules because several briefs need them:

| File or area | Rule |
| --- | --- |
| `src/game/types.ts`, `src/game/save.ts` | Only the brief holding the reserved save version edits them (4.5). Any change to the saved shape needs a migration, a migration test and a line in `docs/ARCHITECTURE.md`. |
| `src/state/gameStore.ts` | Add new actions next to related ones, never reorder or reformat. Briefs list when they may. |
| `src/game/index.ts` | Additive exports only. |
| `src/game/content/strings.json` | Own **one new top-level key** and insert it at the anchor your brief names (immediately before an existing key). Do not edit anyone else's keys. The anchors are spread out so edits do not collide. |
| `docs/PLAYER-GUIDE.md` | Edit only the section or anchor your brief names. |
| `docs/ARCHITECTURE.md`, `README.md` | Maintainer-only. Write your architecture paragraph in your notes file; the maintainer folds it in at the end of the wave. |
| `src/assets/index.ts`, `src/assets/assets.test.ts`, `src/components/overlays/eventText.ts`, `OverlayHost.tsx`, `e2e/responsive.spec.ts` | Additive blocks only, with a comment header naming your brief. Expect to merge `main` when another brief touched the same file. |
| `e2e/helpers.ts` | Brief K may change existing helpers. Everyone else may only append new exports; never change a signature. |
| `e2e/__screenshots__/**` | Regenerate only for screens **you changed**. Never commit more than 0.5 MB of images in one PR. Run `npm run screenshots:check` before pushing. |
| `package.json`, `package-lock.json` | No new dependency unless your brief lists it. Say why in the PR if it does. |
| `.github/**`, `playwright.config.ts`, `vite.config.ts`, `tsconfig*`, `eslint.config.js`, `CLAUDE.md`, `AGENTS.md`, `docs/PARALLEL-WORK.md`, `docs/briefs/**` | **Maintainer-only.** Propose a change in a PR comment with the label `needs-maintainer`. |

**If you need a file you do not own:** do not edit it. Describe the exact change in `docs/review/notes/<ID>.md`, add the label `needs-maintainer`, and comment on your PR. Keep going on everything else. The maintainer applies the change at merge time or hands it to the right brief.

### 4.5 The save file and content

- A change to the shape of `SaveFile` needs a **reserved version number**. Reservations: **v5 = brief H, v6 = brief F (F1), v7 = brief G (G1)**. Lower versions merge first. Two briefs never share a number. If a brief is dropped its number is simply skipped; `migrate` accepts any older version.
- Your PR must include: the bump in `SAVE_VERSION`, the migration in `src/game/save.ts` that fills defaults for older saves, and tests for each earlier version you support (see `src/game/save.test.ts`).
- Content (quests, titles, strings) lives in `src/game/content/*.json` and is documented in `schema.md`. Document every new field there.
- Original content only: no names, art, text or systems copied from the source work.
- Tone: warm, never punitive. The Haven never falls.

### 4.6 Notes go in your own file

Do not edit `docs/review/wave-1-merge-notes.md` (it is archived). Write notes, departures from the brief, open questions and "I needed a file I do not own" requests in `docs/review/notes/<ID>.md`. One file per brief means two PRs never conflict on notes.

### 4.7 Tests and definition of done

Every PR, before marking it ready:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

- New logic has tests that fail without it. Tests assert behaviour, not just that a function runs.
- UI changes: run the Playwright specs your brief names (`npx playwright test e2e/<spec> --workers=2`) and add or extend one. Run **one Playwright suite at a time** on your machine.
- UI changes follow `docs/RESPONSIVE-RULES.md`: check 320x568, 390x844 at 150% text, and 844x390, and put the screenshots in the PR description.
- The CI jobs must be green on the PR head: `Lint, typecheck, test, build`, `E2E mobile 1/2`, `E2E mobile 2/2`, `E2E desktop`.
- Screenshots: only screens you changed, downscaled the way `e2e/visual.spec.ts` does, within the 0.5 MB budget.
- Nothing is done until the maintainer merges it. "CI is green" is necessary, not sufficient.

### 4.8 When `main` moves (conflicts)

1. `git fetch origin && git merge origin/main` into your branch. Never rebase a branch that has an open PR.
2. Resolve conflicts by keeping both sides when both are legitimate (lists, JSON keys, docs sections).
3. Conflict in a file you do not own, or in a hot file (4.4), and you are not sure: stop, label `needs-maintainer`, describe it in a comment. Do not guess.
4. Re-run the checks, push, and comment "merged main at <short sha>".

### 4.9 Never

- Merge, close or retarget a PR; push to `main`; create or move tags.
- Force-push after review has started; delete someone else's branch.
- Edit `.github/**`, lockfiles or configs outside your brief.
- Commit secrets, tokens, `.env` files, `node_modules`, `dist`, `test-results`.
- Add network calls, analytics or third-party scripts: the app is offline-first with no backend.
- Raise a size budget (for example the 60,000 character cap on the map SVG) to make a test pass.
- Skip hooks or checks.

## 5. How the maintainer manages the PRs

So you know what to expect.

1. **Triage** (within a day). Base is `main` (or a declared stack), labels set, files inside the brief's "may edit" list, size sane, template filled. Otherwise: a comment asking for the fix, and the PR waits.
2. **CI.** All four jobs green on the head commit. Red CI is the author's to fix; flaky e2e is reported (brief K exists to remove it), not hidden.
3. **Independent review.** A reviewer who has not seen your reasoning reads the diff against the brief and `docs/RESPONSIVE-RULES.md`, hunting real defects: purity and mutation, migrations, edge cases and dates, privacy, accessibility, responsive breakage, tests that do not test, files outside the brief. Findings come back as review comments ranked critical, major, minor. You fix criticals and majors, and minors that are cheap; anything skipped is listed in your notes file.
4. **Merge.** Merge commit (`gh pr merge N --merge`), never squash for a branch that others stack on. Merge order: the dependency first, then the smallest or most independent. Docs-only PRs can merge any time.
5. **After a merge.** The maintainer deletes the merged branch, updates section 2 of this file, comments on any PR that now needs `main` merged in, and retargets stacked PRs.
6. **End of a wave.** Tag a release (`v0.4.0` after wave 2), update `README.md`, `docs/PLAYER-GUIDE.md` and the GDD errata, archive the wave's notes to `docs/review/archive/wave-N/`, and write the wave 3 briefs.

## 6. Launching an agent

Give the agent the repository and this single instruction (replace `X` and the file name):

> You are agent X on Haven Protocol. Read `AGENTS.md`, then `docs/PARALLEL-WORK.md` sections 1 and 4, then follow `docs/briefs/<file>.md` exactly. Branch from the latest `main`, open a draft PR against `main` after your first commit using the PR template, and mark it ready only when every acceptance item in the brief passes. Do not merge anything.

| Agent | Start when | Brief file | Starting branch |
| --- | --- | --- | --- |
| E | now | `docs/briefs/E-i18n-groundwork.md` | `main` |
| F1 | now | `docs/briefs/F-citizens.md`, section F1 | `main` |
| G1 | now | `docs/briefs/G-arena.md`, section G1 | `main` |
| H | now | `docs/briefs/H-quest-notes.md` | the existing `cursor/quest-learned-notes-40d2` |
| J | now | `docs/briefs/J-weekly-recap-card.md` | `main` |
| K | now | `docs/briefs/K-e2e-stability.md` | `main` |
| L | now | `docs/briefs/L-polish-pack.md` | `main` |
| F2 | after F1 has a green CI run | `docs/briefs/F-citizens.md`, section F2 | `feat/F1-citizens-engine` |
| G2 | after G1 has a green CI run | `docs/briefs/G-arena.md`, section G2 | `feat/G1-arena-engine` |

The exact prompt for each agent is at the end of its brief (F and G have one prompt per run).

### 6.1 Launching on Cursor

Cursor's cloud agents clone the GitHub repository, work on their own branch, can open a pull request, and read `AGENTS.md`. Steps:

1. **One-time setup.** In Cursor, connect GitHub for `TeddySabatier/ultimate-shut-in` with read and write access (an agent already pushed `cursor/...` branches here, so this is probably done). Set a spend limit when prompted. Let Cursor's guided environment setup run once so a Build exists with Node 24 and `npm ci`; you can then commit the generated `.cursor/environment.json`. Cursor's docs say a saved environment is used before the committed file.
2. **Start an agent.** Open https://cursor.com/agents (or choose "Cloud" in the dropdown under the agent input in the desktop app). Pick the repository, set the **starting branch** from the table above, paste the agent's prompt, and start it. Start the seven "now" agents together; Cursor runs as many in parallel as you start.
3. **Watch.** Each agent should open a **draft PR against `main`** (F2 and G2: against the F1 or G1 branch) after its first commit. If Cursor opens a PR against the wrong base, the agent may fix its own PR's base; nobody else retargets it.
4. **Hand over.** When an agent marks its PR ready, tell the maintainer; the review and merge procedure is section 5. Do not merge from Cursor.
5. **Follow-ups.** To ask an agent for a fix after review, send a follow-up message in the same agent run rather than starting a new one, so it keeps its context and its branch.

Cursor's interface changes. The steps above come from its public documentation; if a control has moved, the principle is the same: repository, starting branch, prompt.

Run the seven "now" agents at once: that is what the plan is for. If an agent reports a collision this document did not predict, stop that agent, fix the document, then continue.

## 7. Housekeeping

- Merged branches are deleted by the maintainer at merge time. Local worktrees from finished work are removed (`git worktree remove`).
- The `cursor/*` branches from the closed Map PRs stay until the maintainer says otherwise.
- Screenshot folder budget: 3 MB (`npm run screenshots:check`).
- Notes files live in `docs/review/notes/`; at the end of a wave they move to `docs/review/archive/wave-N/`. The wave 1 notes are already archived as `docs/review/wave-1-merge-notes.md`.
- Optional hardening for the maintainer: protect `main` (require a PR and the four CI jobs). It is not enabled today, so the "never push to `main`" rule rests on this document.
