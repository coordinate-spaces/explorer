import type {
  XyzDslBoxSpec,
  XyzDslContentSpec,
  XyzDslGeometrySpec,
  XyzDslMaterialSpec,
  XyzDslTransformSpec,
  ParseDiagnostic,
  SpatialObject,
} from './types';
import { canonicalNamespacePath } from './pathParser';

export interface ResolvedSpatialObject extends SpatialObject {
  box: XyzDslBoxSpec;
  material: XyzDslMaterialSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  content: XyzDslContentSpec;
  namespacePath: string;
  parentNamespacePath: string;
  renderable: boolean;
  materializedFrom?: string;
  anchorScale?: [number, number, number];
}

interface ResolvedProperties {
  material: XyzDslMaterialSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  content: XyzDslContentSpec;
}

const DEFAULT_PROPERTIES: ResolvedProperties = {
  material: { diagnostics: [] },
  geometry: { kind: 'box', diagnostics: [] },
  transform: { rotation: [0, 0, 0], diagnostics: [] },
  content: { diagnostics: [] },
};

function mergeGeometry(
  base: XyzDslGeometrySpec,
  override: XyzDslGeometrySpec,
): XyzDslGeometrySpec {
  if (!override.declared) {
    return { ...base, diagnostics: [] };
  }

  const kind = override.kindDeclared ? override.kind : base.kind;

  return {
    diagnostics: [],
    declared: true,
    ...(override.kindDeclared
      ? { kindDeclared: true }
      : { kindDeclared: base.kindDeclared }),
    kind,
    ...(kind === 'box'
      ? {
          'box-radius': override['box-radius'] ?? base['box-radius'],
          puff: override.puff ?? base.puff,
        }
      : {}),
    operation: override.operation ?? base.operation,
  };
}

function mergeContent(base: XyzDslContentSpec, override: XyzDslContentSpec): XyzDslContentSpec {
  if (!override.kind) {
    return { ...base, diagnostics: [] };
  }

  return { ...override, diagnostics: [] };
}

function anonymousCompoundRefNamespace(
  objectIndex: number,
  occupiedNamespaces: Set<string>,
): string[] {
  let suffix = objectIndex + 1;

  while (
    [...occupiedNamespaces].some((namespacePath) =>
      namespacePath.startsWith(canonicalNamespacePath([`Ref${suffix}`])),
    )
  ) {
    suffix += 1;
  }

  const namespace = [`Ref${suffix}`];
  occupiedNamespaces.add(canonicalNamespacePath(namespace));

  return namespace;
}

function mergeProperties(
  base: ResolvedProperties,
  override: SpatialObject | ResolvedProperties,
  options: { includeTransform?: boolean } = {},
): ResolvedProperties {
  const overrideMaterial = override.material;
  const overrideGeometry = override.geometry;
  const overrideTransform = override.transform;
  const includeTransform = options.includeTransform ?? true;

  return {
    material: {
      diagnostics: [],
      color: overrideMaterial.color ?? base.material.color,
      metalness: overrideMaterial.metalness ?? base.material.metalness,
      roughness: overrideMaterial.roughness ?? base.material.roughness,
    },
    geometry: mergeGeometry(base.geometry, overrideGeometry),
    content: mergeContent(base.content, override.content),
    transform:
      includeTransform && overrideTransform.declared
        ? { ...overrideTransform, diagnostics: [] }
        : { ...base.transform, diagnostics: [] },
  };
}

function namespacePrefixes(namespace: string[]): string[] {
  return namespace.map((_, index) =>
    canonicalNamespacePath(namespace.slice(0, index + 1)),
  );
}

function latestNamedEntries(objects: SpatialObject[]): SpatialObject[] {
  const latestByNamespaceAndKind = new Map<string, SpatialObject>();

  objects.forEach((object) => {
    if (object.namespace.length > 0) {
      latestByNamespaceAndKind.set(
        `${object.declarationOnly ? 'declaration' : 'instance'}:${canonicalNamespacePath(object.namespace)}`,
        object,
      );
    }
  });

  return objects.filter(
    (object) =>
      object.namespace.length === 0 ||
      latestByNamespaceAndKind.get(
        `${object.declarationOnly ? 'declaration' : 'instance'}:${canonicalNamespacePath(object.namespace)}`,
      ) === object,
  );
}

