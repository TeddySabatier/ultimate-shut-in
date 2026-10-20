# Agent G (Arena) notes

## Decisions

- **Wave boost timing:** `bankRun(..., 'defense')` sets `waveBoost.forWeekIndex` to the current `week.index` so the bonus applies on the next `waveDefense` call before that period settles; cleared in `settleWaveDraft` when consumed.
- **Engine vs registry:** `pickNextGame` takes eligible game metadata from the host; `src/game/` does not import `src/games/registry.ts`.
- **Party power:** Reuses `derivePower` from `src/games/contract.ts` (allowed for types/helpers).

## Files touched outside the G1 brief (typecheck / CI only)

- `src/components/overlays/eventText.ts` — exhaustive `eventKey` cases for new arena events (G2 will add toast copy).
- `src/game/wave.test.ts`, `src/game/review.test.ts`, `src/game/index.test.ts`, `src/components/overlays/OverlayHost.test.tsx` — `WaveBreakdown.arena` and `SAVE_VERSION` 5.

## G2 follow-ups

- Full `strings.arena` tree for every UI label.
- Host outcome validation and lazy registry import path.
