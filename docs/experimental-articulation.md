# Experimental passive articulation (Release A)

## Canonical articulation coordinate-space contract

This section is the canonical coordinate-space contract for articulation. The
requirement words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are used in the
RFC sense: correctness invariants use **MUST**, prohibited world-pose feedback
or cross-space substitution uses **MUST NOT**, recommended naming and
diagnostics use **SHOULD**, and **MAY** is reserved for optional presentation or
debug tooling.

### Current behavior, including the historical world-space ambiguity

Historically, implementation and documentation used “local,” “world,”
“anchor,” “transform,” and “frame” without consistently naming the reference
coordinate system. In particular, a `joint-anchor` that looks visually related
to geometry inside a component was historically interpreted as an absolute
world-simulation-space point.

```xyzdsl
"Pendulum/+0+1/+0+1/+0+1" : ""
"Pendulum/Rod/..." : "joint-anchor: 0.5 8 0.5"
```

Under those absolute world-space semantics, changing the component declaration
to

```xyzdsl
"Pendulum/+15+1/+0+1/+0+1" : ""
```

moves the visible bodies but leaves the pivot at world X = 0.5. The compiler
can nevertheless derive mathematically valid body-local anchors reaching back
to that old world pivot. Rapier then reports an active constraint and near-zero
backend pivot error although the visible geometry is detached. If mutable
runtime world poses are fed back into compilation, the derived body-local
anchor can drift while still reconstructing the same world pivot. A diagnostic
that reports only backend pivot error can therefore incorrectly suggest that
the visible articulation is healthy.

The repository now implements the required contract below. This history is a
migration warning for old documents, diagnostics, and integrations; it is not a
supported alternate interpretation of `joint-anchor`.

### Required contract (normative and implemented)

Under the component-local contract, the same authored anchor moves with the
component and resolves to world X = 15.5 in the translated example.

| Term | Definition | Mutability |
| --- | --- | --- |
| Component-local authored space | Coordinate system owned by one authored/materialized component instance. XYZDSL articulation positions and directions are expressed here. | Changes only through authoring or explicit component reconstruction. |
| Body-local physics space | Coordinate system fixed to one rigid body. The compiler converts component-local articulation frames into parent- and child-body-local frames for Rapier. | Immutable for an unchanged authored revision. |
| World simulation space | Shared runtime space containing current rigid-body poses and derived joint anchor positions. | Changes every physics tick. |
| Published render space | World-space pose included in the immutable document/frame sent to the renderer. | Changes when a completed simulation frame is published. |
| Mounted scene space | World transform of the actual Three.js object after scene-graph composition. | Observed from the mounted object; it MUST match published render space for flattened primitives. |
| Joint local frame | The immutable parent- or child-body-local anchor, axis, and orientation used by the physics backend. | Immutable unless the authored articulation definition changes. |
| Derived world anchor | A diagnostic world-space point calculated from a joint local frame and a current runtime body pose. | Changes with body motion; never becomes authored input. |
| Geometry endpoint | A point on visible collider/render geometry, such as the pendulum rod’s top-face center. | Derived from geometry and the mounted mesh transform. It is not automatically equivalent to a joint anchor. |

#### Language rules

Documentation, code comments, diagnostics, type names, and test descriptions
**MUST** name the reference space explicitly. They **MUST NOT** use ambiguous
phrases such as “the anchor position,” “local transform,” “world transform”
without identifying which world or publication layer, “rendered anchor” for a
value reconstructed from a physics body, “mesh pivot error” when the mounted
mesh was not inspected, or “the joint remains attached” based only on backend
pivot error.

Preferred phrases include “component-local authored joint anchor,”
“parent-body-local Rapier anchor,” “child-body-local Rapier axis,” “runtime
world-space parent anchor,” “published world-space node pose,” “mounted Three.js
geometry endpoint,” and “distance from mounted rod-top endpoint to runtime
parent anchor.” Diagnostics **SHOULD** use these explicit forms; optional debug
tooling **MAY** abbreviate them only when the full term is available nearby.

#### Permitted conversion graph

```text
component-local authored definition
        |
        | compile once for an authored revision
        v
parent-body-local / child-body-local joint frames
        |
        | combine with current body poses
        v
derived runtime world anchors
        |
        | publish completed physics frame
        v
published render pose
        |
        | mount as a flattened Three.js object
        v
mounted scene geometry endpoint

runtime world pose       --X--> authored component-local definition
published render pose    --X--> body-local joint recompilation
mounted scene transform  --X--> persisted articulation definition
```

Runtime, published, and mounted world-space observations **MUST NOT** be fed
back into component-local articulation compilation. For an unchanged authored
revision, body-local joint frames **MUST** remain invariant regardless of
simulation movement.

