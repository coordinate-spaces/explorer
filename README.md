# Spatial Object Model

A prototype for composing primitive geometry and embedded content in an XYZDSL spatial document model with a declarative Spatial Declaration Language.

## Run locally

```bash
npm install
npm run dev
```


## Deploy to GitHub Pages

This repository includes a GitHub Actions workflow that builds the Vite app and deploys the `dist` artifact to GitHub Pages whenever changes are pushed to `main`. You can also run the deployment manually from the **Actions** tab by selecting **Deploy to GitHub Pages** and choosing **Run workflow**.

In the repository settings, set **Pages** → **Build and deployment** → **Source** to **GitHub Actions**. The workflow automatically builds with the repository name as the Vite base path so project pages load assets from the correct URL.

## Spatial declaration example

Each declaration lays out a primitive inside an edge-based X/Y/Z bounding box. The optional `geometry` property defaults to `box` and currently supports `box`, `cylinder`, `cone`, and `sphere`. Boxes can also set `box-radius` in the same project units as path coordinates to render rounded edges and `puff: 0..5` to make cushion-like boxes use a softer rounded silhouette while keeping the same layout, transform, collision, and union contract.

A spatial declaration is one quoted path/property line. Declaration keys can be anonymous world-space boxes, named spatial instances, namespace declarations, or child instances inside a named parent namespace. Namespaces use slash-separated identifiers before the final three coordinate segments. Namespace declarations end in `/` and do not render by themselves; they define inherited defaults for matching child instances. A prototype namespace is a reusable namespace intended for references. A reference instance uses the `ref` property to copy material, geometry, and transform defaults from a previously declared namespace and applies them to the referencing instance's own box.

Named entries are replaceable: when a later namespace declaration has the same namespace as an earlier namespace declaration, or a later spatial instance has the same namespace as an earlier instance, the later entry overwrites rather than merges with the earlier one. Properties omitted from the replacement do not survive. The matching key is the complete slash-separated path before the three XYZ segments, so two `Sofa/Cushion/...` instances replace one another even when their coordinates differ. Declaration-only defaults and concrete instances remain complementary—for example, `Sofa/` can still provide defaults to a `Sofa/...` instance. Anonymous paths, which begin directly with XYZ segments, have no namespace key and are never overwritten.

References are evaluated in declaration order. They use the newest matching target available above the `ref` line, so a later target redeclaration does not retroactively change or invalidate an existing reference:

```txt
"Sofa/" : "color: brown"
"SeatA/+0+4/+0+2/+0+3" : "ref: Sofa/"
"Sofa/" : "color: blue"
"SeatB/+5+4/+0+2/+0+3" : "ref: Sofa/"
```

Here `SeatA/` uses brown and `SeatB/` uses blue.

Path coordinates use compact project units rather than literal walking strides: `1` bare unit is `10 cm`, and `1c` is one centiunit, or `1 mm`. The optional `c` suffix applies per number, so mixed axis values are valid: `+1+3c` means offset `1` unit (`10 cm`) and size `0.03` units (`3 mm`). For real-world mental scale, an adult walking pace of about `0.75 m` is `7.5` units, written exactly as `750c`. Decimal path notation is intentionally avoided; write `10c` instead of `0.1`.

Boolean composition operations (`operation: union`, `operation: subtraction`, and `operation: intersection`) follow declaration order and are implemented with CSG internally. A later overlapping operator first targets earlier solids in the same namespace/local scope; if no local scoped target overlaps, it falls back to the earlier overlapping world-space solid. This lets compound objects be authored as local groups, but the group must still have a concrete namespace anchor to materialize its children:

Ordinary collisions use the same component boundary: overlapping primitives whose namespace paths share the same top-level component are assigned a default union group. A later object colliding outside that local component space is instead packed against the nearest available face of the earlier geometry. All primitives in a named component receive one shared packing translation, preserving their authored arrangement. Packing tests the six axis-aligned face positions in distance order, with `+X`, `-X`, `+Y`, `-Y`, `+Z`, `-Z` as the deterministic tie-break, and chooses the first position that does not overlap previously placed global objects. Explicit CSG operators retain their authored offset from the selected base and move with that base when its completed expression is packed.

```txt
"Mug/+0+1/+0+1/+0+1" : "color: 0xf5f3ef"
"Mug/Body/+5+2/+1+2/+1+2" : "geometry: cylinder; roughness: 0.65"
"Mug/Hollow/+530c+140c/+120c+190c/+130c+140c" : "geometry: cylinder; operation: subtraction"
"Mug/Handle/+680c+110c/+155c+110c/+135c+130c" : "box-radius: 0.18; operation: union"
"Mug/HandleHole/+700c+70c/+175c+70c/+155c+90c" : "box-radius: 0.12; operation: subtraction"
```

