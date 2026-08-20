import { describe, expect, it, vi } from 'vitest';
import type { PhysicsInput } from '../physics/types';
import { resolveJointControllerInputs } from './SimulationTimeline';
import { SimulationTimeline } from './SimulationTimeline';

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

  it('arbitrates commands on the public enqueue path instead of relying on array order', () => {
    const timeline = new SimulationTimeline();
    const enqueue = vi.spyOn(timeline.world, 'enqueueInputs');
    timeline.enqueueInputs([
      { kind: 'joint-position-target', jointId: 'finger', tick: 1, value: .4, controllerPriority: 2, exclusive: true },
      { kind: 'joint-position-target', jointId: 'finger', tick: 1, value: -.5, controllerPriority: 1 },
    ]);
    expect(enqueue).toHaveBeenCalledWith([expect.objectContaining({ value: .4, controllerPriority: 2 })]);
    timeline.dispose();
  });
});
