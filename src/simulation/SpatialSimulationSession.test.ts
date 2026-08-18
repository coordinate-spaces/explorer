import { describe, expect, it } from 'vitest';
import { BoxGeometry, Euler, Mesh, MeshBasicMaterial, Quaternion, Scene, Vector3 } from 'three';
import { spatialBaselineRevision } from '../transactions/AccumulativeSpatialTimeline';
import { SpatialSimulationSession } from './SpatialSimulationSession';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { spatialPrimitiveTransform } from '../scene/SpatialPrimitive';

const fallingBody = '"Body/+0+1/+10+1/+0+1":"physics-mode: dynamic; can-sleep: false"';
const bodyY = (session: SpatialSimulationSession) => session.frame().document.renderNodes[0].transform.position[1];

const contactSource = (cursorX: number) => [
  '"Target/+0+2/+0+2/+0+2":"physics-mode: static"',
  `"Cursor/+${cursorX}+1/+0+1/+0+1":""`,
].join('\n');
const contactOrigins = () => new Map<number, XyzDslDeclarationOrigin>([
  [1, { sourceKind: 'baseline' }],
  [2, { sourceKind: 'secondary', streamId: 'local-cursor' }],
]);

const documentedPendulum = [
  '"Pendulum/+0+1/+0+1/+0+1" : ""',
  '"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"',
  '"Pendulum/Ceiling/+0+4/+8+1/+0+1" : "body: Anchor; physics-mode: static"',
  '"Pendulum/Rod/+83c+20c/+304c+5/+45c+10c" : "body: Rod; mass: 1; rotation: 0,0,10; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -170 170; joint-damping: 0.05"',
].join('\n');

