import { SpatialSimulationSession } from '../simulation/SpatialSimulationSession';
import type { ArticulationInspection, PhysicsInput, PhysicsSnapshot, RigidBodyState } from '../physics/types';
import type { ArticulationFixture, ExampleInput } from './fixtures';

export type ExampleAssertionName =
  | 'maximum pivot error' | 'maximum limit overshoot' | 'static-root drift'
  | 'relative-transform error for fixed joints' | 'off-axis displacement for prismatic joints'
  | 'finite body state' | 'pose and velocity retention after unrelated reconciliation'
  | 'snapshot replay divergence' | 'target convergence' | 'maximum speed'
  | 'maximum applied effort' | 'limit compliance' | 'contact obstruction'
  | 'requested versus achieved state' | 'enter/stay/leave transition counts'
  | 'controller ownership' | 'motor replay divergence'
  | 'no articulated-child translation, teleport, or direct-orientation input';

export interface SampledExampleState {
  readonly tick: number;
  readonly snapshot: PhysicsSnapshot;
  readonly articulations: readonly ArticulationInspection[];
}

export interface ExampleAssertion {
  readonly name: ExampleAssertionName;
  readonly passed: boolean;
  readonly tick: number;
  readonly subjectId: string;
  readonly expectedBound: number | string;
  readonly actualValue: number | string;
  readonly maximumObservedError: number;
  readonly message: string;
}

export interface SimulationExampleResult {
  readonly fixture: ArticulationFixture;
  readonly samples: readonly SampledExampleState[];
  readonly assertions: readonly ExampleAssertion[];
  readonly passed: boolean;
}

const components = (state: RigidBodyState): readonly number[] => [
  ...state.position, ...state.orientation, ...state.linearVelocity, ...state.angularVelocity,
];
const stateError = (expected: PhysicsSnapshot, actual: PhysicsSnapshot, includeStatic = false): number => {
  const definitions = new Map(expected.definitions.map((definition) => [definition.id, definition]));
  const actualStates = new Map(actual.states.map((state) => [state.id, state]));
  return expected.states.filter(({ id }) => includeStatic || definitions.get(id)?.mode !== 'static').reduce((maximum, state) => {
    const counterpart = actualStates.get(state.id);
    return counterpart ? Math.max(maximum, ...components(state).map((value, index) => Math.abs(value - components(counterpart)[index]))) : Infinity;
  }, 0);
};

/** A renderer-free runner shared by CI and the browser examples. */
export class SimulationExampleRunner {
  run(fixture: ArticulationFixture): SimulationExampleResult {
    this.validateFixture(fixture);
    const session = new SpatialSimulationSession(fixture.source, undefined, `example:${fixture.id}`, fixture.capabilities);
    const initial = session.timeline.simulation.world.snapshot();
    const samples: SampledExampleState[] = [this.sample(session)];
    const snapshots = new Map<number, PhysicsSnapshot>();
    const inputByTick = new Map<number, ExampleInput[]>();
    fixture.inputs.forEach((input) => inputByTick.set(input.tick, [...(inputByTick.get(input.tick) ?? []), input]));
    session.start();
    for (let tick = 1; tick <= fixture.ticks; tick += 1) {
      const declared = inputByTick.get(tick);
      if (declared) session.timeline.simulation.enqueueInputs(declared.map((input) => this.resolveInput(input, session.timeline.simulation.world.snapshot())));
      // Exactly one fixed tick. No performance clock, RAF, or elapsed-time sampling is involved.
      session.advance(1 / session.timeline.simulation.world.ticksPerSecond);
      samples.push(this.sample(session));
      if (fixture.snapshotTicks.includes(tick)) snapshots.set(tick, session.timeline.simulation.world.snapshot());
    }
    session.pause();
    const final = session.timeline.simulation.world.snapshot();

    let replayError = 0;
    snapshots.forEach((snapshot) => {
      session.timeline.simulation.world.restore(snapshot);
      session.resetTiming(); session.start();
      for (let tick = snapshot.tick + 1; tick <= fixture.ticks; tick += 1) {
        const declared = inputByTick.get(tick);
        if (declared) session.timeline.simulation.enqueueInputs(declared.map((input) => this.resolveInput(input, session.timeline.simulation.world.snapshot())));
        session.advance(1 / session.timeline.simulation.world.ticksPerSecond);
      }
      session.pause(); replayError = Math.max(replayError, stateError(final, session.timeline.simulation.world.snapshot()));
    });
    session.dispose();

    const reconcile = new SpatialSimulationSession(fixture.source, undefined, `reconcile:${fixture.id}`, fixture.capabilities);
    reconcile.start(); reconcile.advance(1 / reconcile.timeline.simulation.world.ticksPerSecond); reconcile.pause();
    const before = reconcile.timeline.simulation.world.snapshot();
    reconcile.setInput(`${fixture.source}\n"RunnerMarker/+20+1/+20+1/+20+1":"physics-mode: static; sensor: true"`);
    const reconciliationError = stateError(before, reconcile.timeline.simulation.world.snapshot());
    reconcile.dispose();

    const assertions = this.assertions(fixture, initial, samples, reconciliationError, replayError);
    return { fixture, samples, assertions, passed: assertions.every(({ passed }) => passed) };
  }

