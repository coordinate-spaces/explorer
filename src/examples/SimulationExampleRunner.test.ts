import { describe, expect, it } from 'vitest';
import { RELEASE_B_FIXTURES } from './releaseB/catalog';
import { RELEASE_C_FIXTURES } from './releaseC/catalog';
import { SimulationExampleRunner } from './SimulationExampleRunner';

describe('SimulationExampleRunner', () => {
  it.each([...RELEASE_B_FIXTURES, ...RELEASE_C_FIXTURES])('runs $id without a rendering clock', (fixture) => {
    const result = new SimulationExampleRunner().run(fixture);
    expect(result.samples).toHaveLength(fixture.ticks + 1);
    expect(result.samples.map(({ tick }) => tick)).toEqual(Array.from({ length: fixture.ticks + 1 }, (_, tick) => tick));
    expect(result.assertions.filter(({ passed }) => !passed).map(({ message }) => message).join('\n')).toBe('');
  });
});