describe('application spatial simulation session', () => {
  it('renders the nested documented pendulum at its resolved world pose while retaining its pivot', () => {
    const session = new SpatialSimulationSession(documentedPendulum);
    const snapshot = session.timeline.simulation.world.snapshot();
    const rod = snapshot.definitions.find(({ entityId }) => entityId?.endsWith('body:Rod'))!;
    const initialX = session.timeline.simulation.world.frame().states.get(rod.id)!.position[0];

    expect(snapshot.joints).toEqual([
      expect.objectContaining({ kind: 'revolute', childEntityId: rod.entityId }),
    ]);

    session.start();
    const initialMeshTransform = spatialPrimitiveTransform(
      session.frame().document.renderNodes.find(({ id }) => id === rod.id)!,
    );
    const initialCoordinate = session.timeline.simulation.world.inspectArticulations!()[0].coordinate!;
    for (let tick = 0; tick < 360; tick += 1) {
      session.advance(1 / 60);
      const articulation = session.timeline.simulation.world.inspectArticulations!()[0];
      expect(articulation.tick).toBe(tick + 1);
      expect(articulation.hasActiveHandle).toBe(true);
      expect(articulation.pivotError).toBeLessThan(0.02);
      expect(articulation.error).toBeUndefined();
    }

    const state = session.timeline.simulation.world.frame().states.get(rod.id)!;
    const publishedRod = session.frame().document.renderNodes.find(({ id }) => id === rod.id)!;
    expect(publishedRod.namespacePath).toBe('Pendulum/Rod/');
    const meshTransform = spatialPrimitiveTransform(publishedRod);
    const transformedTop = new Vector3(0, 0.5, 0)
      .multiply(new Vector3(...meshTransform.scale))
      .applyEuler(new Euler(...meshTransform.rotation, 'XYZ'))
      .add(new Vector3(...meshTransform.position));
    expect(transformedTop.distanceTo(new Vector3(0.5, 8, 0.5))).toBeLessThan(0.02);
    expect(Math.abs(state.position[0] - initialX)).toBeGreaterThan(0.05);
    expect(session.timeline.simulation.world.snapshot().joints).toEqual([
      expect.objectContaining({ kind: 'revolute', childEntityId: rod.entityId }),
    ]);
    expect(publishedRod.transform.position).toEqual(state.position);
    const publishedOrientation = new Quaternion().setFromEuler(new Euler(...publishedRod.transform.rotation, 'XYZ'));
    expect(Math.abs(publishedOrientation.dot(new Quaternion(...state.orientation)))).toBeCloseTo(1, 6);
    const finalCoordinate = session.timeline.simulation.world.inspectArticulations!()[0].coordinate!;
    expect(Math.abs(finalCoordinate - initialCoordinate)).toBeGreaterThan(0.01);
    expect(meshTransform.position).not.toEqual(initialMeshTransform.position);
    expect(meshTransform.rotation).not.toEqual(initialMeshTransform.rotation);
    session.dispose();
  });

  it('publishes a late pendulum pose that mounts directly in the scene at the physics pivot', () => {
    const session = new SpatialSimulationSession(documentedPendulum);
    const rodId = session.timeline.simulation.world.snapshot().definitions
      .find(({ entityId }) => entityId?.endsWith('body:Rod'))!.id;
    session.start();
    for (let tick = 0; tick < 360; tick += 1) session.advance(1 / 60);

    const document = session.frame().document;
    const rod = document.renderNodes.find(({ id }) => id === rodId)!;
    const pose = spatialPrimitiveTransform(rod);
    const mountedScene = new Scene();
    const mountedRod = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    mountedRod.userData.fullStableNodeId = rodId;
    mountedRod.position.fromArray(pose.position);
    mountedRod.rotation.fromArray([...pose.rotation, 'XYZ']);
    mountedRod.scale.fromArray(pose.scale);
    mountedScene.add(mountedRod); // Same direct-child contract as SceneRoot/Canvas.
    mountedScene.updateMatrixWorld(true);

    const center = mountedRod.getWorldPosition(new Vector3());
    const pivot = new Vector3(...document.physicsJoints![0].articulation!.parentAnchorWorld!);
    const geometryTop = new Vector3(0, 0.5, 0).applyMatrix4(mountedRod.matrixWorld);
    expect(center.distanceTo(new Vector3(18.263, 2.5, 26.502))).toBeGreaterThan(10);
    expect(center.distanceTo(new Vector3(0.5, 5.5, 0.5))).toBeLessThan(4);
    expect(geometryTop.distanceTo(pivot)).toBeLessThan(0.02);
    expect(rod.renderTransform).toBe(rod.transform);
    session.dispose();
  });

  it('advances gravity while authored input is idle', () => {
    const session = new SpatialSimulationSession(fallingBody); const initial = bodyY(session);
    session.start(); session.advance(1 / 60); session.advance(1 / 60);
    expect(bodyY(session)).toBeLessThan(initial);
  });
  it('does not accrue paused wall time before resume', () => {
    const session = new SpatialSimulationSession(fallingBody); session.start(); session.advance(1 / 60); session.pause();
    const paused = session.frame().tick; expect(session.advance(10)).toBeUndefined();
    session.resume(); session.advance(1 / 60); expect(session.frame().tick).toBe(paused + 1);
  });
  it('produces stable fixed ticks at different render rates', () => {
    const fast = new SpatialSimulationSession(fallingBody); const slow = new SpatialSimulationSession(fallingBody);
    fast.start(); slow.start();
    for (let i = 0; i < 60; i += 1) fast.advance(1 / 60);
    for (let i = 0; i < 20; i += 1) slow.advance(1 / 20);
    expect(fast.frame().tick).toBe(slow.frame().tick); expect(bodyY(fast)).toBeCloseTo(bodyY(slow), 8);
  });
  it('reconstructs playback from its baseline and selected authored frame', () => {
    const revision = spatialBaselineRevision(fallingBody);
    const sought = new SpatialSimulationSession(fallingBody, undefined, revision);
    sought.start(); sought.advance(0.5);
    expect(sought.frame().tick).toBeGreaterThan(0);
    sought.reconstruct(fallingBody);
    expect(sought.frame().tick).toBe(0);

    const fresh = new SpatialSimulationSession(fallingBody, undefined, revision); fresh.start();
    sought.advance(0.1); fresh.advance(0.1);
    expect(sought.frame().tick).toBe(fresh.frame().tick);
    expect(bodyY(sought)).toBeCloseTo(bodyY(fresh), 8);
  });
  it('does not advance when a completed authored frame is reread or recompiled', () => {
    const session = new SpatialSimulationSession(fallingBody); session.start(); session.advance(1 / 60);
    const tick = session.frame().tick;
    const published = session.frame();
    expect(session.setInput(fallingBody)).toBe(published);
    expect(session.setInput(fallingBody)).toBe(published);
    expect(session.frame().tick).toBe(tick);
  });

  it('keeps a stationary cursor in contact queries while fixed steps continue', () => {
    const origins = contactOrigins();
    const session = new SpatialSimulationSession(contactSource(1), origins);
    session.start();

    session.advance(1 / 60);
    const first = session.frame().document.interactions?.find(({ streamId }) => streamId === 'local-cursor');
    session.advance(1 / 15);
    const later = session.frame().document.interactions?.find(({ streamId }) => streamId === 'local-cursor');

    expect(first?.state).toBeDefined();
    expect(later?.state).toBe(first?.state);
    expect(session.frame().tick).toBe(5);
  });

  it('reconciles cursor movement as authored kinematic input without adding physics ticks', () => {
    const origins = contactOrigins();
    const moved = new SpatialSimulationSession(contactSource(1), origins);
    const idle = new SpatialSimulationSession(contactSource(1), origins);
    moved.start(); idle.start();
    moved.advance(1 / 30); idle.advance(1 / 30);
    const tickBeforeMovement = moved.frame().tick;

    moved.setInput(contactSource(4), origins);
    expect(moved.frame().tick).toBe(tickBeforeMovement);
    expect(moved.frame().document.renderNodes.find(({ origin }) => origin?.sourceKind === 'secondary')?.box.x).toBe(4);

    moved.advance(1 / 10); idle.advance(1 / 10);
    expect(moved.frame().tick).toBe(idle.frame().tick);
  });

  it('continues through idle updates and stops only while explicitly paused or disposed', () => {
    const session = new SpatialSimulationSession(fallingBody);
    session.start();
    session.advance(1 / 30);
    const runningTick = session.frame().tick;
    session.advance(1 / 30);
    expect(session.frame().tick).toBeGreaterThan(runningTick);

    session.pause();
    const pausedTick = session.frame().tick;
    expect(session.advance(1)).toBeUndefined();
    expect(session.frame().tick).toBe(pausedTick);

    session.resume();
    session.advance(1 / 60);
    expect(session.frame().tick).toBe(pausedTick + 1);

    session.dispose();
    const stoppedTick = session.frame().tick;
    expect(session.advance(1)).toBeUndefined();
    expect(session.frame().tick).toBe(stoppedTick);
  });
});
