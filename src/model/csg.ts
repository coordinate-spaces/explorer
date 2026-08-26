import { boundsOverlap } from './collision';
import type { SpatialNode } from './SpatialNode';

export interface CsgOperationNode {
  op: NonNullable<SpatialNode['geometry']['operation']>;
  tool: SpatialNode;
}

export interface CsgExpression {
  id: string;
  base: SpatialNode;
  operations: CsgOperationNode[];
  scopePath?: string;
}

function sourceOrder(node: SpatialNode): number {
  return node.metadata?.lineNumber as number ?? Number.MAX_SAFE_INTEGER;
}

function isCsgTool(node: SpatialNode): boolean {
  return !node.model && node.geometry.operation !== undefined;
}

function scopePath(node: SpatialNode): string {
  return node.parentNamespacePath ?? '';
}

function candidateBaseId(candidate: SpatialNode): string | undefined {
  if (!isCsgTool(candidate)) {
    return candidate.id;
  }

  return candidate.csgExpressionId;
}

export function buildCsgExpressions(nodes: SpatialNode[]): { expressions: CsgExpression[]; nodes: SpatialNode[] } {
  const byId = new Map<string, SpatialNode>(nodes.map((node) => [node.id, { ...node, csgExpressionId: undefined, csgConsumed: false }]));
  const ordered = [...byId.values()].sort((a, b) => sourceOrder(a) - sourceOrder(b));
  const operationsByBase = new Map<string, CsgOperationNode[]>();
  const scopeByBase = new Map<string, string>();
  const baseByTool = new Map<string, string>();

  ordered.forEach((tool) => {
    if (!isCsgTool(tool) || !tool.geometry.operation) {
      return;
    }

    const earlierOverlapping = ordered
      .filter((candidate) => sourceOrder(candidate) < sourceOrder(tool))
      .filter((candidate) => !candidate.model)
      .filter((candidate) => boundsOverlap(candidate.bounds, tool.bounds));
    const scopedCandidate = earlierOverlapping
      .filter((candidate) => scopePath(candidate) === scopePath(tool))
      .at(-1);
    const candidate = scopedCandidate ?? earlierOverlapping.at(-1);
    const baseId = candidate ? (baseByTool.get(candidate.id) ?? candidateBaseId(candidate)) : undefined;
    const base = baseId ? byId.get(baseId) : undefined;

    if (!base || isCsgTool(base)) {
      return;
    }

    const operation = { op: tool.geometry.operation, tool };
    operationsByBase.set(base.id, [...(operationsByBase.get(base.id) ?? []), operation]);
    scopeByBase.set(base.id, scopePath(base));
    baseByTool.set(tool.id, base.id);

    const storedTool = byId.get(tool.id);
    if (storedTool) {
      storedTool.csgConsumed = true;
      storedTool.csgExpressionId = base.id;
    }
  });

  const expressions: CsgExpression[] = [...operationsByBase.entries()].map(([baseId, operations], index) => {
    const expressionId = `csg-${index + 1}`;
    const base = byId.get(baseId)!;
    base.csgExpressionId = expressionId;
    operations.forEach(({ tool }) => {
      const storedTool = byId.get(tool.id);
      if (storedTool) {
        storedTool.csgExpressionId = expressionId;
      }
    });

    return {
      id: expressionId,
      base,
      operations: operations.map(({ op, tool }) => ({ op, tool: byId.get(tool.id) ?? tool })),
      scopePath: scopeByBase.get(baseId),
    };
  });

  return { expressions, nodes: nodes.map((node) => byId.get(node.id) ?? node) };
}
