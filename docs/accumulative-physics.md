# Accumulative physics

## Current backend

Runtime simulations use Rapier through the engine-neutral `RigidBodyWorld`
contract. Spatial nodes are compiled into stable compound-body/collider
definitions before reconciliation; renderer code receives only immutable poses
and never sees Rapier handles. The former AABB solver remains temporarily as a
compatibility/test backend while remaining interaction queries are migrated.

Project coordinates are treated as metres, physics ticks as seconds divided by
the configured tick rate, mass as kilograms, force as newtons, and impulse as
newton-seconds. Transaction amounts are not physical units: until an authored
mass/density DSL property is introduced, positive transaction amounts remain a
legacy mass input and should not be used for calibrated simulations.

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
Dynamic bodies accept force and impulse inputs. Invalid or missing mass defaults
to `1`; applications should define a project-specific transaction-amount-to-mass
conversion before exposing physics bindings in XYZDSL.

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
