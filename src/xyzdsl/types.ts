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

export interface XyzDslPathSpec {
  source: string;
  namespace: string[];
  box?: XyzDslBoxSpec;
  canonicalPath: string;
  isDeclarationOnly: boolean;
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


export interface XyzDslMaterialSpec {
  color?: string | number;
  metalness?: number;
  roughness?: number;
  diagnostics: string[];
}

export interface XyzDslTransformSpec {
  rotation: [number, number, number];
  diagnostics: string[];
  declared?: boolean;
}

export type XyzDslModelFit = 'contain' | 'stretch';
export type XyzDslModelAlign = 'center' | 'floor';

export interface XyzDslModelSpec {
  source?: string;
  fit: XyzDslModelFit;
  align: XyzDslModelAlign;
  declared?: boolean;
  sourceDeclared?: boolean;
  fitDeclared?: boolean;
  alignDeclared?: boolean;
  diagnostics: string[];
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
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  reference: XyzDslReferenceSpec;
  content: XyzDslContentSpec;
  model: XyzDslModelSpec;
  declarationOnly: boolean;
  lineNumber: number;
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
