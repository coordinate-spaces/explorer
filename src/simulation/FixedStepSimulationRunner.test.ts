import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FixedStepSimulationRunner } from './FixedStepSimulationRunner';

describe('FixedStepSimulationRunner', () => {
  it('steps only complete fixed intervals and publishes an interpolation alpha', () => {
    const world = new PhysicsWorld(10); const runner = new FixedStepSimulationRunner(world);
    expect(runner.update(0.05)).toMatchObject({ steps: 0, alpha: 0.5 });
    expect(runner.update(0.16)).toMatchObject({ steps: 2 });
    expect(world.tick).toBe(2);
  });

  it('bounds catch-up work and reports discarded wall time', () => {
    const world = new PhysicsWorld(10); const runner = new FixedStepSimulationRunner(world, 2);
    const result = runner.update(1);
    expect(result.steps).toBe(2);
    expect(result.droppedSeconds).toBeCloseTo(0.8);
  });
});
