import type { XyzDslPropertyDeclaration } from './propertyParser';
import type { XyzDslPhysicsMode, XyzDslPhysicsSpec } from './types';

export const SUPPORTED_PHYSICS_KEYS = [
  'body', 'joint', 'joint-parent', 'joint-anchor', 'joint-axis', 'joint-limits',
  'joint-damping', 'collide-connected',
  'control-target', 'control-scope', 'motor-stiffness', 'motor-damping', 'motor-max-torque',
  'physics-mode', 'mass', 'density', 'friction', 'restitution', 'linear-damping',
  'gravity-scale', 'ccd', 'can-sleep', 'lock-translations', 'lock-rotations',
  'sensor', 'physical-body', 'collision-groups', 'solver-groups',
  'max-speed', 'max-acceleration', 'max-deceleration', 'max-turn-rate',
  'arrival-radius', 'jump-speed', 'max-step-height', 'max-slope', 'air-control', 'max-fall-speed',
] as const;

const MODES = new Set<XyzDslPhysicsMode>(['dynamic', 'static', 'kinematic']);

export function parsePhysicsDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslPhysicsSpec {
  const result: XyzDslPhysicsSpec = { diagnostics: [] };
  const latest = new Map(declarations.map((entry) => [entry.property, entry.value]));
  const number = (key: keyof XyzDslPhysicsSpec, options: { min?: number; max?: number } = {}) => {
    const raw = latest.get(key);
    if (raw === undefined) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || (options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max)) {
      result.diagnostics.push(`Invalid ${key} "${raw}"; expected a finite number${options.min !== undefined ? ` >= ${options.min}` : ''}${options.max !== undefined ? ` and <= ${options.max}` : ''}.`);
      return;
    }
    (result as unknown as Record<string, unknown>)[key] = value;
  };
  const boolean = (key: keyof XyzDslPhysicsSpec) => {
    const raw = latest.get(key);
    if (raw === undefined) return;
    if (raw !== 'true' && raw !== 'false') {
      result.diagnostics.push(`Invalid ${key} "${raw}"; expected true or false.`);
      return;
    }
    (result as unknown as Record<string, unknown>)[key] = raw === 'true';
  };
  const axes = (key: 'lock-translations' | 'lock-rotations') => {
    const raw = latest.get(key);
    if (raw === undefined) return;
    const tokens = raw.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 1 && tokens[0] === 'none') result[key] = [false, false, false];
    else if (tokens.length === 1 && tokens[0] === 'all') result[key] = [true, true, true];
    else if (tokens.length > 0 && new Set(tokens).size === tokens.length && tokens.every((axis) => ['x', 'y', 'z'].includes(axis))) {
      result[key] = ['x', 'y', 'z'].map((axis) => tokens.includes(axis)) as [boolean, boolean, boolean];
    } else result.diagnostics.push(`Invalid ${key} "${raw}"; expected none, all, or a comma-separated subset of x,y,z.`);
  };
  const tuple = (key: 'joint-anchor' | 'joint-axis', length = 3) => {
    const raw = latest.get(key);
    if (raw === undefined) return;
    const values = raw.split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.length !== length || values.some((value) => !Number.isFinite(value))) {
      result.diagnostics.push(`Invalid ${key} "${raw}"; expected ${length} finite numbers.`);
      return;
    }
    (result as unknown as Record<string, unknown>)[key] = values;
  };

  const body = latest.get('body');
  if (body !== undefined) {
    if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(body)) result.body = body;
    else result.diagnostics.push(`Invalid body "${body}"; expected an identifier.`);
  }
  const joint = latest.get('joint');
  if (joint !== undefined) {
    if (joint === 'revolute') result.joint = joint;
    else result.diagnostics.push(`Invalid joint "${joint}"; Release A supports revolute only.`);
  }
  const jointParent = latest.get('joint-parent');
  if (jointParent !== undefined) result['joint-parent'] = jointParent.endsWith('/') ? jointParent : `${jointParent}/`;
  const controlTarget = latest.get('control-target');
  if (controlTarget !== undefined) result['control-target'] = controlTarget.endsWith('/') ? controlTarget : `${controlTarget}/`;
  const controlScope = latest.get('control-scope');
  if (controlScope !== undefined) {
    if (['body', 'chain', 'subtree', 'component'].includes(controlScope)) result['control-scope'] = controlScope as NonNullable<XyzDslPhysicsSpec['control-scope']>;
    else result.diagnostics.push(`Invalid control-scope "${controlScope}"; expected body, chain, subtree, or component.`);
  }
  tuple('joint-anchor'); tuple('joint-axis');
  const limits = latest.get('joint-limits');
  if (limits !== undefined) {
    const values = limits.split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.length !== 2 || values.some((value) => !Number.isFinite(value)) || values[0] > values[1]) result.diagnostics.push(`Invalid joint-limits "${limits}"; expected ordered minimum and maximum degrees.`);
    else result['joint-limits'] = values as [number, number];
  }
  number('joint-damping', { min: 0 });
  number('motor-stiffness', { min: 0 }); number('motor-damping', { min: 0 }); number('motor-max-torque', { min: 0 });

  const mode = latest.get('physics-mode');
  if (mode !== undefined) {
    if (MODES.has(mode as XyzDslPhysicsMode)) result['physics-mode'] = mode as XyzDslPhysicsMode;
    else result.diagnostics.push(`Invalid physics-mode "${mode}"; expected dynamic, static, or kinematic.`);
  }
  number('mass', { min: 0 });
  if (result.mass === 0) {
    result.diagnostics.push('Invalid mass "0"; expected a finite number > 0.');
    delete result.mass;
  }
  const density = latest.get('density');
  if (density !== undefined) {
    const value = Number(density);
    result.diagnostics.push(!Number.isFinite(value) || value < 0
      ? `Invalid density "${density}"; expected a finite number >= 0.`
      : 'The reserved density property is not supported; use mass in kilograms.');
  }
  number('friction', { min: 0, max: 1 });
  number('restitution', { min: 0, max: 1 });
  number('linear-damping', { min: 0 });
  number('gravity-scale');
  for (const key of ['max-speed', 'max-acceleration', 'max-deceleration', 'max-turn-rate', 'arrival-radius', 'jump-speed', 'max-step-height', 'max-fall-speed'] as const) number(key, { min: 0 });
  number('max-slope', { min: 0, max: 90 });
  number('air-control', { min: 0, max: 1 });
  number('collision-groups', { min: 0, max: 0xffffffff });
  number('solver-groups', { min: 0, max: 0xffffffff });
  for (const key of ['collision-groups', 'solver-groups'] as const) {
    if (result[key] !== undefined && !Number.isInteger(result[key])) {
      result.diagnostics.push(`Invalid ${key} "${latest.get(key)}"; expected an unsigned 32-bit integer.`);
      delete result[key];
    }
  }
  for (const key of ['ccd', 'can-sleep', 'sensor', 'physical-body', 'collide-connected'] as const) boolean(key);
  axes('lock-translations'); axes('lock-rotations');
  return result;
}
