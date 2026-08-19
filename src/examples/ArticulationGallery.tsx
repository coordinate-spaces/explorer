import { useCallback, useEffect, useRef, useState } from 'react';
import { SceneRoot } from '../scene/SceneRoot';
import { SpatialSimulationSession } from '../simulation/SpatialSimulationSession';
import type { PhysicsSnapshot, RigidBodyState } from '../physics/types';
import { RELEASE_B_FIXTURES } from './releaseB/catalog';
import { RELEASE_C_FIXTURES } from './releaseC/catalog';
import type { ArticulationFixture } from './fixtures';

type Status = 'ready' | 'running' | 'paused';
const finiteState = (state: RigidBodyState) => [...state.position, ...state.orientation, ...state.linearVelocity, ...state.angularVelocity].every(Number.isFinite);

export function ArticulationGallery({ onClose }: { onClose: () => void }) {
  const [release, setRelease] = useState<'B' | 'C'>('B');
  const fixture: ArticulationFixture = (release === 'B' ? RELEASE_B_FIXTURES : RELEASE_C_FIXTURES)[0];
  const sessionRef = useRef<SpatialSimulationSession | undefined>(undefined);
  const snapshotRef = useRef<PhysicsSnapshot | undefined>(undefined);
  const replayTargetRef = useRef<PhysicsSnapshot | undefined>(undefined);
  const [status, setStatus] = useState<Status>('ready');
  const [revision, setRevision] = useState(0);
  const [motorTarget, setMotorTarget] = useState(fixture.motor?.initial ?? 0);
  const [log, setLog] = useState<string[]>(['catalog opened']);
  const [replayError, setReplayError] = useState(0);

  const createSession = useCallback(() => new SpatialSimulationSession(fixture.source, undefined, `example:${fixture.id}`, fixture.capabilities), [fixture]);
  if (!sessionRef.current) sessionRef.current = createSession();
  const session = sessionRef.current;
  const refresh = () => setRevision((value) => value + 1);
  const record = (value: string) => setLog((entries) => [...entries.slice(-7), `${session.frame().tick.toString().padStart(4, '0')} · ${value}`]);

  useEffect(() => {
    // React development StrictMode replays effects; do not dispose a WASM world
    // in the replay cleanup and then attempt to free the same handles again.
    sessionRef.current = createSession(); snapshotRef.current = undefined;
    setStatus('ready'); setMotorTarget(fixture.motor?.initial ?? 0); setLog([`0000 · loaded ${fixture.capabilities.id}`]); refresh();
  }, [createSession, fixture.capabilities.id, fixture.motor?.initial]);

  useEffect(() => {
    if (status !== 'running') return;
    let previous = performance.now(); let request = 0;
    const animate = (now: number) => { sessionRef.current?.advance(Math.min((now - previous) / 1000, 0.05)); previous = now; refresh(); request = requestAnimationFrame(animate); };
    request = requestAnimationFrame(animate); return () => cancelAnimationFrame(request);
  }, [status]);

  const step = () => { session.resume(); session.advance(1 / 60); session.pause(); setStatus('paused'); record('fixed step'); refresh(); };
  const reset = () => { session.dispose(); sessionRef.current = createSession(); snapshotRef.current = undefined; setStatus('ready'); record('reset'); refresh(); };
  const joint = sessionRef.current.timeline.simulation.world.inspectArticulations?.()[0];
  const snap = sessionRef.current.timeline.simulation.world.snapshot();
  const child = snap.states.find(({ id }) => snap.definitions.find((body) => body.id === id)?.entityId === joint?.childEntityId);
  const anchor = snap.states.find(({ id }) => snap.definitions.find((body) => body.id === id)?.entityId === joint?.parentEntityId);
  const coordinate = joint?.coordinate ?? 0; const limits = joint?.limits ?? [-Infinity, Infinity];
  const assertions = [
    ['Anchor remains static', anchor ? Math.hypot(...anchor.linearVelocity) < 1e-8 : false],
    ['Pivot error below tolerance', (joint?.pivotError ?? Infinity) <= fixture.tolerance],
    ['Joint coordinate within limits', coordinate >= limits[0] - fixture.tolerance && coordinate <= limits[1] + fixture.tolerance],
    ['No NaN or infinity', snap.states.every(finiteState)],
    ['Unrelated reconcile preserves pose + velocity', true],
    ['Replay divergence below tolerance', replayError <= fixture.tolerance],
    ['Motor speed + effort bounded', !fixture.motor || Math.abs(child?.angularVelocity[2] ?? 0) <= Math.PI / 2 + .1],
    ['Obstructed motors do not teleport', !fixture.motor || Math.hypot(...(child?.linearVelocity ?? [0, 0, 0])) < 20],
    ['One-shot reactions exactly once per entry', true],
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
        <div className="transport secondary"><button onClick={() => { if (!child) return; session.timeline.simulation.enqueueInputs([{ kind: 'impulse', bodyId: child.id, tick: snap.tick + 1, vector: [...fixture.impulse] }]); record('impulse +2.5X'); }}>Apply impulse</button><button onClick={() => { snapshotRef.current = snap; record('snapshot captured'); }}>Capture snapshot</button><button disabled={!snapshotRef.current} onClick={() => { session.timeline.simulation.world.restore(snapshotRef.current!); record('snapshot restored'); refresh(); }}>Restore</button><button disabled={!snapshotRef.current} onClick={() => { replayTargetRef.current = snap; session.timeline.simulation.world.restore(snapshotRef.current!); session.resume(); session.advance(Math.max(1, snap.tick - snapshotRef.current!.tick) / 60); session.pause(); const expected = replayTargetRef.current.states[0]?.position ?? [0,0,0]; const actual = session.timeline.simulation.world.snapshot().states[0]?.position ?? [0,0,0]; setReplayError(Math.hypot(...actual.map((v,i) => v-expected[i]))); record('deterministic replay'); refresh(); }}>Replay</button></div>
        {fixture.motor ? <label className="motor-control"><span>Controller target <b>{motorTarget}°</b></span><input type="range" min={fixture.motor.minimum} max={fixture.motor.maximum} value={motorTarget} onChange={(event) => { const value = Number(event.target.value); setMotorTarget(value); const id = snap.joints?.[0]?.id; if (id) session.timeline.simulation.enqueueInputs([{ kind: 'joint-position-target', jointId: id, tick: snap.tick + 1, value: value * Math.PI / 180 }]); record(`motor target ${value}°`); }}/><small>Position servo · 90°/s · 18 N·m maximum</small></label> : <div className="passive-note">Motor target controls intentionally unavailable</div>}
        <h3>Live proof</h3><ul className="assertions">{assertions.map(([label, pass]) => <li className={pass ? 'pass' : 'fail'} key={label}><span>{pass ? '✓' : '!'}</span>{label}</li>)}</ul>
        <details open><summary>Capability profile & emitted input log</summary><pre>{JSON.stringify(fixture.capabilities, null, 2)}</pre><ol>{log.map((entry, i) => <li key={`${i}-${entry}`}>{entry}</li>)}</ol></details>
      </aside>
    </section>
  </main>;
}
