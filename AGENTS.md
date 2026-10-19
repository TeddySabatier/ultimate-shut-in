# Instructions for agents (Cursor and others)

Haven Protocol is an offline-first mobile PWA habit RPG (Vite, React 18, strict TypeScript, vitest, Playwright). The live app is https://teddysabatier.github.io/ultimate-shut-in/ and deploys on every push to `main`.

**Read in this order before writing anything:**

1. `CLAUDE.md`: the architecture contract (a pure engine in `src/game/`, content in JSON, the store as the only caller of engine mutators), the tone rules, and the responsive rules summary.
2. `docs/PARALLEL-WORK.md` sections 1 and 4: how branches, pull requests, stacking, shared files and the definition of done work.
3. **Your brief** in `docs/briefs/` (the maintainer tells you which). It lists exactly what you may edit, what is off limits, the acceptance checks and the PR title.

**The rules that matter most**

- Branch from the latest `main`. Open a **draft PR against `main`** after your first commit, using `.github/pull_request_template.md`. One brief is one PR.
- Edit only the files your brief allows. If you need another file, write the request in `docs/review/notes/<your id>.md`, add the label `needs-maintainer`, and keep going; do not edit it.
- `npm run lint && npm run typecheck && npm test && npm run build` before every push. UI changes also run the Playwright specs your brief names and follow `docs/RESPONSIVE-RULES.md`. Run one Playwright suite at a time.
- Do not rebase or force-push once a PR is open: merge `main` into your branch.
- **Never** merge, close or retarget a PR, push to `main`, create tags, add dependencies or network calls, or raise a size budget to make a test pass.
- Everything is original content in a warm, never punitive tone. Nothing is copied from the work that inspired the game.

Setup: Node 24, `npm ci`, `npx playwright install chromium` once, `npm run dev` to try it.
