import { describe, expect, it } from 'vitest';
import type { InteractionFact } from '../model/interactions';
import { SimulationTimeline } from './SimulationTimeline';

const definition = { id: 'Body/', bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }, position: [0, 0, 0] as [number, number, number] };
const fact: InteractionFact = { state: 'probe', targetId: 'Body/', targetNamespace: 'Body/', cursorId: 'Cursor/', cursorNamespace: 'Cursor/', streamId: 'controller', normal: [1, 0, 0], inferredDirection: [1, 1, 1] };

describe('SimulationTimeline', () => {
  it('applies force while persistent and impulse only on enter', () => {
    const force = new SimulationTimeline();
    force.reconcileDefinitions([definition]);
    const first = force.evaluate(1, 1, 0, [fact], [{ targetId: 'Body/', mode: 'force', magnitude: 60 }]);
    const second = force.evaluate(2, 2, 0, [fact], [{ targetId: 'Body/', mode: 'force', magnitude: 60 }]);
    expect(first.transitions[0].kind).toBe('enter');
    expect(second.transitions[0].kind).toBe('stay');
    expect(second.physics.states.get('Body/')?.linearVelocity[0]).toBe(2);

    const impulse = new SimulationTimeline();
    impulse.reconcileDefinitions([definition]);
    impulse.evaluate(1, 1, 0, [fact], [{ targetId: 'Body/', mode: 'impulse', magnitude: 1 }]);
    expect(impulse.evaluate(2, 2, 0, [fact], [{ targetId: 'Body/', mode: 'impulse', magnitude: 1 }]).physics.states.get('Body/')?.linearVelocity[0]).toBe(1);
  });

  it('restores transition and physics state on seek', () => {
    const timeline = new SimulationTimeline();
    timeline.reconcileDefinitions([definition]);
    timeline.evaluate(1, 1, 0, [fact], [{ targetId: 'Body/', mode: 'impulse', magnitude: 1 }]);
    expect(timeline.seek(0)).toBe(true);
    timeline.reconcileDefinitions([definition]);
    const replay = timeline.evaluate(1, 1, 0, [fact], [{ targetId: 'Body/', mode: 'impulse', magnitude: 1 }]);
    expect(replay.transitions[0].kind).toBe('enter');
    expect(replay.physics.states.get('Body/')?.linearVelocity[0]).toBe(1);
  });
});
