import { useCallback, useEffect, useRef, useState } from 'react';
import { SceneRoot } from '../scene/SceneRoot';
import { SpatialSimulationSession } from '../simulation/SpatialSimulationSession';
import { SimulationTimeline } from '../transactions/SimulationTimeline';
import type { InteractionFact } from '../model/interactions';
import type { PhysicsSnapshot, RigidBodyState } from '../physics/types';
import { RELEASE_B_FIXTURES } from './releaseB/catalog';
import { RELEASE_C_FIXTURES } from './releaseC/catalog';
import type { ArticulationFixture } from './fixtures';

type Status = 'ready' | 'running' | 'paused';
type ProofResult = { reconciliation: boolean; oneShot: boolean; motorBounded: boolean; obstructedMotor: boolean };
const vector = (state: RigidBodyState) => [...state.position, ...state.orientation, ...state.linearVelocity, ...state.angularVelocity];
const finiteState = (state: RigidBodyState) => vector(state).every(Number.isFinite);

/** Maximum component error for every dynamic body, matched by stable body ID. */
export function dynamicStateDivergence(expected: PhysicsSnapshot, actual: PhysicsSnapshot): number {
  const definitions = new Map(expected.definitions.map((definition) => [definition.id, definition]));
  const actualById = new Map(actual.states.map((state) => [state.id, state]));
  return expected.states
    .filter((state) => definitions.get(state.id)?.mode !== 'static')
    .reduce((maximum, state) => {
      const counterpart = actualById.get(state.id);
      if (!counterpart) return Infinity;
      return Math.max(maximum, ...vector(state).map((value, index) => Math.abs(value - vector(counterpart)[index])));
    }, 0);
}

function verifyFixture(fixture: ArticulationFixture): ProofResult {
  const reconcile = new SpatialSimulationSession(fixture.source, undefined, `proof:${fixture.id}`, fixture.capabilities);
  reconcile.start(); reconcile.advance(1 / 30); reconcile.pause();
  const before = reconcile.timeline.simulation.world.snapshot();
  // A static, non-colliding declaration forces a real unrelated reconciliation.
  reconcile.setInput(`${fixture.source}\n"ProofMarker/+20+1/+20+1/+20+1":"physics-mode: static; sensor: true"`);
  const reconciliation = dynamicStateDivergence(before, reconcile.timeline.simulation.world.snapshot()) <= fixture.tolerance;
  reconcile.dispose();

  const timeline = new SimulationTimeline(undefined, fixture.capabilities);
  const body = { id: 'proof-body', bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }, position: [0, 0, 0] as [number, number, number], gravityScale: 0 };
  const fact: InteractionFact = { state: 'touch', targetId: body.id, targetNamespace: 'Proof/', cursorId: 'proof-cursor', cursorNamespace: 'Cursor/', streamId: 'proof', normal: [1, 0, 0], inferredDirection: [1, 0, 0] };
  timeline.reconcileDefinitions([body]);
  const entered = timeline.evaluate(1, 1, 0, [fact], [{ targetId: body.id, mode: 'impulse', magnitude: 1 }]);
  const stayed = timeline.evaluate(2, 2, 0, [fact], [{ targetId: body.id, mode: 'impulse', magnitude: 1 }]);
  const oneShot = entered.transitions.filter(({ kind }) => kind === 'enter').length === 1
    && stayed.transitions.every(({ kind }) => kind !== 'enter')
    && stayed.physics.states.get(body.id)?.linearVelocity[0] === 1;
  timeline.dispose();

  let motorBounded = true;
  let obstructedMotor = true;
  if (fixture.motor) {
    const motor = new SpatialSimulationSession(fixture.source, undefined, `motor-proof:${fixture.id}`, fixture.capabilities);
    const initial = motor.timeline.simulation.world.snapshot();
    const jointDefinition = initial.joints?.[0];
    const childDefinition = initial.definitions.find(({ entityId }) => entityId === jointDefinition?.childEntityId);
    const limit = jointDefinition?.kind === 'revolute' ? jointDefinition.limits?.[1] : undefined;
    let previous = childDefinition ? initial.states.find(({ id }) => id === childDefinition.id)?.position : undefined;
    let maximumStepDistance = 0;
    let maximumAngularSpeed = 0;
    if (jointDefinition && childDefinition && limit !== undefined) {
      // Drive beyond the upper joint stop: the limit is the deterministic obstruction.
      motor.timeline.simulation.enqueueInputs([{ kind: 'joint-position-target', jointId: jointDefinition.id, tick: 1, value: limit + Math.PI }]);
      motor.start();
      for (let tick = 0; tick < 180; tick += 1) {
        motor.advance(1 / 60);
        const state = motor.timeline.simulation.world.frame().states.get(childDefinition.id);
        if (!state || !previous) { obstructedMotor = false; break; }
        maximumStepDistance = Math.max(maximumStepDistance, Math.hypot(...state.position.map((value, axis) => value - previous![axis])));
        maximumAngularSpeed = Math.max(maximumAngularSpeed, Math.hypot(...state.angularVelocity));
        previous = state.position;
      }
      const inspection = motor.timeline.simulation.world.inspectArticulations?.()[0];
      const configured = jointDefinition.motor;
      motorBounded = configured !== undefined && Number.isFinite(configured.maxEffort) && configured.maxEffort <= 18
        && maximumAngularSpeed <= configured.maxSpeed + fixture.tolerance;
      obstructedMotor = obstructedMotor && maximumStepDistance < 0.25
        && (inspection?.coordinate ?? Infinity) <= limit + fixture.tolerance;
    } else {
      motorBounded = false; obstructedMotor = false;
    }
    motor.dispose();
  }
  return { reconciliation, oneShot, motorBounded, obstructedMotor };
}

