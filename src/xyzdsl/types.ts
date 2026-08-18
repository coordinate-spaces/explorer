export type AxisName = 'x' | 'y' | 'z';

export interface XyzDslAxisSpec {
  axis: AxisName;
  offset: number;
  size: number;
}

export interface XyzDslBoxSpec {
  source: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

export type XyzDslInteractionState = 'touch' | 'breach';
export type XyzDslInteractionDirective = XyzDslInteractionState;

export interface XyzDslDirectiveSpec {
  name: XyzDslInteractionDirective;
  segmentIndex: number;
  scopeNamespace: string[];
}

export type XyzDslConditionalSpatialOverride =
  | { mode: 'inherit' }
  | { mode: 'translation'; magnitude: [number, number, number] }
  | { mode: 'weighted-translation' }
  | { mode: 'absolute-box'; box: XyzDslBoxSpec };

export interface XyzDslConditionalSpec {
  directives: XyzDslDirectiveSpec[];
  spatialOverride: XyzDslConditionalSpatialOverride;
  targetNamespace: string[];
}

export interface XyzDslDeclarationOrigin {
  sourceKind: 'baseline' | 'secondary';
  streamId?: string;
  publicKey?: string;
  endpoint?: string;
  transactionId?: string;
  transactionTime?: number;
  sourceOrder?: number;
  /** Transaction amount used as physical weight by weighted interaction directives. */
  transactionAmount?: number;
}

export interface XyzDslPathSpec {
  source: string;
  namespace: string[];
  box?: XyzDslBoxSpec;
  canonicalPath: string;
  isDeclarationOnly: boolean;
  conditional?: XyzDslConditionalSpec;
}

export type XyzDslIntentMode = 'absolute' | 'relative';

/** A controller instruction. Coordinates describe a target, never renderable geometry. */
export interface XyzDslIntentSpec {
  mode: XyzDslIntentMode;
  coordinate: [number, number, number];
}

export type XyzDslGeometryKind = 'box' | 'cylinder' | 'cone' | 'sphere';
export type XyzDslCsgOperation = 'union' | 'subtraction' | 'intersection';

export interface XyzDslGeometrySpec {
  kind: XyzDslGeometryKind;
  diagnostics: string[];
  declared?: boolean;
  kindDeclared?: boolean;
  'box-radius'?: number;
  puff?: number;
  operation?: XyzDslCsgOperation;
}


export type XyzDslTextureChannel = 'map' | 'roughnessMap' | 'normalMap' | 'bumpMap' | 'metalnessMap' | 'alphaMap';

export interface XyzDslTextureSpec {
  preset?: string;
  src?: string;
  repeat?: [number, number];
  rotation?: number;
  offset?: [number, number];
  strength?: number;
}

export interface XyzDslMaterialSpec {
  materialPreset?: string;
  semanticMaterial?: string;
  materialVariant?: string;
  materialPattern?: string;
  materialFinish?: string;
  textures?: Partial<Record<XyzDslTextureChannel, XyzDslTextureSpec>>;
  color?: string | number;
  metalness?: number;
  roughness?: number;
  reflectivity?: number;
  clearcoat?: number;
  opacity?: number;
  transmission?: number;
  ior?: number;
  diagnostics: string[];
}

export type XyzDslPhysicsMode = 'dynamic' | 'static' | 'kinematic';
export type XyzDslJointKind = 'revolute' | 'fixed' | 'prismatic' | 'spherical';

/** Authored/resolved physics, deliberately separate from visual material. */
export interface XyzDslPhysicsSpec {
  /** Explicit rigid-component boundary. Descendants inherit this body name. */
  body?: string;
  joint?: XyzDslJointKind;
  'joint-parent'?: string;
  /** Pivot in the containing component's immutable local coordinates. */
  'joint-anchor'?: [number, number, number];
  /** Direction in the containing component's immutable local coordinates. */
  'joint-axis'?: [number, number, number];
  /** Revolute limits in degrees; prismatic limits in project units. */
  'joint-limits'?: [number, number];
  'joint-damping'?: number;
  'collide-connected'?: boolean;
  'physics-mode'?: XyzDslPhysicsMode;
  /** Explicit rigid-body mass in kilograms. */
  mass?: number;
  friction?: number;
  restitution?: number;
  'linear-damping'?: number;
  'gravity-scale'?: number;
  ccd?: boolean;
  'can-sleep'?: boolean;
  'lock-translations'?: [boolean, boolean, boolean];
  'lock-rotations'?: [boolean, boolean, boolean];
  sensor?: boolean;
  /** Allows a secondary-stream declaration to be emitted into the physics world. */
  'physical-body'?: boolean;
  'collision-groups'?: number;
  'solver-groups'?: number;
  'max-speed'?: number;
  'max-acceleration'?: number;
  'max-deceleration'?: number;
  'max-turn-rate'?: number;
  'arrival-radius'?: number;
  'jump-speed'?: number;
  'max-step-height'?: number;
  'max-slope'?: number;
  'air-control'?: number;
  'max-fall-speed'?: number;
  diagnostics: string[];
}

export interface XyzDslTransformSpec {
  rotation: [number, number, number];
  diagnostics: string[];
  declared?: boolean;
}

export type XyzDslContentSpec =
  | { kind?: undefined; diagnostics: string[] }
  | { kind: 'text'; text: string; diagnostics: string[] }
  | { kind: 'url'; url: string; diagnostics: string[] };

export interface XyzDslReferenceSpec {
  targetPath?: string;
  scale?: boolean;
  diagnostics: string[];
}

export interface SpatialObject {
  id: string;
  source: string;
  path: XyzDslPathSpec;
  namespace: string[];
  box?: XyzDslBoxSpec;
  material: XyzDslMaterialSpec;
  physics: XyzDslPhysicsSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  reference: XyzDslReferenceSpec;
  content: XyzDslContentSpec;
  declarationOnly: boolean;
  lineNumber: number;
  origin?: XyzDslDeclarationOrigin;
  conditional?: XyzDslConditionalSpec;
  intent?: XyzDslIntentSpec;
  unionGroupId?: string;
}

export interface ParseDiagnostic {
  line: number;
  message: string;
  source: string;
}

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  diagnostics: ParseDiagnostic[];
}