function latestEntryBefore(
  objects: SpatialObject[],
  namespacePath: string,
  lineNumber: number,
  predicate: (candidate: SpatialObject) => boolean = () => true,
): SpatialObject | undefined {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const candidate = objects[index];
    if (
      candidate.lineNumber < lineNumber &&
      candidate.namespace.length > 0 &&
      canonicalNamespacePath(candidate.namespace) === namespacePath &&
      predicate(candidate)
    ) {
      return candidate;
    }
  }

  return undefined;
}

function resolvePropertiesFor(
  object: SpatialObject,
  sourceObjects: SpatialObject[],
  visitedRefTargets: SpatialObject[] = [],
): { properties: ResolvedProperties; diagnostics: ParseDiagnostic[] } {
  let properties = { ...DEFAULT_PROPERTIES };
  const diagnostics: ParseDiagnostic[] = [];

  const fullNamespacePath = canonicalNamespacePath(object.namespace);

  namespacePrefixes(object.namespace).forEach((prefix) => {
    const declaration =
      prefix === fullNamespacePath && object.declarationOnly
        ? undefined
        : latestEntryBefore(
            sourceObjects,
            prefix,
            object.lineNumber,
            (candidate) => candidate.declarationOnly,
          );
    if (declaration) {
      properties = mergeProperties(properties, declaration);
    }

    if (prefix !== fullNamespacePath) {
      const ancestor = latestEntryBefore(
        sourceObjects,
        prefix,
        object.lineNumber + 1,
        (candidate) => !candidate.declarationOnly,
      );
      if (ancestor && ancestor !== object) {
        properties = mergeProperties(properties, ancestor, {
          includeTransform: false,
        });
      }
    }
  });

  if (object.reference.targetPath) {
    const targetPath = object.reference.targetPath;

    const target = latestEntryBefore(
      sourceObjects,
      targetPath,
      object.lineNumber,
    );

    if (!target) {
      diagnostics.push({
        line: object.lineNumber,
        source: object.source,
        message: `Reference target "${targetPath}" was not found.`,
      });
    } else if (visitedRefTargets.includes(target)) {
      diagnostics.push({
        line: object.lineNumber,
        source: object.source,
        message: `Cyclic ref detected: ${[
          ...visitedRefTargets.map((entry) =>
            canonicalNamespacePath(entry.namespace),
          ),
          targetPath,
        ].join(' -> ')}`,
      });
    } else {
      const resolvedTarget = resolvePropertiesFor(
        target,
        sourceObjects,
        [...visitedRefTargets, target],
      );
      diagnostics.push(...resolvedTarget.diagnostics);
      properties = mergeProperties(properties, resolvedTarget.properties);
    }
  }

  properties = mergeProperties(properties, object);

  return { properties, diagnostics };
}

function namespaceStartsWith(namespace: string[], prefix: string[]): boolean {
  return prefix.every((segment, index) => namespace[index] === segment);
}

function hasConcreteAncestorInstance(
  object: SpatialObject,
  concreteNamespaces: Set<string>,
): boolean {
  if (object.namespace.length <= 1) {
    return true;
  }

  for (let length = object.namespace.length - 1; length > 0; length -= 1) {
    if (
      concreteNamespaces.has(
        canonicalNamespacePath(object.namespace.slice(0, length)),
      )
    ) {
      return true;
    }
  }

  return false;
}

function concreteNamespaceSet(objects: SpatialObject[]): Set<string> {
  const concreteNamespaces = new Set<string>();

  objects
    .filter(
      (object) =>
        !object.declarationOnly && object.box && object.namespace.length <= 1,
    )
    .forEach((object) =>
      concreteNamespaces.add(canonicalNamespacePath(object.namespace)),
    );

  let changed = true;
  while (changed) {
    changed = false;

    objects.forEach((object) => {
      if (
        object.declarationOnly ||
        !object.box ||
        object.namespace.length === 0
      ) {
        return;
      }

      const key = canonicalNamespacePath(object.namespace);
      if (
        !concreteNamespaces.has(key) &&
        hasConcreteAncestorInstance(object, concreteNamespaces)
      ) {
        concreteNamespaces.add(key);
        changed = true;
      }
    });
  }

  return concreteNamespaces;
}

