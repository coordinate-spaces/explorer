import { describe, expect, it } from 'vitest';
import {
  advancePlaybackIndex,
  clampPlaybackIndex,
  currentPlaybackTransaction,
  hasPlaybackReachedEnd,
  mergeHistoricalStreamTransactions,
  mergeStreamTransactions,
  outgoingTransactionsForPublicKey,
  playbackIndexForElapsedTime,
  playbackTickIntervalMilliseconds,
  playbackTimeForElapsedTime,
  scaledPlaybackElapsedSeconds,
  sortTransactionsByTimeStable,
} from './streamTransactions';
import type { XyzDslTransaction } from './types';

function transaction(overrides: Partial<XyzDslTransaction> = {}): XyzDslTransaction {
  return {
    time: 100,
    series: 1,
    nonce: 7,
    from: 'sender-key',
    to: '+0d+1d/+0d+1d/+0d+1d',
    amount: 1,
    fee: 0,
    memo: 'geometry: box',
    ...overrides,
  };
}

describe('mergeStreamTransactions', () => {
  it('keeps duplicate-looking transactions with identical content', () => {
    const first = transaction();
    const duplicate = transaction();

    expect(mergeStreamTransactions([first], [duplicate])).toEqual([first, duplicate]);
  });

  it('appends realtime transactions in received order', () => {
    const existing = transaction({ memo: 'existing' });
    const firstRealtime = transaction({ memo: 'first realtime' });
    const secondRealtime = transaction({ memo: 'second realtime' });

    const afterFirst = mergeStreamTransactions([existing], [firstRealtime]);
    const afterSecond = mergeStreamTransactions(afterFirst, [secondRealtime]);

    expect(afterSecond.map(({ memo }) => memo)).toEqual(['existing', 'first realtime', 'second realtime']);
  });
});

describe('mergeHistoricalStreamTransactions', () => {
  it('does not re-add already loaded transactions with the same blockchain signature', () => {
    const loaded = transaction({ signature: 'same-chain-transaction', memo: 'loaded' });
    const refetched = transaction({ signature: 'same-chain-transaction', memo: 'refetched' });
    const fresh = transaction({ signature: 'fresh-chain-transaction', memo: 'fresh' });

    expect(mergeHistoricalStreamTransactions([loaded], [refetched, fresh])).toEqual([loaded, fresh]);
  });

  it('preserves duplicate-looking historical transactions when no blockchain identity is available', () => {
    const first = transaction();
    const duplicate = transaction();

    expect(mergeHistoricalStreamTransactions([first], [duplicate])).toEqual([first, duplicate]);
  });
});

describe('sortTransactionsByTimeStable', () => {
  it('orders historical transactions by time while preserving equal-time input order', () => {
    const later = transaction({ time: 300, memo: 'later' });
    const equalFirst = transaction({ time: 100, memo: 'equal first' });
    const middle = transaction({ time: 200, memo: 'middle' });
    const equalSecond = transaction({ time: 100, memo: 'equal second' });

    expect(sortTransactionsByTimeStable([later, equalFirst, middle, equalSecond]).map(({ memo }) => memo)).toEqual([
      'equal first',
      'equal second',
      'middle',
      'later',
    ]);
  });
});

describe('outgoingTransactionsForPublicKey', () => {
  it('filters stale persisted streams to only transactions from the watched key', () => {
    const incoming = transaction({ from: 'someone-else', to: 'secondary-key', memo: 'incoming' });
    const outgoing = transaction({ from: 'secondary-key', to: 'recipient-key', memo: 'outgoing' });
    const missingSender = transaction({ from: undefined, to: 'secondary-key', memo: 'missing sender' });

    expect(outgoingTransactionsForPublicKey([incoming, outgoing, missingSender], 'secondary-key')).toEqual([outgoing]);
  });
});

describe('advancePlaybackIndex', () => {
  it('advances over every transaction entry, including duplicate-looking entries', () => {
    const first = transaction();
    const duplicate = transaction();
    const transactions = mergeStreamTransactions([first], [duplicate]);

    let playbackIndex = 0;
    playbackIndex = advancePlaybackIndex(playbackIndex, transactions.length);
    playbackIndex = advancePlaybackIndex(playbackIndex, transactions.length);

    expect(playbackIndex).toBe(2);
  });
});

describe('clampPlaybackIndex', () => {
  it('keeps a seek position within the loaded transaction range', () => {
    expect(clampPlaybackIndex(-1, 3)).toBe(0);
    expect(clampPlaybackIndex(1.8, 3)).toBe(1);
    expect(clampPlaybackIndex(5, 3)).toBe(2);
    expect(clampPlaybackIndex(5, 0)).toBe(0);
  });
});

describe('playbackIndexForElapsedTime', () => {
  it('selects the transaction frame synced to transaction time', () => {
    const transactions = [
      transaction({ time: 100, memo: 'first' }),
      transaction({ time: 105, memo: 'second' }),
      transaction({ time: 120, memo: 'third' }),
    ];

    expect(playbackIndexForElapsedTime(transactions, 0)).toBe(0);
    expect(playbackIndexForElapsedTime(transactions, 5)).toBe(1);
    expect(playbackIndexForElapsedTime(transactions, 20)).toBe(2);
  });

  it('exposes one current playback transaction at a time', () => {
    const transactions = [
      transaction({ time: 100, memo: 'first' }),
      transaction({ time: 105, memo: 'second' }),
    ];

    expect(currentPlaybackTransaction(transactions, 0)?.memo).toBe('first');
    expect(currentPlaybackTransaction(transactions, 1)?.memo).toBe('second');
    expect(currentPlaybackTransaction(transactions, 10)?.memo).toBe('second');
  });

  it('reports completion only after the final transaction time is reached', () => {
    const transactions = [
      transaction({ time: 100, memo: 'first' }),
      transaction({ time: 105, memo: 'second' }),
    ];

    expect(hasPlaybackReachedEnd(transactions, 1, 4)).toBe(false);
    expect(hasPlaybackReachedEnd(transactions, 1, 5)).toBe(true);
  });
});

describe('scaledPlaybackElapsedSeconds', () => {
  it('advances replay elapsed time at the selected speed', () => {
    expect(scaledPlaybackElapsedSeconds(3, 2)).toBe(6);
    expect(scaledPlaybackElapsedSeconds(3, 8)).toBe(24);
  });

  it('falls back to original speed for an unsupported value', () => {
    expect(scaledPlaybackElapsedSeconds(3, 3)).toBe(3);
  });

  it('preserves the in-progress position when replay is restarted at a new speed', () => {
    const playbackTime = playbackTimeForElapsedTime(0, 99, 1);

    expect(playbackTime).toBe(99);
    expect(playbackTimeForElapsedTime(playbackTime, 1 / 16, 16)).toBe(100);
  });
});

describe('playbackTickIntervalMilliseconds', () => {
  it('ticks fast enough to render every one-second frame at accelerated speeds', () => {
    const transactions = [transaction({ time: 100 }), transaction({ time: 101 }), transaction({ time: 102 })];

    expect(playbackTickIntervalMilliseconds(transactions, 4)).toBe(125);
    expect(playbackTickIntervalMilliseconds(transactions, 16)).toBe(31.25);
  });

  it('uses the standard cadence when there is no positive timestamp gap', () => {
    expect(playbackTickIntervalMilliseconds([transaction({ time: 100 })], 16)).toBe(800);
  });
});
