import type { AxisName, XyzDslAxisSpec, XyzDslBoxSpec, ParseDiagnostic, ParseResult, SpatialObject, XyzDslDeclarationOrigin } from './types';
import { parseObjectProperties } from './objectDeclarationParser';
import { parseIntentPath, parseXyzDslPath, parsePathAxisSpec, parsePathBoxSpec, parsePathNumber, canonicalNamespacePath } from './pathParser';

const DECLARATION_PATTERN = /^\s*"(?<box>[^"]+)"\s*:\s*"(?<properties>[^"]*)"\s*$/;

export function parseCompactNumber(raw: string): number {
  return parsePathNumber(raw);
}

export function parseAxisSpec(raw: string, axis: AxisName): XyzDslAxisSpec {
  return parsePathAxisSpec(raw, axis);
}

export function parseBoxSpec(source: string): XyzDslBoxSpec {
  return parsePathBoxSpec(source);
}

export function parseXyzDslDeclaration(line: string, lineNumber = 1, origin?: XyzDslDeclarationOrigin): ParseResult<SpatialObject> {
  const match = line.match(DECLARATION_PATTERN);
  const diagnostics: ParseDiagnostic[] = [];

  if (!match?.groups) {
    return {
      ok: false,
      diagnostics: [
        {
          line: lineNumber,
          source: line,
          message: 'Declaration must look like "+2+4/+0+6/+1+3" : "geometry: box; color: blue; metalness: 0.1".',
        },
      ],
    };
  }

  try {
    const properties = parseObjectProperties(match.groups.properties);
    const intentPath = properties.intent ? parseIntentPath(match.groups.box) : undefined;
    const path = intentPath ? {
      source: match.groups.box,
      namespace: intentPath.namespace,
      canonicalPath: `${canonicalNamespacePath(intentPath.namespace)}${intentPath.coordinate.map((value) => `${value < 0 ? '-' : '+'}${Math.abs(value)}`).join('/')}`,
      isDeclarationOnly: false,
    } : parseXyzDslPath(match.groups.box);

    return {
      ok: true,
      value: {
        id: path.namespace.length > 0 ? path.canonicalPath : `node-${lineNumber}`,
        source: line,
        path,
        namespace: path.namespace,
        box: path.box,
        material: properties.material,
        physics: properties.physics,
        geometry: properties.geometry,
        transform: properties.transform,
        reference: properties.reference,
        content: properties.content,
        declarationOnly: path.isDeclarationOnly,
        lineNumber,
        conditional: path.conditional,
        intent: properties.intent && intentPath ? { mode: properties.intent, coordinate: intentPath.coordinate } : undefined,
        origin,
      },
      diagnostics: properties.diagnostics.map((message) => ({ line: lineNumber, source: line, message })),
    };
  } catch (error) {
    diagnostics.push({
      line: lineNumber,
      source: line,
      message: error instanceof Error ? error.message : 'Unknown parse error.',
    });

    return { ok: false, diagnostics };
  }
}

export function parseXyzDslDocument(source: string, originsByLine: ReadonlyMap<number, XyzDslDeclarationOrigin> = new Map()): ParseResult<SpatialObject[]> {
  const objects: SpatialObject[] = [];
  const diagnostics: ParseDiagnostic[] = [];

  source
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .forEach(({ line, lineNumber }) => {
      const result = parseXyzDslDeclaration(line, lineNumber, originsByLine.get(lineNumber));

      diagnostics.push(...result.diagnostics);

      if (result.ok && result.value) {
        objects.push({ ...result.value, id: result.value.namespace.length > 0 ? result.value.id : `node-${objects.length + 1}` });
      }
    });

  return {
    ok: diagnostics.length === 0,
    value: objects,
    diagnostics,
  };
}
