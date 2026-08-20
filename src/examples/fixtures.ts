import type { ArticulationCapabilities } from '../physics/articulationCapabilities';
import type { JointDefinition } from '../physics/types';

export type ExampleInput =
  | { readonly tick: number; readonly kind: 'child-impulse'; readonly vector: readonly [number, number, number]; readonly jointIndex?: number }
  | { readonly tick: number; readonly kind: 'joint-position-target' | 'joint-velocity-target' | 'joint-effort'; readonly value: number; readonly jointIndex?: number; readonly controllerPriority?: number; readonly blendWeight?: number; readonly exclusive?: boolean };

export type ExampleControl = 'impulse' | 'position' | 'velocity' | 'effort' | 'touch' | 'direct' | 'competing';

export interface ExampleTolerances {
  readonly pivotError: number; readonly limitOvershoot: number; readonly staticRootDrift: number;
  readonly fixedRelativeTransform: number; readonly prismaticOffAxis: number; readonly reconciliation: number;
  readonly replayDivergence: number; readonly targetConvergence: number; readonly maximumSpeed: number;
  readonly maximumAppliedEffort: number; readonly contactObstruction: number; readonly requestedAchieved: number;
  readonly motorReplayDivergence: number;
}

export interface ArticulationFixture {
  readonly id: string; readonly title: string; readonly description: string; readonly source: string;
  readonly capabilities: ArticulationCapabilities; readonly ticks: number; readonly inputs: readonly ExampleInput[];
  readonly snapshotTicks: readonly number[]; readonly tolerances: ExampleTolerances;
  readonly expectedTransitions: { readonly enter: number; readonly stay: number; readonly leave: number };
  readonly expectedJointKinds: readonly JointDefinition['kind'][];
  readonly control?: ExampleControl;
  readonly motor?: { readonly minimum: number; readonly maximum: number; readonly initial: number; readonly unit: 'deg' | 'rad/s' | 'N·m' };
  /** Some physical examples intentionally must not achieve the request. */
  readonly expectTargetConvergence?: boolean;
}

export const defaultTolerances: ExampleTolerances = {
  pivotError: 0.04, limitOvershoot: 0.04, staticRootDrift: 1e-9, fixedRelativeTransform: 0.04,
  prismaticOffAxis: 0.04, reconciliation: 0.04, replayDivergence: 1e-6, targetConvergence: 0.15,
  maximumSpeed: 20, maximumAppliedEffort: 24, contactObstruction: 0.12, requestedAchieved: 0.15,
  motorReplayDivergence: 1e-6,
};

const root = (name: string) => `"${name}/+0+1/+0+1/+0+1" : ""`;
const body = (path: string, size: string, properties: string) => `"${path}/${size}" : "${properties}"`;

export const hingeSource = (name: string, options: { limits?: string; motor?: string; obstacle?: boolean } = {}) => [
  root(name),
  body(`${name}/Frame`, '+45c+10c/+8+1/+45c+10c', `body: Frame; physics-mode: static; color: 0x22304a`),
  body(`${name}/Panel`, '+83c+20c/+304c+5/+45c+10c', `body: Panel; mass: 1; color: 0xf6c453; rotation: 0,0,10; joint: revolute; joint-parent: ${name}/Frame/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: ${options.limits ?? '-75 75'}; joint-damping: 0.08${options.motor ? `; ${options.motor}` : ''}`),
  ...(options.obstacle ? [body(`${name}/Obstacle`, '+75c+10c/+30c+2/+45c+10c', 'body: Obstacle; physics-mode: static; color: 0xe45b5b')] : []),
].join('\n');

export const passivePendulumSource = hingeSource('Pendulum');

export const fixedSource = [root('Assembly'), body('Assembly/Base', '+0+2/+0+1/+0+2', 'body: Base; physics-mode: static; color: 0x22304a'), body('Assembly/Beam', '+0+2/+1+3/+0+1', 'body: Beam; mass: 1; color: 0x62c4a5; joint: fixed; joint-parent: Assembly/Base/; joint-anchor: 1 1 1')].join('\n');
export const prismaticSource = [root('Drawer'), body('Drawer/Case', '+0+3/+0+1/+0+3', 'body: Case; physics-mode: static; color: 0x22304a'), body('Drawer/Tray', '+0+2/+1+2/+0+2', 'body: Tray; mass: 1; gravity-scale: 0; color: 0x62c4a5; joint: prismatic; joint-parent: Drawer/Case/; joint-anchor: 1 1 1; joint-axis: 1 0 0; joint-limits: -1 1; joint-damping: .2')].join('\n');
export const sphericalSource = [root('Spherical'), body('Spherical/Anchor', '+0+1/+2+1/+0+1', 'body: Anchor; physics-mode: static; color: 0x22304a'), body('Spherical/Load', '+0+1/+0+2/+0+1', 'body: Load; mass: 2; color: 0xe879f9; joint: spherical; joint-parent: Spherical/Anchor/; joint-anchor: .5 2 .5')].join('\n');
export const twoLinkSource = [root('Chain'), body('Chain/Anchor', '+0+1/+3+1/+0+1', 'body: Anchor; physics-mode: static'), body('Chain/Upper', '+0+1/+1+2/+0+1', 'body: Upper; mass: 1; joint: revolute; joint-parent: Chain/Anchor/; joint-anchor: .5 2 .5; joint-axis: 0 0 1; joint-limits: -120 120'), body('Chain/Lower', '+0+1/+0+2/+0+1', 'body: Lower; mass: 1; joint: revolute; joint-parent: Chain/Upper/; joint-anchor: .5 2 .5; joint-axis: 0 0 1; joint-limits: -120 120')].join('\n');
