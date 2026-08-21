import type { ReactNode } from 'react';
import type { SpatialDocument } from '../model/SpatialDocument';
import { UNIT_SCALE_DESCRIPTION } from '../model/units';
import type { RejectedTransaction, SecondaryProjection, TransactionRange } from '../transactions/types';
import { normalizeXyzDslTransaction } from '../transactions/transactionXyzDsl';
import { XyzDslEditor } from './XyzDslEditor';
import { XyzDslTransactionControls } from './XyzDslTransactionControls';
import { SecondaryProjectionPanel } from './SecondaryProjectionPanel';
import { XyzDslTreeView } from './XyzDslTreeView';
import { usePersistentState } from './usePersistentState';

function describeAuthoringState(
  hasRemoteBaseline: boolean,
  hasAuthoringEdits: boolean,
  remoteBaselineChanged: boolean,
): string {
  if (!hasRemoteBaseline) {
    return `Editing local spatial declarations. Use bare path numbers for units and a c suffix for centiunits (${UNIT_SCALE_DESCRIPTION}).`;
  }

  if (remoteBaselineChanged && hasAuthoringEdits) {
    return 'Remote declarations changed after local edits. Keep editing, or reset to the latest remote state.';
  }

  if (hasAuthoringEdits) {
    return 'Local draft differs from the loaded remote declarations. Edit, remove, or add declarations below.';
  }

  return 'Loaded from remote transactions. Edit, remove, or add declarations below.';
}

