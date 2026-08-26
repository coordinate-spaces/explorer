# Spatial Object Model Implementation Plan

## Product goal

The project renders realistic interior spatial compositions from a declarative Spatial Declaration Language. The default space is an XYZDSL corner scene: a floor on the X/Z plane, a back wall at Z = 0, and a side wall at X = 0. Users add fixtures, fittings, furniture, content cards, and primitive geometry by composing spatial declarations in the same shared world space.

The long-term model is intentionally DOM-like: spatial declarations compile into a neutral spatial document model, and the ThreeJS renderer consumes that document. This keeps parsing, layout, collision handling, and rendering independently extensible.


## Terminology

- **Spatial Declaration Language**: the compact text authoring syntax for spatial paths and object properties. Internal parser modules still use `xyzdsl` names for historical continuity.
- **Spatial declaration**: one quoted path/property line in the authoring source.
- **Spatial path**: a slash-delimited namespace plus an optional final X/Y/Z bounding box.
- **Namespace declaration**: a spatial path ending in `/`; it does not render by itself and exists to provide inherited defaults.
- **Spatial instance**: a spatial path with a concrete box; it can produce a node in the spatial document.
- **Prototype namespace**: a reusable namespace intended to be materialized through `ref`.
- **Reference instance**: a concrete instance that imports defaults or descendants from a prototype namespace.
- **Spatial transaction**: a remote transaction whose destination path and memo/properties payload map into one spatial declaration.
- **Spatial document**: the renderer-neutral resolved model made of `SpatialNode` values and boolean composition expressions.
- **Boolean composition operation**: user-facing term for `union`, `subtraction`, and `intersection`; the implementation uses CSG expressions to render those operations.

## Unit model

- One project unit is one metre: `1` = `1 m`.
- Metric suffixes apply to individual numbers: `1d` = `0.1 m`, `1c` = `0.01 m`, and `1m` = `0.001 m`.
- Values may mix bare metres, decimetres, centimetres, and millimetres in one axis segment; for example, `+1+3m` is a 1 m offset with a 3 mm size.
- Numeric path values use unpadded digits with no suffix or exactly one lowercase `d`, `c`, or `m` suffix. Decimal markers, repeated suffixes, and leading zeroes are invalid.
- Path coordinates, dimensions, radii, collision bounds, grid spacing, rooms, and margins share this metre-based scale and pass directly to ThreeJS.

### Authoring scale references

- `1` = 1 m.
- `75c` = 75 cm, roughly one adult walking pace.
- `8d` = 80 cm, a useful table-height reference.
- `2` = 2 m, a useful doorway or person-height reference.
- `3` = 3 m, a useful small-room span reference.

## Spatial declaration grammar

A primitive declaration has a quoted coordinate expression followed by a quoted object-property declaration:

```txt
"+xOffset+width/+yOffset+height/+zOffset+depth" : "geometry: cone; color: blue; metalness: 0.1; roughness: 0.2"
```

Each axis segment uses `+offset+size` syntax. Axis order is always X, Y, then Z. Axis numeric values use the grammar `digits` optionally followed by exactly one of `d`, `c`, or `m`, denoting decimetres, centimetres, or millimetres; bare digits denote metres. Namespace identifiers are parsed separately, so they may still contain the letter `c` as a normal identifier character. Namespace segments may contain only unpadded Base64 characters other than the `/` path delimiter: `A-Z`, `a-z`, `0-9`, and `+`; each namespace segment must start with a letter or number so leading `+` remains reserved for coordinate axis segments. Padding belongs to remote transport validation and is intentionally excluded from renderer spatial declaration namespaces. The optional `geometry` property defaults to `box` and supports `box`, `cylinder`, `cone`, and `sphere`. The optional `box-radius` property applies only to box geometry and rounds box edges in project units when set to a positive value. The optional `puff` property is a compact `0..5` box-geometry deformation control for cushion-like silhouettes; it is intentionally modeled as shape data instead of material data. The optional `rotation` property accepts an X/Y/Z degree triple, for example `rotation: 0,45,0`.

Namespaced declarations extend the quoted coordinate expression with slash-separated identifiers before the coordinate segments:

```txt
"Sofa/+7d+4d/+0d+3d/+0d+2d" : "color: brown"
"Sofa/Cushion/" : "color: 0xf5f3ef; metalness: 0; roughness: 0.88; puff: 5"
"Seat/+3d+5d/+0d+3d/+0d+15d" : "ref: Sofa/"
"Table/+18d+8d/+0d+5d/+4d+8d" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/LegA/+0d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegB/+7d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegC/+0d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"Table/LegD/+7d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
```

A spatial instance path ends with exactly three X/Y/Z axis segments. A namespace declaration ends in `/`, does not render, and supplies inherited defaults to matching child namespaces. Nested coordinates are definitions in the local space of their parent namespace until that parent namespace is materialized. In other words, `Sofa/Base/+0d+6d/+0d+40m/+0d+3d` defines `Base` inside `Sofa`; it does not render in world space unless `Sofa` has an explicit concrete instance such as `Sofa/+10d+6d/+0d+2d/+0d+3d` or another concrete instance references `Sofa/`.

