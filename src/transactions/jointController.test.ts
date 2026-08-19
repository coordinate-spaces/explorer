import { describe, expect, it } from 'vitest';
import type { PhysicsInput } from '../physics/types';
import { resolveJointControllerInputs } from './SimulationTimeline';

describe('joint controller ownership', () => {
  it('uses priority, blend weights, exclusivity, and stable source order deterministically', () => {
    const commands: PhysicsInput[] = [
      { kind: 'joint-position-target', jointId: 'finger', tick: 1, value: 1, controllerPriority: 2, blendWeight: 1, stableSourceOrder: 4 },
      { kind: 'joint-position-target', jointId: 'finger', tick: 1, value: 3, controllerPriority: 2, blendWeight: 3, stableSourceOrder: 5 },
      { kind: 'joint-position-target', jointId: 'finger', tick: 1, value: 99, controllerPriority: 1, exclusive: true, stableSourceOrder: 1 },
    ];
    expect(resolveJointControllerInputs(commands)).toMatchObject([{ jointId: 'finger', value: 2.5, stableSourceOrder: 4 }]);
    commands.push({ kind: 'joint-effort', jointId: 'finger', tick: 1, value: 2, controllerPriority: 3, exclusive: true, stableSourceOrder: 8 });
    expect(resolveJointControllerInputs(commands)).toMatchObject([{ kind: 'joint-effort', value: 2 }]);
  });
});