#### Component-instance boundaries

Articulation is defined only inside one component instance. `joint-parent`
**MUST** resolve in the child's component instance and projection scope. A joint
**MUST NOT** connect separate component instances or connect baseline and
secondary projections. Materialized instances **MUST** receive independent body
and joint identities. Translating or rotating a component instance **MUST**
transform its complete articulation as a unit, while its authored articulation
properties remain unchanged. These boundaries remove any need for implicit
world-space articulation properties.

#### Spatial, scalar, and behavioral properties

“Every property is local” is not a useful shorthand because not every property
transforms spatially:

* **Component-local spatial properties:** `joint-anchor`, `joint-axis`,
  fixed-joint authored orientation/frame properties, and prismatic linear
  directions and component-local linear coordinates.
* **Joint-coordinate scalar properties:** revolute angular limits, prismatic
  scalar limits, damping, and motor targets if introduced later.
* **Referential or behavioral properties:** `joint-parent`, joint kind, and
  `collide-connected`.

Scalar and behavioral properties do not transform spatially, but persist as
part of the same component-local articulation definition.

#### Invariants and diagnostic interpretation

For an unchanged authored revision:

- [ ] component-local authored values remain unchanged;
- [ ] parent- and child-body-local joint frames remain unchanged;
- [ ] joint identity remains unchanged;
- [ ] runtime body poses may change;
- [ ] derived runtime world anchors may move;
- [ ] backend runtime pivot error **SHOULD** remain within solver tolerance; and
- [ ] mounted geometry endpoint error **SHOULD** remain within the intended
      modeling tolerance.

Zero backend runtime pivot error proves only that Rapier's two body-local
anchors coincide in runtime world simulation space. It does not prove that a
body-local anchor still corresponds to the intended geometry endpoint, that the
published mesh is at the correct pose, or that the mounted Three.js mesh matches
the published pose. Diagnostics **SHOULD** report body-local frame drift,
backend runtime pivot error, published-pose anchor error, mounted geometry
endpoint error, active physics tick, and authored revision as separate values.

Release A introduces passive revolute joints without exposing Rapier handles to
XYZDSL, rendering, or transaction code. Articulations are rooted forests of
stable rigid-body identities connected by engine-neutral joint definitions.

## Authoring

```xyzdsl
"Pendulum/+0+1/+0+1/+0+1" : ""
"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"
"Pendulum/Ceiling/+0+4/+8+1/+0+1" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+83c+20c/+304c+5/+45c+10c" : "body: Rod; mass: 1; rotation: 0,0,10; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -170 170; joint-damping: 0.05"
```

The ceiling is authored touching `Pendulum/Anchor/` and assigned to the same
`Anchor` body, so the fixed pivot has visible supporting geometry. Its contact
is illustrative rather than necessary: `physics-mode: static` fixes a body in
world space without requiring a floor, wall, ceiling, or other physical support.
The rod starts 10 degrees from vertical, with its box position adjusted so its
transformed top remains at the intended component-local pivot `(0.5, 8, 0.5)`.
Gravity therefore starts observable swinging without an impulse. An application
can instead author the rod vertically and enqueue an `impulse` input for the rod
on the first simulation tick.

Ground and floor are separate infrastructure. `RapierPhysicsWorld.addGround()`
adds an implicit collider whose contact surface is at `y = 0`.
`src/scene/XyzCoordinateSpace.tsx` renders the visible floor, walls, and grids;
it offsets grid lines from those surfaces by `GRID_OFFSET` to prevent z-fighting.
Neither supplies the authored ceiling in this example.

`body` starts an explicit rigid component. Primitives resolving to the same body
name within a top-level component remain one compound rigid body. Components
without `body` preserve the legacy behavior in which their primitives share the
top-level component body.

A `joint` is declared on the child body. `joint-parent` is the canonical
namespace path of a concrete primitive in the parent body. Release A accepts
only `revolute`.

| Property | Meaning |
| --- | --- |
| `body` | Identifier for a rigid component boundary. |
| `joint` | Joint kind; currently exactly `revolute`. |
| `joint-parent` | Component-local parent primitive namespace; it must resolve in the same materialized instance and projection scope. |
| `joint-anchor` | Component-local pivot as three finite project-unit numbers. |
| `joint-axis` | Non-zero component-local direction as three finite numbers. |
| `joint-limits` | Optional ordered minimum/maximum angles in degrees. |
| `joint-damping` | Optional non-negative passive angular damping coefficient in N·m·s/rad. |
| `collide-connected` | Whether directly connected colliders contact; defaults to `false`. |

