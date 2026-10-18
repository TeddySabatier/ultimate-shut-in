# src/game

Pure game logic. No React, no DOM, no browser APIs, no store imports.

Everything here is plain TypeScript: types, constants and pure functions
(XP curves, level-up rules, quest definitions, reward calculations, etc.).
The Zustand stores in `src/state/` call into this folder; React components
never import from it directly except for types.

Rules:

- Functions take plain data in and return plain data out; no side effects.
- Deterministic: anything random takes a seed or an RNG function as input.
- Fully unit-testable with Vitest without `jsdom`.
