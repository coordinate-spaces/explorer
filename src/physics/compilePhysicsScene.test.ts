import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { compileArticulatedPhysicsScene, compilePhysicsScene } from './compilePhysicsScene';
import { Quaternion, Vector3 } from 'three';

describe('compilePhysicsScene', () => {
  const portablePendulum = (component = '+0+1/+0+1/+0+1', rotation = '') => `"Pendulum/${component}" : "${rotation}"
"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+45c+10c/+3+5/+45c+10c" : "body: Rod; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1"`;

  it('splits explicit bodies and resolves a revolute pivot into local frames', () => {
    const document = createSpatialDocument(`"Pendulum/+0+1/+0+1/+0+1" : ""
"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+45c+10c/+3+5/+45c+10c" : "body: Rod; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1"`);
    const scene = compileArticulatedPhysicsScene(document);
    expect(new Set(scene.bodies.map(({ entityId }) => entityId))).toEqual(new Set(['component:Pendulum/body:Anchor', 'component:Pendulum/body:Rod']));
    expect(scene.joints).toEqual([expect.objectContaining({ parentAnchor: [0, -0.5, 0], childAnchor: [0, 2.5, 0], parentAxis: [0, 0, 1], childAxis: [0, 0, 1] })]);
    expect(document.diagnostics.map(({ message }) => message)).not.toEqual(expect.arrayContaining([expect.stringContaining('Conflicting physics-mode')]));
  });
  it('resolves joint parents only within the child projection scope', () => {
    const source = `"Pendulum/+0+1/+0+1/+0+1" : ""
"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+45c+10c/+3+5/+45c+10c" : "body: Rod; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1"
"Pendulum/+10+1/+0+1/+0+1" : "physical-body: true"
"Pendulum/Anchor/+10+1/+8+1/+0+1" : "body: Anchor; physical-body: true; physics-mode: static"
"Pendulum/Rod/+10+1/+3+5/+0+1" : "body: Rod; physical-body: true"`;
    const origins = new Map([
      [1, { sourceKind: 'baseline' as const }], [2, { sourceKind: 'baseline' as const }], [3, { sourceKind: 'baseline' as const }],
      [4, { sourceKind: 'secondary' as const, streamId: 'remote-a' }], [5, { sourceKind: 'secondary' as const, streamId: 'remote-a' }], [6, { sourceKind: 'secondary' as const, streamId: 'remote-a' }],
    ]);
    const scene = compileArticulatedPhysicsScene(createSpatialDocument(source, { originsByLine: origins }));
    expect(scene.joints).toHaveLength(1);
    expect(scene.joints[0]).toMatchObject({
      parentEntityId: 'component:Pendulum/body:Anchor',
      childEntityId: 'component:Pendulum/body:Rod',
    });
  });
  it('keeps body-local frames identical under component translation and rotation', () => {
    const base = compileArticulatedPhysicsScene(createSpatialDocument(portablePendulum()));
    const translated = compileArticulatedPhysicsScene(createSpatialDocument(portablePendulum('+15+1/+2+1/+4+1')));
    const rotated = compileArticulatedPhysicsScene(createSpatialDocument(portablePendulum('+15+1/+2+1/+4+1', 'rotation: 20,35,-10')));
    expect(translated.joints).toEqual(base.joints);
    expect(rotated.joints).toEqual(base.joints);
    expect(translated.bodies.map(({ position }) => position)).not.toEqual(base.bodies.map(({ position }) => position));
    expect(rotated.bodies.map(({ orientation }) => orientation)).not.toEqual(translated.bodies.map(({ orientation }) => orientation));
  });

  it('rejects a parent outside the authored component', () => {
    const document = createSpatialDocument(`"Outside/+0+1/+8+1/+0+1" : "body: Anchor; physics-mode: static"
"Pendulum/+0+1/+0+1/+0+1" : ""
"Pendulum/Rod/+0+1/+3+5/+0+1" : "body: Rod; joint: revolute; joint-parent: Outside/; joint-anchor: 0 8 0; joint-axis: 0 0 1"`);
    expect(compileArticulatedPhysicsScene(document).joints).toEqual([]);
    expect(document.diagnostics.map(({ message }) => message)).toEqual(expect.arrayContaining([
      expect.stringContaining('Articulation properties are component-local'),
    ]));
  });
  it('rebases template-local parents for every materialized component instance', () => {
    const document = createSpatialDocument(`"Pendulum/" : ""
"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+45c+10c/+3+5/+45c+10c" : "body: Rod; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1"
"Left/+2+1/+0+1/+0+1" : "ref: Pendulum/"
"Right/+15+1/+2+1/+4+1" : "ref: Pendulum/; rotation: 20,35,-10"`);
    const scene = compileArticulatedPhysicsScene(document);
    expect(scene.joints).toHaveLength(2);
    expect(scene.joints.map(({ parentEntityId, childEntityId }) => ({ parentEntityId, childEntityId }))).toEqual([
      { parentEntityId: 'component:Left/body:Anchor', childEntityId: 'component:Left/body:Rod' },
      { parentEntityId: 'component:Right/body:Anchor', childEntityId: 'component:Right/body:Rod' },
    ]);
    const frames = scene.joints.map(({ id: _id, parentEntityId: _parent, childEntityId: _child, ...frame }) => frame);
    expect(frames[1]).toEqual(frames[0]);
    expect(document.diagnostics.map(({ message }) => message)).not.toEqual(expect.arrayContaining([
      expect.stringContaining('outside the child component'),
    ]));
  });
  it('scales materialized articulation anchors consistently with ref-scale bodies', () => {
    const document = createSpatialDocument(`"Pendulum/" : ""
"Pendulum/Anchor/+0+1/+8+1/+0+1" : "body: Anchor; physics-mode: static"
"Pendulum/Rod/+0+1/+3+5/+0+1" : "body: Rod; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1"
"Scaled/+10+2/+0+16/+2+2" : "ref: Pendulum/; ref-scale: true"`);
    const scene = compileArticulatedPhysicsScene(document);
    const joint = scene.joints[0];
    const endpoint = (entityId: string, anchor: [number, number, number]) => {
      const body = scene.bodies.find((entry) => entry.entityId === entityId)!;
      return new Vector3(...anchor).applyQuaternion(new Quaternion(...body.orientation!)).add(new Vector3(...body.position));
    };
    const parentPivot = endpoint(joint.parentEntityId, joint.parentAnchor);
    const childPivot = endpoint(joint.childEntityId, joint.childAnchor);
    expect(parentPivot.distanceTo(childPivot)).toBeLessThan(1e-9);
  });

  it('uses the concrete tree when lexical namespace segments have no node', () => {
    const document = createSpatialDocument(`"C/+0+1/+0+1/+0+1" : ""
"C/Group/+2+1/+1+1/+3+1" : ""
"C/Group/A/Parent/+0+1/+4+1/+0+1" : "body: Parent; physics-mode: static"
"C/Group/A/Child/+0+1/+1+3/+0+1" : "body: Child; joint: revolute; joint-parent: C/Group/A/Parent/; joint-anchor: 2.5 5 3.5; joint-axis: 0 0 1"`);
    const scene = compileArticulatedPhysicsScene(document);
    const joint = scene.joints[0];
    expect(joint.parentAnchor).toEqual([0, -0.5, 0]);
    expect(joint.childAnchor).toEqual([0, 1.5, 0]);
  });
  it('compiles body, collider, locks, groups, and no transaction-derived mass', () => {
    const origins = new Map([[1, { sourceKind: 'baseline' as const, transactionAmount: 999 }]]);
    const document = createSpatialDocument('"Body/+0+2/+0+2/+0+2" : "physics-mode: static; mass: 3; friction: .2; restitution: .4; linear-damping: 2; gravity-scale: .5; ccd: true; can-sleep: false; lock-translations: x; lock-rotations: y,z; sensor: true; collision-groups: 12; solver-groups: 34"', { originsByLine: origins });
    expect(compilePhysicsScene(document)[0]).toMatchObject({ mode: 'static', mass: 3, linearDamping: 2, gravityScale: .5, ccd: true, canSleep: false, enabledTranslations: [false, true, true], enabledRotations: [true, false, false], colliders: [{ friction: .2, restitution: .4, sensor: true, collisionGroups: 12, solverGroups: 34 }] });
    const legacy = createSpatialDocument('"Legacy/+0+1/+0+1/+0+1" : ""', { originsByLine: origins });
    expect(compilePhysicsScene(legacy)[0].mass).toBeUndefined();
  });

  it('compiles cones exactly and resolves compound mode conflicts', () => {
    const document = createSpatialDocument('"Thing/+0+1/+0+1/+0+1" : ""\n"Thing/Box/+0+1/+0+1/+0+1" : "physics-mode: static"\n"Thing/Cone/+1+1/+0+1/+0+1" : "geometry: cone; physics-mode: dynamic"');
    const definitions = compilePhysicsScene(document);
    expect(definitions.every((definition) => definition.mode === 'static')).toBe(true);
    expect(definitions[1].colliders?.[0].shape).toBe('cone');
    expect(document.diagnostics.map(({ message }) => message)).toEqual(expect.arrayContaining([expect.stringContaining('Conflicting physics-mode')]));
  });

  it('explains why negative-volume CSG tools cannot become compound colliders', () => {
    const document = createSpatialDocument('"Shape/+0+4/+0+4/+0+4" : ""\n"Shape/Cut/+1+2/+1+2/+1+2" : "operation: subtraction"');
    const definitions = compilePhysicsScene(document);
    expect(definitions.find(({ id }) => id.includes('Cut'))?.colliders).toEqual([]);
    expect(document.diagnostics.at(-1)?.message).toContain('positive primitive colliders');
  });
  it('includes union tools as positive compound colliders', () => {
    const document = createSpatialDocument('"Shape/+0+2/+0+2/+0+2" : ""\n"Shape/Added/+2+1/+0+1/+0+1" : "operation: union"');
    const added = compilePhysicsScene(document).find(({ id }) => id.includes('Added'));
    expect(added?.colliders).toHaveLength(1);
  });

  it('stream-scopes opted-in secondary rigid bodies', () => {
    const origins = new Map([
      [1, { sourceKind: 'baseline' as const }],
      [2, { sourceKind: 'secondary' as const, streamId: 'remote-a' }],
    ]);
    const definitions = compilePhysicsScene(createSpatialDocument('"Shared/+0+1/+0+1/+0+1" : ""\n"Shared/+2+1/+0+1/+0+1" : "physical-body: true"', { originsByLine: origins }));
    expect(new Set(definitions.map(({ entityId }) => entityId)).size).toBe(2);
    expect(definitions[1].entityId).toContain('secondary:remote-a:');
  });
  it('separates default sensor and physical members in one secondary component', () => {
    const sensorOrigins = new Map([
      [1, { sourceKind: 'baseline' as const }],
      [2, { sourceKind: 'secondary' as const, streamId: 'remote-a' }],
    ]);
    const physicalOrigins = new Map([
      [1, { sourceKind: 'baseline' as const }],
      [2, { sourceKind: 'secondary' as const, streamId: 'remote-a' }],
    ]);
    const sensor = compilePhysicsScene(createSpatialDocument(
      '"Ground/+0+1/+0+1/+0+1" : ""\n"Cursor/+0+1/+2+1/+0+1" : ""',
      { originsByLine: sensorOrigins },
    )).find(({ interactionIdentity }) => interactionIdentity?.namespace === 'Cursor/')!;
    const physical = compilePhysicsScene(createSpatialDocument(
      '"Ground/+0+1/+0+1/+0+1" : ""\n"Cursor/+2+1/+2+1/+0+1" : "physical-body: true"',
      { originsByLine: physicalOrigins },
    )).find(({ interactionIdentity }) => interactionIdentity?.namespace === 'Cursor/')!;
    expect(sensor).toMatchObject({ mode: 'kinematic', contributesToBounds: false, retainsPhysicsState: false,
      colliders: [{ sensor: true, solverGroups: 0 }] });
    expect(physical).toMatchObject({ mode: 'dynamic', contributesToBounds: true, retainsPhysicsState: true,
      colliders: [{ sensor: false }] });
    expect(physical.colliders![0].solverGroups).toBeUndefined();
    expect(sensor.entityId).not.toBe(physical.entityId);
  });
  it('does not attach cross-stream union tools to a baseline CSG body', () => {
    const origins = new Map([
      [1, { sourceKind: 'baseline' as const }],
      [2, { sourceKind: 'secondary' as const, streamId: 'remote-a' }],
    ]);
    const document = createSpatialDocument('"+0+2/+0+2/+0+2" : ""\n"+0+2/+0+2/+0+2" : "operation: union; physical-body: true"', { originsByLine: origins });
    expect(document.csgExpressions).toHaveLength(1);
    const definitions = compilePhysicsScene(document);
    expect(new Set(definitions.map(({ entityId }) => entityId)).size).toBe(2);
    expect(definitions.find(({ entityId }) => entityId?.includes('secondary:remote-a:'))?.entityId).toContain('secondary:remote-a:');
  });
  it('maps authored primitives to stable collider definitions', () => {
    const definitions = compilePhysicsScene(createSpatialDocument(`"Box/+0+2/+0+4/+0+6" : "geometry: box"
"Ball/+5+2/+0+2/+0+2" : "geometry: sphere"`));
    expect(definitions.map(({ colliders }) => colliders?.[0]?.shape)).toEqual(['cuboid', 'ball']);
    expect(definitions[0].colliders?.[0]).toMatchObject({ dimensions: [2, 4, 6], offset: [0, 0, 0] });
  });

  it('excludes CSG tools from collision volume', () => {
    const definitions = compilePhysicsScene(createSpatialDocument(`"Shape/+0+4/+0+4/+0+4" : "geometry: box"
"Shape/Cut/+1+2/+1+2/+1+2" : "operation: subtraction"`));
    expect(definitions.find(({ id }) => id.includes('Cut'))?.colliders).toEqual([]);
  });

  it('uses effective world scale for fitted reference colliders', () => {
    const document = createSpatialDocument(`"Panel/" : ""
"Panel/Part/+0+4/+0+2/+0+2" : ""
"Copy/+10+8/+0+4/+0+1" : "ref: Panel/; ref-scale: true"`);
    expect(compilePhysicsScene(document)[0].colliders?.[0].dimensions).toEqual([8, 4, 1]);
  });
});
