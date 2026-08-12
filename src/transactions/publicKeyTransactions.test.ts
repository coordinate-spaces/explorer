import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicKeyTransactions, fetchTipHeight } from './publicKeyTransactions';
import type { TransactionRange, XyzDslTransaction } from './types';

interface SentRequest {
  type: string;
  body?: {
    public_key: string;
    start_height: number;
    end_height: number;
    limit: number;
  };
}

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly protocols: string | string[];
  readyState = MockWebSocket.CONNECTING;
  sent: SentRequest[] = [];

  constructor(url: string | URL, protocols: string | string[] = []) {
    super();
    this.url = String(url);
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.dispatchEvent(new Event('open'));
    });
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as SentRequest);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  receive(message: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

async function nextSocket(): Promise<MockWebSocket> {
  await vi.waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
  const socket = MockWebSocket.instances.at(-1);
  if (!socket) throw new Error('Expected a WebSocket request.');
  await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0));
  return socket;
}

const transactionAtTip: XyzDslTransaction = {
  time: 123,
  to: 'recipient',
  amount: 1,
  fee: 0,
  memo: 'tip transaction',
};

describe('public-key transaction request boundaries', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('loads through tip N with an exclusive N + 1 boundary and includes block N', async () => {
    const tipPromise = fetchTipHeight('wss://primary.example');
    const tipSocket = await nextSocket();
    expect(tipSocket.sent[0]).toEqual({ type: 'get_tip_header' });
    tipSocket.receive({ type: 'tip_header', body: { header: { height: 42 } } });
    const tipHeight = await tipPromise;

    // This mirrors loadTipHeight: the displayed/UI range retains the real header height.
    const range: TransactionRange = { startHeight: tipHeight, endHeight: 0, limit: 500 };
    const transactionsPromise = fetchPublicKeyTransactions({
      endpoint: 'wss://primary.example',
      publicKey: 'primary-key',
      range,
    });
    const transactionSocket = await nextSocket();

    expect(transactionSocket.sent[0]).toEqual({
      type: 'get_public_key_transactions',
      body: { public_key: 'primary-key', start_height: 43, end_height: 0, limit: 500 },
    });
    transactionSocket.receive({
      type: 'public_key_transactions',
      body: { public_key: 'primary-key', filter_blocks: [{ header: { height: 42 }, transactions: [transactionAtTip] }] },
    });
    await expect(transactionsPromise).resolves.toEqual([transactionAtTip]);
    expect(range.startHeight).toBe(42);
  });

  it('serializes a manually selected inclusive multi-block range', async () => {
    const promise = fetchPublicKeyTransactions({
      endpoint: 'wss://primary.example',
      publicKey: 'primary-key',
      range: { startHeight: 20, endHeight: 10, limit: 75 },
    });
    const socket = await nextSocket();

    expect(socket.sent[0]?.body).toEqual({
      public_key: 'primary-key', start_height: 21, end_height: 10, limit: 75,
    });
    socket.receive({ type: 'public_key_transactions', body: { public_key: 'primary-key', transactions: [] } });
    await expect(promise).resolves.toEqual([]);
  });

  it('applies the same conversion when secondary history reuses transactionRange', async () => {
    const transactionRange: TransactionRange = { startHeight: 30, endHeight: 12, limit: 500 };
    const promise = fetchPublicKeyTransactions({
      endpoint: 'wss://secondary.example',
      publicKey: 'secondary-key',
      range: transactionRange,
    });
    const socket = await nextSocket();

    expect(socket.url).toBe('wss://secondary.example');
    expect(socket.sent[0]?.body).toEqual({
      public_key: 'secondary-key', start_height: 31, end_height: 12, limit: 500,
    });
    socket.receive({ type: 'public_key_transactions', body: { public_key: 'secondary-key', transactions: [] } });
    await expect(promise).resolves.toEqual([]);
  });
});