Spatial transaction validation may limit each memo/properties field to 100 bytes, but that is a transport constraint rather than a renderer limit. A spatial transaction is a remote transaction whose path and memo/properties payload map into one spatial declaration. Once declarations are loaded, the renderer consumes the resolved spatial document and does not impose a practical size limit on the inherited property set. Authors targeting the remote format can fit richer scenes into the 100-byte fields by putting shared material, geometry, texture, and deformation properties on namespace declarations, then letting child instances inherit those defaults or add compact overrides across additional declarations.

```txt
"+2+4/+0+6/+1+3" : "geometry: box; box-radius: 0.15; color: 0x333333; metalness: 0.8; roughness: 0.2"
"Sofa/+7+4/+0+3/+0+2" : "color: brown; metalness: 0.2; roughness: 0.8"
"Sofa/Cushion/" : "material-preset: upholstery.fabric; color: 0xf5f3ef; texture: fabric.weave; texture-repeat: 6 6; puff: 5"
"Seat/+3+5/+0+3/+0+15" : "ref: Sofa/"

"Table/+18+8/+0+5/+4+8" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0+8/+4+1/+0+8" : ""
"Table/LegA/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegB/+7+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegC/+0+1/+0+5/+7+1" : "geometry: cylinder"
"Table/LegD/+7+1/+0+5/+7+1" : "geometry: cylinder"
```

## Interaction directives

Secondary projections can act as remote cursors. A baseline object can declare conditional variants with the Base64-compatible `+touch` and `+breach` directives. `touch` means faces meet within a small tolerance without overlapping, while `breach` means positive-volume intersection. Directive segments are removed from object identity, and their position selects the namespace scope that must be interacting.

```txt
"Rod/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Rod/+touch" : "rotation: 90,90,0"
"Rod/+breach/+9+1/+0+5/+0+1" : "color: red"
"Rod/+breach/+++" : ""
```

Conditional paths have three spatial forms:

| Form | Effect while active |
| --- | --- |
| `Rod/+touch` | Inherit the baseline box and override only declared properties. |
| `Rod/+touch/+4/+5/+9` | Translate by unsigned X/Y/Z magnitudes, away from the interacting cursor; an indeterminate direction defaults positive. |
| `Rod/+touch/+++` | Translate in the polar-opposite interaction direction by the cursor-to-target transaction-amount ratio converted to centiunit-scale project distance. |
| `Rod/+touch/+9+1/+0+5/+0+1` | Replace the complete absolute X/Y/Z box, including sizes. |

Direct `createSpatialDocument` calls recalculate relative translation from the resolved baseline. In the application transaction pipeline, relative and weighted translations for either interaction directive are instead applied to the retained physics pose once per new transaction/playback frame, so repeated interactions accumulate without depending on render frequency. In `Machine/+touch/Lever`, the target remains `Machine/Lever/`, while placement of the directive after `Machine` makes `Machine/` the interaction scope. Secondary cursor identity includes its projection stream, so independent controllers can reuse the same cursor namespace.

Weighted translation (`+++`) treats the cursor amount as force and the concrete baseline declaration amount as object weight. Each missing, zero, negative, or non-finite amount deterministically falls back to the atomic minimum transaction amount of `1_000_000`. The cursor-to-target amount ratio is divided by `CENTIUNITS_PER_UNIT` (`100`) to convert it to project distance, so equal valid weights move `0.01` project units (one millimetre). The converted distance is capped at 100 project units (10 metres). The target-oriented interaction normal is preferred; otherwise the direction away from the cursor is normalized before applying the distance. No surface-area, volume, or density factor is applied: shape-specific volume semantics and a mass unit for transaction weight are not yet defined.

See the [Secondary projection interaction specification](docs/secondary-interaction-spec.md) for the normative syntax and evaluation rules. The current release evaluates persistent `touch` and `breach` facts for the selected frame. Temporal transition playback and a persistent incremental spatial index are only partially implemented; see [Secondary interaction implementation status](docs/secondary-interaction-roadmap.md) for the exact supported behavior and remaining acceptance criteria.

## Spatial content cards

Spatial transaction memos can still contain ordinary declaration properties such as `geometry: sphere; color: blue`. If a memo is not valid property text, the transaction importer treats it as a placed spatial content card instead:

- Plain text becomes a paper/card mesh inscribed with the memo text.
- Plain `http` or `https` URLs become a 2D HTML card in the 3D scene.

Internally these content memos are normalized to explicit spatial declaration properties:

```txt
"+0+4/+0+2/+0+1" : "content-kind: text; content-text-uri: Hello%20world"
"+5+4/+0+3/+0+10c" : "content-kind: url; content-url-uri: https%3A%2F%2Fexample.com"
```