export function ArticulationGallery({ onClose }: { onClose: () => void }) {
  const [release, setRelease] = useState<'B' | 'C'>('B');
  const fixture: ArticulationFixture = (release === 'B' ? RELEASE_B_FIXTURES : RELEASE_C_FIXTURES)[0];
  const [session, setSession] = useState<SpatialSimulationSession>();
  const snapshotRef = useRef<PhysicsSnapshot | undefined>(undefined);
  const [status, setStatus] = useState<Status>('ready');
  const [, setRevision] = useState(0);
  const [motorTarget, setMotorTarget] = useState(fixture.motor?.initial ?? 0);
  const [log, setLog] = useState<string[]>(['catalog opened']);
  const [replayError, setReplayError] = useState<number | undefined>();
  const [proof, setProof] = useState<ProofResult>({ reconciliation: false, oneShot: false, motorBounded: false, obstructedMotor: false });
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const next = new SpatialSimulationSession(fixture.source, undefined, `example:${fixture.id}`, fixture.capabilities);
    setSession(next); snapshotRef.current = undefined; setStatus('ready'); setReplayError(undefined);
    setMotorTarget(fixture.motor?.initial ?? 0); setLog([`0000 · loaded ${fixture.capabilities.id}`]);
    setProof(verifyFixture(fixture));
    return () => next.dispose();
  }, [fixture]);

  useEffect(() => {
    if (status !== 'running' || !session) return;
    let previous = performance.now(); let request = 0;
    const animate = (now: number) => { session.advance(Math.min((now - previous) / 1000, 0.05)); previous = now; refresh(); request = requestAnimationFrame(animate); };
    request = requestAnimationFrame(animate); return () => cancelAnimationFrame(request);
  }, [session, status]);

  const record = useCallback((value: string) => setLog((entries) => [...entries.slice(-7), `${session?.frame().tick.toString().padStart(4, '0') ?? '0000'} · ${value}`]), [session]);
  if (!session) return <main className="example-gallery"><p>Initializing production articulation runtime…</p></main>;
  const step = () => { session.resume(); session.advance(1 / 60); session.pause(); setStatus('paused'); record('fixed step'); refresh(); };
  const restoreAndPublish = (snapshot: PhysicsSnapshot) => { session.timeline.simulation.world.restore(snapshot); session.setInput(fixture.source, new Map()); };
  const reset = () => { session.reconstruct(fixture.source); snapshotRef.current = undefined; setStatus('ready'); setReplayError(undefined); record('reset'); refresh(); };
  const joint = session.timeline.simulation.world.inspectArticulations?.()[0];
  const snap = session.timeline.simulation.world.snapshot();
  const definitionById = new Map(snap.definitions.map((body) => [body.id, body]));
  const child = snap.states.find(({ id }) => definitionById.get(id)?.entityId === joint?.childEntityId);
  const anchor = snap.states.find(({ id }) => definitionById.get(id)?.entityId === joint?.parentEntityId);
  const coordinate = joint?.coordinate ?? 0; const limits = joint?.limits ?? [-Infinity, Infinity];
  const assertions = [
    ['Anchor remains static', anchor ? Math.hypot(...anchor.linearVelocity) < 1e-8 : false],
    ['Pivot error below tolerance', (joint?.pivotError ?? Infinity) <= fixture.tolerance],
    ['Joint coordinate within limits', coordinate >= limits[0] - fixture.tolerance && coordinate <= limits[1] + fixture.tolerance],
    ['No NaN or infinity', snap.states.every(finiteState)],
    ['Unrelated reconcile preserves pose + velocity', proof.reconciliation],
    ['Replay divergence below tolerance', replayError === undefined ? undefined : replayError <= fixture.tolerance],
    ['Motor speed + effort bounded', !fixture.motor || proof.motorBounded],
    ['Obstructed motors do not teleport', !fixture.motor || proof.obstructedMotor],
    ['One-shot reactions exactly once per entry', proof.oneShot],
  ] as const;
  const pivotError = joint?.pivotError ?? 0;

  return <main className="example-gallery">
    <header><div><span className="eyebrow">ARTICULATION LAB / PRODUCTION RUNTIME</span><h1>Joint behavior, made visible.</h1><p>Deterministic fixtures rendered through the same SceneRoot and SpatialSimulationSession exercised by automated tests.</p></div><button onClick={onClose}>Return to workspace</button></header>
    <nav aria-label="Gallery filter"><button className={release === 'B' ? 'active' : ''} onClick={() => setRelease('B')}>Release B — passive</button><button className={release === 'C' ? 'active' : ''} onClick={() => setRelease('C')}>Release C — active</button></nav>
    <section className="example-layout">
      <article className="example-stage"><div className="stage-label"><b>{fixture.title}</b><span>{status} · tick {session.frame().tick}</span></div><div className="example-canvas"><SceneRoot document={session.frame().document} /></div>
        <svg className="joint-overlay" viewBox="0 0 600 420" aria-label="Joint debug overlay"><path d="M300 115 A105 105 0 0 1 390 205"/><line x1="300" y1="115" x2="300" y2="280"/><line className={pivotError > fixture.tolerance ? 'error' : ''} x1="300" y1="115" x2={300 + pivotError * 900} y2="115"/><circle className="parent" cx="300" cy="115" r="8"/><circle className="child" cx={300 + pivotError * 900} cy="115" r="5"/><text x="312" y="101">parent pivot / child pivot</text><text x="310" y="275">axis · Z</text><text x="395" y="207">limit range</text></svg>
      </article>
      <aside className="example-panel"><span className="eyebrow">FIXTURE 01 / {release === 'B' ? 'PASSIVE' : 'ACTIVE'}</span><h2>{fixture.title}</h2><p>{fixture.description}</p>
        <div className="transport"><button onClick={() => { session.start(); setStatus('running'); record('start'); }}>Start</button><button onClick={() => { session.pause(); setStatus('paused'); record('pause'); }}>Pause</button><button onClick={step}>Step</button><button onClick={() => { session.resume(); setStatus('running'); record('resume'); }}>Resume</button><button onClick={reset}>Reset</button></div>
        <div className="transport secondary"><button onClick={() => { if (!child) return; session.timeline.simulation.enqueueInputs([{ kind: 'impulse', bodyId: child.id, tick: snap.tick + 1, vector: [...fixture.impulse] }]); record('impulse +2.5X'); }}>Apply impulse</button><button onClick={() => { snapshotRef.current = snap; record('snapshot captured'); }}>Capture snapshot</button><button disabled={!snapshotRef.current} onClick={() => { restoreAndPublish(snapshotRef.current!); session.pause(); setStatus('paused'); record('snapshot restored'); refresh(); }}>Restore</button><button disabled={!snapshotRef.current} onClick={() => { const expected = snap; restoreAndPublish(snapshotRef.current!); session.resume(); while (session.timeline.simulation.world.tick < expected.tick) session.advance(1 / 60); session.pause(); setStatus('paused'); setReplayError(dynamicStateDivergence(expected, session.timeline.simulation.world.snapshot())); session.setInput(fixture.source, new Map()); record('deterministic replay'); refresh(); }}>Replay</button></div>
        {fixture.motor ? <label className="motor-control"><span>Controller target <b>{motorTarget}°</b></span><input type="range" min={fixture.motor.minimum} max={fixture.motor.maximum} value={motorTarget} onChange={(event) => { const value = Number(event.target.value); setMotorTarget(value); const id = snap.joints?.[0]?.id; if (id) session.timeline.simulation.enqueueInputs([{ kind: 'joint-position-target', jointId: id, tick: snap.tick + 1, value: value * Math.PI / 180 }]); record(`motor target ${value}°`); }}/><small>Position servo · 90°/s · 18 N·m maximum</small></label> : <div className="passive-note">Motor target controls intentionally unavailable</div>}
        <h3>Live proof</h3><ul className="assertions">{assertions.map(([label, pass]) => <li className={pass === undefined ? 'pending' : pass ? 'pass' : 'fail'} key={label}><span>{pass === undefined ? '·' : pass ? '✓' : '!'}</span>{label}</li>)}</ul>
        <details open><summary>Capability profile & emitted input log</summary><pre>{JSON.stringify(fixture.capabilities, null, 2)}</pre><ol>{log.map((entry, i) => <li key={`${i}-${entry}`}>{entry}</li>)}</ol></details>
      </aside>
    </section>
  </main>;
}
