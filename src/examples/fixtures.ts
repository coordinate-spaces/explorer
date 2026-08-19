import type { ArticulationCapabilities } from '../physics/articulationCapabilities';

export interface ArticulationFixture {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly capabilities: ArticulationCapabilities;
  readonly tolerance: number;
  readonly impulse: readonly [number, number, number];
  readonly motor?: { readonly minimum: number; readonly maximum: number; readonly initial: number };
}

export const passivePendulumSource = [
  '"Pendulum/+0+1/+0+1/+0+1" : ""',
  '"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static; color: 0x22304a"',
  '"Pendulum/Rod/+83c+20c/+304c+5/+45c+10c" : "body: Rod; mass: 1; color: 0xf6c453; rotation: 0,0,10; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -75 75; joint-damping: 0.08"',
].join('\n');
