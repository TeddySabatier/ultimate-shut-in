# Orchestration charter

Owner: the orchestrator (Claude) makes every product and technical decision. No question is escalated to the user.

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
- Game designer: docs/design/GDD.md (core loop, progression, quest catalog, economy)
- Engineers: game core, quest system, UI screens
- Asset artist: SVG sprites, icons, backgrounds, UI chrome
- QA: unit tests, e2e smoke via Playwright, PWA audit
- Reviewer: code review passes before each milestone commit

## Milestones
1. M0 scaffold builds and deploys (empty shell)
2. M1 playable core loop: quests -> XP -> level, character sheet, persistence
3. M2 content + assets: full quest catalog, story beats, art, sound-free polish
4. M3 QA, PWA audit, README, release tag v0.1.0
