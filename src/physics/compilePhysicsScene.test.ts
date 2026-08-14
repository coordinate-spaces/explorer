import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { compilePhysicsScene } from './compilePhysicsScene';

describe('compilePhysicsScene', () => {
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
});
