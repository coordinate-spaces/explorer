import { parseXyzDslDeclaration, parseXyzDslDocument } from '../xyzdsl/parser';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';

export type TransactionSourceNamespacePolicy = 'append' | 'consume-primary-namespaces';

export interface SecondaryTransactionSourceDeclaration {
  source: string;
}

export interface ComposeTransactionSecondaryStream {
  declarations: readonly SecondaryTransactionSourceDeclaration[] | string;
  id?: string;
  playbackCursor?: number;
  publicKey?: string;
  endpoint?: string;
  transactionId?: string;
  transactionTime?: number;
  transactionAmount?: number;
  /** Local development cursors may opt out of remote namespace-consumer filtering. */
  bypassNamespacePolicy?: boolean;
}

export interface ComposedXyzDslSource {
  source: string;
  originsByLine: Map<number, XyzDslDeclarationOrigin>;
}

export interface ComposeTransactionSourcesOptions {
  playbackCursor?: number;
  namespacePolicy?: TransactionSourceNamespacePolicy;
}

/**
 * Carries transaction provenance onto unchanged declarations in an edited copy
 * of a baseline. Entries are consumed in source order so duplicate declaration
 * text retains deterministic occurrence-based identity.
 */
export function originsForEditedSource(
  editedSource: string,
  baselineSource: string,
  baselineOrigins: ReadonlyMap<number, XyzDslDeclarationOrigin>,
): Map<number, XyzDslDeclarationOrigin> {
  const originsByDeclaration = new Map<string, XyzDslDeclarationOrigin[]>();
  sourceLines(baselineSource).forEach((line, index) => {
    const origin = baselineOrigins.get(index + 1);
    if (!origin || !line.trim()) return;
    const occurrences = originsByDeclaration.get(line) ?? [];
    occurrences.push(origin);
    originsByDeclaration.set(line, occurrences);
  });

  const remapped = new Map<number, XyzDslDeclarationOrigin>();
  sourceLines(editedSource).forEach((line, index) => {
    const origin = originsByDeclaration.get(line)?.shift();
    if (origin) remapped.set(index + 1, origin);
  });
  return remapped;
}

function declarationSources(declarations: readonly SecondaryTransactionSourceDeclaration[] | string): string[] {
  if (typeof declarations === 'string') {
    return declarations
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return declarations.map((declaration) => declaration.source.trim()).filter(Boolean);
}

function primaryDeclarationNamespaces(primaryXyzDslSource: string): Set<string> {
  const parsed = parseXyzDslDocument(primaryXyzDslSource);
  const namespaces = new Set<string>();

  (parsed.value ?? []).forEach((object) => {
    if (object.declarationOnly && object.namespace.length > 0) {
      namespaces.add(canonicalNamespacePath(object.namespace));
    }
  });

  return namespaces;
}

function namespaceIsPrimaryConsumer(namespace: readonly string[], primaryNamespaces: ReadonlySet<string>): boolean {
  if (namespace.length === 0) {
    return true;
  }

  return namespace.some((_, index) => primaryNamespaces.has(canonicalNamespacePath(namespace.slice(0, index + 1))));
}

function secondaryConsumerLine(line: string, primaryNamespaces: ReadonlySet<string>): string | undefined {
  const parsed = parseXyzDslDeclaration(line);

  if (!parsed.ok || !parsed.value || parsed.value.declarationOnly || !parsed.value.box) {
    return undefined;
  }

  return namespaceIsPrimaryConsumer(parsed.value.namespace, primaryNamespaces) ? line : undefined;
}

function clampCursor(cursor: number | undefined, lineCount: number): number {
  if (cursor === undefined) {
    return lineCount;
  }

  return Math.min(Math.max(Math.trunc(cursor), 0), lineCount);
}

export function composeTransactionSources(
  primaryXyzDslSource: string,
  secondaryStreams: readonly ComposeTransactionSecondaryStream[],
  options: ComposeTransactionSourcesOptions = {},
): string {
  const primary = primaryXyzDslSource;
  const primaryNamespaces = primaryDeclarationNamespaces(primaryXyzDslSource);
  const policy = options.namespacePolicy ?? 'consume-primary-namespaces';
  const composedSecondarySources = secondaryStreams.flatMap((stream) => {
    const lines = declarationSources(stream.declarations);
    const cursor = clampCursor(stream.playbackCursor ?? options.playbackCursor, lines.length);
    const visibleLines = lines.slice(0, cursor);

    if (policy === 'append') {
      return visibleLines;
    }

    return visibleLines.flatMap((line) => secondaryConsumerLine(line, primaryNamespaces) ?? []);
  });

  return [primary, composedSecondarySources.join('\n')]
    .filter((source) => source.trim().length > 0)
    .join('\n');
}

function sourceLines(source: string): string[] {
  return source.length > 0 ? source.split('\n') : [];
}

export function composeTransactionSourceBundle(
  primaryXyzDslSource: string,
  secondaryStreams: readonly ComposeTransactionSecondaryStream[],
  options: ComposeTransactionSourcesOptions = {},
  primaryOriginsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>,
): ComposedXyzDslSource {
  const primaryNamespaces = primaryDeclarationNamespaces(primaryXyzDslSource);
  const policy = options.namespacePolicy ?? 'consume-primary-namespaces';
  // Baseline line numbers are also editor line numbers. Preserve blank lines
  // verbatim so node metadata continues to address the original authoring text.
  const lines = sourceLines(primaryXyzDslSource);
  const originsByLine = new Map<number, XyzDslDeclarationOrigin>();
  const append = (line: string, origin: XyzDslDeclarationOrigin) => {
    lines.push(line);
    originsByLine.set(lines.length, { ...origin, sourceOrder: lines.length - 1 });
  };

  lines.forEach((line, index) => {
    if (line.trim().length > 0) {
      originsByLine.set(index + 1, primaryOriginsByLine?.get(index + 1) ?? { sourceKind: 'baseline', sourceOrder: index });
    }
  });
  secondaryStreams.forEach((stream) => {
    const declarationLines = declarationSources(stream.declarations);
    const cursor = clampCursor(stream.playbackCursor ?? options.playbackCursor, declarationLines.length);
    declarationLines.slice(0, cursor).forEach((line) => {
      const accepted = policy === 'append' || stream.bypassNamespacePolicy ? line : secondaryConsumerLine(line, primaryNamespaces);
      if (accepted) {
        append(accepted, {
          sourceKind: 'secondary',
          streamId: stream.id,
          publicKey: stream.publicKey,
          endpoint: stream.endpoint,
          transactionId: stream.transactionId,
          transactionTime: stream.transactionTime,
          transactionAmount: stream.transactionAmount,
        });
      }
    });
  });
  return { source: lines.join('\n'), originsByLine };
}

export function composeSpatialEditorSources(
  documentSource: string,
  secondaryStreams: readonly ComposeTransactionSecondaryStream[],
): string {
  return composeTransactionSources(documentSource, secondaryStreams, {
    namespacePolicy: 'consume-primary-namespaces',
  });
}

export function composeSpatialEditorSourceBundle(
  documentSource: string,
  secondaryStreams: readonly ComposeTransactionSecondaryStream[],
  primaryOriginsByLine?: ReadonlyMap<number, XyzDslDeclarationOrigin>,
): ComposedXyzDslSource {
  const bundle = composeTransactionSourceBundle(documentSource, secondaryStreams, {
    namespacePolicy: 'consume-primary-namespaces',
  }, primaryOriginsByLine);
  return bundle;
}
