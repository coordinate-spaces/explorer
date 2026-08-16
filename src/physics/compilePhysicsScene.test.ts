import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { compilePhysicsScene } from './compilePhysicsScene';

describe('compilePhysicsScene', () => {
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