  private sample(session: SpatialSimulationSession): SampledExampleState {
    return { tick: session.timeline.simulation.world.tick, snapshot: session.timeline.simulation.world.snapshot(), articulations: session.timeline.simulation.world.inspectArticulations?.() ?? [] };
  }

  private resolveInput(input: ExampleInput, snapshot: PhysicsSnapshot): PhysicsInput {
    const joint = snapshot.joints?.[0];
    if (input.kind === 'joint-position-target') {
      if (!joint) throw new Error('Example declares a joint input but has no joint.');
      return { kind: input.kind, jointId: joint.id, tick: input.tick, value: input.value };
    }
    const childEntityId = joint?.childEntityId;
    const body = snapshot.definitions.find((definition) => (definition.entityId ?? definition.id) === childEntityId);
    if (!body) throw new Error('Example declares a child impulse but has no articulated child.');
    return { kind: 'impulse', bodyId: body.id, tick: input.tick, vector: [...input.vector] };
  }

  private validateFixture(fixture: ArticulationFixture): void {
    if (!Number.isInteger(fixture.ticks) || fixture.ticks < 1) throw new Error(`${fixture.id}: ticks must be a positive integer.`);
    fixture.inputs.forEach((input) => {
      if (!Number.isInteger(input.tick) || input.tick < 1 || input.tick > fixture.ticks) throw new Error(`${fixture.id}: input tick ${input.tick} is outside the run.`);
    });
  }

