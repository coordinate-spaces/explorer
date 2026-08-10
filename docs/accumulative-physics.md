# Accumulative physics

Interaction directives remain declarative sensors when compiled directly with
`createSpatialDocument`. The application transaction pipeline now gives the spatial
overrides on `+contact/+x/+y/+z` and `+contact/+++` accumulative semantics: every
new transaction/playback frame that still reports contact translates the retained
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
`AabbInteractionNarrowPhase` preserves the existing probe and breach contract;
future physical contact manifolds can be implemented separately without changing
directive facts.

## Integration boundary

`createSpatialDocument({ physicsFrame })` is a pure overlay. It applies completed
body positions before collision grouping and reports `physicsTick` for inspection.
It does not own a world, compare frames, enqueue inputs, or step time. React should
hold only the published frame; a transaction/playback service must own the
`SimulationTimeline`.

`AccumulativeSpatialTimeline` is the transaction-layer bridge used by the
application. Explicit contact vectors are per-frame translations. Weighted contact
uses the existing cursor-amount / target-amount / 100 distance conversion, including
contact penetration resolution. Force and impulse bindings remain an application API
until their physical units are standardized.

