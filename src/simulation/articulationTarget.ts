import type { ArticulationControlScope, ArticulationControlTarget, JointDefinition } from '../physics/types';

/** Resolves a stable rigid-body selection without exposing physics-engine handles. */
export function resolveArticulationTarget(
  joints: readonly JointDefinition[],
  bodyId: string,
  scope: ArticulationControlScope,
): ArticulationControlTarget {
  const byChild = new Map(joints.map((joint) => [joint.childEntityId, joint]));
  const children = new Map<string, JointDefinition[]>();
  joints.forEach((joint) => children.set(joint.parentEntityId, [...(children.get(joint.parentEntityId) ?? []), joint]));
  const chain: JointDefinition[] = [];
  let cursor = bodyId;
  while (byChild.has(cursor)) {
    const joint = byChild.get(cursor)!;
    chain.unshift(joint);
    cursor = joint.parentEntityId;
  }
  const descendants: JointDefinition[] = [];
  const visit = (parent: string) => (children.get(parent) ?? []).sort((a, b) => a.id.localeCompare(b.id)).forEach((joint) => {
    descendants.push(joint); visit(joint.childEntityId);
  });
  visit(bodyId);
  const selectedJoints = scope === 'body' ? chain.slice(-1)
    : scope === 'chain' ? chain
      : scope === 'subtree' ? descendants
        : [...chain, ...descendants];
  const bodyIds = scope === 'subtree'
    ? [bodyId, ...descendants.map((joint) => joint.childEntityId)]
    : scope === 'component'
      ? [cursor, ...joints.map((joint) => joint.childEntityId)]
      : [bodyId];
  return { bodyId, rootBodyId: cursor, jointIds: [...new Set(selectedJoints.map(({ id }) => id))], bodyIds: [...new Set(bodyIds)], scope };
}
