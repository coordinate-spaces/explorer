import type { PhysicsFrame } from '../physics/types';
import type { RigidBodyWorld } from '../physics/RigidBodyWorld';

export interface FixedStepResult {
  previous: PhysicsFrame;
  current: PhysicsFrame;
  alpha: number;
  steps: number;
  droppedSeconds: number;
}

/** Converts elapsed wall time into bounded fixed physics steps; interpolation is render-only. */
export class FixedStepSimulationRunner {
  private accumulator = 0;
  private lastFrame: PhysicsFrame;

  constructor(readonly world: RigidBodyWorld, readonly maximumStepsPerUpdate = 8) {
    if (!Number.isInteger(maximumStepsPerUpdate) || maximumStepsPerUpdate < 1) throw new Error('Maximum physics steps must be a positive integer.');
    this.lastFrame = world.frame();
  }

  update(elapsedSeconds: number): FixedStepResult {
    const dt = 1 / this.world.ticksPerSecond;
    this.accumulator += Math.max(0, elapsedSeconds);
    let previous = this.lastFrame;
    let current = previous;
    let steps = 0;
    while (this.accumulator >= dt && steps < this.maximumStepsPerUpdate) {
      previous = current;
      current = this.world.step();
      this.accumulator -= dt;
      steps += 1;
    }
    const droppedSeconds = this.accumulator >= dt ? this.accumulator - (this.accumulator % dt) : 0;
    if (droppedSeconds) this.accumulator %= dt;
    this.lastFrame = current;
    return { previous, current, alpha: this.accumulator / dt, steps, droppedSeconds };
  }

  reset(): void { this.accumulator = 0; this.lastFrame = this.world.frame(); }
}
