# Experimental passive articulation (Release A)

Release A introduces passive revolute joints without exposing Rapier handles to
XYZDSL, rendering, or transaction code. Articulations are rooted forests of
stable rigid-body identities connected by engine-neutral joint definitions.

## Authoring

```xyzdsl
"Pendulum/+0+1/+0+1/+0+1" : ""
"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+45c+10c/+3+5/+45c+10c" : "body: Rod; mass: 1; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -170 170; joint-damping: 0.05"
```

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
| `joint-parent` | Parent primitive namespace, with an optional trailing slash. |
| `joint-anchor` | Pivot in top-level component-local project units. |
| `joint-axis` | Non-zero direction in the top-level component-local frame. |
| `joint-limits` | Optional ordered minimum/maximum angles in degrees. |
| `joint-damping` | Optional non-negative passive angular damping. |
| `collide-connected` | Whether directly connected colliders contact; defaults to `false`. |

### Coordinate-space invariant

Jointed articulation is defined only within a top-level component. Consequently,
all spatial joint properties are component-local: `joint-anchor` is scaled,
rotated, and translated with the component, while `joint-axis` is rotated with
it as a direction. There is deliberately no world-space joint authoring mode.

This invariant prevents a subtle failure in which moving a component moved its
bodies but left a literal world-space pivot behind. Such a stale pivot produced
large body-local offsets and made the solver snap or deform an otherwise valid
articulation. The compiler now retains each descendant's component frame,
transforms the authored anchor and axis through that frame exactly once, and
then resolves them into the two bodies' local frames. The engine adapter receives
only those body-local values, so the constraint remains attached throughout
simulation, reconciliation, component movement, and snapshot restoration.

Future joint properties that represent positions, directions, orientations, or
motion targets must follow the same component-local-to-body-local compilation
boundary. Tests must cover the same articulation at the origin and beneath
translated and rotated component roots; accepting raw project-world joint data
in the engine-neutral definition is not permitted.

Physics uses fixed ticks; joint limits are converted to radians at the compiler
boundary.

## Validation and scope

Missing parents, endpoints that resolve to one rigid body, missing anchors, and
zero axes are rejected with source diagnostics. Joint identity is derived from
the stable child-body identity. Release A is intentionally limited to passive
tree articulation: it does not define motors, cursor targets, inverse kinematics,
breakable joints, soft constraints, or closed-loop mechanisms.

Rapier owns gravity, contact response, angular motion, and constraint solving.
Joint definitions are included in physics snapshots so restore reconstructs the
same constraint graph before body state is applied. Rendering continues to
consume immutable body poses through `PhysicsFrame`; it has no joint backend
dependency.
