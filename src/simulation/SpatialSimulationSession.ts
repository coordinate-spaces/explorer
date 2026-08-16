import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { AccumulativeSpatialTimeline, type AccumulativeSpatialFrame } from '../transactions/AccumulativeSpatialTimeline';
import { FixedStepSimulationRunner } from './FixedStepSimulationRunner';

interface AuthoredInput {
  source: string;
  originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>;
}

/** Owns wall-clock timing and the mutable timeline for one application simulation run. */
export class SpatialSimulationSession {
  timeline: AccumulativeSpatialTimeline;
  private readonly baselineRevision: string;
  private input: AuthoredInput;
  private runner: FixedStepSimulationRunner;
  private published: AccumulativeSpatialFrame;
  private running = false;

  constructor(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>, baselineRevision = 'baseline') {
    this.baselineRevision = baselineRevision;
    this.input = { source, originsByLine };
    this.timeline = new AccumulativeSpatialTimeline(baselineRevision);
    this.published = this.timeline.compile(source, originsByLine);
    this.runner = this.createRunner();
  }

  private createRunner(): FixedStepSimulationRunner {
    const target = {
      ticksPerSecond: this.timeline.simulation.world.ticksPerSecond,
      frame: () => this.timeline.simulation.world.frame(),
      step: () => {
        this.published = this.timeline.evaluate(this.input.source, this.input.originsByLine);
        return this.timeline.simulation.world.frame();
      },
    };
    return new FixedStepSimulationRunner(target);
  }

  frame(): AccumulativeSpatialFrame { return this.published; }

  setInput(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    // React may render for reasons unrelated to the authored projection. Avoid a
    // reconcile in that case: the fixed-step runner owns clock advancement and
    // will evaluate this retained input when a complete tick is available.
    if (source === this.input.source && originsByLine === this.input.originsByLine) return this.published;
    this.input = { source, originsByLine };
    this.published = this.timeline.compile(source, originsByLine);
    return this.published;
  }

  /** Rebuilds physics, interaction history, and timing at an authored discontinuity. */
  reconstruct(source: string, originsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>): AccumulativeSpatialFrame {
    this.timeline.dispose();
    this.input = { source, originsByLine };
    this.timeline = new AccumulativeSpatialTimeline(this.baselineRevision);
    this.published = this.timeline.compile(source, originsByLine);
    this.runner = this.createRunner();
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
