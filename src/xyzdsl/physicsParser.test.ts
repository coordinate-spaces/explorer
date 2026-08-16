import { describe, expect, it } from 'vitest';
import { parseXyzDslDocument } from './parser';
import { resolveXyzDslDocument } from './resolveDocument';

describe('XYZDSL physics properties', () => {
  it('parses the complete vocabulary', () => {
    const parsed = parseXyzDslDocument('"Body/+0+1/+0+1/+0+1" : "physics-mode: kinematic; mass: 2.5; friction: .4; restitution: .2; linear-damping: 1; gravity-scale: -1; ccd: true; can-sleep: false; lock-translations: x,z; lock-rotations: all; sensor: true; collision-groups: 15"');
    expect(parsed.ok).toBe(true);
    expect(parsed.value?.[0].physics).toMatchObject({ 'physics-mode': 'kinematic', mass: 2.5, ccd: true, 'lock-translations': [true, false, true] });
  });

  it.each(['mass: -1', 'friction: 2', 'ccd: yes', 'physics-mode: flying', 'lock-rotations: x,q', 'mass: Infinity', 'density: -1', 'collision-groups: 1.5'])(
    'diagnoses malformed %s', (property) => {
      const parsed = parseXyzDslDocument(`"+0+1/+0+1/+0+1" : "${property}"`);
      expect(parsed.ok).toBe(false);
      expect(parsed.diagnostics[0].line).toBe(1);
    },
  );

  it('inherits and conditionally overrides individual fields', () => {
    const parsed = parseXyzDslDocument('"Part/" : "mass: 8; friction: .2; ccd: true"\n"Part/+0+1/+0+1/+0+1" : "friction: .5"\n"Part/+touch" : "restitution: .9"');
    const resolved = resolveXyzDslDocument(parsed.value!);
    expect(resolved.objects[0].physics).toMatchObject({ mass: 8, friction: .5, ccd: true });
    expect(resolved.variants[0].properties.physics.restitution).toBe(.9);
  });
});