function hasMaterializedChildInstance(
  object: ResolvedSpatialObject,
  instances: ResolvedSpatialObject[],
): boolean {
  if (object.namespace.length === 0) {
    return false;
  }

  return instances.some(
    (candidate) =>
      candidate !== object &&
      candidate.namespace.length > object.namespace.length &&
      object.namespace.every(
        (segment, index) => candidate.namespace[index] === segment,
      ),
  );
}

function mergeResolvedProperties(
  base: ResolvedProperties,
  override: ResolvedProperties,
): ResolvedProperties {
  return mergeProperties(base, override);
}

function dimensionsFromBox(box: XyzDslBoxSpec): [number, number, number] {
  return [box.width, box.height, box.depth];
}

function dimensionsFromRootChildren(
  descendants: SpatialObject[],
  targetNamespace: string[],
): [number, number, number] | undefined {
  const rootChildren = descendants.filter(
    (descendant) => descendant.namespace.length === targetNamespace.length + 1,
  );
  const boxes = (rootChildren.length > 0 ? rootChildren : descendants)
    .map((descendant) => descendant.box)
    .filter(Boolean) as XyzDslBoxSpec[];

  if (boxes.length === 0) {
    return undefined;
  }

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const minZ = Math.min(...boxes.map((box) => box.z));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  const maxZ = Math.max(...boxes.map((box) => box.z + box.depth));

  return [maxX - minX, maxY - minY, maxZ - minZ];
}

function scaleToFit(
  sourceDimensions: [number, number, number] | undefined,
  targetBox: XyzDslBoxSpec,
): [number, number, number] | undefined {
  if (
    !sourceDimensions ||
    sourceDimensions.some((dimension) => dimension <= 0)
  ) {
    return undefined;
  }

  return [
    targetBox.width / sourceDimensions[0],
    targetBox.height / sourceDimensions[1],
    targetBox.depth / sourceDimensions[2],
  ];
}

