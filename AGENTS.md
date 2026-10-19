# Instructions for agents (Cursor and others)

Haven Protocol is an offline-first mobile PWA habit RPG (Vite, React 18, strict TypeScript, vitest, Playwright). The live app is https://teddysabatier.github.io/ultimate-shut-in/ and deploys on every push to `main`.

**Read in this order before writing anything:**

1. `CLAUDE.md`: the architecture contract (a pure engine in `src/game/`, content in JSON, the store as the only caller of engine mutators), the tone rules, and the responsive rules summary.
2. `docs/PARALLEL-WORK.md` sections 1 and 4: how branches, pull requests, stacking, shared files and the definition of done work.
3. **Your brief** in `docs/briefs/` (the maintainer tells you which). It lists exactly what you may edit, what is off limits, the acceptance checks and the PR title.

**The rules that matter most**

- Branch from the latest `main` (or from the integration branch your brief names, for example `integration/arena`). Open a **draft PR against that same branch** after your first commit, using `.github/pull_request_template.md`. One brief is one PR (some briefs say they deliver two).
- On an `integration/*` base a PR merges itself when you mark it **ready** and CI is green (`docs/PARALLEL-WORK.md` 4.3b), so mark ready only when your acceptance list passes.
- Edit only the files your brief allows. If you need another file, write the request in `docs/review/notes/<your id>.md`, add the label `needs-maintainer`, and keep going; do not edit it.
- `npm run lint && npm run typecheck && npm test && npm run build` before every push. UI changes also run the Playwright specs your brief names and follow `docs/RESPONSIVE-RULES.md`. Run one Playwright suite at a time.
- Do not rebase or force-push once a PR is open: merge `main` into your branch.
- **Never** merge, close or retarget a PR, push to `main`, create tags, add dependencies or network calls, or raise a size budget to make a test pass.
- Everything is original content in a warm, never punitive tone. Nothing is copied from the work that inspired the game.

Setup: Node 24, `npm ci`, `npx playwright install chromium` once, `npm run dev` to try it.

## Cursor Cloud specific instructions

- **Environment.** Node 24. Run `npm ci` first. For end-to-end tests run `npx playwright install --with-deps chromium` once per machine. To try a screen, `npm run dev`; the dev server has the debug features on, so the Games Lab is at `#/lab` (in a production build set `localStorage.setItem('haven.debug', '1')`).
- **Commit and push early and often.** A cloud machine can stop; unpushed work is lost. Push after every milestone, not only at the end.
- **Tests.** Run one Playwright suite at a time with `--workers=2`. Specs that need the debug clock use the helpers in `e2e/helpers.ts`.
- **Pull requests.** After creating a PR with Cursor's tool, **check its base branch** on GitHub and correct it if it is wrong (for example `main` instead of `integration/arena`). The base is part of your brief.
- **No secrets, no network.** There are no secrets in this project and the app makes no network calls; never add any. Do not read or write `.env` files.
- **When blocked, keep going.** Nobody answers overnight. Decide, write the decision in your notes file under `docs/review/notes/`, and continue.
