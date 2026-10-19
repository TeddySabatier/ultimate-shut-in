# Orchestration charter

Owner: Teddy (`TeddySabatier`) is the maintainer. Claude acts as orchestrator and reviewer: it makes product and technical decisions inside the briefs, reviews every pull request and prepares merges; the maintainer merges and tags.

**How parallel work runs now is in [`PARALLEL-WORK.md`](PARALLEL-WORK.md)** (rules, backlog, pull request and stacking protocol) and the per-task files in [`briefs/`](briefs/). This charter keeps only the product decisions and the history.

## Fixed decisions
- Product: mobile-first installable PWA, offline-first, no backend. All state in the browser (zustand + localStorage).
- Hosting: GitHub repository + GitHub Pages deploy from `main` via Actions.
- Stack: Vite + React 18 + TypeScript strict, react-router (hash), zustand/immer, CSS modules + tokens, vitest.
- Game logic lives in `src/game/` as pure TypeScript with no React imports, fully unit-tested.
- Real-life quests are self-reported (honor system) with optional light friction (timers, photo note, streaks) — no device sensors required for v1.
- Content is original: no character names, art, or text copied from the source work. The source gives themes, structure and system flavor only.
- Assets: generated programmatically (SVG / canvas / small scripts) or hand-authored SVG; everything committed to the repo, no external CDNs at runtime except Google Fonts.

## Roles (subagents)
- Researcher: source analysis -> docs/research/source-analysis.md
- Tech lead: scaffold, CI, deploy
- Cursor and other agents: one brief, one pull request each (see `PARALLEL-WORK.md`)
- Game designer: docs/design/GDD.md (core loop, progression, quest catalog, economy)
- Engineers: game core, quest system, UI screens
- Asset artist: SVG sprites, icons, backgrounds, UI chrome
- QA: unit tests, e2e smoke via Playwright, PWA audit
- Reviewer: code review passes before each milestone commit

## Milestones (history)
1. M0 scaffold builds and deploys (empty shell). Done.
2. M1 playable core loop: quests -> XP -> level, character sheet, persistence. Done.
3. M2 content + assets: full quest catalog, story beats, art. Done.
4. M3 QA, PWA audit, README. Done, `v0.1.0`.
5. `v0.2.0`: custom quests by voice or text, adaptive proposals, responsive pass.
6. `v0.3.0`: the City Map with outposts. Since then: edit and restore custom quests, local reminders and app shortcuts, a faster CI.
7. Next: wave 2 briefs, then `v0.4.0` (see `PARALLEL-WORK.md` section 3).
