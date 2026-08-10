import { createSpatialDocument } from '../model/createSpatialDocument';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import type { RigidBodyDefinition } from '../physics/types';
import { parseXyzDslDocument } from '../xyzdsl/parser';
import { resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { SimulationTimeline } from './SimulationTimeline';
import type { PhysicsDirectiveBinding } from './SimulationTimeline';

export interface AccumulativeSpatialFrame {
  document: SpatialDocument;
  tick: number;
}

function renderable(nodes: readonly SpatialNode[]): SpatialNode[] {
  return nodes.flatMap((node) => [node.renderable ? node : undefined, ...renderable(node.children ?? [])])
    .filter(Boolean) as SpatialNode[];
}

/** Transaction/playback-owned bridge from XYZDSL contact declarations to persistent physics. */
export class AccumulativeSpatialTimeline {
  readonly simulation = new SimulationTimeline();

  evaluate(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    const authored = createSpatialDocument(source, { originsByLine });
    const definitions: RigidBodyDefinition[] = renderable(authored.nodes)
      .filter((node) => node.origin?.sourceKind !== 'secondary')
      .map((node) => ({
        id: node.id,
        bounds: node.bounds,
        position: [...(node.worldTransform ?? node.transform).position],
        mass: node.origin?.transactionAmount,
      }));
    this.simulation.reconcileDefinitions(definitions);

    const current = createSpatialDocument(source, {
      originsByLine,
      physicsFrame: this.simulation.world.frame(),
      accumulativePhysics: true,
    });
    const parsed = parseXyzDslDocument(source, originsByLine);
    const resolved = resolveXyzDslDocument(parsed.value ?? []);
    const idsByNamespace = new Map(renderable(authored.nodes).map((node) => [node.namespacePath, node.id]));
    const bindings = resolved.variants.flatMap((variant): PhysicsDirectiveBinding[] => {
      const targetId = idsByNamespace.get(variant.targetNamespacePath);
      if (!targetId || !variant.conditional.directives.some((directive) => directive.name === 'contact')) return [];
      const spatial = variant.conditional.spatialOverride;
      if (spatial.mode === 'translation') return [{ targetId, mode: 'translation', vector: spatial.magnitude }];
      if (spatial.mode === 'weighted-translation') {
        const node = renderable(authored.nodes).find(({ id }) => id === targetId);
        return [{ targetId, mode: 'weighted-translation', targetWeight: node?.origin?.transactionAmount }];
      }
      return [];
    });
    const tick = this.simulation.world.tick + 1;
    const frame = this.simulation.evaluate(tick, tick, 0, current.interactions ?? [], bindings);
    return {
      tick,
      document: createSpatialDocument(source, { originsByLine, physicsFrame: frame.physics, accumulativePhysics: true }),
    };
  }
}
