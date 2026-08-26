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

function namedInstanceIdentity(namespace: readonly string[]): string | undefined {
  return namespace.length > 0 ? `instance:${canonicalNamespacePath([...namespace])}` : undefined;
}

function primaryNamedInstanceIdentities(primaryXyzDslSource: string): Set<string> {
  const parsed = parseXyzDslDocument(primaryXyzDslSource);
  return new Set((parsed.value ?? [])
    .filter((object) => !object.declarationOnly)
    .map((object) => namedInstanceIdentity(object.namespace))
    .filter((identity): identity is string => identity !== undefined));
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

function tenantDeclarations(lines: readonly string[], primaryNamespaces: ReadonlySet<string>): Array<{
  line: string;
  identity?: string;
}> {
  return lines.flatMap((line) => {
    const consumer = secondaryConsumerLine(line, primaryNamespaces);
    if (!consumer) return [];

    const declaration = parseXyzDslDeclaration(consumer).value;
    return declaration ? [{ line: consumer, identity: namedInstanceIdentity(declaration.namespace) }] : [];
  });
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
  const occupiedIdentities = primaryNamedInstanceIdentities(primaryXyzDslSource);
  const policy = options.namespacePolicy ?? 'consume-primary-namespaces';
  const composedSecondarySources = secondaryStreams.flatMap((stream) => {
    const lines = declarationSources(stream.declarations);
    const cursor = clampCursor(stream.playbackCursor ?? options.playbackCursor, lines.length);
    const visibleLines = lines.slice(0, cursor);

    if (policy === 'append') {
      return visibleLines;
    }

    const declarations = tenantDeclarations(visibleLines, primaryNamespaces);
    const tenantIdentities = new Set(declarations
      .map(({ identity }) => identity)
      .filter((identity): identity is string => identity !== undefined));
    const blockedIdentities = new Set([...tenantIdentities].filter((identity) => occupiedIdentities.has(identity)));

    tenantIdentities.forEach((identity) => occupiedIdentities.add(identity));
    return declarations.flatMap(({ line, identity }) => identity && blockedIdentities.has(identity) ? [] : [line]);
  });

  return [primary, composedSecondarySources.join('\n')]
    .filter((source) => source.trim().length > 0)
    .join('\n');
}
