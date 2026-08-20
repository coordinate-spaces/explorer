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
  const descendantsFrom = (parent: string): JointDefinition[] => {
    const descendants: JointDefinition[] = [];
    const visit = (current: string) => (children.get(current) ?? []).sort((a, b) => a.id.localeCompare(b.id)).forEach((joint) => {
      descendants.push(joint); visit(joint.childEntityId);
    });
    visit(parent);
    return descendants;
  };
  const descendants = descendantsFrom(bodyId);
  const componentJoints = descendantsFrom(cursor);
  const selectedJoints = scope === 'body' ? chain.slice(-1)
    : scope === 'chain' ? chain
      : scope === 'subtree' ? descendants
        : componentJoints;
  const bodyIds = scope === 'subtree'
    ? [bodyId, ...descendants.map((joint) => joint.childEntityId)]
    : scope === 'component'
      ? [cursor, ...componentJoints.map((joint) => joint.childEntityId)]
      : [bodyId];
  return { bodyId, rootBodyId: cursor, jointIds: [...new Set(selectedJoints.map(({ id }) => id))], bodyIds: [...new Set(bodyIds)], scope };
}
