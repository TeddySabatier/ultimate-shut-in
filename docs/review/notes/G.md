# Brief G notes (Arena)

Agent G, overnight program. Base `integration/arena`. G1 branch `feat/G1-arena-engine`, G2 stacked `feat/G2-arena-ui`.

## Decisions (nobody to ask)

1. **Entry fee** is `base + perRing × (ring − 1)`, capped at one `typicalDayCoins(difficulty)` computed from `questRewards` in `economy.ts`. Steady 90% over two days covers every ring. See `docs/design/ARENA.md` §3.
2. **Training week** is the wave period (`week.index`). Cap is `floor(typicalWeekCoins × 0.25)` of a full-adherence habit week. `settleWaveDraft` resets the period spend.
3. **`WaveBreakdown.arena` is optional** (`arena?: number`). Overlay fixtures in `src/components/overlays/OverlayHost.test.tsx` construct breakdowns without it and G1 should not need to edit that file. The engine always writes the field; migration fills `0` on old records.
4. **Banking is a choice** of coins, one-period defense, or a rare gear piece (`or` in the brief), not all three at once. Domain Points are never awarded.
5. **Fled is homecoming**, same as a loss: pending discarded, buffs cleared, kit and earlier banked defense kept.
6. **`src/game/types.ts` does not import `src/games/contract.ts`.** Arena buffs are a parallel shape; `party.ts` maps them and reuses `derivePower` from the contract (helpers only).
7. **Engine never imports the registry.** `pickNextGame` takes `{ id, minRing }[]` the host builds from `listGames`. Empty list is valid.
8. **Gear slots** in content are `blade` / `mail` / `charm` (three slots per vassal). Copy labels them Hand / Kit / Charm.
9. **Quiet waves still consume** the banked Arena defense at settlement (aligns with GDD-errata 24 as written in the first G1 commit).
10. **ManagePullRequest** is not in this run's tool catalog (cursor, cursor-cloud, cursor-subscriptions, Gmail). PRs are opened with `gh pr create` as drafts, then the base branch is verified.
11. **Node** on this machine is 22; the brief asks for 24. `npm ci` succeeded on 22.
12. **`docs/ARCHITECTURE.md` and `src/game/README.md`** are not in the G1 file list. Architecture paragraph is in ARENA.md §16 for folding in.
13. **G1 includes the `strings.arena` tree** (G2 may not edit `strings.json`).
14. **STORAGE_VERSION** stays 3. G1 cannot edit `gameStore.ts`. Only `SAVE_VERSION` (the inner save) goes 4 → 5.
15. **`eventKey` in `eventText.ts`** is typed as `string` with an exhaustive switch. New `GameEvent` variants fail typecheck unless cases are added. G1 added keys only (no toast bodies). G2 still owns toast copy in that file.

## Files needed but not owned

- `src/components/overlays/eventText.ts` — exhaustive `eventKey` cases for arena events (keys only). Needed for `tsc`. Label `needs-maintainer` if the morning review wants this reverted and folded into G2.
- `src/screens/CharacterScreen.tsx` — the Ledger wave breakdown does not yet show the `arena` term. G2 cannot edit that screen either. Ask the maintainer to add ` · Arena +{n}` next to Outposts.

## G2 decisions

16. **ManagePullRequest** is still missing from the tool catalog. `gh pr create` returned 403 on G1. Branches are pushed; PR bodies live in this notes file for the maintainer.
17. **Registry stays in `src/components/arena/host/catalog.ts`.** `ArenaScreen` is lazy from `App.tsx`. `GameList` reads `listedGames()` from that catalog (not from `registry` directly) so the lint rule holds. Home's `ArenaCard` never imports the registry.
18. **Voice status** on the request form reuses `strings.compose.stop` for the listening toggle. G2 cannot add arena keys. Other request copy is `strings.arena`.
19. **Leave on the bank panel** banks coins (keeps the outing). Forfeit in Coin Duel is homecoming (`fled`).
20. **Invalid outcomes** become `{ result: 'fled', score: 0 }` in `resolveHostOutcome` before `applyArenaOutcome`.
21. **e2e earns coins by completing boards** rather than mutating the save, because `window.__haven` has no setter and a raw mutation would not re-render or persist.

## Files needed but not owned

- `src/components/overlays/eventText.ts` — G1 added `eventKey` cases; G2 added toast bodies. Still owned here.
- `src/screens/CharacterScreen.tsx` — Ledger wave breakdown does not show the `arena` term.
- `e2e/a11y.spec.ts` — not in the G2 list. Arena axe lives in `e2e/arena.spec.ts`.
- Pull requests — open G1 against `integration/arena` and G2 stacked on G1 when the token allows.

## Open for the reviewer

- Confirm optional `arena` on `WaveBreakdown` is acceptable.
- Confirm eventKey cases in `eventText.ts` (decision 15).
- G1 and G2 draft PRs if they are not already open.
