# Secondary interaction implementation status

This document records the implementation boundary for secondary/projection interactions. It distinguishes the functionality used by the application today from scaffolding that exists for later work.

Normative syntax and evaluation semantics live in the [Secondary projection interaction specification](secondary-interaction-spec.md). This roadmap describes implementation status rather than redefining that contract.

## Current interaction pipeline

For each compiled document, the application currently:

1. Preserves declaration provenance for baseline and secondary sources.
2. Resolves authored baseline and secondary cursor bounds.
3. Evaluates `touch` and `breach` facts before ordinary collision packing.
4. Applies matching conditional variants to produce effective boxes, transforms, materials, and bounds.
5. Excludes secondary sensor nodes from baseline collision packing.

Rapier collider-backed sensing and the application runtime migration are both
complete, but are distinct milestones. `SpatialSimulationSession` now retains
the accumulative timeline and advances it from bounded fixed wall-clock ticks;
transaction arrival only replaces deterministic authored input. General
application-visible transition effects described below remain incomplete.

## Task 6: temporal interaction transitions

**Status: integrated for accumulative interaction motion; transition effects remain partial.**

### Implemented

- `src/transactions/interactionTimeline.ts` provides a pure `interactionTransitions(previous, current)` helper.
- Facts are keyed by persistent state, target, secondary stream, and cursor namespace.
- Given two complete fact sets, the helper derives `enter`, `stay`, and `leave` transitions independently for each cursor-to-target relationship.
- Interaction facts carry stream identity and transaction time, so the required provenance is available to a future timeline owner.

### Not implemented

- `App.tsx` retains `SpatialSimulationSession`, which owns
  `AccumulativeSpatialTimeline`, prior facts, pause/resume timing, and fixed-tick
  advancement. Transitions are not yet exposed as general application effects.
- Playback seeking does not reconstruct transition state by replaying the transaction prefix or loading a cached snapshot.
- There is no timeline owner that orders evaluations by transaction time and stable source order.
- Cursor disappearance, target deletion, stream disconnection, backward seeking, and replay restart do not currently emit application-visible transition events.
- `enter`, `stay`, and `leave` are not exposed in `SpatialDocument`, the inspector, an effects API, or XYZDSL directives.
- No one-frame event lifetime has been defined for transition-driven conditional declarations.

### Required design

Introduce a timeline evaluator owned by the transaction/playback layer rather than by React rendering components. It should maintain or reconstruct:

```ts
interface InteractionFrame {
  transactionTime: number;
  stableSourceOrder: number;
  facts: InteractionFact[];
  transitions: InteractionTransition[];
}
```

Forward evaluation compares the new fact set with the immediately preceding transaction-time frame. Seeking must reset transient state and deterministically reconstruct the selected frame from the nearest cached snapshot or from the beginning of the relevant stream prefix. It must never compare a sought frame with whichever live frame happened to render previously.

Persistent predicates and transition events must remain separate:

- `touch` and `breach` remain active for as long as their spatial predicate is true.
- `touch-enter`, `touch-leave`, `breach-enter`, and `breach-leave` are one evaluated-frame events.
- A target touched by two cursors remains in persistent `touch` when one cursor leaves, while still emitting a cursor-specific leave event.

### Acceptance criteria

Task 6 is complete only when tests and application integration demonstrate:

1. Forward live updates produce deterministic enter/stay/leave transitions.
2. Equal transaction times use stable source order.
3. Forward replay produces the same transitions as live ingestion.
4. Backward and forward seeking reconstructs state without stale or spurious events.
5. Cursor disappearance, target deletion, and stream removal produce cursor-specific leave events when moving forward.
6. Multiple cursors interacting with one target remain independently keyed.
7. Transitions are delivered through a documented effects or document API with an explicit lifetime.

## Task 7: scalable spatial candidate index

**Status: library foundation implemented; application retention and performance validation remain.**

### Implemented

- `SpatialInteractionIndex` defines `query`, `update`, and `remove` operations.
- `AabbInteractionIndex` partitions baseline AABBs into deterministic uniform-grid cells.
- Queries expand cursor bounds by touch tolerance, deduplicate cell candidates, apply an AABB broad-phase filter, and return stable ID ordering.
- `InteractionNarrowPhase` is a replaceable narrow-phase boundary, and
  `AabbInteractionNarrowPhase` implements the legacy AABB `touch`/`breach`
  contract through that boundary.
- `InteractionWorld` is a retained library abstraction. It owns one index,
  applies target updates and removals, and evaluates cursor-only frames without
  rebuilding the index.
- `AabbInteractionIndex` sends a node spanning more than 4,096 cells to a
  bounded oversized-object set. A query whose own bounds exceed the cap safely
  scans the retained nodes instead of enumerating an uncontrolled number of
  cells.
- `evaluateInteractions` can use a supplied index and narrow phase before its
  final predicate checks.

These are **library capabilities**, not a description of application wiring.
The application does not retain an `InteractionWorld`. Its
`AccumulativeSpatialTimeline` recompiles authored and conditional documents
through `createSpatialDocument`, reconciles the resulting collider definitions,
and obtains production interaction facts from the retained Rapier world. Direct
`createSpatialDocument` calls do not evaluate interactions unless facts are
supplied or the explicit `aabbInteractionCompatibility` test/reference option is
enabled.

