# Experimental passive articulation (Release A)

Release A introduces passive revolute joints without exposing Rapier handles to
XYZDSL, rendering, or transaction code. Articulations are rooted forests of
stable rigid-body identities connected by engine-neutral joint definitions.

## Authoring

```xyzdsl
"Pendulum/+0+1/+0+1/+0+1" : ""
"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+295c+10c/+550c+5/+45c+10c" : "body: Rod; mass: 1; rotation: 0,0,90; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -170 170; joint-damping: 0.05"
```

This initial transform puts the five-unit rod horizontally, away from its
gravity-aligned equilibrium. Rotation is about the rod center at
`(3, 8, 0.5)`; after the 90-degree Z rotation its top endpoint is therefore
`(0.5, 8, 0.5)`, matching `joint-anchor`. Gravity supplies torque immediately,
while the revolute constraint keeps that endpoint attached to the hinge.

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
| `joint-anchor` | World-space pivot as three finite project-unit numbers. |
| `joint-axis` | Non-zero world-space axis as three finite numbers. |
| `joint-limits` | Optional ordered minimum/maximum angles in degrees. |
| `joint-damping` | Optional non-negative passive angular damping. |
| `collide-connected` | Whether directly connected colliders contact; defaults to `false`. |

The compiler normalizes the axis and resolves the pivot and axis into both body
local frames. The engine adapter receives only local coordinates. Physics uses
fixed ticks; joint limits are converted to radians at the compiler boundary.

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
