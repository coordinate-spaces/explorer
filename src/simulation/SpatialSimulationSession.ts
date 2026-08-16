import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { AccumulativeSpatialTimeline, type AccumulativeSpatialFrame } from '../transactions/AccumulativeSpatialTimeline';
import { FixedStepSimulationRunner } from './FixedStepSimulationRunner';

interface AuthoredInput {
  source: string;
  originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>;
}

/** Owns wall-clock timing and the mutable timeline for one application simulation run. */
export class SpatialSimulationSession {
  readonly timeline: AccumulativeSpatialTimeline;
  private input: AuthoredInput;
  private runner: FixedStepSimulationRunner;
  private published: AccumulativeSpatialFrame;
  private running = false;

  constructor(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>, baselineRevision = 'baseline') {
    this.input = { source, originsByLine };
    this.timeline = new AccumulativeSpatialTimeline(baselineRevision);
    this.published = this.timeline.compile(source, originsByLine);
    const target = {
      ticksPerSecond: this.timeline.simulation.world.ticksPerSecond,
      frame: () => this.timeline.simulation.world.frame(),
      step: () => {
        this.published = this.timeline.evaluate(this.input.source, this.input.originsByLine);
        return this.timeline.simulation.world.frame();
      },
    };
    this.runner = new FixedStepSimulationRunner(target);
  }

  frame(): AccumulativeSpatialFrame { return this.published; }

  setInput(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    this.input = { source, originsByLine };
    this.published = this.timeline.compile(source, originsByLine);
    return this.published;
  }

  start(): void { this.runner.reset(); this.running = true; }
  pause(): void { this.running = false; this.runner.reset(); }
  resume(): void { this.runner.reset(); this.running = true; }
  resetTiming(): void { this.runner.reset(); }

  advance(elapsedSeconds: number): AccumulativeSpatialFrame | undefined {
    if (!this.running) return undefined;
    const result = this.runner.update(elapsedSeconds);
    return result.steps ? this.published : undefined;
  }

  dispose(): void { this.running = false; this.timeline.dispose(); }
}