### Not implemented

- The application does not retain an `InteractionWorld` or incrementally apply
  baseline node diffs to `AabbInteractionIndex` across secondary-only frames.
- Although `update` and `remove` exist, no document-diff or playback integration invokes them incrementally.
- There are no brute-force parity/property tests over generated scenes.
- There are no performance benchmarks for sparse scenes, dense scenes, large objects, or many moving cursors.
- Uniform-grid cell size is fixed by a constructor default and is not selected from scene scale or profiling data.

### Required design

Move index ownership above a single document compilation. A reusable interaction-world object should retain baseline target entries while cursor frames advance:

```ts
interface InteractionWorld {
  index: SpatialInteractionIndex;
  baselineRevision: string;
  updateTargets(changes: SpatialTargetChange[]): void;
  evaluate(cursors: readonly SpatialNode[]): InteractionFact[];
}
```

Baseline edits and active conditional variants should produce explicit insert/update/remove changes. Secondary-only frames should query the retained index without rebuilding it. If a conditional variant changes a target's effective bounds, that target must be updated before the next interaction evaluation according to the documented pre-variant/next-frame feedback semantics.

The implemented broad phase feeds a replaceable narrow phase:

```ts
interface InteractionNarrowPhase {
  evaluate(target: SpatialNode, cursor: SpatialNode): InteractionResult | undefined;
}
```

The initial AABB implementation preserves the compatibility behavior. Production
application sensing now uses Rapier geometry rather than selecting a
geometry-specific implementation of this library interface; either approach can
continue to produce the same `InteractionFact` contract.

### Acceptance criteria

Task 7 is complete only when tests and profiling demonstrate:

1. Secondary-only frames reuse the same index instance.
2. Baseline insertion, movement, resizing, and deletion call incremental index operations correctly.
3. Indexed candidates and final facts match a brute-force reference across generated scenes.
4. Candidate and fact ordering remains deterministic.
5. **Implemented and unit-tested:** very large bounds use the 4,096-cell bounded fallback.
6. **Implemented and unit-tested:** a narrow-phase interface exists and current AABB behavior is implemented through it.
7. Benchmarks cover sparse, dense, large-bound, and multi-cursor workloads and establish a regression baseline.

Criteria 1 and 2 are demonstrated at the library boundary, but not by the
application integration, so Task 7 remains open. Criteria 3 and 7 also remain
open; criterion 4 has deterministic unit coverage but still needs the generated
parity suite from criterion 3.

## Rapier sensing migration checklist

The implementation and application integration tests for this migration are
complete:

- [x] **Secondary sensor compilation:** compile every secondary primitive into a
  kinematic, non-state-retaining sensor proxy by default, while preserving the
  explicit `physical-body: true` path.
- [x] **Stable collider-ID mapping:** derive collider and body IDs from stable
  spatial node/entity identities and retain authored cursor/target provenance
  without exposing Rapier handles.
- [x] **Periodic wrapping:** query the central cursor plus the eight neighboring
  X/Z images, select the closest representative contact, and deduplicate logical
  cursor-target facts.
- [x] **Sensor intersections:** use Rapier's sensor intersection graph for the
  central image and exact shape intersection for periodic images, without
  generating solver impulses.
- [x] **Manifold/shape-contact conversion:** use manifolds for ordinary collider
  penetration and exact shape contacts for sensor or tolerance queries, then
  normalize them to `touch`/`breach`, normal, separation, penetration, and
  resolution-distance fields.
- [x] **Deterministic aggregation:** collapse compound collider pairs to one
  deterministic representative and sort logical facts by stable stream, cursor,
  and target identity.
- [x] **Snapshot/seek behavior:** serialize stable definitions and identities,
  restore the Rapier world and preceding interaction facts, and reproduce the
  same query results after restore/replay.
- [x] **Remove the production AABB fallback:** the application supplies Rapier
  facts to `createSpatialDocument`; AABB evaluation is available only through
  the explicit compatibility option used by focused model tests.

## Delivery order

Complete Task 6 before exposing transition directives in XYZDSL. Complete the persistent-index and correctness portions of Task 7 before optimizing cell sizing or adding geometry-specific narrow phases. Both tasks should preserve the existing rule that interaction predicates are evaluated from pre-variant authored state to avoid same-frame conditional oscillation.

## Accumulative physics foundation

The renderer-independent foundation is now available in `src/physics` and
`src/transactions/SimulationTimeline.ts`. It provides fixed ticks, persistent
body state, deterministic input ordering, snapshots, replay-safe interaction
transitions, force/impulse separation, and an immutable document overlay.

`InteractionWorld` also provides a retained broad-phase index, an injected narrow
phase, and bounded uniform-grid membership as library abstractions. The application
instead retains a Rapier world while rebuilding documents through
`createSpatialDocument`; it does not retain `InteractionWorld`.

## Remaining migration work

With the Rapier sensing checklist and its integration tests complete, production
AABB sensing is no longer migration work. What remains is incremental application
document compilation/index reconciliation (if `InteractionWorld` is adopted), the
generated broad-phase parity suite and performance regression benchmarks, Task 6's
application-visible transition/effect API and seek integration, standardized
force/impulse XYZDSL syntax, and angular force/impulse bindings. The existing
directive syntax retains its documented semantics. See
[Accumulative physics](accumulative-physics.md).
