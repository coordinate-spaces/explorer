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

/** Authored/resolved physics, deliberately separate from visual material. */
export interface XyzDslPhysicsSpec {
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