Manual spatial declarations can use `content-text`/`content-url` for simple values, or the URI-encoded `content-text-uri`/`content-url-uri` properties when values may contain semicolons, quotes, newlines, or other XYZDSL delimiters. URL content is limited to absolute `http` and `https` URLs and is embedded in a sandboxed iframe; some sites may block iframe embedding, in which case the card still shows an external "Open URL" link.

Primitive dimensions are derived from the bounding box and use the same project-unit scale as paths (`1` = `10 cm`, `1c` = `1 mm`). For example, a cone or cylinder uses X/Z as its footprint and Y as its height. Non-square footprints are rendered as scaled elliptical primitives so every primitive fills the declared bounding box. `box-radius` applies only to box geometry and is measured in project units; omitted or zero radius renders a sharp box, and the renderer clamps positive radii to half of the smallest box dimension. `puff` is intentionally a geometry modifier, not a material setting, because it changes the rendered cushion shape.

## Material and texture declaration reference

Materials now support semantic authoring first, with low-level texture channels still available as advanced overrides. Prefer author-facing material families such as `wood`, `metal`, `ceramic`, `plastic`, `fabric`, `concrete`, `stone`, `glass`, and `leather` instead of hand-selecting every texture map.

```txt
"OakTable/+0+8/+0+4/+0+8" : "material: wood; grain: oak; finish: satin; texture-scale: 3 1"
"SteelHandle/+0+4/+5+1/+0+1" : "material: metal; pattern: brushed; finish: semi-gloss; reflectivity: 0.8"
"SpeckledMug/+0+2/+0+3/+0+2" : "material: ceramic; pattern: speckled; finish: glazed"
"FabricCushion/+0+4/+0+1/+0+3" : "material: fabric; pattern: weave; color: 0xf5f3ef; bump: 3; puff: 5"
"PolishedCounter/+0+8/+0+1/+0+3" : "material: concrete; pattern: aggregate; finish: polished"
"MarbleTop/+0+8/+0+1/+0+3" : "material: stone; variant: marble; pattern: vein; finish: polished"
"GlassDoor/+0+4/+0+8/+0+1" : "material: glass; variant: frosted; pattern: reeded"
"LeatherSeat/+0+4/+0+1/+0+4" : "material: leather; variant: tan; pattern: pebbled; finish: satin"
```

### Semantic material properties

| Property | Purpose | Examples |
| --- | --- | --- |
| `material` | Material family | `wood`, `metal`, `ceramic`, `plastic`, `fabric`, `concrete`, `stone`, `glass`, `leather` |
| `grain` / `variant` | Family variant, mostly for wood color/grain choices | `oak`, `walnut`, `pine`, `maple`, `marble`, `clear`, `tan` |
| `pattern` | Procedural visual/texture pattern | `linear`, `grain`, `brushed`, `speckled`, `weave`, `aggregate`, `vein`, `reeded`, `pebbled` |
| `finish` | Surface response preset | `raw`, `matte`, `satin`, `semi-gloss`, `glossy`, `polished`, `mirror`, `glazed` |
| `texture-scale` | Repeat all active procedural/image channels | `3 1`, `6 6` |
| `bump` | Simple 0..5 bump strength override | `2`, `4` |
| `reflectivity` | Direct reflectivity override | `0.6` |
| `clearcoat` | Direct clearcoat override for physical materials | `0.4` |
| `opacity` | Transparency override, useful for glass | `0.3` |
| `transmission` | Physical glass-like light transmission | `0.75` |
| `ior` | Index of refraction for physical materials | `1.45` |

Semantic declarations compile to the same renderer-neutral material fields used by the old system: color, metalness, roughness, reflectivity, clearcoat, opacity, transmission, index of refraction, and texture descriptors. Explicit low-level properties such as `roughness`, `metalness`, `texture-src`, or `normal-texture-src` override semantic defaults.

### Compatibility material presets

The older `material-preset` property is still supported as a compatibility alias, but new scenes should prefer semantic materials.

| Old syntax | Preferred syntax |
| --- | --- |
| `material-preset: upholstery.fabric` | `material: fabric; pattern: weave; finish: matte` |
| `material-preset: wood.oak` | `material: wood; grain: oak; pattern: grain; finish: satin` |
| `material-preset: metal.brushed` | `material: metal; pattern: brushed; finish: semi-gloss` |
| `material-preset: plastic.matte` | `material: plastic; finish: matte` |

### Advanced texture sources

Every texture channel can still come from a built-in procedural preset or a custom image source. Generic `texture`/`texture-src` targets the color map channel. The value prefixes `preset:` and `src:` are optional shortcuts when you want to make the source kind explicit inline.

