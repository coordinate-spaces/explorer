# Articulation release-boundary verification

## Historical boundary

Release B exists as a clean historical boundary. The repository history is a
linear, first-parent sequence of squash-merged PR commits (the inspected range
contains no merge commits):

| Boundary | Commit | Evidence |
| --- | --- | --- |
| Commit immediately before Release B | `c2f3625f6b23b18063708ddb21c82e587e73128c` | PR #124, `Add experimental passive revolute joints (articulation) to physics pipeline`, is the Release A tip before the Release B diagnostics, lifecycle, rendering, frame, portability, and contract work in PRs #125-#138. |
| Last commit containing Release B without Release C | `c2e908cb0879887bd35dddabf088ca8c5aa92374` | PR #138, `Document canonical articulation coordinate-space contract and align code/comments`, still explicitly excludes motors and cursor joint targeting. |
| First commit introducing Release C | `1cf12b4927bec84b3a0305681618d8210dec95a7` | PR #139, `Add bounded deterministic joint actuation, joint cursor targets, and physical interaction reactions`, adds motor definitions/state, cursor-to-joint intent handling, touch/breach motor reactions, and the associated parser and controller tests. |

The changed-file inspection for PR #139 includes the physics-world adapter and
types, scene compiler, simulation/transaction timelines, coordinate intents,
XYZDSL parser/types, and a new `jointController.test.ts`. None of those Release C
changes is present at the selected Release B commit. Consequently no revert or
reconstruction branch is needed.

The verification artifact delivered by this repository is the immutable
historical commit `c2e908cb0879887bd35dddabf088ca8c5aa92374`, not a tag. Tags
are separate Git refs and are not transported by the commit that adds this
document. In particular, this document does **not** claim that an upstream
`verification/release-b` tag has been published.

Verification was performed from a detached worktree at
`/workspace/explorer-release-b`, so neither `main` nor the current development
branch was rewritten. The boundary can be checked without relying on a tag:

```sh
test "$(git rev-parse c2e908cb0879887bd35dddabf088ca8c5aa92374^{commit})" = \
  c2e908cb0879887bd35dddabf088ca8c5aa92374
```

## Reproduction and results

The exact setup and verification commands were:

```sh
test "$(git rev-parse c2e908cb0879887bd35dddabf088ca8c5aa92374^{commit})" = \
  c2e908cb0879887bd35dddabf088ca8c5aa92374
git worktree add --detach /workspace/explorer-release-b \
  c2e908cb0879887bd35dddabf088ca8c5aa92374
cd /workspace/explorer-release-b
npm ci
npm test
npm run check:articulation-docs
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
curl --fail --silent --show-error http://127.0.0.1:4173/
```

Results on 2026-08-19 UTC:

- Vitest: **38 test files passed; 383 tests passed**.
- Canonical articulation documentation check: passed.
- TypeScript and Vite production build: passed; 713 modules transformed.
- Browser example: package/application version **0.1.0**, served from the
  production build by **Vite 7.3.5**. The HTTP smoke check returned the Candid
  Spaces HTML and its generated JavaScript and CSS asset references.
- The build emitted only Vite's advisory that the generated JavaScript chunk is
  larger than 500 kB after minification.

## Numerical tolerances at the boundary

Release B's articulation checks use the following explicit tolerances and
precision expectations:

- Runtime backend pivot error and mounted/documented pendulum endpoint error
  must be less than `0.02` project units.
- Compiled parent/child pivot agreement must be less than `1e-9` project units.
- The gravity pendulum radius is compared at Vitest precision 2
  (`toBeCloseTo(2.5, 2)`).
- Published orientation agreement uses Vitest precision 6, and deterministic
  fixed-step/seek position comparisons use precision 8.
- Geometry-aware interaction tests use a touch tolerance of `0.001` project
  units and require reported separation to be at most `0.001`.
- The damped oscillation check requires strictly decreasing successive peaks
  and a final peak below 98% of the first measured peak.

These are test acceptance thresholds, not promises of bit-identical results
across engines or platforms; the Release B contract otherwise describes solver
agreement as ordinary floating-point tolerance.
