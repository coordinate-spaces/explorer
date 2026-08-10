# Secondary interaction implementation status

This document records the implementation boundary for secondary/projection interactions. It distinguishes the functionality used by the application today from scaffolding that exists for later work.

Normative syntax and evaluation semantics live in the [Secondary projection interaction specification](secondary-interaction-spec.md). This roadmap describes implementation status rather than redefining that contract.

## Current interaction pipeline

For each compiled document, the application currently:

1. Preserves declaration provenance for baseline, secondary, and remote-editor sources.
2. Resolves authored baseline and secondary cursor bounds.
3. Evaluates `probe` and `breach` facts before ordinary collision packing.
4. Applies matching conditional variants to produce effective boxes, transforms, materials, and bounds.
5. Excludes secondary sensor nodes from baseline collision packing.

This pipeline evaluates the selected transaction frame. It does not yet maintain an interaction timeline between document compilations.

## Task 6: temporal interaction transitions

**Status: partially implemented; not integrated into playback.**

### Implemented

- `src/transactions/interactionTimeline.ts` provides a pure `interactionTransitions(previous, current)` helper.
- Facts are keyed by persistent state, target, secondary stream, and cursor namespace.
- Given two complete fact sets, the helper derives `enter`, `stay`, and `leave` transitions independently for each cursor-to-target relationship.
- Interaction facts carry stream identity and transaction time, so the required provenance is available to a future timeline owner.

### Not implemented

- `App.tsx` does not retain the prior evaluated fact set or call `interactionTransitions` during live updates or playback.
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

- `probe` and `breach` remain active for as long as their spatial predicate is true.
- `probe-enter`, `probe-leave`, `breach-enter`, and `breach-leave` are one evaluated-frame events.
- A target probed by two cursors remains in persistent `probe` when one cursor leaves, while still emitting a cursor-specific leave event.

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

**Status: partially implemented; the current index is per-compilation, not incremental across frames.**

### Implemented

- `SpatialInteractionIndex` defines `query`, `update`, and `remove` operations.
- `AabbInteractionIndex` partitions baseline AABBs into deterministic uniform-grid cells.
- Queries expand cursor bounds by probe tolerance, deduplicate cell candidates, apply an AABB broad-phase filter, and return stable ID ordering.
- `evaluateInteractions` uses the index before its probe/breach predicate checks.

### Not implemented

- `evaluateInteractions` constructs a new index for every `createSpatialDocument` call.
- The application does not retain one baseline index across secondary-only movement frames.
- Although `update` and `remove` exist, no document-diff or playback integration invokes them incrementally.
- There is no explicit narrow-phase interface for geometry-specific sphere, cylinder, oriented-box, mesh, or CSG tests.
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

The broad phase should feed a replaceable narrow phase:

```ts
interface InteractionNarrowPhase {
  evaluate(target: SpatialNode, cursor: SpatialNode): InteractionContact | undefined;
}
```

The initial narrow phase may preserve current AABB behavior. Later geometry-specific implementations can be selected by collision-shape or geometry kind without changing XYZDSL directives or `InteractionFact` consumers.

### Acceptance criteria

Task 7 is complete only when tests and profiling demonstrate:

1. Secondary-only frames reuse the same index instance.
2. Baseline insertion, movement, resizing, and deletion call incremental index operations correctly.
3. Indexed candidates and final facts match a brute-force reference across generated scenes.
4. Candidate and fact ordering remains deterministic.
5. Very large bounds cannot cause an uncontrolled cell-enumeration failure; a fallback or alternate structure is defined.
6. A narrow-phase interface exists and current AABB behavior is implemented through it.
7. Benchmarks cover sparse, dense, large-bound, and multi-cursor workloads and establish a regression baseline.

## Delivery order

Complete Task 6 before exposing transition directives in XYZDSL. Complete the persistent-index and correctness portions of Task 7 before optimizing cell sizing or adding geometry-specific narrow phases. Both tasks should preserve the existing rule that interaction predicates are evaluated from pre-variant authored state to avoid same-frame conditional oscillation.

## Accumulative physics foundation

The renderer-independent foundation is now available in `src/physics` and
`src/transactions/SimulationTimeline.ts`. It provides fixed ticks, persistent
body state, deterministic input ordering, snapshots, replay-safe interaction
transitions, force/impulse separation, and an immutable document overlay.

`InteractionWorld` also permits a retained broad-phase index, an injected narrow
phase, and bounded uniform-grid membership. Application playback integration,
portable force/mass syntax, angular integration, and a physical contact-manifold
solver remain intentionally separate follow-up work. Existing directive syntax
has not changed semantics. See [Accumulative physics](accumulative-physics.md).
