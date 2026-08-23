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
"SeatA/+0d+4d/+0d+2d/+0d+3d" : "ref: Sofa/"
"Sofa/" : "color: blue"
"SeatB/+5d+4d/+0d+2d/+0d+3d" : "ref: Sofa/"
```

Here `SeatA/` uses brown and `SeatB/` uses blue.

Path coordinates use metres: a bare integer is metres, while `d`, `c`, and `m` suffixes denote decimetres, centimetres, and millimetres. Suffixes apply independently to each number, so `+1d+3m` means a 1 dm offset and a 3 mm size. Decimal path notation is avoided; use an exact metric suffix instead.

Boolean composition operations (`operation: union`, `operation: subtraction`, and `operation: intersection`) follow declaration order and are implemented with CSG internally. A later overlapping operator first targets earlier solids in the same namespace/local scope; if no local scoped target overlaps, it falls back to the earlier overlapping world-space solid. This lets compound objects be authored as local groups, but the group must still have a concrete namespace anchor to materialize its children:

```txt
"Mug/+0d+1d/+0d+1d/+0d+1d" : "color: 0xf5f3ef"
"Mug/Body/+5d+2d/+1d+2d/+1d+2d" : "geometry: cylinder; roughness: 0.65"
"Mug/Hollow/+530m+140m/+120m+190m/+130m+140m" : "geometry: cylinder; operation: subtraction"
"Mug/Handle/+680m+110m/+155m+110m/+135m+130m" : "box-radius: 0.018; operation: union"
"Mug/HandleHole/+700m+70m/+175m+70m/+155m+90m" : "box-radius: 0.012; operation: subtraction"
```

Spatial transaction validation may limit each memo/properties field to 100 bytes, but that is a transport constraint rather than a renderer limit. A spatial transaction is a remote transaction whose path and memo/properties payload map into one spatial declaration. Once declarations are loaded, the renderer consumes the resolved spatial document and does not impose a practical size limit on the inherited property set. Authors targeting the remote format can fit richer scenes into the 100-byte fields by putting shared material, geometry, and deformation properties on namespace declarations, then letting child instances inherit those defaults or add compact overrides across additional declarations.

```txt
"+2d+4d/+0d+6d/+1d+3d" : "geometry: box; box-radius: 0.015; color: 0x333333; metalness: 0.8; roughness: 0.2"
"Sofa/+7d+4d/+0d+3d/+0d+2d" : "color: brown; metalness: 0.2; roughness: 0.8"
"Sofa/Cushion/" : "color: 0xf5f3ef; metalness: 0; roughness: 0.88; puff: 5"
"Seat/+3d+5d/+0d+3d/+0d+15d" : "ref: Sofa/"

"Table/+18d+8d/+0d+5d/+4d+8d" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/LegA/+0d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegB/+7d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegC/+0d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"Table/LegD/+7d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
```

## Spatial content cards

Spatial transaction memos can still contain ordinary declaration properties such as `geometry: sphere; color: blue`. If a memo is not valid property text, the transaction importer treats it as a placed spatial content card instead:

- Plain text becomes a paper/card mesh inscribed with the memo text.
- Plain `http` or `https` URLs become a 2D HTML card in the 3D scene.

Internally these content memos are normalized to explicit spatial declaration properties:

```txt
"+0d+4d/+0d+2d/+0d+1d" : "content-kind: text; content-text-uri: Hello%20world"
"+5d+4d/+0d+3d/+0d+10m" : "content-kind: url; content-url-uri: https%3A%2F%2Fexample.com"
```

Manual spatial declarations can use `content-text`/`content-url` for simple values, or the URI-encoded `content-text-uri`/`content-url-uri` properties when values may contain semicolons, quotes, newlines, or other XYZDSL delimiters. URL content is limited to absolute `http` and `https` URLs and is embedded in a sandboxed iframe; some sites may block iframe embedding, in which case the card still shows an external "Open URL" link.

Primitive dimensions are derived from the bounding box and use the same project-unit scale as paths (`1` = `1 m`, `1d` = `1 dm`, `1c` = `1 cm`, `1m` = `1 mm`). For example, a cone or cylinder uses X/Z as its footprint and Y as its height. Non-square footprints are rendered as scaled elliptical primitives so every primitive fills the declared bounding box. `box-radius` applies only to box geometry and is measured in project units; omitted or zero radius renders a sharp box, and the renderer clamps positive radii to half of the smallest box dimension. `puff` is intentionally a geometry modifier, not a material setting, because it changes the rendered cushion shape.

## Material declaration reference

Spatial primitives intentionally expose only the basic scalar properties needed by the standard metallic/roughness shading model. Material presets, semantic material families, textures, transparency, and extended physical-material properties are not supported.

| Property | Purpose | Range / examples |
| --- | --- | --- |
| `color` | Base surface color | `blue`, `white`, `0x3366ff` |
| `metalness` | Nonmetal-to-metal surface response | `0..1` |
| `roughness` | Smooth-to-rough surface response | `0..1` |

`metalness` and `roughness` reject nonnumeric values and values outside `0..1`. The default primitive material is a neutral nonmetal with `color: #64748b`, `metalness: 0`, and `roughness: 0.7`. These properties inherit through namespace declarations and `ref` like other object defaults.

```txt
"Table/" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/Leg/+0d+1d/+0d+5d/+0d+1d" : "geometry: cylinder; roughness: 0.35"
"CopiedTable/+10d+8d/+0d+5d/+0d+8d" : "ref: Table/"
```

See [docs/implementation-plan.md](docs/implementation-plan.md) for architecture details and the feature roadmap.
