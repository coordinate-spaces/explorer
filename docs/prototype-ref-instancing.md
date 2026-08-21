# Future implementation: prototype `ref` instancing for namespaced groups

## Purpose

The current namespaced Spatial Declaration Language implementation supports namespace declarations, named spatial instances, property inheritance, and `ref` as a property-default lookup. A line such as:

```txt
"Table/+3+8/+0+5/+4+8" : "rotation: 0,2,0; color: white; metalness: 0.8; roughness: 0.2"
"+15+10/+7+10/+2+10" : "ref: Table/"
```

currently creates a second independent primitive at the anonymous world-space box that inherits `Table/` material/geometry/transform defaults. It does **not** clone all `Table/...` descendants.

This document records the desired future behavior and an implementation plan so the feature can be picked up later without changing runtime behavior now.

## Desired future behavior

A `ref` to a compound namespaced prototype should instantiate the full prototype subtree:

```txt
"Table/+3+8/+0+5/+4+8" : "rotation: 0,2,0; color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0+8/+4+1/+0+8" : ""
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+0+1/+0+5/+0+1" : ""
"Table/Leg/+7+1/+0+5/+0+1" : ""
"Table/Leg/+0+1/+0+5/+7+1" : ""
"Table/Leg/+7+1/+0+5/+7+1" : ""

"+15+10/+7+10/+2+10" : "ref: Table/"
```

The final line should mean:

> Create a second full grouped `Table` instance, including all `Table/...` descendants, scaled to fit the referencing bounding box `+15+10/+7+10/+2+10`.

The implementation should preserve simple single-object references. If `ref` targets a namespace with no concrete descendants, it can keep the current behavior: create one primitive using the referencing box and inherit the target's resolved defaults.

## Current implementation constraints

- `ref` currently resolves properties only; it does not materialize additional parsed or resolved objects.
- The model builds a hierarchy but the renderer consumes flattened `renderNodes`.
- Namespaces are not currently rendered as runtime Three.js `<group>` nodes.
- Parent transforms are composed into descendant world transforms in the model layer.
- Container nodes use an anchor transform rather than primitive center/scale semantics.

These constraints make a model-layer subtree expansion the lowest-risk first implementation.

## Recommended implementation strategy

Implement prototype instancing in the spatial declaration resolver first, while leaving the renderer unchanged.

The resolver should:

1. Build a prototype registry from concrete named root instances.
2. Detect `ref` targets that point to compound prototypes.
3. Expand a compound `ref` into synthetic cloned root + descendant objects.
4. Scale cloned descendant boxes from the prototype root box into the referencing box.
5. Assign synthetic namespaces/ids to cloned objects so they form an independent tree.
6. Resolve inherited color, metalness, roughness, geometry, and transform properties over the expanded object list.
7. Continue producing flattened `renderNodes` for the current renderer.

## Prototype registry

Add a prototype abstraction in `src/xyzdsl/resolveDocument.ts`:

```ts
interface XyzDslPrototype {
  path: string;
  root: SpatialObject;
  descendants: SpatialObject[];
}
```

A prototype root is the first concrete instance for a namespace path, for example `Table/`. Descendants are concrete instances whose namespace starts with that root namespace and is longer than the root namespace.

Pseudo-code:

```ts
function isDescendantOf(candidate: SpatialObject, root: SpatialObject): boolean {
  return (
    candidate.namespace.length > root.namespace.length &&
    root.namespace.every((segment, index) => candidate.namespace[index] === segment)
  );
}

function buildPrototypeRegistry(instances: SpatialObject[]): Map<string, XyzDslPrototype> {
  const registry = new Map<string, XyzDslPrototype>();

  instances.forEach((root) => {
    if (root.namespace.length === 0) {
      return;
    }

    const path = canonicalNamespacePath(root.namespace);

    if (registry.has(path)) {
      return;
    }

    registry.set(path, {
      path,
      root,
      descendants: instances.filter((candidate) => isDescendantOf(candidate, root)),
    });
  });

  return registry;
}
```

## Scaling cloned boxes into the referencing box

For a compound prototype, the referencing box becomes the new root bounding box. Descendant boxes should be scaled from prototype-root coordinates into reference-root coordinates.

Given:

```txt
prototype root box: x=3,  y=0, z=4, width=8,  height=5,  depth=8
reference box:      x=15, y=7, z=2, width=10, height=10, depth=10
```

The scale ratios are:

```txt
scaleX = 10 / 8 = 1.25
scaleY = 10 / 5 = 2
scaleZ = 10 / 8 = 1.25
```

A descendant box can be mapped with:

