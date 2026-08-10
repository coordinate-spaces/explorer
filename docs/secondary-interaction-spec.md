# Secondary projection interaction specification

## 1. Status and conformance language

This document defines the authoring and evaluation contract for secondary/projection interactions in XYZDSL. It consolidates the decisions made during the initial design and review of `+probe` and `+breach`.

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative requirements. Implementation progress and deferred work are tracked separately in the [secondary interaction roadmap](secondary-interaction-roadmap.md).

## 2. Goals

The interaction system provides a renderer-neutral way to:

- Treat transaction-time-ordered secondary projections as remote cursors or controllers.
- Detect spatial relationships between secondary cursors and baseline scene objects.
- Select conditional XYZDSL variants without introducing imperative control flow.
- Preserve controller identity when several streams use the same cursor namespace.
- Add future interaction predicates without changing ordinary namespace or coordinate syntax.

Conditional declarations are declarative **state variants**. They are not branches, loops, or an imperative control-flow language.

## 3. Terminology

- **Baseline**: the primary authored spatial environment against which secondary cursors are evaluated.
- **Secondary stream**: an ordered transaction source, identified by stream/public-key provenance.
- **Cursor**: a concrete spatial declaration produced by a secondary stream. A stream may produce more than one cursor namespace.
- **Target**: the ordinary object whose effective state may be changed by a conditional declaration.
- **Interaction directive**: a reserved leading-`+` keyword such as `+probe` or `+breach`.
- **Directive scope**: the namespace prefix appearing before the directive.
- **Conditional declaration** or **state variant**: a declaration that contains an interaction directive.
- **Interaction fact**: a renderer-neutral cursor-to-target relationship for one evaluated frame.
- **Persistent state**: a predicate, such as `probe` or `breach`, that remains active while its spatial condition is true.
- **Transition event**: a temporal edge such as enter or leave, derived by comparing consecutive fact sets.

## 4. Base64-safe path grammar

XYZDSL declaration paths are constrained to the unpadded Base64 character set used by the transport: `A-Z`, `a-z`, `0-9`, `+`, and `/` as the segment delimiter.

The path grammar reserves segment-leading `+` values as follows:

```txt
Rod       ordinary namespace segment
+probe    interaction directive
+contact  probe-or-breach interaction directive
+4        unsigned translation magnitude
+9+1      absolute axis offset and size
```

Ordinary namespace segments MUST start with a letter or number. Interaction directive segments MUST start with `+` followed by a supported keyword. Concrete absolute coordinates MUST be the final three path segments and MUST use the existing X/Y/Z `+offset+size` form.

Because classification is based on both suffix position and segment shape, `+probe` cannot be confused with `+offset+size` coordinates.

### 4.1 Supported directives

The initial directive set is:

- `+probe`
- `+breach`
- `+contact`

`+contact` is a matching directive rather than a third geometric fact. It selects either a `probe` or `breach` fact while preserving the underlying fact state for inspection and timeline identity. It is intended for responses, such as cursor pushing, that must not deactivate when face contact becomes penetration.

A conditional declaration SHOULD contain one interaction directive. Multiple directives are reserved for a future explicitly defined conjunction model and MUST NOT be relied upon by portable documents.

Unknown leading-`+` keyword segments MUST produce a diagnostic rather than silently becoming ordinary namespaces.

## 5. Target identity and hierarchical scope

Directive segments appear in the authored namespace path but MUST be removed when calculating ordinary object identity.

```txt
"Machine/Lever/+probe": "rotation: 0,0,30"
```

has:

```txt
target namespace = Machine/Lever/
directive scope  = Machine/Lever/
```

Moving the directive earlier changes its interaction scope without changing the target:

```txt
"Machine/+probe/Lever": "rotation: 0,0,30"
```

has:

```txt
target namespace = Machine/Lever/
directive scope  = Machine/
```

The latter variant activates when the matching interaction state targets an object in the `Machine/` scope, while its property override is still applied to `Machine/Lever/`. This permits interaction with one part of a component to affect another part.

A conditional declaration MUST resolve to an existing ordinary target namespace. It MUST NOT create a second renderable object, concrete ancestor, collision body, or CSG tool merely by existing.

## 6. Conditional spatial forms

A conditional declaration supports three spatial modes.

### 6.1 Inherit the current resolved box

```txt
"Rod/+probe": "rotation: 90,90,0"
```

