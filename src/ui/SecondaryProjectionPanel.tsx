import { PLAYBACK_SPEED_OPTIONS } from '../transactions/streamTransactions';
import { normalizeXyzDslTransaction } from '../transactions/transactionXyzDsl';
import type { SecondaryProjection, XyzDslTransaction } from '../transactions/types';

interface SecondaryProjectionPanelProps {
  projections: SecondaryProjection[];
  onReplay: (publicKey: string) => void;
  onPlaybackToggle: (publicKey: string) => void;
  onPlaybackSpeedChange: (publicKey: string, playbackSpeed: number) => void;
  onPlaybackSeek: (publicKey: string, playbackIndex: number) => void;
  onLoadHistory: (publicKey: string) => void;
}

function statusLabel(projection: SecondaryProjection): string {
  if (projection.streamError) return 'Needs attention';
  if (projection.historyLoading) return 'Loading history';
  if (projection.replaying) return 'Replaying';
  if (projection.transactions.length > 0) return `Frame ${projection.playbackIndex + 1} of ${projection.transactions.length}`;
  return projection.realtimeStatus === 'connected' ? 'Listening live' : projection.realtimeStatus;
}

function transactionSummary(transaction: XyzDslTransaction): string {
  const normalized = normalizeXyzDslTransaction(transaction);
  return [normalized.from ? `from ${normalized.from}` : undefined, `to ${normalized.to}`, normalized.memo.trim() || '(empty memo)']
    .filter(Boolean)
    .join(' · ');
}

export function SecondaryProjectionPanel({
  projections,
  onReplay,
  onPlaybackToggle,
  onPlaybackSpeedChange,
  onPlaybackSeek,
  onLoadHistory,
}: SecondaryProjectionPanelProps) {
  if (projections.length === 0) return null;

  return (
    <section className="secondary-projections" aria-label="Secondary key projections">
      <div className="section-heading-row">
        <h2>Secondary key projections</h2>
        <span>{projections.length} active</span>
      </div>
      <p className="secondary-projection-intro">Each referenced key contributes its current frame only when it targets a namespace declared by the baseline scene.</p>
      <ul className="secondary-projection-list">
        {projections.map((projection) => (
          <li key={`${projection.publicKey}@@${projection.endpoint}`} className={projection.streamError ? 'has-error' : ''}>
            <details>
              <summary>
                <span className="secondary-projection-key">{projection.publicKey}</span>
                <span className="secondary-projection-status">{statusLabel(projection)}</span>
              </summary>
              <dl className="secondary-projection-facts">
                <div><dt>Endpoint</dt><dd>{projection.endpoint}</dd></div>
                <div><dt>Connection</dt><dd>{projection.realtimeStatus}</dd></div>
                <div><dt>Rendering</dt><dd>Current frame · primary namespaces only</dd></div>
                <div><dt>Discovered from</dt><dd>{projection.references.length} primary transaction{projection.references.length === 1 ? '' : 's'}</dd></div>
              </dl>
              {projection.streamError ? <p className="transaction-error">{projection.streamError}</p> : null}
              <div className="secondary-projection-primary-actions">
                <button type="button" disabled={projection.historyLoading} onClick={() => onLoadHistory(projection.publicKey)}>
                  {projection.historyLoading ? 'Loading history…' : projection.transactions.length ? 'Refresh history' : 'Load history'}
                </button>
                {projection.transactions.length > 0 ? <button type="button" onClick={() => onReplay(projection.publicKey)}>Replay from start</button> : null}
              </div>
              {projection.transactions.length > 0 ? (
                <details className="secondary-projection-details">
                  <summary>Playback details</summary>
                  <div className="secondary-projection-controls">
                    <button type="button" disabled={!projection.replaying && projection.playbackIndex >= projection.transactions.length - 1} onClick={() => onPlaybackToggle(projection.publicKey)}>{projection.replaying ? 'Pause' : 'Play'}</button>
                    <label>Speed<select value={projection.playbackSpeed} onChange={(event) => onPlaybackSpeedChange(projection.publicKey, Number(event.target.value))}>{PLAYBACK_SPEED_OPTIONS.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
                    <label>Frame<input type="range" min={0} max={Math.max(projection.transactions.length - 1, 0)} value={projection.playbackIndex} onChange={(event) => onPlaybackSeek(projection.publicKey, Number(event.target.value))} /></label>
                  </div>
                  <ol className="secondary-projection-history">{projection.transactions.map((transaction, index) => <li key={`${transaction.signature ?? 'transaction'}-${transaction.time}-${index}`}><time>{new Date(transaction.time * 1000).toLocaleString()}</time><span>{transactionSummary(transaction)}</span></li>)}</ol>
                </details>
              ) : null}
              <details className="secondary-projection-details">
                <summary>Discovery details</summary>
                <p>Selected node: {projection.endpoint}</p>
                <ul>{projection.references.map((reference) => <li key={reference.sourceTransactionId}><strong>{reference.sourceTransactionId}</strong><span>{reference.memoPreview || '(empty memo)'}</span></li>)}</ul>
              </details>
              {projection.currentTransactionRejectedDiagnostics.length > 0 ? <details className="secondary-projection-details"><summary>Current-frame parsing diagnostics ({projection.currentTransactionRejectedDiagnostics.length})</summary><ul>{projection.currentTransactionRejectedDiagnostics.map((rejection) => <li key={rejection.id}>{rejection.reasons.join(' ')}</li>)}</ul></details> : null}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
