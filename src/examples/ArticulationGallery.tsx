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
  const reconciliation = dynamicStateDivergence(before, reconcile.timeline.simulation.world.snapshot()) <= fixture.tolerances.pivotError;
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
        && maximumAngularSpeed <= configured.maxSpeed + fixture.tolerances.pivotError;
      obstructedMotor = obstructedMotor && maximumStepDistance < 0.25
        && (inspection?.coordinate ?? Infinity) <= limit + fixture.tolerances.pivotError;
    } else {
      motorBounded = false; obstructedMotor = false;
    }
    motor.dispose();
  }
  return { reconciliation, oneShot, motorBounded, obstructedMotor };
}

export function ArticulationGallery({ onClose }: { onClose: () => void }) {
  const [release, setRelease] = useState<'B' | 'C'>('B');
  const [fixtureIndex, setFixtureIndex] = useState(0);
  const catalog = release === 'B' ? RELEASE_B_FIXTURES : RELEASE_C_FIXTURES;
  const fixture: ArticulationFixture = catalog[fixtureIndex] ?? catalog[0];
  const [session, setSession] = useState<SpatialSimulationSession>();
  const snapshotRef = useRef<{ tick: number; snapshot: PhysicsSnapshot } | undefined>(undefined);
  const maximumPivotErrorRef = useRef(0);
  const [status, setStatus] = useState<Status>('ready');
  const [, setRevision] = useState(0);
  const [motorTarget, setMotorTarget] = useState(fixture.motor?.initial ?? 0);
  const [log, setLog] = useState<string[]>(['catalog opened']);
  const [replayError, setReplayError] = useState<number | undefined>();
  const [proof, setProof] = useState<ProofResult>({ reconciliation: false, oneShot: false, motorBounded: false, obstructedMotor: false });
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const next = new SpatialSimulationSession(fixture.source, undefined, `example:${fixture.id}`, fixture.capabilities);
    setSession(next); snapshotRef.current = undefined; maximumPivotErrorRef.current = 0; setStatus('ready'); setReplayError(undefined);
    setMotorTarget(fixture.motor?.initial ?? 0); setLog([`0000 · loaded ${fixture.capabilities.id}`]);
    setProof(verifyFixture(fixture));
    return () => next.dispose();
  }, [fixture]);

  useEffect(() => {
    if (status !== 'running' || !session) return;
    // The timer only requests a tick; physics always receives exactly one fixed
    // quantum and is never driven by requestAnimationFrame or measured wall time.
    const timer = window.setInterval(() => { session.advance(1 / 60); refresh(); }, 1000 / 60);
    return () => window.clearInterval(timer);
  }, [session, status]);

  const record = useCallback((value: string) => setLog((entries) => [...entries.slice(-7), `${session?.frame().tick.toString().padStart(4, '0') ?? '0000'} · ${value}`]), [session]);
  if (!session) return <main className="example-gallery"><p>Initializing production articulation runtime…</p></main>;
  const step = () => { session.resume(); session.advance(1 / 60); session.pause(); setStatus('paused'); record('fixed step'); refresh(); };
  const reset = () => { session.reconstruct(fixture.source); snapshotRef.current = undefined; setStatus('ready'); setReplayError(undefined); record('reset'); refresh(); };
  const joint = session.timeline.simulation.world.inspectArticulations?.()[0];
  const snap = session.timeline.simulation.world.snapshot();
  const definitionById = new Map(snap.definitions.map((body) => [body.id, body]));
  const child = snap.states.find(({ id }) => definitionById.get(id)?.entityId === joint?.childEntityId);
  const anchor = snap.states.find(({ id }) => definitionById.get(id)?.entityId === joint?.parentEntityId);
  const coordinate = joint?.coordinate ?? 0; const limits = joint?.limits ?? [-Infinity, Infinity];
  maximumPivotErrorRef.current = Math.max(maximumPivotErrorRef.current, joint?.pivotError ?? 0);
  const requested = fixture.motor?.unit === 'deg' ? motorTarget * Math.PI / 180 : motorTarget;
  const effortControl = fixture.control === 'effort' || fixture.control === 'touch';
  const achieved = (fixture.control === 'velocity' || effortControl) && child ? Math.hypot(...child.angularVelocity) : coordinate;
  const achievedUnit = fixture.control === 'velocity' || effortControl ? 'rad/s' : 'rad';
  const enqueueControl = (value: number) => {
    const id = snap.joints?.[0]?.id; if (!id) return;
    if (fixture.control === 'touch') {
      const target = snap.definitions.find((definition) => (definition.entityId ?? definition.id) === joint?.childEntityId);
      if (!target || !joint) return;
      const tick = snap.tick + 1;
      const fact: InteractionFact = { state: 'touch', targetId: target.id, targetNamespace: `${joint.childEntityId}/`, cursorId: 'gallery-touch-cursor', cursorNamespace: 'GalleryCursor/', streamId: 'gallery-touch', normal: [1, 0, 0], inferredDirection: [1, 0, 0] };
      session.timeline.simulation.evaluate(tick, tick, 0, [fact], [{ targetId: target.id, mode: 'joint-effort', jointId: id, value, phase: 'enter' }]);
      session.seek(tick); setStatus('paused'); refresh(); return;
    }
    const kind = fixture.control === 'velocity' ? 'joint-velocity-target' : fixture.control === 'effort' ? 'joint-effort' : 'joint-position-target';
    session.timeline.simulation.enqueueInputs([{ kind, jointId: id, tick: snap.tick + 1, value: fixture.motor?.unit === 'deg' ? value * Math.PI / 180 : value }]);
  };
  const assertions = [
    ['Anchor remains static', anchor ? Math.hypot(...anchor.linearVelocity) < 1e-8 : false],
    ['Pivot error below tolerance', (joint?.pivotError ?? Infinity) <= fixture.tolerances.pivotError],
    ['Joint coordinate within limits', coordinate >= limits[0] - fixture.tolerances.pivotError && coordinate <= limits[1] + fixture.tolerances.pivotError],
    ['No NaN or infinity', snap.states.every(finiteState)],
    ['Unrelated reconcile preserves pose + velocity', proof.reconciliation],
    ['Replay divergence below tolerance', replayError === undefined ? undefined : replayError <= fixture.tolerances.pivotError],
    ['Motor speed + effort bounded', !fixture.motor || proof.motorBounded],
    ['Obstructed motors do not teleport', !fixture.motor || proof.obstructedMotor],
    ['One-shot reactions exactly once per entry', proof.oneShot],
  ] as const;
  const pivotError = joint?.pivotError ?? 0;

  return <main className="example-gallery">
    <header><div><span className="eyebrow">ARTICULATION LAB / PRODUCTION RUNTIME</span><h1>Joint behavior, made visible.</h1><p>Deterministic fixtures rendered through the same SceneRoot and SpatialSimulationSession exercised by automated tests.</p></div><button onClick={onClose}>Return to workspace</button></header>
    <nav aria-label="Gallery filter"><button className={release === 'B' ? 'active' : ''} onClick={() => { setRelease('B'); setFixtureIndex(0); }}>Release B — passive</button><button className={release === 'C' ? 'active' : ''} onClick={() => { setRelease('C'); setFixtureIndex(0); }}>Release C — active</button></nav>
    <nav className="fixture-catalog" aria-label={`Release ${release} examples`}>{catalog.map((entry, index) => <button key={entry.id} className={index === fixtureIndex ? 'active' : ''} onClick={() => setFixtureIndex(index)}><span>{String(index + 1).padStart(2, '0')}</span>{entry.title}</button>)}</nav>
    <section className="example-layout">
      <article className="example-stage"><div className="stage-label"><b>{fixture.title}</b><span>{status} · tick {session.frame().tick}</span></div><div className="example-canvas"><SceneRoot document={session.frame().document} /></div>
        <svg className="joint-overlay" viewBox="0 0 600 420" aria-label="Joint debug overlay"><path d="M300 115 A105 105 0 0 1 390 205"/><line x1="300" y1="115" x2="300" y2="280"/><line className={pivotError > fixture.tolerances.pivotError ? 'error' : ''} x1="300" y1="115" x2={300 + pivotError * 900} y2="115"/><circle className="parent" cx="300" cy="115" r="8"/><circle className="child" cx={300 + pivotError * 900} cy="115" r="5"/><text x="312" y="101">parent pivot / child pivot</text><text x="310" y="275">axis · Z</text><text x="395" y="207">limit range</text></svg>
      </article>
      <aside className="example-panel"><span className="eyebrow">FIXTURE {String(fixtureIndex + 1).padStart(2, '0')} / {release === 'B' ? 'PASSIVE' : 'ACTIVE'}</span><h2>{fixture.title}</h2><p>{fixture.description}</p>
        <div className="transport"><button onClick={() => { session.start(); setStatus('running'); record('start'); }}>Start</button><button onClick={() => { session.pause(); setStatus('paused'); record('pause'); }}>Pause</button><button onClick={step}>Step</button><button onClick={() => { session.resume(); setStatus('running'); record('resume'); }}>Resume</button><button onClick={reset}>Reset</button></div>
        <div className="transport secondary"><button disabled={fixture.control !== 'impulse'} onClick={() => { if (!child) return; session.timeline.simulation.enqueueInputs([{ kind: 'impulse', bodyId: child.id, tick: snap.tick + 1, vector: [...(fixture.inputs.find((input) => input.kind === 'child-impulse')?.vector ?? [2.5, 0, 0])] }]); record('impulse queued'); }}>Apply impulse</button><button onClick={() => { snapshotRef.current = { tick: snap.tick, snapshot: snap }; record(`timeline tick ${snap.tick} captured`); }}>Capture tick</button><button disabled={!snapshotRef.current} onClick={() => { if (!session.seek(snapshotRef.current!.tick)) return; session.pause(); setStatus('paused'); record('exact tick restored'); refresh(); }}>Restore</button><button disabled={!snapshotRef.current || snap.tick <= (snapshotRef.current?.tick ?? 0)} onClick={() => { const expected = snap; const captured = snapshotRef.current!; if (!session.seek(captured.tick)) return; session.start(); while (session.timeline.simulation.world.tick < expected.tick) session.advance(1 / session.timeline.simulation.world.ticksPerSecond); session.pause(); setStatus('paused'); setReplayError(dynamicStateDivergence(expected, session.timeline.simulation.world.snapshot())); record('timeline replay'); refresh(); }}>Replay</button></div>
        {fixture.motor ? <label className="motor-control"><span>Requested state <b>{motorTarget.toFixed(2)} {fixture.motor.unit}</b></span><input type="range" step="0.05" min={fixture.motor.minimum} max={fixture.motor.maximum} value={motorTarget} onChange={(event) => { const value = Number(event.target.value); setMotorTarget(value); enqueueControl(value); record(`${fixture.control} request ${value}`); }}/><small>Physically achieved {effortControl ? 'response' : 'state'} <b>{achieved.toFixed(3)} {achievedUnit}</b>{effortControl ? ' · bounded effort produces motion, not an assigned pose' : ` · error ${Math.abs(requested - achieved).toFixed(3)}`}</small></label> : <div className="passive-note">Passive fixture — no active motor command</div>}
        <h3>Joint telemetry</h3><dl className="joint-telemetry"><div><dt>Kind / stable ID</dt><dd>{joint?.kind ?? '—'} · {joint?.id ?? '—'}</dd></div><div><dt>Parent / child</dt><dd>{joint?.parentEntityId ?? '—'} / {joint?.childEntityId ?? '—'}</dd></div><div><dt>Parent pivot</dt><dd>{joint?.parentAnchorWorld?.map((v) => v.toFixed(3)).join(', ') ?? '—'}</dd></div><div><dt>Child pivot</dt><dd>{joint?.childAnchorWorld?.map((v) => v.toFixed(3)).join(', ') ?? '—'}</dd></div><div><dt>Coordinate / limits</dt><dd>{coordinate.toFixed(3)} / {limits.map((v) => Number.isFinite(v) ? v.toFixed(3) : '∞').join(' … ')}</dd></div><div><dt>Max pivot error</dt><dd>{maximumPivotErrorRef.current.toExponential(2)}</dd></div><div><dt>Tick / replay divergence</dt><dd>{snap.tick} / {replayError?.toExponential(2) ?? 'not run'}</dd></div></dl>
        <h3>Live proof</h3><ul className="assertions">{assertions.map(([label, pass]) => <li className={pass === undefined ? 'pending' : pass ? 'pass' : 'fail'} key={label}><span>{pass === undefined ? '·' : pass ? '✓' : '!'}</span>{label}</li>)}</ul>
        <details open><summary>Capability profile & emitted input log</summary><pre>{JSON.stringify(fixture.capabilities, null, 2)}</pre><ol>{log.map((entry, i) => <li key={`${i}-${entry}`}>{entry}</li>)}</ol></details>
      </aside>
    </section>
  </main>;
}
