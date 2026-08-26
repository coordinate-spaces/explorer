export interface XyzDslTransaction {
  time: number;
  nonce?: number;
  from?: string;
  to: string;
  amount: number;
  fee: number;
  memo: string;
  series?: number;
  signature?: string;
}

export interface TransactionRange {
  /** Inclusive height of the newest block shown in the UI. */
  startHeight: number;
  /** Inclusive height of the oldest block shown in the UI. */
  endHeight: number;
  limit: number;
}

export interface TransactionPublicKeyEndpoint {
  publicKey: string;
  endpoint: string;
}

export interface PrimaryPublicKeyReference extends TransactionPublicKeyEndpoint {}

export interface PrimaryHistoricalBaselineXyzDsl {
  source: string;
  rejected: RejectedTransaction[];
}

export interface RejectedTransaction {
  id: string;
  memoPreview: string;
  reasons: string[];
}

/** A secondary public key discovered in a primary transaction. */
export interface DiscoveredSecondaryPublicKeyReference extends Pick<TransactionPublicKeyEndpoint, 'publicKey'> {
  endpoint: string;
  sourceTransactionId: string;
  memoPreview: string;
}

export interface ActiveSecondaryTenant extends TransactionPublicKeyEndpoint {
  enabled: boolean;
  streamError?: string;
  transactions: XyzDslTransaction[];
  playbackIndex: number;
  playbackSpeed: number;
  replaying: boolean;
  historyLoading?: boolean;
  /** Diagnostics accumulated through this tenant's playback cursor. */
  rejectedDiagnostics: RejectedTransaction[];
}

export type SecondaryKeyReference = DiscoveredSecondaryPublicKeyReference;

/** A historical tenant document composed into the primary spatial document. */
export interface SecondaryTenant extends ActiveSecondaryTenant {
  /** Every primary transaction that discovered this unique key. */
  references: SecondaryKeyReference[];
  /** Secondary declarations only render when they consume a primary namespace. */
  compositionPolicy: 'consume-primary-namespaces';
}
