# Notes: game-gate-runner (Haven Rush)

Decisions taken while unattended. Nobody was available to answer.

## Design

- Gate operations are monotonic, so “always take the larger immediate result” is optimal if both future pairs stay available. Tempting-but-bad gates on difficulty 3–5 are therefore **side-specific walls** after a flashy op (`x3` / `+25`): greedy takes the big number and then pays the wall; the modest side (`+10`) keeps more troops. The solver enumerates every L/R path with perfect steering (x snapped to the half) and uses the same `step` as live play.
- Fairness margin (best-path damage vs boss HP): `40 - floor(35 * (d - 1) / 4)` → 40, 32, 23, 14, 5 percent for difficulty 1–5. Boss HP is `floor(bestDealt * 100 / (100 + margin))` so the best path is winnable by construction; on difficulty ≥ 3 the generator retries until greedy damage is below that HP.
- `x === CENTER` (100) counts as the **right** half. The squad starts there; the player / bot must steer left before the first gate if they want it.
- `time` buff and the slow-lane toggle both halve speed; they do **not** stack (still half, not a quarter). Decision: one “slow” flag in `step` is easier to prove and gentler for accessibility.
- Center-line pickups (both halves collect them) so luck cannot invert a trap. Luck raises spawn chance and extra members on those pickups.
- Stored `bestPath` is not kept in state: after a wrong gate the remaining optimum is recomputed from the current state (`bestNextSide`).

## Cut line

Nothing was cut. Pickups, `x3` / `+25`, fire-rate boost, and the slow-lane toggle are all in.

## Files

Owned paths only: `src/games/gate-runner/**`, `e2e/games/gate-runner.spec.ts`, `docs/games/gate-runner.md`, `docs/games/img/gate-runner-*.png`, this notes file.

## Open

- If the 300-seed fairness test is slow on CI, it still uses the solver (not `playToEnd`) and a 60s timeout. Pair count is capped at 6 (64 paths).
- Lab `Bot play` calls `setPrevious(result)` before recording the new result. After **Replay same seed** (`result` is null), that wipes `previous`, so `lab-compare` never appears. Decision: the e2e replay test compares the two bot outcomes itself instead of using `replaySameSeed` (which needs a Screen `onFinish`). A Lab fix would belong to the platform, not this brief.
- **ManagePullRequest is not in this cloud run's tool catalog** (`cursor` only has AwaitShell, Delete, EditNotebook, FetchMcpResource, GenerateImage, ReadLints, TodoWrite, WebFetch, WebSearch). Decision: try `gh pr create --draft --base integration/arena`. That failed with `GraphQL: Resource not accessible by integration (createPullRequest)` because `gh` is read-only here. Branch `feat/game-gate-runner` is pushed; the parent/maintainer needs to open the draft PR (title `feat(games): Haven Rush [game-gate-runner]`, base `integration/arena`). I will not merge, retarget, or push to `main` / `integration/arena`.
