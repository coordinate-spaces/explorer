import type { JointDefinition, PhysicsInput } from './types';

/** Release-neutral feature boundary for articulation. Keep this outside the UI. */
export interface ArticulationCapabilities {
  readonly id: 'release-b-passive' | 'release-c-active';
  readonly label: string;
  readonly activeMotors: boolean;
  readonly jointMotorInputs: boolean;
  readonly interactionMotorActuation: boolean;
  readonly cursorJointControllers: boolean;
}

export const RELEASE_B_PASSIVE_CAPABILITIES: ArticulationCapabilities = Object.freeze({
  id: 'release-b-passive', label: 'Release B · passive joints', activeMotors: false,
  jointMotorInputs: false, interactionMotorActuation: false, cursorJointControllers: false,
});

export const RELEASE_C_ACTIVE_CAPABILITIES: ArticulationCapabilities = Object.freeze({
  id: 'release-c-active', label: 'Release C · active articulation', activeMotors: true,
  jointMotorInputs: true, interactionMotorActuation: true, cursorJointControllers: true,
});

export const ARTICULATION_CAPABILITY_PROFILES = [
  RELEASE_B_PASSIVE_CAPABILITIES, RELEASE_C_ACTIVE_CAPABILITIES,
] as const;

export function validatePhysicsInputs(capabilities: ArticulationCapabilities, inputs: readonly PhysicsInput[]): void {
  if (!capabilities.jointMotorInputs && inputs.some(({ kind }) => kind.startsWith('joint-'))) {
    throw new Error(`${capabilities.label} rejects joint-addressed motor inputs.`);
  }
}

export function validateJointDefinitions(capabilities: ArticulationCapabilities, joints: readonly JointDefinition[]): void {
  if (!capabilities.activeMotors && joints.some(({ motor }) => motor !== undefined)) {
    throw new Error(`${capabilities.label} rejects motor-bearing joint definitions.`);
  }
}
