import { parseXyzDslDeclaration, parseXyzDslDocument } from '../xyzdsl/parser';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';

export type TransactionSourceNamespacePolicy = 'append' | 'consume-primary-namespaces';

export interface SecondaryTransactionSourceDeclaration {
  source: string;
}
export interface ComposeTransactionSecondaryStream {
  declarations: readonly SecondaryTransactionSourceDeclaration[] | string;
  id?: string;
  playbackCursor?: number;
}

export interface ComposeTransactionSourcesOptions {
  playbackCursor?: number;
  namespacePolicy?: TransactionSourceNamespacePolicy;
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
