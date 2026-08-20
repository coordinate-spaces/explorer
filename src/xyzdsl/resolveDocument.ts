import type {
  XyzDslBoxSpec,
  XyzDslContentSpec,
  XyzDslGeometrySpec,
  XyzDslMaterialSpec,
  XyzDslPhysicsSpec,
  XyzDslTextureChannel,
  XyzDslTextureSpec,
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
  collisionOrder?: number;
  anchorScale?: [number, number, number];
  runtimeIntentId?: string;
  /** Original baseline namespace retained when a controller segment is injected. */
  runtimeAuthoredNamespacePath?: string;
  runtimeControllerSegment?: string;
}

export interface ResolvedConditionalVariant extends Omit<SpatialObject, 'box'> {
  conditional: NonNullable<SpatialObject['conditional']>;
  properties: ResolvedProperties;
  targetNamespacePath: string;
}

export interface ResolvedIntent {
  id: string;
  mode: 'absolute' | 'relative';
  coordinate: [number, number, number];
  definitionNamespacePath: string;
  streamId: string;
  lineNumber: number;
  origin: NonNullable<SpatialObject['origin']>;
  definition: ResolvedProperties;
}

interface ResolvedProperties {
  material: XyzDslMaterialSpec;
  physics: XyzDslPhysicsSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  content: XyzDslContentSpec;
}


function cloneTextureSpec(texture: XyzDslTextureSpec): XyzDslTextureSpec {
  return {
    ...texture,
    ...(texture.repeat ? { repeat: [...texture.repeat] as [number, number] } : {}),
    ...(texture.offset ? { offset: [...texture.offset] as [number, number] } : {}),
  };
}

