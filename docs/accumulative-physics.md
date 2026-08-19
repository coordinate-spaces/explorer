# Accumulative physics

Articulation compilation, runtime diagnostics, and rendering **MUST** follow the
canonical [articulation coordinate-space contract](experimental-articulation.md#canonical-articulation-coordinate-space-contract).
In particular, runtime, published, and mounted world-space observations are not
authored articulation input and **MUST NOT** be fed back into body-local joint
frame compilation.

## Current backend

Runtime simulations use Rapier through the engine-neutral `RigidBodyWorld`
contract. Spatial nodes are compiled into stable compound-body/collider
definitions before reconciliation; renderer code receives only immutable poses
and never sees Rapier handles. Production interaction sensing is also Rapier-backed.
The AABB interaction implementation remains an explicit compatibility/reference
library path, not an application fallback.

Project coordinates are treated as metres, physics ticks as seconds divided by
the configured tick rate, `mass` as kilograms, force as newtons, and impulse as
newton-seconds. `mass` is the one supported mass model. `density` is reserved and
diagnosed; if it is added later, an explicit `mass` will take precedence.
Transaction amounts are never kilograms and are no longer copied to rigid-body
mass. They remain inputs only to the explicitly weighted `+++` interaction
conversion at the transaction boundary.

## XYZDSL physics-property grammar

Physics is an independent property group, not part of visual material. Physics
properties use the ordinary declaration value grammar: semicolon-separated
`name: value` entries inside the declaration's quoted property string. Property
names are lowercase and values below are case-sensitive except that axis names
are normalized to lowercase.

```xyzdsl
"Body/+0+2/+0+2/+0+2" : "physics-mode: dynamic; mass: 2.5; friction: 0.4; ccd: true; lock-rotations: x,z"
```

| Property | Accepted grammar | Default | Unit / meaning |
| --- | --- | --- | --- |
| `physics-mode` | `dynamic \| static \| kinematic` | `dynamic` | Rigid-body mode. |
| `mass` | finite number `> 0` | `1` per compiled member when omitted; compound body mass is the member sum | kilograms (kg), authored member mass rather than density or volume-derived mass. |
| `density` | reserved; any authored value is diagnosed and ignored | none | Reserved for a future mass model; it is not currently a synonym for `mass`. |
| `friction` | finite number in `[0, 1]` | `0.7` | dimensionless collider coefficient. |
| `restitution` | finite number in `[0, 1]` | `0` | dimensionless collider coefficient. |
| `linear-damping` | finite number `>= 0` | `0` | inverse seconds (s^-1). |
| `gravity-scale` | any finite number | `1` | dimensionless multiplier; negative values reverse gravity. |
| `ccd` | exactly `true` or `false` | `false` | continuous collision detection. |
| `can-sleep` | exactly `true` or `false` | `true` | whether Rapier may sleep the body. |
| `sensor` | exactly `true` or `false` | `false` for baseline/physical colliders; `true` for ordinary secondary cursors | Collider intersection-only mode. |
| `physical-body` | exactly `true` or `false` | `false` for secondary declarations | Opts a secondary declaration into persistent physical-body behavior. It has no special effect on baseline declarations. |
| `lock-translations` | `none`, `all`, or a unique comma/space-separated subset of `x,y,z` | `none` | Locked world translation axes. |
| `lock-rotations` | `none`, `all`, or a unique comma/space-separated subset of `x,y,z` | `none` | Locked world rotation axes. |
| `collision-groups` | integer `0..4294967295` | baseline `0x0001_0003`; secondary `0x0002_0001` | Rapier unsigned 32-bit membership/filter mask. |
| `solver-groups` | integer `0..4294967295` | Rapier default; `0` for ordinary secondary sensors | Rapier unsigned 32-bit solver membership/filter mask. |

Invalid values produce line diagnostics and do not replace the inherited/default
value. There is no permissive boolean spelling (`yes`, `1`, and mixed-case values
are invalid), no repeated axis, and no implicit clamping. The last occurrence of
the same property within one declaration is the parsed occurrence.

### Defaults and inheritance

Every field inherits independently through ancestor namespace declarations and
ordered references. References are resolved in authored order, after which the
concrete declaration wins. A concrete declaration and an active conditional
variant override only fields they declare; an omitted field never clears the
inherited physics object or resets siblings to defaults. Thus, for example, a
variant that declares only `restitution` retains inherited `mass`, mode, locks,
and damping. The defaults in the table are installed only where the resolved
chain supplies no value.

Material-like collider fields (`friction`,
`restitution`, groups, and `sensor`) are resolved per primitive and applied to
that primitive's collider. Body fields apply to the compound entity. When
compound primitives conflict on `physics-mode`, the first declaration's mode
wins deterministically and compilation emits a line diagnostic.

### Secondary cursors and supported shapes

Secondary declarations enter the Rapier scene as kinematic, non-state-retaining
sensor proxies for interaction queries. They may explicitly set
`physical-body: true`; an opted-in collider defaults to `sensor: false` and uses
Rapier's default solver groups unless the author explicitly overrides those
properties.
Box, sphere, cylinder, and cone primitives compile to their matching Rapier
shapes, and union compounds retain one positive collider per primitive.
Subtraction/intersection CSG tools are omitted with a diagnostic: a Rapier
compound is a union of positive volumes, so it cannot express subtraction, and
the renderer-neutral CSG model does not retain a triangulated or convex-decomposed
intersection mesh. Treating either tool as an ordinary positive collider would
materially change the authored solid. A future mesh/decomposition compilation
stage may provide exact or explicitly documented approximations.

Unsupported or unknown visual geometry otherwise uses the existing box/cuboid
physics approximation. This fallback must not be used for subtraction or
intersection tools: those colliders are omitted rather than silently adding
positive volume. Unsupported CSG tools remain renderable, and their omission
diagnostic is carried into the compiled spatial document.

### Transaction-amount migration

Transaction `amount` metadata is not physics syntax, has no mass unit, and is
never copied into `mass`, density, collider mass, force, or impulse. Existing
documents that relied on an amount-shaped value must author `mass: <kg>`
explicitly. When `mass` is absent, the backend contributes `1 kg` for each
compiled member; a compound body's resulting mass is the sum of its member
masses. Neither fallback depends on transaction amount.

The only retained amount conversion is the explicit weighted `+++` interaction
at the transaction boundary. Its translation distance is
`cursor amount / target amount / 100` project units. One project unit is `0.1 m`,
so equal valid weights produce `0.01` project units, or `1 mm`. This is legacy
interaction weighting, not a physical force or mass conversion. Missing or
unusable weights therefore follow the interaction directive's existing behavior
rather than altering body mass. Future force/impulse syntax must state newtons
or newton-seconds explicitly and must not infer those values from transaction
amounts.

Rapier is the sole runtime authority for gravity, contacts, restitution,
friction, sleeping, and rigid-body pose. Compilation deliberately performs no
implicit settling step. The application session owner drives the world with
`FixedStepSimulationRunner`; its interpolation alpha is presentation-only and
must never be fed back into physics or interaction evaluation.

Collider-backed interaction sensing is complete in the application. Secondary
cursor proxies, sensor intersections, ordinary contact manifolds, periodic
shape queries, and deterministic logical-pair aggregation are implemented behind
the physics adapter. The AABB narrow phase is retained only for explicit
compatibility/reference calls.

The Rapier sensing migration and application runtime migration are separate
completion milestones. Collider-backed sensing is complete, and the runtime
migration is now complete as well: `SpatialSimulationSession` owns the retained
timeline, continuously evaluates facts and bindings at fixed ticks while
running, bounds catch-up, discards paused wall time, and publishes completed
immutable documents to React. Transaction frames remain authored input changes,
not clocks.

Interaction directives remain declarative sensors when compiled directly with
`createSpatialDocument`. The application transaction pipeline now gives the spatial
relative and weighted overrides on `+touch` and `+breach` accumulative semantics:
each fixed physics tick that still reports the selected interaction translates
the retained body pose again. A transaction can change the declarations used by
later ticks, but does not itself advance time. Completed frames remain immutable,
so rendering cannot advance time.

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
parser. A missing member mass contributes the backend default (`1` kg), and a
compound body sums its members. Applications that need transaction weighting
must perform a documented conversion before authoring `mass`; the compiler does
not infer one.

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

### Articulation persistence

Passive fixed, revolute, prismatic, and spherical constraints participate in the same stable-ID lifecycle as rigid bodies and colliders. No-op reconciliation retains the existing constraint graph and sleeping solver islands. Snapshots deep-copy authored body and joint definitions; restoration reconstructs constraints before applying poses, velocities, sleep flags, and the saved simulation tick. Identical fixed-timestep replay is expected to reproduce articulated chains within ordinary floating-point solver tolerance.

Angular engine-boundary values are radians; linear anchors and slider limits are project units. DSL revolute limits are authored in degrees and converted during compilation. Tree graphs only are supported: duplicate IDs, missing/self endpoints, multiple parents, invalid axes/frames/limits, and cycles are rejected. Closed loops, active motors, cursor joints, and spherical cone/twist limits are not supported.


## Articulation coordinate and timeline contract

Joint parents resolve only within the same authored component instance and baseline/secondary projection scope. Anchors and axes are immutable component-local definitions; limits and damping are scalar joint-coordinate properties. Compilation converts them directly from immutable component-relative body poses into parent/child body-local Rapier frames. Component world transforms only place the complete graph. Runtime world poses and published `PhysicsFrame` documents never feed definition compilation.

The timeline therefore keeps an unpositioned authored-definition document for body, collider, and joint compilation, and creates a separate physics-positioned publication document for rendering and interaction output. Conditional variants that alter definitions are evaluated on the authored flow. No-op reconciliation retains joint identity and frames; snapshot restoration rebuilds those saved local frames before applying body poses. A component translation, rotation, pause/resume, or ordinary simulation tick changes no articulation value.

## Motor input timing and replay

Motor commands are immutable fixed-tick simulation inputs, not render side effects. Document compilation never advances or reapplies them. Evaluation resolves controller ownership once, queues the resulting stable-ID command for the next tick, and caches the post-step snapshot. Seeking restores both physical body state and active motor targets; replaying transaction frames therefore reproduces the same source-ordered command sequence. Maintained (`stay`) reactions are emitted for every simulated tick, while `enter` and `leave` are transition-only.