The canonical overwrite key is every namespace segment before the XYZ axes. Within each kind of named entry, a newer entry with the same key replaces rather than merges with the older entry: omitted properties do not carry forward, namespace declarations replace earlier namespace declarations, and concrete spatial instances replace earlier concrete instances even if their XYZ boxes differ. Declaration-only defaults and concrete instances at the same namespace coexist so inheritance continues to work. Authors who need several sibling primitives must give them distinct namespaces, such as `Table/LegA/...` and `Table/LegB/...`. Coordinate-only anonymous declarations have no namespace key, are exempt from replacement, and remain independent in source order.

Reference lookup is historical rather than retroactive. A `ref` resolves to the newest target entry occurring before that line, including the then-current snapshot of compound descendants. For example, in `Sofa/` (brown), `SeatA/... : ref: Sofa/`, `Sofa/` (blue), then `SeatB/... : ref: Sofa/`, `SeatA/` keeps the brown target while `SeatB/` receives blue. Redeclaring `Sofa/` after `SeatA/` therefore neither invalidates nor rewrites the existing reference.

References must point to a namespace that has already been declared or instantiated. A reference to a namespace with local descendants materializes those descendants below the referring instance. By default, the referring instance is an unscaled anchor transform, so referenced templates preserve their authored local dimensions and the referring box establishes only the world-space origin and rotation for the cloned local subtree. Authors can opt into fit-to-box scaling with `ref-scale: true`; in that mode, the referring box scales the referenced local subtree on X/Y/Z so the prototype root dimensions fit the referring box. References to namespaces without local descendants keep the previous primitive-copy behavior: the referring instance renders its own box with the target namespace properties. Child coordinates are local to the nearest concrete ancestor namespace, while anonymous and top-level named instances remain in world space. Concrete ancestor transforms compose onto descendants as group transforms; they are not inherited into each child primitive as local rotation defaults. Boolean composition declarations also use declaration order within the nearest concrete namespace scope before falling back to world-space overlap, so a later subtraction or union can refine an earlier local solid and the composed result can then participate with other world-space objects.

Spatial transaction validation can cap each memo/properties payload at 100 bytes, but the parser, document model, and renderer treat that as an upstream transport limit rather than a scene-rendering limit. A spatial transaction is a remote transaction whose path and memo/properties payload map into one spatial declaration. The renderer consumes the fully resolved declaration graph and has no practical limit on how many inherited properties a node may receive. Spatial transaction authors can therefore spread compact declarations across multiple 100-byte fields and use namespace inheritance to amortize verbose shared settings: a parent namespace declaration can carry material or geometry defaults, child namespaces can add geometry or deformation defaults, and concrete instances can rely on the accumulated properties while only spending bytes on coordinates or local overrides.

## Coordinate system

Spatial declarations use edge-based bounding-box placement:

- X = horizontal distance from the left wall/corner plus bounding-box width.
- Y = height from the floor plus bounding-box/object height.
- Z = distance from the back wall plus bounding-box depth.

ThreeJS primitives are center-positioned, so each spatial declaration bounding box is converted to:

```txt
position.x = x + width / 2
position.y = y + height / 2
position.z = z + depth / 2
```

The derived primitive dimensions are:

```txt
[width, height, depth]
```

## Rotation and transforms

Spatial objects compile to a neutral transform contract before rendering:

```txt
transform.position = [x + width / 2, y + height / 2, z + depth / 2]
transform.rotation = [xRadians, yRadians, zRadians]
transform.scale = [width, height, depth]
transform.pivot = [0, 0, 0]
```

The Spatial Declaration Language expresses rotation in degrees for readability and the model converts those values to radians for ThreeJS. Axis order is always X, Y, then Z, matching the coordinate segment order. Rotation defaults to `[0, 0, 0]`, uses the object center as the pivot, and is applied to the unit primitive after it has been positioned inside its declared bounding-box contract. The renderer consumes this neutral transform directly, so future exporters or renderers can use the same document model.

Example rotated box:

```txt
"+2d+4d/+0d+2d/+2d+1d" : "geometry: box; color: orange; rotation: 0,45,0"
```

Collision and union grouping use transformed world-space AABBs: the model rotates the eight corners of each object box around the center pivot, then derives an axis-aligned broad-phase bound from those transformed corners. Future group nodes should compose parent and child transforms rather than rewriting child geometry.

Boxes map these values directly to box dimensions. Boxes with `box-radius` set to a positive value render rounded edges inside the same bounding-box contract; omitted or zero radius renders a normal sharp-edged box, and the renderer clamps the radius to half of the smallest box dimension. Cylinders and cones use X/Z as their footprint and Y as their height. Spheres use the full bounding box as a scalable ellipsoid contract, so non-cubic dimensions intentionally render a stretched sphere that still fills the declared box.

## Examples