```txt
"PresetColor/+0+4/+0+1/+0+3" : "texture: wood.rings"
"ImageColor/+10+4/+0+1/+0+3" : "texture-src: /textures/albedo.png"
"ImageColorInline/+15+4/+0+1/+0+3" : "texture: src:/textures/albedo.png"
```

Built-in procedural texture presets include `fabric.weave`, `fabric.knit`, `fabric.corduroy`, `bump.noise`, `wood.rings`, `wood.linear`, `wood.oak`, `metal.brushed`, `metal.cast`, `ceramic.speckle`, `ceramic.clay`, `concrete.aggregate`, `concrete.smooth`, `stone.vein`, `stone.granite`, `stone.slate`, `glass.frosted`, `glass.reeded`, `leather.grain`, `leather.pebbled`, and `leather.smooth`.

### Texture channels

Supported texture channels map directly to ThreeJS material map slots:

| Channel | Preset key | Image key | Repeat aliases | Offset aliases | Rotation aliases | Strength aliases |
| --- | --- | --- | --- | --- | --- | --- |
| Color map (`map`) | `texture`, `map`, `color-texture` | `texture-src`, `map-src`, `color-texture-src` | `texture-repeat`, `map-repeat`, `color-texture-repeat` | `texture-offset`, `map-offset` | `texture-rotation`, `map-rotation` | `texture-strength`, `map-strength` |
| Roughness map | `roughness-texture` | `roughness-texture-src` | `roughness-repeat`, `roughness-texture-repeat` | `texture-offset`, `roughness-texture-offset` | `texture-rotation`, `roughness-texture-rotation` | `texture-strength`, `roughness-texture-strength` |
| Normal map | `normal-texture` | `normal-texture-src` | `normal-repeat`, `normal-texture-repeat` | `texture-offset`, `normal-texture-offset` | `texture-rotation`, `normal-texture-rotation` | `texture-strength`, `normal-texture-strength` |
| Bump map | `bump-texture` | `bump-texture-src` | `bump-repeat`, `bump-texture-repeat` | `texture-offset`, `bump-texture-offset` | `texture-rotation`, `bump-texture-rotation` | `texture-strength`, `bump-texture-strength` |
| Metalness map | `metalness-texture` | `metalness-texture-src` | `metalness-repeat`, `metalness-texture-repeat` | `texture-offset`, `metalness-texture-offset` | `texture-rotation`, `metalness-texture-rotation` | `texture-strength`, `metalness-texture-strength` |
| Alpha map | `alpha-texture` | `alpha-texture-src` | `alpha-repeat`, `alpha-texture-repeat` | `texture-offset`, `alpha-texture-offset` | `texture-rotation`, `alpha-texture-rotation` | `texture-strength`, `alpha-texture-strength` |

```txt
"AllTextureChannels/+0+6/+0+2/+0+3" : "texture: wood.rings; roughness-texture: fabric.weave; normal-texture-src: /textures/panel-normal.png; bump-texture: bump.noise; metalness-texture: metal.brushed; alpha-texture-src: /textures/panel-alpha.png"
```

### Texture transforms and strength

Texture transforms are optional and can be generic or channel-specific. `texture-repeat`, `texture-scale`, `texture-offset`, and `texture-rotation` apply to all currently declared texture channels, or create a color map transform when no texture channel exists yet. Strength is a `0..5` authoring scale used by procedural presets; image textures can carry it in the descriptor, but the current renderer only uses strength for procedural generation and bump scale.

```txt
"RepeatedWood/+0+6/+0+1/+0+3" : "material: wood; grain: oak; texture-scale: 4 1"
"ChannelTransforms/+0+6/+2+1/+0+3" : "roughness-texture: fabric.weave; roughness-texture-repeat: 8 8; bump-texture: bump.noise; bump-texture-strength: 4; bump-texture-offset: 0.1 0.2; metalness-texture: metal.brushed; metalness-texture-rotation: 1.5708"
```

### Custom object templates with texture inheritance

Texture descriptors inherit through namespace declarations and `ref`. Referencing instances can override individual descriptor fields, such as changing an inherited preset color map to a custom image while keeping the inherited bump map.

```txt
"WoodTable/" : "material-preset: wood.oak; texture-repeat: 3 1"
"WoodTable/Top/+0+8/+4+1/+0+8" : ""
"WoodTable/Leg/" : "geometry: cylinder; texture-repeat: 1 3"
"WoodTable/Leg/+0+1/+0+4/+0+1" : ""
"WoodTable/Leg/+7+1/+0+4/+7+1" : ""
"CopiedTable/+10+8/+0+5/+0+8" : "ref: WoodTable/"
"CustomPoster/+0+4/+2+3/+0+10c" : "texture-src: /textures/poster.png; texture-repeat: 1 1"
```

See [docs/implementation-plan.md](docs/implementation-plan.md) for architecture details and the feature roadmap.