export function resolveXyzDslDocument(objects: SpatialObject[]): {
  objects: ResolvedSpatialObject[];
  diagnostics: ParseDiagnostic[];
} {
  const diagnostics: ParseDiagnostic[] = [];
  const effectiveObjects = latestNamedEntries(objects);
  const instances = effectiveObjects.filter(
    (object) => !object.declarationOnly && object.box,
  );
  const concreteNamespaces = concreteNamespaceSet(effectiveObjects);

  const resolveObject = (
    object: SpatialObject,
    index: number,
    options: {
      materializedFrom?: string;
      namespace?: string[];
      idPrefix?: string;
    } = {},
  ): ResolvedSpatialObject => {
    const { properties, diagnostics: propertyDiagnostics } =
      resolvePropertiesFor(object, objects);
    diagnostics.push(...propertyDiagnostics);

    const namespace = options.namespace ?? object.namespace;
    const namespacePath = canonicalNamespacePath(namespace);
    const parentNamespacePath = canonicalNamespacePath(namespace.slice(0, -1));
    const duplicateSuffix = namespace.length > 0 ? `#${index + 1}` : '';
    const idPath =
      namespace.length > 0
        ? `${namespacePath}${object.box!.source}${duplicateSuffix}`
        : object.id;

    return {
      ...object,
      namespace,
      id: options.idPrefix ? `${options.idPrefix}${idPath}` : idPath,
      box: object.box!,
      namespacePath,
      parentNamespacePath,
      renderable: false,
      material: properties.material,
      geometry: properties.geometry,
      transform: properties.transform,
      content: properties.content,
      materializedFrom: options.materializedFrom,
    };
  };

  const resolvedObjects = instances.map((object, index) =>
    resolveObject(object, index),
  );
  const originalByObject = new Map<SpatialObject, ResolvedSpatialObject>();
  instances.forEach((object, index) =>
    originalByObject.set(object, resolvedObjects[index]),
  );
  const materializedObjects: ResolvedSpatialObject[] = [];
  const anchorScaleById = new Map<string, [number, number, number]>();
  const occupiedNamespaces = new Set(
    objects
      .map((object) => canonicalNamespacePath(object.namespace))
      .filter(Boolean),
  );

  resolvedObjects.forEach((object, objectIndex) => {
    if (
      !object.reference.targetPath ||
      !hasConcreteAncestorInstance(object, concreteNamespaces)
    ) {
      return;
    }

    const targetNamespace = object.reference.targetPath
      .split('/')
      .filter(Boolean);
    const historicalEntries = latestNamedEntries(
      objects.filter((candidate) => candidate.lineNumber < object.lineNumber),
    );
    const descendants = historicalEntries.filter(
      (candidate) =>
        !candidate.declarationOnly &&
        candidate.box &&
        candidate !== object &&
        candidate.namespace.length > targetNamespace.length &&
        namespaceStartsWith(candidate.namespace, targetNamespace),
    );
    const isCompoundReference = descendants.length > 0;
    const instanceNamespace =
      isCompoundReference && object.namespace.length === 0
        ? anonymousCompoundRefNamespace(objectIndex, occupiedNamespaces)
        : object.namespace;

    if (isCompoundReference && object.namespace.length === 0) {
      object.namespace = instanceNamespace;
      object.namespacePath = canonicalNamespacePath(instanceNamespace);
      object.parentNamespacePath = canonicalNamespacePath(
        instanceNamespace.slice(0, -1),
      );
    }

    const target = latestEntryBefore(
      objects,
      object.reference.targetPath,
      object.lineNumber,
    );
    const anchorScale = object.reference.scale
      ? scaleToFit(
          target?.box
            ? dimensionsFromBox(target.box)
            : dimensionsFromRootChildren(descendants, targetNamespace),
          object.box,
        )
      : undefined;

    if (anchorScale) {
      anchorScaleById.set(object.id, anchorScale);
    }

    descendants.forEach((descendant, descendantIndex) => {
      const resolvedDescendant =
        originalByObject.get(descendant) ??
        resolveObject(descendant, descendantIndex);
      const suffix = descendant.namespace.slice(targetNamespace.length);
      const namespace = [...instanceNamespace, ...suffix];
      const properties = mergeResolvedProperties(
        {
          material: object.material,
          geometry: object.geometry,
          transform: object.transform,
          content: object.content,
        },
        {
          material: resolvedDescendant.material,
          geometry: resolvedDescendant.geometry,
          transform: resolvedDescendant.transform,
          content: resolvedDescendant.content,
        },
      );

      materializedObjects.push({
        ...resolvedDescendant,
        id: `${object.id}->${resolvedDescendant.namespacePath}${resolvedDescendant.box.source}#${objectIndex + 1}-${descendantIndex + 1}`,
        namespace,
        namespacePath: canonicalNamespacePath(namespace),
        parentNamespacePath: canonicalNamespacePath(namespace.slice(0, -1)),
        material: properties.material,
        geometry: properties.geometry,
        transform: properties.transform,
        content: properties.content,
        reference: { diagnostics: [] },
        materializedFrom: object.reference.targetPath,
        renderable: false,
      });
    });
  });

  const allObjects = [...resolvedObjects, ...materializedObjects];
  const materializedConcreteNamespaces = new Set(concreteNamespaces);
  materializedObjects.forEach((object) =>
    materializedConcreteNamespaces.add(object.namespacePath),
  );

  const renderEligibleObjects = allObjects.filter(
    (object) =>
      object.materializedFrom ||
      hasConcreteAncestorInstance(object, materializedConcreteNamespaces),
  );
  const referencedTargetNamespaces = new Set(
    effectiveObjects
      .map((object) => object.reference.targetPath)
      .filter(Boolean) as string[],
  );

  allObjects.forEach((object) => {
    const belongsToReferencedTemplate = [...referencedTargetNamespaces].some(
      (targetPath) => object.namespacePath.startsWith(targetPath),
    );

    if (
      object.namespace.length > 1 &&
      !belongsToReferencedTemplate &&
      !renderEligibleObjects.includes(object) &&
      !hasConcreteAncestorInstance(object, materializedConcreteNamespaces)
    ) {
      diagnostics.push({
        line: object.lineNumber,
        source: object.source,
        message: `Nested declaration "${object.namespacePath}${object.box.source}" has no concrete ancestor namespace anchor and will not render. Declare "${canonicalNamespacePath(object.namespace.slice(0, 1))}" as a concrete instance to materialize its local children.`,
      });
    }
  });

  return {
    objects: allObjects.map((object) => ({
      ...object,
      anchorScale: anchorScaleById.get(object.id) ?? object.anchorScale,
      renderable:
        renderEligibleObjects.includes(object) &&
        !hasMaterializedChildInstance(object, renderEligibleObjects),
    })),
    diagnostics,
  };
}