```txt
"+2d+4d/+0d+6d/+1d+3d" : "geometry: box; box-radius: 0.015; color: 0x333333; metalness: 0.8; roughness: 0.2"
```

This renders a rounded box that is 4 dm wide, offset 2 dm from the X origin, rests on the floor, is 6 dm high, is 1 dm from the back wall, and is 3 dm deep. Its edge radius is 0.015 m (1.5 cm).

```txt
"+2d+4d/+7d+6d/+0d+10m" : "geometry: cone; color: yellow; metalness: 0.2; roughness: 0.5"
```

This renders a cone above the first box with a 4 dm × 1 cm footprint and a height of 6 dm.

```txt
"+7d+6d/+0d+15d/+0d+50m" : "geometry: sphere; color: blue; metalness: 0.1; roughness: 0.2"
```

This renders a right-side scaled sphere inside a 6 dm × 1.5 m × 5 cm bounding box.

## Current architecture

```txt
src/
  xyzdsl/
    materialParser.ts
    parser.ts
    types.ts
  model/
    SpatialDocument.ts
    SpatialNode.ts
    collision.ts
    createSpatialDocument.ts
  scene/
    XyzCornerSpace.tsx
    Lighting.tsx
    SceneRoot.tsx
    SpatialPrimitive.tsx
    materials.ts
  ui/
    XyzDslDrawer.tsx
    XyzDslEditor.tsx
    ObjectList.tsx
```

## Parser architecture

The parser is independent from React and ThreeJS. It converts text declarations into typed spatial objects, captures diagnostics, and preserves source strings for future editing and object provenance.

The object-property parser currently supports geometry plus a deliberately minimal material model:

- `geometry` (`box`, `cylinder`, `cone`, `sphere`)
- `box-radius` (box-only rounded edge radius in project units)
- `puff` (`0..5` box-only cushion deformation strength)
- `color`
- `metalness` (`0..1`)
- `roughness` (`0..1`)
- `rotation` / `rotate` (X/Y/Z degree triple)
- `ref` (namespace reference target)
- `ref-scale` (`true`/`false`, defaults to `false`; scales referenced local descendants to fit the referring box when enabled)

Unsupported object properties are ignored with diagnostics. Nonnumeric or out-of-range metalness and roughness declarations are rejected with diagnostics rather than silently clamped. Material state stays renderer-neutral and contains only base color plus metallic/roughness surface response; presets, transparency, and extended physical-material properties are intentionally outside the current scope.

## Spatial document model

The spatial document contains neutral `SpatialNode` values with:

- stable node IDs
- original source text
- parsed bounding-box dimensions
- computed bounds
- derived primitive geometry
- parsed transform settings
- parsed material settings
- optional union group IDs
- future-ready metadata and children fields

This document model is the extension point for named objects, hierarchy, reusable components, anchors, relative positioning, snapping, and export formats.

## Collision and union strategy

The first implementation uses transformed world-space axis-aligned bounding box collision detection. Colliding components are grouped and assigned a `union-*` identifier. Rendering applies a subtle union highlight to grouped objects.

Full boolean geometry merging is implemented through a ThreeJS-compatible CSG library while preserving the spatial document model API. User-facing docs should call these boolean composition operations; implementation docs and code can still use CSG for the mesh operation layer.

## Rendering architecture

The renderer uses React Three Fiber and Drei. `SceneRoot` owns the canvas, camera, controls, lighting, XYZ corner space, and spatial primitives. `XyzCornerSpace` draws the floor and two wall planes exclusively as transparent lines. `SpatialPrimitive` maps each spatial node into a ThreeJS mesh by dispatching on the derived geometry kind while sharing the same transform and union-highlight behavior for all primitives. All spatial primitives render with `meshStandardMaterial` using only color, metalness, and roughness. `puff` affects the actual box geometry by increasing rounded cushion curvature; collision bounds remain based on the declared transformed box, so the layout contract stays stable even as the silhouette softens.

## UI drawer workflow

Content declarations are modeled separately from primitive geometry. Text content renders as a paper/card mesh with Drei text on its front face. URL content renders as a card with a sandboxed Drei `Html` iframe overlay instead of trying to rasterize remote pages into a WebGL texture, which avoids CORS-tainted canvas issues and keeps unsafe URL schemes out of the scene.

The UI is a full-screen 3D canvas with a popup drawer. The drawer allows users to edit declarations, see parse diagnostics, and inspect parsed objects. The scene updates immediately as the spatial declaration source changes.

## Deferred design notes

- [Prototype `ref` instancing for namespaced groups](prototype-ref-instancing.md) captures the future design for making `ref: Table/` clone a full composed `Table/...` subtree scaled into the referencing box.

## Roadmap

1. Add richer validation and structured parse errors.
2. Add object naming and references.
3. Add group nodes and nested transforms.
4. Add fixture/furniture presets that compile to primitive geometry.
5. Add wall-mounted anchors and relative positioning.
7. Extend boolean composition beyond the current CSG-backed operations for more collision and grouping cases.
8. Add save/load, shareable URLs, JSON export, and GLTF export.
