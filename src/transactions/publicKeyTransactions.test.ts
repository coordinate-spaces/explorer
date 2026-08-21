import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicKeyTransactions, fetchTipHeight } from './publicKeyTransactions';
import type { TransactionRange, XyzDslTransaction } from './types';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly protocols: string[];
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Set<(event: Event | MessageEvent<string>) => void>>();

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open', new Event('open'));
    });
  }

  addEventListener(type: string, listener: (event: Event | MessageEvent<string>) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event | MessageEvent<string>) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = 3;
  }

  send(message: string) {
    this.sent.push(message);
  }

  respond(message: unknown) {
    this.emit('message', new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  private emit(type: string, event: Event | MessageEvent<string>) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

function requestBody(socket: MockWebSocket) {
  expect(socket.sent).toHaveLength(1);
  return JSON.parse(socket.sent[0]) as {
    type: string;
    body?: { public_key: string; start_height: number; end_height: number; limit: number };
  };
}

async function nextSocket(): Promise<MockWebSocket> {
  await vi.waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
  return MockWebSocket.instances.shift()!;
}

afterEach(() => {
  MockWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe('public-key transaction protocol requests', () => {
  it('loads through the reported tip using an exclusive N + 1 boundary', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const tipPromise = fetchTipHeight('wss://primary.example');
    const tipSocket = await nextSocket();
    expect(requestBody(tipSocket)).toEqual({ type: 'get_tip_header' });
    tipSocket.respond({ type: 'tip_header', body: { header: { height: 42 } } });

    const tipHeight = await tipPromise;
    const transaction: XyzDslTransaction = {
      time: 1, to: 'recipient', amount: 1, fee: 0, memo: 'tip transaction',
    };
    const transactionsPromise = fetchPublicKeyTransactions({
      endpoint: 'wss://primary.example',
      publicKey: 'primary-key',
      range: { startHeight: tipHeight, endHeight: 0, limit: 500 },
    });
    const transactionSocket = await nextSocket();
    expect(requestBody(transactionSocket)).toEqual({
      type: 'get_public_key_transactions',
      body: { public_key: 'primary-key', start_height: 43, end_height: 0, limit: 500 },
    });
    transactionSocket.respond({
      type: 'public_key_transactions',
      body: { public_key: 'primary-key', filter_blocks: [{ height: 42, transactions: [transaction] }] },
    });

    expect(await transactionsPromise).toEqual([transaction]);
    expect(tipHeight).toBe(42);
  });

  it('serializes a manually selected inclusive multi-block range', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const promise = fetchPublicKeyTransactions({
      endpoint: 'wss://primary.example', publicKey: 'primary-key',
      range: { startHeight: 120, endHeight: 100, limit: 25 },
    });
    const socket = await nextSocket();
    expect(requestBody(socket).body).toEqual({
      public_key: 'primary-key', start_height: 121, end_height: 100, limit: 25,
    });
    socket.respond({ type: 'public_key_transactions', body: { public_key: 'primary-key', transactions: [] } });
    await expect(promise).resolves.toEqual([]);
  });

  it('applies the same range conversion on the secondary-history endpoint', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const transactionRange: TransactionRange = { startHeight: 80, endHeight: 70, limit: 10 };
    const promise = fetchPublicKeyTransactions({
      endpoint: 'wss://secondary.example', publicKey: 'secondary-key', range: transactionRange,
    });
    const socket = await nextSocket();
    expect(socket.url).toBe('wss://secondary.example');
    expect(requestBody(socket).body).toEqual({
      public_key: 'secondary-key', start_height: 81, end_height: 70, limit: 10,
    });
    socket.respond({ type: 'public_key_transactions', body: { public_key: 'secondary-key', filter_blocks: [] } });
    await expect(promise).resolves.toEqual([]);
  });
});
