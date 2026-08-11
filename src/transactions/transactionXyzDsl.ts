import { parseXyzDslDocument } from '../xyzdsl/parser';
import type { ParseDiagnostic, XyzDslDeclarationOrigin } from '../xyzdsl/types';
import type { XyzDslTransaction, PrimaryHistoricalBaselineXyzDsl, RejectedTransaction, SecondaryKeyReference } from './types';

// Remote transaction transport/validation can append either slash-prefixed
// zero/equal filler or a terminal equals marker with optional zero filler on
// the final axis size. This filler must not be stored as part of the renderable spatial
// declaration path. Keep this path-scoped: memo/content values may legitimately
// contain "=" and should not use this cleanup rule.
const TRAILING_FILLER_PATTERN = /\/[0=]+$/;
const TERMINAL_AXIS_SIZE_FILLER_PATTERN = /(?<prefix>\+\d+\+)(?<size>[1-9]\d*?)0*=$/;
const MAX_MEMO_PREVIEW_LENGTH = 120;

function transactionFallbackId(transaction: XyzDslTransaction, index: number): string {
  return [transaction.time, trimTransactionPathFiller(transaction.to), transaction.series ?? 'none', index].join(':');
}

function previewMemo(memo: string): string {
  const compact = memo.replace(/\s+/g, ' ').trim();
  return compact.length > MAX_MEMO_PREVIEW_LENGTH
    ? `${compact.slice(0, MAX_MEMO_PREVIEW_LENGTH - 1)}…`
    : compact;
}

export function trimTransactionPathFiller(path: string): string {
  return path
    .trim()
    .replace(TRAILING_FILLER_PATTERN, '')
    .replace(TERMINAL_AXIS_SIZE_FILLER_PATTERN, '$<prefix>$<size>');
}

export function trimTransactionMemoFiller(memo: string): string {
  return memo.trim();
}

export function normalizeXyzDslTransaction(transaction: XyzDslTransaction): XyzDslTransaction {
  const destination = transaction.to ?? '';

  return {
    ...transaction,
    // Base64 public keys can end in text that resembles terminal path filler
    // (for example, "+1+10="). Keep them raw so node discovery can identify
    // secondary-key references before any spatial-path normalization occurs.
    to: secondaryPublicKeyCandidate(destination) ? destination : trimTransactionPathFiller(destination),
  };
}

export function normalizeXyzDslTransactions(transactions: readonly XyzDslTransaction[]): XyzDslTransaction[] {
  return transactions.map(normalizeXyzDslTransaction);
}

