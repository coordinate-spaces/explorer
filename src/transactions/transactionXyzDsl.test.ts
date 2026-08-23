import { describe, expect, it } from 'vitest';
import {
  normalizeXyzDslTransaction,
  normalizeXyzDslTransactions,
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
    ['+2d+4d/+6d+6d/+4d+3d000=', '+2d+4d/+6d+6d/+4d+3d'],
    ['+2c+4c/+6c+6c/+4c+30c000=', '+2c+4c/+6c+6c/+4c+30c'],
    ['+2m+4m/+6m+6m/+4m+300m000=', '+2m+4m/+6m+6m/+4m+300m'],
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

  it.each(['d', 'c', 'm'])('imports a %s-suffixed path with terminal transport filler', (unit) => {
    const result = transactionsToXyzDslSource([
      transaction('geometry: box', 0, `+0${unit}+1${unit}/+0${unit}+1${unit}/+0${unit}+1${unit}000=`),
    ]);

    expect(result.source).toBe(`"+0${unit}+1${unit}/+0${unit}+1${unit}/+0${unit}+1${unit}" : "geometry: box"`);
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

  it('uses a direct node endpoint from a secondary-key definition', () => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = transactionsToXyzDslSource([
      transaction(`node: wss://secondary.example/ws`, 3, secondaryPublicKey),
    ]);

    expect(result.source).toBe('');
    expect(result.rejected).toEqual([]);
    expect(result.secondaryKeys).toEqual([
      {
        publicKey: secondaryPublicKey,
        endpoint: 'wss://secondary.example/ws',
        sourceTransactionId: `103:${secondaryPublicKey}:none:0`,
        memoPreview: `${secondaryPublicKey}: node: wss://secondary.example/ws`,
      },
    ]);
  });

  it.each([
    ['', 'wss://primary.example/ws'],
    ['node: primary', 'wss://primary.example/ws'],
    ['node: secondary', 'wss://secondary.example/ws'],
    ['node: direct.example/ws', 'wss://direct.example/ws'],
  ])('resolves node definition %j', (memo, endpoint) => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = transactionsToXyzDslSource([
      transaction(memo, 0, secondaryPublicKey),
    ], {
      primaryEndpoint: 'wss://primary.example/ws',
      secondaryEndpoint: 'wss://secondary.example/ws',
    });

    expect(result.secondaryKeys[0]?.endpoint).toBe(endpoint);
  });

  it('does not interpret a colon-less wss spelling as a protocol-less host', () => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = transactionsToXyzDslSource([
      transaction('node: wss//direct.example/ws', 0, secondaryPublicKey),
    ], {
      primaryEndpoint: 'wss://primary.example/ws',
      secondaryEndpoint: 'wss://secondary.example/ws',
    });

    expect(result.secondaryKeys[0]?.endpoint).toBe('');
  });

  it('uses the latest definition for a repeatedly defined public key', () => {
    const secondaryPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = transactionsToXyzDslSource([
      transaction('node: secondary', 1, secondaryPublicKey),
      transaction('node: wss://old.example/ws', 0, secondaryPublicKey),
    ], {
      primaryEndpoint: 'wss://primary.example/ws',
      secondaryEndpoint: 'wss://secondary.example/ws',
    });

    expect(result.secondaryKeys).toHaveLength(2);
    expect(result.secondaryKeys.map(({ endpoint }) => endpoint)).toEqual([
      'wss://secondary.example/ws',
      'wss://old.example/ws',
    ]);
    expect(result.latestSecondaryKeys).toHaveLength(1);
    expect(result.latestSecondaryKeys[0]).toMatchObject({
      publicKey: secondaryPublicKey,
      endpoint: 'wss://secondary.example/ws',
    });
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