```ts
function scaleBoxFromPrototypeRoot(
  sourceBox: XyzDslBoxSpec,
  prototypeRootBox: XyzDslBoxSpec,
  targetRootBox: XyzDslBoxSpec,
): XyzDslBoxSpec {
  const scaleX = targetRootBox.width / prototypeRootBox.width;
  const scaleY = targetRootBox.height / prototypeRootBox.height;
  const scaleZ = targetRootBox.depth / prototypeRootBox.depth;

  return {
    source: sourceBox.source,
    x: targetRootBox.x + (sourceBox.x - prototypeRootBox.x) * scaleX,
    y: targetRootBox.y + (sourceBox.y - prototypeRootBox.y) * scaleY,
    z: targetRootBox.z + (sourceBox.z - prototypeRootBox.z) * scaleZ,
    width: sourceBox.width * scaleX,
    height: sourceBox.height * scaleY,
    depth: sourceBox.depth * scaleZ,
  };
}
```

This strategy intentionally materializes scaled boxes so the existing flattened render pipeline can continue to work.

## Cloning a prototype subtree

A compound `ref` expansion should produce:

- one cloned root using the reference line's box;
- one cloned object for each concrete prototype descendant;
- synthetic namespaces so the clone does not collide with the original prototype namespace.

Pseudo-code:

```ts
function clonePrototypeForRef(refObject: SpatialObject, prototype: XyzDslPrototype): SpatialObject[] {
  const syntheticRootNamespace = [`ref-${refObject.lineNumber}`, ...prototype.root.namespace];

  const cloneOne = (source: SpatialObject, isRoot: boolean): SpatialObject => {
    const descendantTail = source.namespace.slice(prototype.root.namespace.length);
    const namespace = isRoot ? syntheticRootNamespace : [...syntheticRootNamespace, ...descendantTail];

    return {
      ...source,
      id: `${refObject.id}:${source.id}`,
      source: refObject.source,
      namespace,
      box: isRoot
        ? refObject.box
        : scaleBoxFromPrototypeRoot(source.box!, prototype.root.box!, refObject.box!),
      reference: { diagnostics: [] },
      lineNumber: refObject.lineNumber,
    };
  };

  return [cloneOne(prototype.root, true), ...prototype.descendants.map((descendant) => cloneOne(descendant, false))];
}
```

## Property precedence

The desired precedence for cloned compound refs is:

1. global/default properties;
2. prototype root and ancestor namespace declarations;
3. descendant namespace declarations;
4. prototype descendant local declarations;
5. local overrides on the `ref` line, where appropriate.

For example:

```txt
"+15+10/+7+10/+2+10" : "ref: Table/; color: red"
```

should create a cloned table whose root override is red, with descendants inheriting red unless they declare their own color.

Implementation detail: cloned objects should clear their `reference` field after expansion so the same `ref` is not resolved twice.

## Rotation behavior

For:

```txt
"+15+10/+7+10/+2+10" : "ref: Table/"
```

the cloned root should inherit the `Table/` root rotation. Descendants should rotate as part of the cloned group transform.

For:

```txt
"+15+10/+7+10/+2+10" : "ref: Table/; rotation: 0,45,0"
```

the local `rotation` declaration on the `ref` line should override the prototype root rotation for the cloned root.

## Renderer approach

The first implementation should keep the renderer unchanged:

```txt
expanded prototype refs -> resolved spatial objects -> hierarchical nodes -> flattened renderNodes -> meshes
```

A future renderer may map namespaces to actual React Three Fiber `<group>` nodes, but that should be a separate project because it requires avoiding double-applied world transforms and likely distinguishing primitive scale from group scale.

## Suggested test coverage

Add tests in `src/model/createSpatialDocument.test.ts` for:

1. A compound `ref` clones all concrete descendants.
2. Cloned descendant boxes are scaled into the reference box.
3. Local overrides on the `ref` line cascade to cloned descendants unless overridden.
4. Simple single-object `ref` behavior remains unchanged.
5. Rotated prototype roots rotate cloned descendants as a group.
6. Synthetic cloned namespaces do not collide with the original prototype namespace.

## Open questions

- Should descendant coordinates be normalized relative to the prototype root box, or relative to the root anchor coordinate system?
- Should children outside the prototype root box be allowed and scaled proportionally, even if that places them outside the target reference box?
- Should a compound `ref` render the cloned root itself if the prototype root has children, or should the root remain a non-renderable container?
- Should local overrides on a compound `ref` apply only to the cloned root, or cascade to all cloned descendants through normal inheritance?
- Should actual Three.js groups be introduced after resolver-level instancing is working?
