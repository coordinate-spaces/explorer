import type { XyzDslTransaction, TransactionRange } from './types';

export interface PublicKeyTransactionRequest {
  endpoint: string;
  publicKey: string;
  range: TransactionRange;
  signal?: AbortSignal;
}

/**
 * The Cruzbit history request walks backwards from an exclusive start boundary.
 * TransactionRange deliberately remains an inclusive, UI-facing block range.
 */
export function exclusiveTransactionStartHeight(range: Pick<TransactionRange, 'startHeight'>): number {
  return range.startHeight + 1;
}

export function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();

  if (!trimmed) {
    throw new Error('A WebSocket endpoint is required.');
  }

  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http/i, 'ws');
  }

  return `wss://${trimmed}`;
}

type SocketRequestOptions<T> = {
  endpoint: string;
  signal?: AbortSignal;
  send: (socket: WebSocket) => void;
  handleMessage: (event: MessageEvent<string>) => T | undefined;
  prematureCloseMessage: string;
};

function requestSocketMessage<T>({
  endpoint,
  signal,
  send,
  handleMessage,
  prematureCloseMessage,
}: SocketRequestOptions<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(normalizeEndpoint(endpoint), ['cruzbit.1']);

    const cleanup = () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', handleError);
      socket.removeEventListener('close', handleClose);
      signal?.removeEventListener('abort', handleAbort);
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      callback();
    };

    function handleAbort() {
      finish(() => reject(new DOMException('Transaction request was aborted.', 'AbortError')));
    }

    function handleOpen() {
      send(socket);
    }

    function onMessage(event: MessageEvent<string>) {
      const result = handleMessage(event);
      if (result !== undefined) {
        finish(() => resolve(result));
      }
    }

    function handleError() {
      finish(() => reject(new Error('Unable to communicate with transaction endpoint.')));
    }

    function handleClose() {
      finish(() => reject(new Error(prematureCloseMessage)));
    }

    signal?.addEventListener('abort', handleAbort, { once: true });
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', handleError);
    socket.addEventListener('close', handleClose);
  });
}

export function parseJsonMessage(event: MessageEvent<string>): { type?: string; body?: unknown } | undefined {
  try {
    const parsed = JSON.parse(event.data) as unknown;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function fetchTipHeight(endpoint: string, signal?: AbortSignal): Promise<number> {
  return requestSocketMessage({
    endpoint,
    signal,
    send: (socket) => socket.send(JSON.stringify({ type: 'get_tip_header' })),
    prematureCloseMessage: 'Transaction endpoint closed before returning the blockchain tip.',
    handleMessage: (event) => {
      const parsed = parseJsonMessage(event);
      if (parsed?.type !== 'tip_header' || !parsed.body || typeof parsed.body !== 'object') {
        return undefined;
      }

      const { header } = parsed.body as { header?: { height?: number } };
      return typeof header?.height === 'number' ? header.height : undefined;
    },
  });
}

export function fetchPublicKeyTransactions({
  endpoint,
  publicKey,
  range,
  signal,
}: PublicKeyTransactionRequest): Promise<XyzDslTransaction[]> {
  if (!publicKey.trim()) {
    return Promise.resolve([]);
  }

  return requestSocketMessage({
    endpoint,
    signal,
    send: (socket) => socket.send(JSON.stringify({
      type: 'get_public_key_transactions',
      body: {
        public_key: publicKey,
        start_height: exclusiveTransactionStartHeight(range),
        end_height: range.endHeight,
        limit: range.limit,
      },
    })),
    prematureCloseMessage: 'Transaction endpoint closed before returning transactions.',
    handleMessage: (event) => {
      const parsed = parseJsonMessage(event);
      const body = parsed?.body as {
        public_key?: string;
        filter_blocks?: { transactions?: XyzDslTransaction[] }[];
        transactions?: XyzDslTransaction[];
      } | undefined;

      if (parsed?.type !== 'public_key_transactions' || body?.public_key !== publicKey) {
        return undefined;
      }

      return body.filter_blocks?.flatMap((block) => block.transactions ?? []) ?? body.transactions ?? [];
    },
  });
}
