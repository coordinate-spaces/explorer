# Accumulative physics

## Current backend

Runtime simulations use Rapier through the engine-neutral `RigidBodyWorld`
contract. Spatial nodes are compiled into stable compound-body/collider
definitions before reconciliation; renderer code receives only immutable poses
and never sees Rapier handles. The former AABB solver remains temporarily as a
compatibility/test backend while remaining interaction queries are migrated.

Project coordinates are treated as metres, physics ticks as seconds divided by
the configured tick rate, `mass` as kilograms, force as newtons, and impulse as
newton-seconds. `mass` is the one supported mass model. `density` is reserved and
diagnosed; if it is added later, an explicit `mass` will take precedence.
Transaction amounts are never kilograms and are no longer copied to rigid-body
mass. They remain inputs only to the explicitly weighted `+++` interaction
conversion at the transaction boundary.

## XYZDSL physics properties

Physics is an independent property group, not part of visual material. The
initial vocabulary is: `physics-mode: dynamic | static | kinematic`; `mass` in
kg (finite and non-negative); `friction` and `restitution` in `[0,1]`;
`linear-damping` in inverse seconds (non-negative); dimensionless
`gravity-scale`; strict booleans `ccd`, `can-sleep`, `sensor`, and
`physical-body`; `lock-translations` and `lock-rotations` as `none`, `all`, or a
comma-separated subset of `x,y,z`; and unsigned 32-bit `collision-groups` and
`solver-groups`. Defaults preserve the previous runtime: dynamic, friction
`0.7`, restitution/damping `0`, gravity scale `1`, CCD off, sleeping on, and no
axis locks.

Every field inherits independently through ancestor namespace declarations and
ordered references. A concrete declaration and an active conditional variant
override only fields they declare; an omitted field never clears the inherited
physics object. Material-like collider coefficients (`friction`,
`restitution`, groups, and `sensor`) are resolved per primitive and applied to
that primitive's collider. Body fields apply to the compound entity. When
compound primitives conflict on `physics-mode`, the first declaration's mode
wins deterministically and compilation emits a line diagnostic.

Secondary declarations default to sensors for interaction queries and do not
enter the Rapier scene. They may explicitly set `physical-body: true`; their
collider still defaults to `sensor: true`, unless `sensor: false` is authored.
Box, sphere, cylinder, and cone primitives compile to their matching Rapier
shapes, and union compounds retain one positive collider per primitive.
Subtraction/intersection CSG tools are omitted with a diagnostic: a Rapier
compound is a union of positive volumes, so it cannot express subtraction, and
the renderer-neutral CSG model does not retain a triangulated or convex-decomposed
intersection mesh. Treating either tool as an ordinary positive collider would
materially change the authored solid. A future mesh/decomposition compilation
stage may provide exact or explicitly documented approximations.

Rapier is the sole runtime authority for gravity, contacts, restitution,
friction, sleeping, and rigid-body pose. Compilation deliberately performs no
implicit settling step. A playback owner should drive the world with
`FixedStepSimulationRunner`; its interpolation alpha is presentation-only and
must never be fed back into physics or interaction evaluation.

The next migration boundary is collider-backed interaction sensing. Secondary
cursors still use the existing deterministic AABB query contract, so sensor and
contact-manifold facts must be moved behind the physics adapter before the AABB
narrow phase can be retired completely.

Interaction directives remain declarative sensors when compiled directly with
`createSpatialDocument`. The application transaction pipeline now gives the spatial
relative and weighted overrides on `+touch` and `+breach` accumulative semantics:
every new transaction/playback frame that still reports the selected interaction translates the retained
body pose again. Completed frames remain immutable, so rendering cannot advance time.

Accumulation is owned by the transaction layer instead:

1. Compile authored, pre-variant bounds and evaluate interaction facts.
2. Reconcile stable body definitions with `PhysicsWorld`.
3. Use `SimulationTimeline` to turn active facts into fixed-tick forces and
   `enter` transitions into one-shot impulses.
4. Pass the resulting immutable `PhysicsFrame` to `createSpatialDocument`.
5. Render the compiled document. Rendering never advances simulation time.

## State and time

`PhysicsWorld` stores position, orientation, linear and angular velocity, sleep
state, and an integer tick for each stable body ID. It uses 60 ticks per second
by default. Forces are integrated once per tick; impulses change velocity once.
Repeated reads of a frame cannot accumulate motion.

Seeking restores an exact snapshot before replay. `SimulationTimeline.seek`
restores both physics and the preceding complete interaction fact set, preventing
stale `enter`, `stay`, or `leave` results. A playback owner should cache periodic
snapshots and replay from the nearest earlier snapshot when the exact tick is not
cached.

## Reconciliation

Body identity must be stable across transaction frames. New bodies initialize
from their authored pose; removed bodies are deleted. Definition changes retain
pose and velocity. An authored reset must be expressed as a `teleport` input,
with `clearVelocity` selected explicitly, rather than inferred from recompilation.

Static bodies do not integrate. Kinematic bodies accept explicit targets.
Dynamic bodies accept force and impulse inputs. Invalid mass is rejected by the
parser and missing mass uses the backend default (`1` kg). Applications that
need transaction weighting must perform a documented conversion before authoring
`mass`; the compiler does not infer one.

## Spatial scalability

`InteractionWorld` retains a `SpatialInteractionIndex` across cursor-only frames
and applies explicit target updates/removals. `AabbInteractionIndex` places bounds
covering more than 4,096 cells in an oversized-object set, preventing unbounded
cell enumeration. Candidate results remain filtered and sorted by stable ID.

The broad phase accepts a replaceable `InteractionNarrowPhase`. The initial
`AabbInteractionNarrowPhase` preserves the existing touch and breach contract;
future physical collision manifolds can be implemented separately without changing
directive facts.

## Integration boundary

`createSpatialDocument({ physicsFrame })` is a pure overlay. It applies completed
body positions before collision grouping and reports `physicsTick` for inspection.
It does not own a world, compare frames, enqueue inputs, or step time. React should
hold only the published frame; a transaction/playback service must own the
`SimulationTimeline`.

`AccumulativeSpatialTimeline` is the transaction-layer bridge used by the
application. Explicit interaction vectors are per-frame translations. Weighted
translations use the existing cursor-amount / target-amount / 100 distance
conversion. Force and impulse bindings remain an application API until their
physical units are standardized.