Articulation declarations are portable with their component. Translation and rotation move the whole graph without changing `joint-anchor`, `joint-axis`, `joint-limits`, or `joint-damping`. The compiler maintains three distinct spaces: immutable component-local authored values; immutable parent- and child-body-local engine frames; and mutable runtime world poses. The component world transform places the graph and may rotate an axis for world diagnostics (translation never affects a direction), but neither it nor a `PhysicsFrame` participates in local-frame compilation.

For a component-local pivot `pC`, body rotation `R` and translation `t`, the engine anchor is `inverse(R) × (pC - t)` and its axis is `normalize(inverse(R) × axisC)`. The compiler resolves these independently for both endpoints. Physics uses
fixed ticks; joint limits are converted to radians at the compiler boundary.

`joint-damping` is physical viscous damping, not a dimensionless motor strength.
For a revolute joint Rapier's force-based zero-velocity motor applies
`torque = -joint-damping * relative angular velocity`, so the authored unit is
N·m·s/rad. Thus the documented `joint-damping: 0.05` means 0.05 N·m of opposing
torque per rad/s of relative hinge speed. The adapter explicitly selects the
force-based model instead of Rapier's default inertia-independent acceleration
motor. Prismatic definitions use the analogous
`force = -joint-damping * relative velocity`, in N·s per project unit.

## Validation and scope

Parents outside the component instance or projection scope, missing parents, endpoints that resolve to one rigid body, missing anchors, and zero axes are rejected with source diagnostics. Joint identity is derived from
the stable child-body identity. Release A is intentionally limited to passive
tree articulation: it does not define motors, cursor targets, inverse kinematics,
breakable joints, soft constraints, or closed-loop mechanisms.

Rapier owns gravity, contact response, angular motion, and constraint solving.
Joint definitions are included in physics snapshots so restore reconstructs the
same constraint graph before body state is applied. Rendering continues to
consume immutable body poses through `PhysicsFrame`; it has no joint backend
dependency.

## Stabilized passive-joint lifecycle

Articulations are identified by stable joint IDs and reconciled after their endpoint bodies exist. An unchanged authored graph is retained in place, preserving poses, velocities, sleeping islands, warm-started constraints, and solver state. Reset and snapshot restoration remain explicit full-reconstruction boundaries: the body/collider graph and all constraints are rebuilt before saved body states and the saved tick are applied.

| Kind | Anchors | Axis | Limits | Units |
| --- | --- | --- | --- | --- |
| `revolute` | parent/child local | independent parent/child local | optional | radians at the engine-neutral boundary (DSL authors use degrees) |
| `prismatic` | parent/child local | independent parent/child local | optional | project units |
| `fixed` | parent/child local plus local frames | none | none | project units |
| `spherical` | parent/child local | none | none | project units |

Validation rejects missing or self-linked endpoints, duplicate IDs, multiple parent joints, non-finite frames, zero axes, reversed limits, and cycles before backend mutation. Dynamic-only trees and connected masses differing by more than 100:1 produce warnings. Diagnostics retain the declaration line whenever available.

Closed loops, spherical cone/twist limits, and multi-joint cursor articulation remain unsupported. Spherical joints are unrestricted ball-and-socket pivots. Debug inspection exposes stable IDs, endpoints, kind, scalar coordinate/limits where applicable, and pivot error without exposing Rapier handles.


## Portable instances

The source above can be placed at its original transform, translated to `X = 15`, or instantiated repeatedly at arbitrary translated and rotated component transforms. Every instance retains exactly the same `joint-anchor: 0.5 8 0.5`, `joint-axis: 0 0 1`, `joint-limits: -170 170`, and `joint-damping: 0.05`; only its initial world body poses differ. World-space articulation declarations and cross-component links are rejected rather than treated as compatibility input. Snapshots persist the compiled body-local frames and reconstruct constraints before restoring mutable body poses.

## Bounded joint actuation (Release C)

Revolute joint coordinates and position targets are radians, velocities are radians/second, and effort is N·m. Prismatic coordinates use project units, velocities use project units/second, and effort is newtons. `motor-mode` is `position`, `velocity`, `effort`, or `passive`. Active motors require finite, positive `motor-max-speed` and `motor-max-effort`; there is deliberately no infinite-effort default. `motor-target` is authored in degrees for revolute DSL declarations and converted to radians at compilation, while engine-neutral inputs are always radians. `joint-damping` is passive viscous drag; `motor-damping` is an active drive gain.

Commands (`joint-position-target`, `joint-velocity-target`, and `joint-effort`) name the stable joint ID and a fixed future tick. Position targets are clamped to authored limits, target progression is speed-limited, and solver effort is capped. They configure a constraint drive rather than a body transform, so contacts, mass, gravity, limits, and obstruction remain authoritative. Active command and progressed target state are included in snapshots. Multi-joint/end-effector IK remains deferred to Release D.
