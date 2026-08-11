import { describe, expect, it } from 'vitest';
import {
  normalizeXyzDslTransaction,
  normalizeXyzDslTransactions,
  transactionToRemoteEditorSource,
  transactionsToRemoteEditorSource,
  transactionsToXyzDslSource,
  trimTransactionMemoFiller,
  trimTransactionPathFiller,
} from './transactionXyzDsl';
import type { XyzDslTransaction } from './types';

function transaction(memo: string, index = 0, to = `+${index}+1/+0+1/+0+1`, from?: string): XyzDslTransaction {
  return {
    time: 100 + index,
    from,
    to,
    amount: 1,
    fee: 0,
    memo,
  };
}

describe('transactionsToXyzDslSource', () => {
  it('preserves accepted transaction amounts as declaration provenance', () => {
    const result = transactionsToXyzDslSource([
      { ...transaction('geometry: sphere', 0, 'Ball/+0+1/+0+1/+0+1'), amount: 7 },
    ]);

    expect(result.originsByLine.get(1)).toMatchObject({
      sourceKind: 'baseline',
      transactionAmount: 7,
    });
  });

  it('accepts coordinate-less conditional directives as spatial declarations', () => {
    const result = transactionsToXyzDslSource([
      transaction('rotation: 90,90,0', 1, 'Rod/+touch'),
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.source).toContain('"Rod/+touch"');
  });
  it('maps the current primary-key transaction into a remote editor declaration', () => {
    const editorSource = transactionToRemoteEditorSource(
      transaction('color: cyan', 0, '+4+1/+2+1/+0+1', 'originating-key'),
      'originating-key',
    );

    expect(editorSource).toBe('"+4+1/+2+1/+0+1" : "color: cyan"');
    expect(transactionToRemoteEditorSource(
      transaction('color: cyan', 0, '+4+1/+2+1/+0+1', 'another-key'),
      'originating-key',
    )).toBe('');
  });

  it('maps all outgoing remote editor baseline declarations and filters other senders', () => {
    const editorSource = transactionsToRemoteEditorSource([
      transaction('color: cyan', 0, '+4+1/+2+1/+0+1', 'originating-key'),
      transaction('color: magenta', 1, '+5+1/+2+1/+0+1', 'other-key'),
      transaction('color: yellow', 2, '+6+1/+2+1/+0+1', 'originating-key'),
    ], 'originating-key');

    expect(editorSource).toBe('"+4+1/+2+1/+0+1" : "color: cyan"\n"+6+1/+2+1/+0+1" : "color: yellow"');
  });

  it('returns an empty remote editor source when the public key is blank', () => {
    expect(transactionsToRemoteEditorSource([
      transaction('color: cyan', 0, '+4+1/+2+1/+0+1', 'originating-key'),
    ], '   ')).toBe('');
  });

  it('builds valid XYZDSL coordinate declarations from transaction path and memo properties', () => {
    const result = transactionsToXyzDslSource([
      transaction('geometry: box', 0, '+0+1/+0+1/+0+1'),
    ]);

    expect(result.source).toBe('"+0+1/+0+1/+0+1" : "geometry: box"');
    expect(result.rejected).toEqual([]);
  });

  it('accepts namespaces and namespace declarations from transaction paths', () => {
    const result = transactionsToXyzDslSource([
      transaction('color: red', 0, 'Room/'),
      transaction('', 1, 'Room/Chair/+0+1/+0+1/+0+1'),
    ]);

    expect(result.source).toContain('"Room/" : "color: red"');
    expect(result.source).toContain('"Room/Chair/+0+1/+0+1/+0+1" : ""');
    expect(result.rejected).toEqual([]);
  });

  it('accepts plain-text memos as text content declarations', () => {
    const result = transactionsToXyzDslSource([
      transaction('Hello from a memo', 0, '+0+4/+0+2/+0+1'),
    ]);

    expect(result.source).toBe('"+0+4/+0+2/+0+1" : "content-kind: text; content-text-uri: Hello%20from%20a%20memo"');
    expect(result.rejected).toEqual([]);
  });

  it('accepts plain URL memos as URL content declarations', () => {
    const result = transactionsToXyzDslSource([
      transaction('https://example.com/view?x=1', 0, '+0+4/+0+2/+0+1'),
    ]);

    expect(result.source).toBe('"+0+4/+0+2/+0+1" : "content-kind: url; content-url-uri: https%3A%2F%2Fexample.com%2Fview%3Fx%3D1"');
    expect(result.rejected).toEqual([]);
  });

  it('treats non-http URL-like memos as text content', () => {
    const result = transactionsToXyzDslSource([
      transaction('javascript:alert(1)', 0, '+0+4/+0+2/+0+1'),
    ]);

    expect(result.source).toBe('"+0+4/+0+2/+0+1" : "content-kind: text; content-text-uri: javascript%3Aalert(1)"');
    expect(result.rejected).toEqual([]);
  });

  it('does not accept full spatial declarations embedded directly in memo text', () => {
    const result = transactionsToXyzDslSource([
      transaction('"+0+1/+0+1/+0+1" : "geometry: box"', 0, 'not-a-valid-xyzdsl-path'),
    ]);

    expect(result.source).toBe('');
    expect(result.rejected).toHaveLength(1);
  });

  it('rejects malformed transaction paths', () => {
    const result = transactionsToXyzDslSource([
      transaction('geometry: box', 0, '+0+1/+0+1'),
    ]);

    expect(result.source).toBe('');
    expect(result.rejected).toHaveLength(1);
  });

  it('trims filler from transaction to paths before parsing', () => {
    const result = transactionsToXyzDslSource([
      transaction('geometry: sphere; color: blue;', 0, '+2+6/+0+6/+1+13/000000000000000000000000000='),
    ]);

    expect(result.source).toBe('"+2+6/+0+6/+1+13" : "geometry: sphere; color: blue;"');
    expect(result.rejected).toEqual([]);
  });

  it('trims whitespace around memo properties', () => {
    expect(trimTransactionMemoFiller('  geometry: box  ')).toBe('geometry: box');
  });

  it('trims filler from transaction to paths', () => {
    expect(trimTransactionPathFiller('+2+6/+0+6/+1+13/000000000=')).toBe('+2+6/+0+6/+1+13');
  });

  it.each([
    ['+2+4/+6+6/+4+300000000000000000000000000000000=', '+2+4/+6+6/+4+3'],
    ['+2+4/+6+6/+4+300', '+2+4/+6+6/+4+300'],
    ['+2+4/+6+6/+4+3=', '+2+4/+6+6/+4+3'],
  ])('trims only terminal axis-size filler: %s', (path, expected) => {
    expect(trimTransactionPathFiller(path)).toBe(expected);
  });

  it('uses a trimmed terminal axis size when building a spatial declaration', () => {
    const result = transactionsToXyzDslSource([
      transaction('geometry: box', 0, '+2+4/+6+6/+4+300000000000000000000000000000000='),
    ]);

    expect(result.source).toBe('"+2+4/+6+6/+4+3" : "geometry: box"');
    expect(result.rejected).toEqual([]);
  });

  it.each([
    ['/000', '+2+6/+0+6/+1+13'],
    ['/000=', '+2+6/+0+6/+1+13'],
    ['/000000000=', '+2+6/+0+6/+1+13'],
    ['/=', '+2+6/+0+6/+1+13'],
  ])('trims trailing path filler suffix %s', (suffix, expected) => {
    expect(trimTransactionPathFiller(`+2+6/+0+6/+1+13${suffix}`)).toBe(expected);
  });

  it('preserves ordinary namespace terminators when trimming transaction paths', () => {
    expect(trimTransactionPathFiller('Room/')).toBe('Room/');
  });

  it('does not strip non-filler path text', () => {
    expect(trimTransactionPathFiller('Room/Chair')).toBe('Room/Chair');
  });

  it('normalizes transaction paths before transactions are stored at rest', () => {
    expect(normalizeXyzDslTransaction(transaction('geometry: box', 0, '+2+6/+0+6/+1+13/000000000='))).toMatchObject({
      memo: 'geometry: box',
      to: '+2+6/+0+6/+1+13',
    });
  });

  it('normalizes transaction collections used by historical secondary streams', () => {
    expect(normalizeXyzDslTransactions([
      transaction('geometry: box', 0, '+2+4/+6+6/+4+300000000000000000000000000000000='),
    ])).toMatchObject([
      { to: '+2+4/+6+6/+4+3' },
    ]);
  });

  it('preserves Base64 secondary-key destinations that resemble terminal axis filler', () => {
    const secondaryPublicKey = `${'A'.repeat(38)}+1+10=`;
    const transactions = normalizeXyzDslTransactions([
      transaction('node: wss://secondary.example/ws', 0, secondaryPublicKey),
    ]);
    const result = transactionsToXyzDslSource(transactions);

    expect(transactions[0]?.to).toBe(secondaryPublicKey);
    expect(result.secondaryKeys).toEqual([
      expect.objectContaining({
        publicKey: secondaryPublicKey,
      }),
    ]);
  });

  it('preserves text memo content ending with equals padding characters', () => {
    const result = transactionsToXyzDslSource([
      transaction('token==', 0, '+0+4/+0+2/+0+1'),
    ]);

    expect(result.source).toBe('"+0+4/+0+2/+0+1" : "content-kind: text; content-text-uri: token%3D%3D"');
    expect(result.rejected).toEqual([]);
  });

  it('preserves URL memo content containing query-string equals characters', () => {
    const result = transactionsToXyzDslSource([
      transaction('https://example.com/view?token=abc==', 0, '+0+4/+0+2/+0+1'),
    ]);

    expect(result.source).toBe('"+0+4/+0+2/+0+1" : "content-kind: url; content-url-uri: https%3A%2F%2Fexample.com%2Fview%3Ftoken%3Dabc%3D%3D"');
    expect(result.rejected).toEqual([]);
  });

  it('maps only outgoing transactions when a public key is provided', () => {
    const result = transactionsToXyzDslSource([
      transaction('color: red', 1, '+0+1/+0+1/+0+1', 'sender-key'),
      transaction('color: blue', 2, '+1+1/+0+1/+0+1', 'other-key'),
    ], { publicKey: 'sender-key' });

    expect(result.source).toBe('"+0+1/+0+1/+0+1" : "color: red"');
    expect(result.rejected).toEqual([]);
  });

  it('ignores incoming transactions sent to the public key', () => {
    const result = transactionsToXyzDslSource([
      transaction('color: red', 1, 'sender-key', 'other-key'),
    ], { publicKey: 'sender-key' });

    expect(result.source).toBe('');
    expect(result.rejected).toEqual([]);
  });

  it('ignores transactions missing a sender when a public key is provided', () => {
    const result = transactionsToXyzDslSource([
      transaction('color: red', 1, '+0+1/+0+1/+0+1'),
    ], { publicKey: 'sender-key' });

    expect(result.source).toBe('');
    expect(result.rejected).toEqual([]);
  });

  it('discovers secondary public keys without using node memo properties as endpoints', () => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = transactionsToXyzDslSource([
      transaction(`node: wss://secondary.example/ws`, 3, secondaryPublicKey),
    ]);

    expect(result.source).toBe('');
    expect(result.rejected).toEqual([]);
    expect(result.secondaryKeys).toEqual([
      {
        publicKey: secondaryPublicKey,
        sourceTransactionId: `103:${secondaryPublicKey}:none:0`,
        memoPreview: `${secondaryPublicKey}: node: wss://secondary.example/ws`,
      },
    ]);
  });

  it('discovers secondary-key references without an endpoint', () => {
    const secondaryPublicKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const result = transactionsToXyzDslSource([
      transaction(secondaryPublicKey, 4, 'secondary-key-reference'),
    ]);

    expect(result.source).toBe('');
    expect(result.rejected).toEqual([]);
    expect(result.secondaryKeys).toEqual([
      expect.objectContaining({
        publicKey: secondaryPublicKey,
      }),
    ]);
  });

  it('does not retain endpoint data from empty node memo properties', () => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = transactionsToXyzDslSource([
      transaction('node:   ', 5, secondaryPublicKey),
    ]);

    expect(result.secondaryKeys).toEqual([
      expect.objectContaining({
        publicKey: secondaryPublicKey,
      }),
    ]);
  });

  it('extracts secondary public keys from untrimmed destinations before path filler cleanup', () => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/0=';
    const result = transactionsToXyzDslSource([
      transaction('node: wss://secondary.example/ws', 6, secondaryPublicKey),
    ]);

    expect(result.source).toBe('');
    expect(result.rejected).toEqual([]);
    expect(result.secondaryKeys).toEqual([
      expect.objectContaining({
        publicKey: secondaryPublicKey,
      }),
    ]);
  });

  it('keeps content fallback for valid spatial paths with secondary-looking memo text', () => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = transactionsToXyzDslSource([
      transaction(secondaryPublicKey, 5, '+0+4/+0+2/+0+1'),
    ]);

    expect(result.source).toBe('"+0+4/+0+2/+0+1" : "content-kind: text; content-text-uri: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA%3D"');
    expect(result.rejected).toEqual([]);
    expect(result.secondaryKeys).toEqual([]);
  });

  it('preserves transaction order for accepted transactions', () => {
    const result = transactionsToXyzDslSource([
      transaction('color: red', 1, '+0+1/+0+1/+0+1'),
      transaction('color: blue', 2, '+1+1/+0+1/+0+1'),
    ]);

    expect(result.source).toBe('"+0+1/+0+1/+0+1" : "color: red"\n"+1+1/+0+1/+0+1" : "color: blue"');
  });
});