The conditional declaration has no coordinate suffix. It preserves the target's resolved box and overrides only declared properties.

The canonical form has no trailing slash. An implementation MAY accept `Rod/+probe/` as a compatibility alias, but it MUST normalize to the same conditional identity.

### 6.2 Relative translation

```txt
"Rod/+probe/+4/+5/+9": "rotation: 90,90,0"
```

The final three single-number segments are unsigned X/Y/Z translation magnitudes. They preserve the target's dimensions.

A stateless document compilation MUST recalculate translation from the resolved base state. A transaction-owned simulation MAY apply `+contact` translation to its retained body pose once per new transaction/playback frame. It MUST NOT advance from render calls or repeated reads of a completed frame.

The terminal marker `+++` selects weighted unsigned inferred-direction translation:

```text
"Ball/+probe/+++": ""
```

Missing, zero, negative, and non-finite cursor or target amounts MUST each use the deterministic atomic minimum transaction amount of `1_000_000`. The scalar project distance is `(cursor transaction amount / target baseline transaction amount) / CENTIUNITS_PER_UNIT`, where `CENTIUNITS_PER_UNIT` is `100`; equal valid weights therefore produce `0.01` project units (one millimetre). Implementations MUST apply the maximum-distance clamp after this centiunit conversion. The maximum is 100 project units, whose intended physical size is 10 metres under the project scale of one unit per 10 centimetres. Implementations MUST use the target-oriented contact normal when nonzero; otherwise they MUST normalize the inferred target-away-from-cursor direction. An entirely indeterminate vector defaults to positive X. In stateless compilation, weighted translation is recomputed from the resolved base state. A transaction-owned simulation may accumulate `+contact/+++` once per evaluated transaction frame under the timing rule above.

Weighted translation MUST NOT incorporate surface area, volume, or density until those semantics are specified separately. Geometry-dependent volume requires shape-specific calculation, and transaction weight currently has no documented mass unit.

When weighted translation is selected by `+contact`, a matching breach MUST add the minimum target-to-cursor AABB exit distance to the weighted distance. The exit calculation MUST compare both translation directions on every axis; using intersection width alone is insufficient when either box contains the other. The result is applied along the selected exit normal. This clears the sampled breach and then adds the force-to-weight displacement, so a cursor step larger than the weighted distance does not deactivate pushing. Stateless compilation recomputes the result from baseline and current-frame facts; the transaction-owned `+contact` simulation accumulates it once per evaluated frame. `+probe/+++` and `+breach/+++` retain their original weighted-distance-only behavior.

For each axis, direction is selected in this order:

1. Use a nonzero target-oriented interaction/contact normal.
2. Otherwise, infer the direction away from the cursor using target and cursor centers.
3. If direction remains indeterminate, default to the positive axis.

Negative delta syntax is therefore unnecessary in the initial grammar.

### 6.3 Absolute box replacement

```txt
"Rod/+probe/+9+1/+0+5/+0+1": "rotation: 90,90,0"
```

The final three `+offset+size` segments replace the complete effective X/Y/Z box. Conditional absolute coordinates MAY change both placement and dimensions; they are not required to equal the baseline declaration.

## 7. Interaction predicates

### 7.1 Probe

`probe` means that cursor and target faces touch, or are within the configured probe tolerance, without positive-volume overlap. A face probe requires positive overlap on the other two axes. Edge-only, corner-only, or diagonally nearby bounds MUST NOT count as a probe.

### 7.2 Breach

`breach` means that cursor and target have positive-volume overlap. The initial implementation uses transformed world-space AABBs and selects the deterministic minimum target-exit translation across both directions of every axis for its contact normal.

### 7.3 Contact matching

`contact` matches either a `probe` or `breach` fact. It MUST NOT replace the fact's state with `contact`, and it does not change the AABB-based predicate semantics. A spherical render geometry therefore still interacts through its transformed AABB in the initial implementation.

### 7.4 Evaluation space and feedback

Interaction predicates MUST be evaluated from authored/resolved pre-variant bounds and before ordinary collision packing. Conditional movement MUST NOT immediately re-evaluate and deactivate its own triggering predicate within the same frame. This avoids same-frame feedback oscillation.

Secondary cursors are sensors by default. They MUST NOT participate in baseline packing or default union grouping unless a future explicit physical-body option opts them in.

## 8. Stream and cursor identity

An interaction MUST retain which secondary controller caused it. Cursor identity is the pair:

```txt
(streamId, cursorNamespace)
```

`streamId` SHOULD be derived from stable stream provenance such as public key plus endpoint. Transaction ID, transaction time, and stable source order SHOULD be retained when available.

Two streams that both declare `Cursor/` MUST remain distinct. When one cursor leaves a target while another remains, the departing cursor's fact is removed but the target's aggregate persistent state remains active.

One stream MAY control several cursor namespaces, such as `LeftHand/`, `RightHand/`, and `GazePointer/`.

## 9. Transaction time and movement

Secondary declarations are ordered by transaction time with a stable source-order tie-break. Repeated concrete declarations with the same `(streamId, namespace)` represent discrete movement; the selected frame uses the latest applicable declaration for that stream and namespace.

Seeking or replaying MUST derive cursor state from the selected transaction-time frame. It MUST NOT reuse stale interaction state from whichever live frame happened to render previously.

## 10. Variant selection and merging

For each target, evaluation proceeds in this order:

1. Resolve ordinary baseline declarations, namespace inheritance, and references.
2. Evaluate secondary cursor interaction facts from pre-variant bounds.
3. Select conditional variants whose directive state and scope match an active fact.
4. Apply matching variants from broader scope to narrower scope.
5. At equal scope, apply variants in declaration order.
6. Rebuild effective transforms, bounds, geometry, CSG inputs, and render state.

Overrides merge at property level:

- Undeclared material fields MUST remain inherited.
- Texture overrides MUST merge by channel and then by texture attribute; changing one repeat or source MUST NOT delete unrelated channels or inherited preset attributes.
- A partial geometry override MUST retain the resolved base geometry kind unless `geometry` is explicitly declared.
- A declared content override replaces baseline content; absent conditional content preserves it.
- A declared rotation replaces the effective rotation at that point; absent rotation preserves it.
- An absolute box replaces the effective box at that point.
- A later relative translation translates the effective box produced so far.

If several cursors satisfy one variant, selection MUST be deterministic. The initial ordering prefers greater breach penetration, then nearer probe separation, then stable stream and cursor identity.

## 11. Persistent states and temporal transitions

`probe` and `breach` are persistent predicates. `enter`, `stay`, and `leave` are derived relationships between consecutive complete fact sets and MUST remain separate from persistent state.

Future transition-facing names SHOULD be explicit, for example:

```txt
probe-enter
probe-leave
breach-enter
breach-leave
```

Transition events require a transaction-time timeline owner, deterministic seek reconstruction, and an explicit event lifetime. They are not yet portable XYZDSL directives. The roadmap defines their remaining implementation criteria.

## 12. Broad phase and future narrow phases

Interaction candidate lookup is separate from predicate semantics. A broad-phase spatial index MAY reduce cursor-to-target comparisons, but indexed results MUST match a brute-force reference and remain deterministically ordered.

The initial predicate implementation uses transformed AABBs. Future sphere, cylinder, oriented-box, mesh, or CSG narrow phases MUST preserve the `InteractionFact` and directive contracts so authored XYZDSL does not depend on renderer geometry internals.

## 13. Diagnostics and inspection

Implementations SHOULD diagnose:

- Unknown or malformed directive segments.
- Directives without a target or namespace scope.
- Mixed or incomplete conditional coordinate suffixes.
- Conditional targets that do not exist.
- Unsupported conditional topology/reference operations.

Authoring tools SHOULD expose the effective state, base state, active directive, cursor namespace, stream identity, transaction time, inferred direction/contact normal, and contributing variant source when available.

## 14. Examples

### Rotate on contact

```txt
"Rod/+0+1/+0+5/+0+1": "geometry: cylinder"
"Rod/+probe": "rotation: 90,90,0"
```

### Move away from the probing cursor

```txt
"Rod/+0+1/+0+5/+0+1": "geometry: cylinder"
"Rod/+probe/+4/+0/+0": "rotation: 0,0,15"
```

### Replace placement, size, and appearance on breach

```txt
"Rod/+0+1/+0+5/+0+1": "geometry: cylinder; color: blue"
"Rod/+breach/+9+2/+0+3/+0+2": "color: red"
```

### Component-scoped reaction

```txt
"Machine/+0+10/+0+8/+0+10": ""
"Machine/Lever/+1+1/+2+4/+1+1": "geometry: cylinder"
"Machine/+probe/Lever": "rotation: 0,0,30"
```
