import { PLAYBACK_SPEED_OPTIONS } from '../transactions/streamTransactions';
import { normalizeXyzDslTransaction } from '../transactions/transactionXyzDsl';
import type { SecondaryTenant, XyzDslTransaction } from '../transactions/types';

interface SecondaryTenantPanelProps {
  tenants: SecondaryTenant[];
  onReplay: (publicKey: string) => void;
  onPlaybackToggle: (publicKey: string) => void;
  onPlaybackSpeedChange: (publicKey: string, playbackSpeed: number) => void;
  onPlaybackSeek: (publicKey: string, playbackIndex: number) => void;
  onLoadHistory: (publicKey: string) => void;
  onEnabledChange: (publicKey: string, enabled: boolean) => void;
}

function statusLabel(tenant: SecondaryTenant): string {
  if (tenant.streamError) return 'Needs attention';
  if (tenant.historyLoading) return 'Loading history';
  if (tenant.replaying) return 'Replaying';
  if (tenant.transactions.length > 0) return `Frame ${tenant.playbackIndex + 1} of ${tenant.transactions.length}`;
  return tenant.enabled ? 'No transactions' : 'Hidden';
}

function transactionSummary(transaction: XyzDslTransaction): string {
  const normalized = normalizeXyzDslTransaction(transaction);
  return [normalized.from ? `from ${normalized.from}` : undefined, `to ${normalized.to}`, normalized.memo.trim() || '(empty memo)']
    .filter(Boolean)
    .join(' · ');
}

export function SecondaryTenantPanel({
  tenants,
  onReplay,
  onPlaybackToggle,
  onPlaybackSpeedChange,
  onPlaybackSeek,
  onLoadHistory,
  onEnabledChange,
}: SecondaryTenantPanelProps) {
  if (tenants.length === 0) return null;

  return (
    <section className="secondary-tenants" aria-label="Secondary tenants">
      <div className="section-heading-row">
        <h2>Secondary tenants</h2>
        <span>{tenants.length} active</span>
      </div>
      <p className="secondary-tenant-intro">Each enabled tenant contributes its accumulated document through the selected frame, limited to namespaces declared by the baseline scene.</p>
      <ul className="secondary-tenant-list">
        {tenants.map((tenant) => (
          <li key={`${tenant.publicKey}@@${tenant.endpoint}`} className={tenant.streamError ? 'has-error' : ''}>
            <details>
              <summary>
                <span className="secondary-tenant-key">{tenant.publicKey}</span>
                <span className="secondary-tenant-status">{statusLabel(tenant)}</span>
              </summary>
              <dl className="secondary-tenant-facts">
                <div><dt>Endpoint</dt><dd>{tenant.endpoint}</dd></div>
                <div><dt>Source</dt><dd>Historical transactions</dd></div>
                <div><dt>Rendering</dt><dd>{tenant.enabled ? 'Accumulated through current frame · primary namespaces only' : 'Hidden'}</dd></div>
                <div><dt>Discovered from</dt><dd>{tenant.references.length} primary transaction{tenant.references.length === 1 ? '' : 's'}</dd></div>
              </dl>
              {tenant.streamError ? <p className="transaction-error">{tenant.streamError}</p> : null}
              <div className="secondary-tenant-primary-actions">
                <button type="button" aria-pressed={tenant.enabled} onClick={() => onEnabledChange(tenant.publicKey, !tenant.enabled)}>
                  {tenant.enabled ? 'Hide tenant' : 'Show tenant'}
                </button>
                <button type="button" disabled={tenant.historyLoading} onClick={() => onLoadHistory(tenant.publicKey)}>
                  {tenant.historyLoading ? 'Loading history…' : tenant.transactions.length ? 'Refresh history' : 'Load history'}
                </button>
                {tenant.transactions.length > 0 ? <button type="button" onClick={() => onReplay(tenant.publicKey)}>Replay from start</button> : null}
              </div>
              {tenant.transactions.length > 0 ? (
                <details className="secondary-tenant-details">
                  <summary>Playback details</summary>
                  <div className="secondary-tenant-controls">
                    <button type="button" disabled={!tenant.replaying && tenant.playbackIndex >= tenant.transactions.length - 1} onClick={() => onPlaybackToggle(tenant.publicKey)}>{tenant.replaying ? 'Pause' : 'Play'}</button>
                    <label>Speed<select value={tenant.playbackSpeed} onChange={(event) => onPlaybackSpeedChange(tenant.publicKey, Number(event.target.value))}>{PLAYBACK_SPEED_OPTIONS.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
                    <label>Frame<input type="range" min={0} max={Math.max(tenant.transactions.length - 1, 0)} value={tenant.playbackIndex} onChange={(event) => onPlaybackSeek(tenant.publicKey, Number(event.target.value))} /></label>
                  </div>
                  <ol className="secondary-tenant-history">{tenant.transactions.map((transaction, index) => <li key={`${transaction.signature ?? 'transaction'}-${transaction.time}-${index}`}><time>{new Date(transaction.time * 1000).toLocaleString()}</time><span>{transactionSummary(transaction)}</span></li>)}</ol>
                </details>
              ) : null}
              <details className="secondary-tenant-details">
                <summary>Discovery details</summary>
                <p>Shared overlay node: {tenant.endpoint}</p>
                <ul>{tenant.references.map((reference) => <li key={reference.sourceTransactionId}><strong>{reference.sourceTransactionId}</strong><span>{reference.memoPreview || '(empty memo)'}</span></li>)}</ul>
              </details>
              {tenant.rejectedDiagnostics.length > 0 ? <details className="secondary-tenant-details"><summary>Accumulated parsing diagnostics ({tenant.rejectedDiagnostics.length})</summary><ul>{tenant.rejectedDiagnostics.map((rejection) => <li key={rejection.id}>{rejection.reasons.join(' ')}</li>)}</ul></details> : null}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