function mergeTextures(
  base: XyzDslMaterialSpec['textures'],
  override: XyzDslMaterialSpec['textures'],
): XyzDslMaterialSpec['textures'] {
  const merged: XyzDslMaterialSpec['textures'] = {};

  (Object.keys(base ?? {}) as XyzDslTextureChannel[]).forEach((channel) => {
    const texture = base?.[channel];

    if (texture) {
      merged[channel] = cloneTextureSpec(texture);
    }
  });

  (Object.keys(override ?? {}) as XyzDslTextureChannel[]).forEach((channel) => {
    const baseTexture = merged[channel];
    const overrideTexture = override?.[channel];

    if (overrideTexture) {
      merged[channel] = {
        ...(baseTexture ? cloneTextureSpec(baseTexture) : {}),
        ...cloneTextureSpec(overrideTexture),
      };
    }
  });

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Merges a conditional/inherited material without discarding undeclared texture channels or attributes. */
export function mergeXyzDslMaterialSpecs(
  base: XyzDslMaterialSpec,
  override: XyzDslMaterialSpec,
): XyzDslMaterialSpec {
  return {
    diagnostics: [],
    materialPreset: override.materialPreset ?? base.materialPreset,
    semanticMaterial: override.semanticMaterial ?? base.semanticMaterial,
    materialVariant: override.materialVariant ?? base.materialVariant,
    materialPattern: override.materialPattern ?? base.materialPattern,
    materialFinish: override.materialFinish ?? base.materialFinish,
    textures: mergeTextures(base.textures, override.textures),
    color: override.color ?? base.color,
    metalness: override.metalness ?? base.metalness,
    roughness: override.roughness ?? base.roughness,
    reflectivity: override.reflectivity ?? base.reflectivity,
    clearcoat: override.clearcoat ?? base.clearcoat,
    opacity: override.opacity ?? base.opacity,
    transmission: override.transmission ?? base.transmission,
    ior: override.ior ?? base.ior,
  };
}

const DEFAULT_PROPERTIES: ResolvedProperties = {
  material: { diagnostics: [] },
  physics: { diagnostics: [], 'physics-mode': 'dynamic', friction: 0.7, restitution: 0, 'linear-damping': 0, 'gravity-scale': 1, ccd: false, 'can-sleep': true, 'lock-translations': [false, false, false], 'lock-rotations': [false, false, false] },
  geometry: { kind: 'box', diagnostics: [] },
  transform: { rotation: [0, 0, 0], diagnostics: [] },
  content: { diagnostics: [] },
};

/** Physics inherits and overrides one declared field at a time. */
export function mergeXyzDslPhysicsSpecs(base: XyzDslPhysicsSpec, override: XyzDslPhysicsSpec): XyzDslPhysicsSpec {
  return { ...base, ...override, diagnostics: [] };
}

export function mergeXyzDslGeometrySpecs(
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

export function mergeXyzDslContentSpecs(base: XyzDslContentSpec, override: XyzDslContentSpec): XyzDslContentSpec {
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
  const overridePhysics = override.physics;
  const overrideGeometry = override.geometry;
  const overrideTransform = override.transform;
  const includeTransform = options.includeTransform ?? true;

  return {
    material: mergeXyzDslMaterialSpecs(base.material, overrideMaterial),
    physics: mergeXyzDslPhysicsSpecs(base.physics, overridePhysics),
    geometry: mergeXyzDslGeometrySpecs(base.geometry, overrideGeometry),
    content: mergeXyzDslContentSpecs(base.content, override.content),
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
  const identityKey = (object: SpatialObject) => object.origin?.sourceKind === 'secondary'
    ? `secondary:${object.origin.streamId ?? object.origin.publicKey ?? 'unknown'}:`
    : '';

  objects.forEach((object) => {
    if (object.namespace.length > 0) {
      latestByNamespaceAndKind.set(
        `${identityKey(object)}${object.declarationOnly ? 'declaration' : 'instance'}:${canonicalNamespacePath(object.namespace)}`,
        object,
      );
    }
  });

  return objects.filter(
    (object) =>
      object.namespace.length === 0 ||
      latestByNamespaceAndKind.get(
        `${identityKey(object)}${object.declarationOnly ? 'declaration' : 'instance'}:${canonicalNamespacePath(object.namespace)}`,
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
  variants: ResolvedConditionalVariant[];
  intents: ResolvedIntent[];
  diagnostics: ParseDiagnostic[];
} {
  const diagnostics: ParseDiagnostic[] = [];
  const intentObjects = objects.filter((object) => object.intent);
  const ordinaryObjects = objects.filter((object) => !object.conditional && !object.intent);
  const conditionalObjects = objects.filter((object) => object.conditional);
  const effectiveObjects = latestNamedEntries(ordinaryObjects);
  const instances = effectiveObjects.filter(
    (object) => !object.declarationOnly && object.box,
  );

  const intents = intentObjects.flatMap((object): ResolvedIntent[] => {
    const namespacePath = canonicalNamespacePath(object.namespace);
    if (object.origin?.sourceKind !== 'secondary') {
      diagnostics.push({ line: object.lineNumber, source: object.source, message: 'Intent declarations must originate from a secondary controller stream.' });
      return [];
    }
    const definition = [...ordinaryObjects].reverse().find((candidate) =>
      candidate.origin?.sourceKind !== 'secondary' && candidate.declarationOnly && canonicalNamespacePath(candidate.namespace) === namespacePath);
    if (!definition) {
      diagnostics.push({ line: object.lineNumber, source: object.source, message: `Intent definition "${namespacePath}" was not found in the primary baseline.` });
      return [];
    }
    const resolvedDefinition = resolvePropertiesFor(definition, ordinaryObjects);
    diagnostics.push(...resolvedDefinition.diagnostics);
    const controllerPhysics = object.physics;
    const definitionProperties = {
      ...resolvedDefinition.properties,
      physics: {
        ...resolvedDefinition.properties.physics,
        ...(controllerPhysics['control-target'] ? { 'control-target': controllerPhysics['control-target'] } : {}),
        ...(controllerPhysics['control-scope'] ? { 'control-scope': controllerPhysics['control-scope'] } : {}),
      },
    };
    const streamId = object.origin.streamId ?? object.origin.publicKey ?? 'secondary';
    return [{
      id: `${streamId}::${namespacePath}`,
      mode: object.intent!.mode,
      coordinate: object.intent!.coordinate,
      definitionNamespacePath: namespacePath,
      streamId,
      lineNumber: object.lineNumber,
      origin: object.origin,
      definition: definitionProperties,
    }];
  });
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
      resolvePropertiesFor(object, ordinaryObjects);
    diagnostics.push(...propertyDiagnostics);

    const namespace = options.namespace ?? object.namespace;
    const namespacePath = canonicalNamespacePath(namespace);
    const parentNamespacePath = canonicalNamespacePath(namespace.slice(0, -1));
    const duplicateSuffix = namespace.length > 0 ? `#${index + 1}` : '';
    const idPath =
      namespace.length > 0
        ? `${namespacePath}${object.box!.source}${duplicateSuffix}`
        : object.id;
    const originIdPrefix = object.origin?.sourceKind === 'secondary'
      ? `${object.origin.streamId ?? object.origin.publicKey ?? 'secondary'}::`
      : '';

    return {
      ...object,
      namespace,
      id: `${originIdPrefix}${options.idPrefix ? `${options.idPrefix}${idPath}` : idPath}`,
      box: object.box!,
      namespacePath,
      parentNamespacePath,
      renderable: false,
      material: properties.material,
      physics: properties.physics,
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
    ordinaryObjects
      .map((object) => canonicalNamespacePath(object.namespace))
      .filter(Boolean),
  );

  resolvedObjects.forEach((object, objectIndex) => {
    const authoredInstance = instances[objectIndex];
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
      ordinaryObjects.filter((candidate) => candidate.lineNumber < object.lineNumber),
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
      ordinaryObjects,
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
          physics: object.physics,
          geometry: object.geometry,
          transform: object.transform,
          content: object.content,
        },
        {
          material: resolvedDescendant.material,
          physics: resolvedDescendant.physics,
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
        // Resolved template descendants carry defaults. Reapply only fields
        // authored on the ref instance so those defaults cannot erase them.
        physics: mergeXyzDslPhysicsSpecs(properties.physics, authoredInstance.physics),
        geometry: properties.geometry,
        transform: properties.transform,
        content: properties.content,
        reference: { diagnostics: [] },
        materializedFrom: object.reference.targetPath,
        collisionOrder: object.lineNumber,
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

  const concreteTargetNamespaces = new Set(allObjects.map((object) => object.namespacePath));
  const variants: ResolvedConditionalVariant[] = conditionalObjects.flatMap((object) => {
    const conditional = object.conditional!;
    const targetNamespacePath = canonicalNamespacePath(conditional.targetNamespace);
    if (!concreteTargetNamespaces.has(targetNamespacePath)) {
      diagnostics.push({
        line: object.lineNumber,
        source: object.source,
        message: `Conditional declaration target "${targetNamespacePath}" was not found.`,
      });
      return [];
    }
    return [{
      ...object,
      conditional,
      targetNamespacePath,
      properties: {
        material: object.material,
        physics: object.physics,
        geometry: object.geometry,
        transform: object.transform,
        content: object.content,
      },
    }];
  });

  return {
    objects: allObjects.map((object) => ({
      ...object,
      anchorScale: anchorScaleById.get(object.id) ?? object.anchorScale,
      renderable:
        renderEligibleObjects.includes(object) &&
        !hasMaterializedChildInstance(object, renderEligibleObjects),
    })),
    variants,
    intents,
    diagnostics,
  };
}
