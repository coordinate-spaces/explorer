import { describe, expect, it } from 'vitest';
import { parseXyzDslDocument } from './parser';
import { resolveXyzDslDocument } from './resolveDocument';

describe('XYZDSL physics properties', () => {
  it('parses experimental revolute articulation properties', () => {
    const parsed = parseXyzDslDocument('"Pendulum/Rod/+45c+10c/+3+5/+45c+10c" : "body: Rod; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -170 170; joint-damping: 0.05"');
    expect(parsed.value?.[0].physics).toMatchObject({ body: 'Rod', joint: 'revolute', 'joint-parent': 'Pendulum/Anchor/', 'joint-anchor': [0.5, 8, 0.5], 'joint-axis': [0, 0, 1], 'joint-limits': [-170, 170], 'joint-damping': 0.05 });
  });
  it.each([
    ['prismatic', 'joint-axis: 1 0 0; joint-limits: 0 3', [0, 3]],
    ['fixed', '', undefined],
    ['spherical', '', undefined],
  ] as const)('parses passive %s joints with kind-specific fields', (kind, extra, limits) => {
    const parsed = parseXyzDslDocument(`"A/+0+1/+0+1/+0+1" : "joint: ${kind}; joint-parent: Root/; joint-anchor: 0 1 0; ${extra}"`);
    expect(parsed.value?.[0].physics.joint).toBe(kind);
    expect(parsed.value?.[0].physics['joint-limits']).toEqual(limits);
  });

  it.each([
    ['fixed', 'joint-axis: 1 0 0'], ['spherical', 'joint-limits: -1 1'],
    ['prismatic', ''], ['fixed', 'joint-damping: 1'],
  ])('diagnoses invalid %s joint property combinations', (kind, extra) => {
    const parsed = parseXyzDslDocument(`"A/+0+1/+0+1/+0+1" : "joint: ${kind}; joint-parent: Root/; joint-anchor: 0 1 0; ${extra}"`);
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics.some(({ line }) => line === 1)).toBe(true);
  });
  it('parses the complete vocabulary', () => {
    const parsed = parseXyzDslDocument('"Body/+0+1/+0+1/+0+1" : "physics-mode: kinematic; mass: 2.5; friction: .4; restitution: .2; linear-damping: 1; gravity-scale: -1; ccd: true; can-sleep: false; lock-translations: x,z; lock-rotations: all; sensor: true; collision-groups: 15"');
    expect(parsed.ok).toBe(true);
    expect(parsed.value?.[0].physics).toMatchObject({ 'physics-mode': 'kinematic', mass: 2.5, ccd: true, 'lock-translations': [true, false, true] });
  });

  it.each(['mass: -1', 'mass: 0', 'friction: 2', 'ccd: yes', 'physics-mode: flying', 'lock-rotations: x,q', 'mass: Infinity', 'density: -1', 'collision-groups: 1.5'])(
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

  it('preserves physics authored on a compound ref instance', () => {
    const parsed = parseXyzDslDocument('"Template/" : ""\n"Template/Part/+0+1/+0+1/+0+1" : "mass: 2"\n"Copy/+2+1/+0+1/+0+1" : "ref: Template/; physics-mode: static"');
    const clone = resolveXyzDslDocument(parsed.value!).objects.find(({ materializedFrom }) => materializedFrom);
    expect(clone?.physics).toMatchObject({ 'physics-mode': 'static', mass: 2 });
  });
});