function summarizeChanges({ added, removed }: { added: number; removed: number }): string {
  const parts: string[] = [];

  if (added > 0) {
    parts.push(`${added} added`);
  }

  if (removed > 0) {
    parts.push(`${removed} removed`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'No line changes';
}

// Kept exported for the drawer's existing focused summary tests.
export function transactionSummary(transaction: import('../transactions/types').XyzDslTransaction): string {
  const normalized = normalizeXyzDslTransaction(transaction);
  return [normalized.from ? `from ${normalized.from}` : undefined, `to ${normalized.to}`, normalized.memo.trim() ? `memo ${normalized.memo.trim()}` : undefined]
    .filter(Boolean)
    .join(' · ');
}

function renderAuthoringStatus(
  hasRemoteBaseline: boolean,
  hasAuthoringEdits: boolean,
  remoteBaselineChanged: boolean,
  authoringChangeSummary: { added: number; removed: number },
): ReactNode {
  if (!hasRemoteBaseline) {
    return <em className="xyzdsl-status-badge">Local sample</em>;
  }

  if (remoteBaselineChanged && hasAuthoringEdits) {
    return (
      <>
        <em className="xyzdsl-status-badge xyzdsl-status-badge-warning">Remote changed</em>
        <span>{summarizeChanges(authoringChangeSummary)}</span>
      </>
    );
  }

  if (hasAuthoringEdits) {
    return (
      <>
        <em className="xyzdsl-status-badge xyzdsl-status-badge-warning">Modified locally</em>
        <span>{summarizeChanges(authoringChangeSummary)}</span>
      </>
    );
  }

  return <em className="xyzdsl-status-badge xyzdsl-status-badge-success">Remote baseline loaded</em>;
}

interface XyzDslDrawerProps {
  appMode: 'viewer' | 'editor';
  authoringAvailable: boolean;
  document: SpatialDocument;
  isOpen: boolean;
  source: string;
  selectedLineNumber?: number;
  transactionPublicKey: string;
  transactionPublicKeyShareUrl?: string;
  transactionRange: TransactionRange;
  transactionsLoading: boolean;
  transactionError?: string;
  tipHeight?: number;
  tipLoading: boolean;
  tipError?: string;
  transactionCount: number;
  acceptedTransactionCount: number;
  mappedTransactionSource: string;
  rejectedTransactions: RejectedTransaction[];
  secondaryProjections: SecondaryProjection[];
  hasRemoteBaseline: boolean;
  hasAuthoringEdits: boolean;
  remoteBaselineChanged: boolean;
  authoringChangeSummary: { added: number; removed: number };
  onChange: (source: string) => void;
  onModeChange: (mode: 'viewer' | 'editor') => void;
  onResetToRemote: () => void;
  onTransactionPublicKeyChange: (publicKey: string) => void;
  onTransactionRangeChange: (range: TransactionRange) => void;
  onReloadTransactions: () => void;
  onUseTransactionTip: () => void;
  onSecondaryReplay: (publicKey: string) => void;
  onSecondaryPlaybackToggle: (publicKey: string) => void;
  onSecondaryPlaybackSpeedChange: (publicKey: string, playbackSpeed: number) => void;
  onSecondaryPlaybackSeek: (publicKey: string, playbackIndex: number) => void;
  onLoadSecondaryHistory: (publicKey: string) => void;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
  inspector?: ReactNode;
}

export function XyzDslDrawer({
  appMode,
  authoringAvailable,
  document,
  isOpen,
  source,
  selectedLineNumber,
  transactionPublicKey,
  transactionPublicKeyShareUrl,
  transactionRange,
  transactionsLoading,
  transactionError,
  tipHeight,
  tipLoading,
  tipError,
  transactionCount,
  acceptedTransactionCount,
  mappedTransactionSource,
  rejectedTransactions,
  secondaryProjections,
  hasRemoteBaseline,
  hasAuthoringEdits,
  remoteBaselineChanged,
  authoringChangeSummary,
  onChange,
  onModeChange,
  onResetToRemote,
  onTransactionPublicKeyChange,
  onTransactionRangeChange,
  onReloadTransactions,
  onUseTransactionTip,
  onSecondaryReplay,
  onSecondaryPlaybackToggle,
  onSecondaryPlaybackSpeedChange,
  onSecondaryPlaybackSeek,
  onLoadSecondaryHistory,
  selectedNodeId,
  onSelectNode,
  inspector,
}: XyzDslDrawerProps) {
  const isEditorMode = appMode === 'editor';
  const [activeView, setActiveView] = usePersistentState<'explorer' | 'source'>('xyzdsl-drawer-view-v1', 'explorer');
  return (
    <aside className={`xyzdsl-drawer xyzdsl-drawer--${appMode} ${isOpen ? 'is-open' : ''}`}>
      <div className="mode-controls" aria-label="Application mode">
        {authoringAvailable ? <button
          className="mode-toggle"
          type="button"
          aria-pressed={isEditorMode}
          onClick={() => onModeChange(isEditorMode ? 'viewer' : 'editor')}
        >
          {isEditorMode ? 'Viewer mode' : 'Editor mode'}
        </button> : null}

      </div>

      {authoringAvailable && isEditorMode && isOpen ? (
        <div className="drawer-panel">
          <button className="drawer-close-button" type="button" aria-label="Close declarations and return to viewer mode" onClick={() => onModeChange('viewer')}>
            ×
          </button>

          <header>
            <div>
              <p className="eyebrow">Candid Spaces</p>
              <strong>Spatial workspace</strong>
            </div>
            <span className={`workspace-status ${hasAuthoringEdits ? 'is-modified' : ''}`}>
              {hasAuthoringEdits ? 'Modified' : hasRemoteBaseline ? 'Remote' : 'Local'}
            </span>
          </header>

          <div className="workspace-tabs" role="tablist" aria-label="Workspace views">
            {(['explorer', 'source'] as const).map((view) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={activeView === view}
                onClick={() => setActiveView(view)}
              >
                {view === 'explorer' ? 'Explorer' : 'Source'}
              </button>
            ))}
          </div>

          <div className="workspace-primary" role="tabpanel">
            {activeView === 'explorer' ? (
              <XyzDslTreeView document={document} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
            ) : (
              <XyzDslEditor
                actions={
                  <button type="button" disabled={!hasRemoteBaseline || !hasAuthoringEdits} onClick={onResetToRemote}>
                    Reset
                  </button>
                }
                description={describeAuthoringState(hasRemoteBaseline, hasAuthoringEdits, remoteBaselineChanged)}
                status={renderAuthoringStatus(hasRemoteBaseline, hasAuthoringEdits, remoteBaselineChanged, authoringChangeSummary)}
                selectedLineNumber={selectedLineNumber}
                value={source}
                onChange={onChange}
              />
            )}
          </div>

          {inspector ? <div className="workspace-properties">{inspector}</div> : null}

          <details className="workspace-more">
            <summary>Connections &amp; diagnostics</summary>
            <XyzDslTransactionControls
            publicKey={transactionPublicKey}
            publicKeyShareUrl={transactionPublicKeyShareUrl}
            range={transactionRange}
            loading={transactionsLoading}
            error={transactionError}
            tipHeight={tipHeight}
            tipLoading={tipLoading}
            tipError={tipError}
            transactionCount={transactionCount}
            acceptedCount={acceptedTransactionCount}
            rejectedCount={rejectedTransactions.length}
            secondaryProjectionCount={secondaryProjections.length}
            onPublicKeyChange={onTransactionPublicKeyChange}
            onRangeChange={onTransactionRangeChange}
            onReload={onReloadTransactions}
            onUseTip={onUseTransactionTip}
            />

          {mappedTransactionSource.trim().length > 0 ? (
            <details className="remote-baseline-reference">
              <summary>Original remote declarations</summary>
              <label className="xyzdsl-editor xyzdsl-editor-readonly">
                <span>Mapped spatial declarations</span>
                <small>Current remote baseline used for reset.</small>
                <textarea spellCheck={false} value={mappedTransactionSource} wrap="off" readOnly />
              </label>
            </details>
          ) : null}

          <SecondaryProjectionPanel
            projections={secondaryProjections}
            onReplay={onSecondaryReplay}
            onPlaybackToggle={onSecondaryPlaybackToggle}
            onPlaybackSpeedChange={onSecondaryPlaybackSpeedChange}
            onPlaybackSeek={onSecondaryPlaybackSeek}
            onLoadHistory={onLoadSecondaryHistory}
          />


          {document.diagnostics.length > 0 || rejectedTransactions.length > 0 ? (
            <details className="diagnostics" aria-label="Workspace diagnostics">
              <summary>
                Diagnostics
                <span>{document.diagnostics.length + rejectedTransactions.length}</span>
              </summary>
              {document.diagnostics.length > 0 ? <div className="diagnostic-group">
                <h3>Declarations</h3>
                <ul>{document.diagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.line}-${index}`}><strong>Line {diagnostic.line}:</strong> {diagnostic.message}</li>
                ))}</ul>
              </div> : null}
              {rejectedTransactions.length > 0 ? <div className="diagnostic-group">
                <h3>Transactions</h3>
                <ul>{rejectedTransactions.map((rejection) => (
                  <li key={rejection.id}>
                    <strong>{rejection.id}:</strong> {rejection.memoPreview || '(empty memo)'}
                    <ul>{rejection.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  </li>
                ))}</ul>
              </div> : null}
            </details>
          ) : null}

          </details>
        </div>
      ) : null}
      {!authoringAvailable && secondaryProjections.length > 0 ? (
        <details className="runtime-playback-controls">
          <summary>Cursor playback</summary>
          <SecondaryProjectionPanel
            projections={secondaryProjections}
            onReplay={onSecondaryReplay}
            onPlaybackToggle={onSecondaryPlaybackToggle}
            onPlaybackSpeedChange={onSecondaryPlaybackSpeedChange}
            onPlaybackSeek={onSecondaryPlaybackSeek}
            onLoadHistory={onLoadSecondaryHistory}
          />
        </details>
      ) : null}
    </aside>
  );
}