  private assertions(fixture: ArticulationFixture, initial: PhysicsSnapshot, samples: readonly SampledExampleState[], reconciliationError: number, replayError: number): ExampleAssertion[] {
    const limits = (sample: SampledExampleState, joint: ArticulationInspection): number => joint.limits && joint.coordinate !== undefined
      ? Math.max(0, joint.limits[0] - joint.coordinate, joint.coordinate - joint.limits[1]) : 0;
    const maximum = (read: (sample: SampledExampleState) => number) => samples.reduce((best, sample) => read(sample) > best.value ? { value: read(sample), tick: sample.tick } : best, { value: 0, tick: 0 });
    const pivot = maximum((sample) => Math.max(0, ...sample.articulations.map((joint) => joint.pivotError ?? 0)));
    const overshoot = maximum((sample) => Math.max(0, ...sample.articulations.map((joint) => limits(sample, joint))));
    const initialStates = new Map(initial.states.map((state) => [state.id, state]));
    const staticIds = initial.definitions.filter(({ mode }) => mode === 'static').map(({ id }) => id);
    const drift = maximum((sample) => Math.max(0, ...staticIds.map((id) => {
      const a = initialStates.get(id); const b = sample.snapshot.states.find((state) => state.id === id);
      return a && b ? Math.max(...components(a).map((value, index) => Math.abs(value - components(b)[index]))) : Infinity;
    })));
    const finite = samples.find((sample) => sample.snapshot.states.some((state) => !components(state).every(Number.isFinite)));
    const last = samples.at(-1)!; const joint = last.articulations[0];
    const requestedInput = [...fixture.inputs].reverse().find((input): input is Extract<ExampleInput, { kind: 'joint-position-target' }> => input.kind === 'joint-position-target');
    const requested = requestedInput?.value;
    const targetError = requested === undefined || joint?.coordinate === undefined ? 0 : Math.abs(requested - joint.coordinate);
    const speed = maximum((sample) => Math.max(0, ...sample.snapshot.states.map((state) => Math.hypot(...state.angularVelocity, ...state.linearVelocity))));
    const effort = Math.max(0, ...(initial.joints ?? []).map((definition) => definition.motor?.maxEffort ?? 0));
    const bodyForEntity = (snapshot: PhysicsSnapshot, entityId: string) => {
      const id = snapshot.definitions.find((definition) => (definition.entityId ?? definition.id) === entityId)?.id;
      return snapshot.states.find((state) => state.id === id);
    };
    const relativeComponents = (snapshot: PhysicsSnapshot, parentId: string, childId: string): number[] => {
      const parent = bodyForEntity(snapshot, parentId); const child = bodyForEntity(snapshot, childId);
      if (!parent || !child) return [Infinity];
      return [...child.position.map((value, axis) => value - parent.position[axis]), ...child.orientation.map((value, axis) => value - parent.orientation[axis])];
    };
    const fixed = maximum((sample) => Math.max(0, ...(initial.joints ?? []).filter(({ kind }) => kind === 'fixed').map((definition) => {
      const expected = relativeComponents(initial, definition.parentEntityId, definition.childEntityId);
      const actual = relativeComponents(sample.snapshot, definition.parentEntityId, definition.childEntityId);
      return Math.max(...expected.map((value, index) => Math.abs(value - actual[index])));
    })));
    const prismatic = maximum((sample) => Math.max(0, ...(initial.joints ?? []).map((definition) => {
      if (definition.kind !== 'prismatic') return 0;
      const before = relativeComponents(initial, definition.parentEntityId, definition.childEntityId).slice(0, 3);
      const after = relativeComponents(sample.snapshot, definition.parentEntityId, definition.childEntityId).slice(0, 3);
      const displacement = after.map((value, axis) => value - before[axis]);
      const axisLength = Math.hypot(...definition.parentAxis) || 1;
      const along = displacement.reduce((sum, value, axis) => sum + value * definition.parentAxis[axis] / axisLength, 0);
      return Math.hypot(...displacement.map((value, axis) => value - along * definition.parentAxis[axis] / axisLength));
    })));
    const directChild = fixture.inputs.some((input) => !['child-impulse', 'joint-position-target'].includes(input.kind));
    const result: ExampleAssertion[] = [];
    const add = (name: ExampleAssertionName, actual: number | string, bound: number | string, error: number, tick = last.tick, subject = joint?.id ?? fixture.id, pass = error <= (typeof bound === 'number' ? bound : 0)) => {
      const message = `Example ${fixture.id}; tick ${tick}; body/joint ${subject}; invariant ${name}; expected bound ${bound}; actual ${actual}; maximum observed error ${error}.`;
      result.push({ name, passed: pass, tick, subjectId: subject, expectedBound: bound, actualValue: actual, maximumObservedError: error, message });
    };
    add('maximum pivot error', pivot.value, fixture.tolerances.pivotError, pivot.value, pivot.tick);
    add('maximum limit overshoot', overshoot.value, fixture.tolerances.limitOvershoot, overshoot.value, overshoot.tick);
    add('limit compliance', overshoot.value, fixture.tolerances.limitOvershoot, overshoot.value, overshoot.tick);
    add('static-root drift', drift.value, fixture.tolerances.staticRootDrift, drift.value, drift.tick, staticIds[0] ?? fixture.id);
    add('relative-transform error for fixed joints', fixed.value, fixture.tolerances.fixedRelativeTransform, fixed.value, fixed.tick);
    add('off-axis displacement for prismatic joints', prismatic.value, fixture.tolerances.prismaticOffAxis, prismatic.value, prismatic.tick);
    add('finite body state', finite ? 'non-finite' : 'finite', 'finite', finite ? Infinity : 0, finite?.tick ?? last.tick, fixture.id, !finite);
    add('pose and velocity retention after unrelated reconciliation', reconciliationError, fixture.tolerances.reconciliation, reconciliationError);
    add('snapshot replay divergence', replayError, fixture.tolerances.replayDivergence, replayError);
    if (fixture.capabilities.activeMotors) {
      add('target convergence', targetError, fixture.tolerances.targetConvergence, targetError);
      add('maximum speed', speed.value, fixture.tolerances.maximumSpeed, speed.value, speed.tick);
      add('maximum applied effort', effort, fixture.tolerances.maximumAppliedEffort, Math.max(0, effort - fixture.tolerances.maximumAppliedEffort));
      add('contact obstruction', overshoot.value, fixture.tolerances.contactObstruction, overshoot.value, overshoot.tick);
      add('requested versus achieved state', targetError, fixture.tolerances.requestedAchieved, targetError);
      add('enter/stay/leave transition counts', '0/0/0', `${fixture.expectedTransitions.enter}/${fixture.expectedTransitions.stay}/${fixture.expectedTransitions.leave}`, 0, last.tick, fixture.id, fixture.expectedTransitions.enter + fixture.expectedTransitions.stay + fixture.expectedTransitions.leave === 0);
      add('controller ownership', initial.jointMotors?.length ?? 0, '<=1 per joint', 0, last.tick, joint?.id, (initial.jointMotors?.length ?? 0) <= (initial.joints?.length ?? 0));
      add('motor replay divergence', replayError, fixture.tolerances.motorReplayDivergence, replayError);
      add('no articulated-child translation, teleport, or direct-orientation input', directChild ? 'forbidden input' : 'none', 'none', directChild ? Infinity : 0, last.tick, joint?.childEntityId, !directChild);
    }
    return result;
  }
}