function isPlainHttpUrlMemo(memo: string): boolean {
  try {
    const url = new URL(memo);
    return memo.trim() === memo && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function encodeXyzDslContentValue(value: string): string {
  return encodeURIComponent(value);
}

function memoToContentProperties(memo: string): string {
  if (isPlainHttpUrlMemo(memo)) {
    return `content-kind: url; content-url-uri: ${encodeXyzDslContentValue(memo)}`;
  }

  return `content-kind: text; content-text-uri: ${encodeXyzDslContentValue(memo)}`;
}

function secondaryPublicKeyCandidate(value: string): string | undefined {
  const trimmed = value.trim();

  const isBase64PublicKey = /^[A-Za-z0-9+/]{43}=$/.test(trimmed);
  const isHexPublicKey = /^[A-Fa-f0-9]{64}$/.test(trimmed);

  return isBase64PublicKey || isHexPublicKey ? trimmed : undefined;
}

function publicKeyFromMemo(memo: string): string | undefined {
  const keyText = memo
    .replace(/^public[- ]?key\s*:\s*/i, '')
    .split(/[;\s]+/)
    .find(Boolean);

  return keyText ? secondaryPublicKeyCandidate(keyText) : undefined;
}

function secondaryKeyReferenceFromInvalidDeclaration(
  path: string,
  memo: string,
  transactionId: string,
  rawDestination = path,
  endpoints?: SecondaryNodeEndpoints,
): SecondaryKeyReference | undefined {
  const publicKey = secondaryPublicKeyCandidate(rawDestination)
    ?? secondaryPublicKeyCandidate(path)
    ?? publicKeyFromMemo(memo);

  if (!publicKey) {
    return undefined;
  }

  const endpoint = secondaryNodeEndpoint(memo, endpoints);
  if (!endpoint) return undefined;

  return {
    publicKey,
    endpoint,
    sourceTransactionId: transactionId,
    memoPreview: previewMemo(`${publicKey}: ${memo}`),
  };
}

function memoToXyzDslProperties(path: string, memo: string): string {
  if (!memo) {
    return memo;
  }

  const source = quoteXyzDslDeclaration(path, memo);
  const { valid } = parseValidXyzDsl(source);

  return valid ? memo : memoToContentProperties(memo);
}

function diagnosticsToReasons(diagnostics: readonly ParseDiagnostic[]): string[] {
  return diagnostics.map((diagnostic) => `Line ${diagnostic.line}: ${diagnostic.message}`);
}

function quoteXyzDslDeclaration(path: string, properties: string): string {
  return `"${path}" : "${properties.replace(/"/g, '\\"')}"`;
}

function parseValidXyzDsl(source: string) {
  const parsed = parseXyzDslDocument(source);
  const objects = parsed.value ?? [];
  const hasInvalidObject = objects.some((object) => !object.declarationOnly && !object.box && !object.conditional);

  return {
    parsed,
    valid: parsed.ok && objects.length > 0 && !hasInvalidObject,
  };
}

interface TransactionsToXyzDslSourceOptions {
  publicKey?: string;
  nodeEndpoints?: SecondaryNodeEndpoints;
}

export interface SecondaryNodeEndpoints {
  primary: string;
  secondary: string;
}

/** Keeps the final primary-transaction definition for each secondary public key. */
export function latestSecondaryKeyReferences(
  references: readonly SecondaryKeyReference[],
): SecondaryKeyReference[] {
  const latest = new Map<string, SecondaryKeyReference>();
  references.forEach((reference) => {
    latest.delete(reference.publicKey);
    latest.set(reference.publicKey, reference);
  });
  return [...latest.values()];
}

/** Resolves the node selector carried by a primary transaction defining a secondary key. */
export function secondaryNodeEndpoint(memo: string, endpoints?: SecondaryNodeEndpoints): string | undefined {
  const trimmed = memo.trim();
  if (!trimmed) return endpoints?.primary;
  const match = /^node\s*:\s*(.+)$/i.exec(trimmed);
  if (!match) return undefined;
  const selector = match[1].trim();
  if (/^primary$/i.test(selector)) return endpoints?.primary;
  if (/^secondary$/i.test(selector)) return endpoints?.secondary;
  const normalized = selector.replace(/^wss\/\//i, 'wss://');
  try {
    const url = new URL(normalized);
    return url.protocol === 'wss:' ? normalized : undefined;
  } catch {
    return undefined;
  }
}

export function transactionsToXyzDslSource(
  transactions: readonly XyzDslTransaction[],
  options: TransactionsToXyzDslSourceOptions = {},
): PrimaryHistoricalBaselineXyzDsl & {
  secondaryKeys: SecondaryKeyReference[];
  originsByLine: Map<number, XyzDslDeclarationOrigin>;
} {
  const accepted: string[] = [];
  const originsByLine = new Map<number, XyzDslDeclarationOrigin>();
  const rejected: RejectedTransaction[] = [];
  const secondaryKeys: SecondaryKeyReference[] = [];
  const publicKey = options.publicKey?.trim();
  transactions.forEach((transaction, index) => {
    if (publicKey && transaction.from !== publicKey) {
      return;
    }

    const memo = trimTransactionMemoFiller(transaction.memo ?? '');
    const rawDestination = transaction.to ?? '';
    const rawDestinationPublicKey = secondaryPublicKeyCandidate(rawDestination);
    // A Base64 public key can end with a path-filler-looking suffix like /0=.
    // Keep that raw destination intact for secondary-key references that carry
    // a node: memo property.
    const path = rawDestinationPublicKey && memo.includes('node:')
      ? rawDestinationPublicKey
      : trimTransactionPathFiller(rawDestination);
    const id = transactionFallbackId(transaction, index);

    if (!path) {
      return;
    }

    const isSecondaryDefinition = rawDestinationPublicKey
      && (!memo || /^node\s*:/i.test(memo));
    if (isSecondaryDefinition) {
      const secondaryKey = secondaryKeyReferenceFromInvalidDeclaration(
        path,
        memo,
        id,
        rawDestination,
        options.nodeEndpoints,
      );
      if (secondaryKey) {
        secondaryKeys.push(secondaryKey);
      } else {
        rejected.push({
          id,
          memoPreview: previewMemo(`${path}: ${memo}`),
          reasons: ['Secondary public-key node must be empty, primary, secondary, or a valid wss:// URL.'],
        });
      }
      return;
    }

    const properties = memoToXyzDslProperties(path, memo);
    const source = quoteXyzDslDeclaration(path, properties);
    const { parsed, valid } = parseValidXyzDsl(source);

    if (valid) {
      accepted.push(source);
      originsByLine.set(accepted.length, {
        sourceKind: 'baseline',
        publicKey,
        transactionId: transaction.signature,
        transactionTime: transaction.time,
        transactionAmount: transaction.amount,
        sourceOrder: accepted.length - 1,
      });
      return;
    }

    const secondaryKey = secondaryKeyReferenceFromInvalidDeclaration(
      path,
      memo,
      id,
      rawDestination,
      options.nodeEndpoints,
    );

    if (secondaryKey) {
      secondaryKeys.push(secondaryKey);
      return;
    }

    const reasons = diagnosticsToReasons(parsed.diagnostics);
    rejected.push({
      id,
      memoPreview: previewMemo(`${path}: ${memo}`),
      reasons: reasons.length > 0 ? reasons : ['Transaction path and memo did not form valid spatial declaration coordinates, namespaces, or properties.'],
    });
  });

  return {
    source: accepted.join('\n'),
    rejected,
    secondaryKeys,
    originsByLine,
  };
}
