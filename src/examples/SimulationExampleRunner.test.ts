import { describe, expect, it } from 'vitest';
import { RELEASE_B_FIXTURES } from './releaseB/catalog';
import { RELEASE_C_FIXTURES } from './releaseC/catalog';
import { SimulationExampleRunner } from './SimulationExampleRunner';
import { SimulationTimeline } from '../transactions/SimulationTimeline';
import type { InteractionFact } from '../model/interactions';

describe('SimulationExampleRunner', () => {
  it.each([...RELEASE_B_FIXTURES, ...RELEASE_C_FIXTURES])('runs $id without a rendering clock', (fixture) => {
    const result = new SimulationExampleRunner().run(fixture);
    expect(result.samples).toHaveLength(fixture.ticks + 1);
    expect(result.samples.map(({ tick }) => tick)).toEqual(Array.from({ length: fixture.ticks + 1 }, (_, tick) => tick));
    expect(result.assertions.filter(({ passed }) => !passed).map(({ message }) => message).join('\n')).toBe('');
  });

  it('replays interaction phases from timeline history rather than final-run history', () => {
    const timeline = new SimulationTimeline();
    const fact: InteractionFact = {
      state: 'touch', targetId: 'target', targetNamespace: 'Target/', cursorId: 'cursor',
      cursorNamespace: 'Cursor/', streamId: 'stream', normal: [1, 0, 0], inferredDirection: [1, 0, 0],
    };
    timeline.evaluate(1, 1, 0, [fact], []);
    expect(timeline.evaluate(2, 2, 0, [], []).transitions.map(({ kind }) => kind)).toEqual(['leave']);

    expect(timeline.seek(1)).toBe(true);
    expect(timeline.evaluate(2, 2, 0, [], []).transitions.map(({ kind }) => kind)).toEqual(['leave']);
    timeline.dispose();
  });
});
