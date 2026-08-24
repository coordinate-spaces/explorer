import type { ReactNode } from 'react';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import type { AxisName } from '../xyzdsl/types';
import { UNIT_SCALE_DESCRIPTION } from '../model/units';
import type { RejectedTransaction, SecondaryProjection, TransactionRange } from '../transactions/types';
import { normalizeXyzDslTransaction } from '../transactions/transactionXyzDsl';
import { XyzDslEditor } from './XyzDslEditor';
import { XyzDslTransactionControls } from './XyzDslTransactionControls';
import { SecondaryProjectionPanel } from './SecondaryProjectionPanel';
import { XyzDslTreeView } from './XyzDslTreeView';
import { SelectedNodeInspector } from './SelectedNodeInspector';
import { usePersistentState } from './usePersistentState';

type DrawerTab = 'objects' | 'source' | 'data' | 'problems';

function describeAuthoringState(
  hasRemoteBaseline: boolean,
  hasAuthoringEdits: boolean,
  remoteBaselineChanged: boolean,
): string {
  if (!hasRemoteBaseline) {
    return `Editing local spatial declarations. Use bare path numbers for metres, or d, c, and m suffixes for decimetres, centimetres, and millimetres (${UNIT_SCALE_DESCRIPTION}).`;
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
  onOpen: () => void;
  onClose: () => void;
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
  selectedNode?: SpatialNode;
  selectedNodeCanEdit: boolean;
  selectionPath: SpatialNode[];
  onClearSelection: () => void;
  onMoveNode: (axis: AxisName, delta: number) => void;
  onResizeNode: (axis: AxisName, delta: number) => void;
  onRotateNode: (axis: AxisName, delta: number) => void;
  onPathNodeSelect: (id: string) => void;
  onNodePropertyChange: (key: string, value: string) => void;
}

export function XyzDslDrawer({
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
  onOpen,
  onClose,
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
  selectedNode,
  selectedNodeCanEdit,
  selectionPath,
  onClearSelection,
  onMoveNode,
  onResizeNode,
  onRotateNode,
  onPathNodeSelect,
  onNodePropertyChange,
}: XyzDslDrawerProps) {
  const [activeTab, setActiveTab] = usePersistentState<DrawerTab>('xyzdsl-drawer-active-tab', 'objects');
  const problemCount = document.diagnostics.length + rejectedTransactions.length;
  const tabs: { id: DrawerTab; label: string; count?: number }[] = [
    { id: 'objects', label: 'Objects' },
    { id: 'source', label: 'Source' },
    { id: 'data', label: 'Data' },
    { id: 'problems', label: 'Problems', count: problemCount },
  ];
  return (
    <aside className={`xyzdsl-drawer ${isOpen ? 'is-open' : ''}`}>
      <div className="mode-controls" aria-label="Workspace controls">
        <button
          className="mode-toggle"
          type="button"
          aria-expanded={isOpen}
          onClick={isOpen ? onClose : onOpen}
        >
          {isOpen ? 'Collapse workspace' : 'Workspace'}
        </button>

      </div>

      {isOpen ? (
        <div className="drawer-panel">
          <header className="drawer-titlebar">
            <strong>Candid Spaces</strong>
            <span>Workspace</span>
            <button className="drawer-close-button" type="button" aria-label="Collapse workspace" title="Collapse workspace" onClick={onClose}>×</button>
          </header>

          <nav className="drawer-tabs" aria-label="Workspace panels">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" aria-selected={activeTab === tab.id} role="tab" onClick={() => setActiveTab(tab.id)}>
                {tab.label}{tab.count ? <span>{tab.count}</span> : null}
              </button>
            ))}
          </nav>

          <div className="drawer-content" role="tabpanel">
          {activeTab === 'objects' ? (
            <div className="object-workspace">
              <XyzDslTreeView document={document} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
              <SelectedNodeInspector
                node={selectedNode}
                canEdit={selectedNodeCanEdit}
                selectionPath={selectionPath}
                onClearSelection={onClearSelection}
                onMove={onMoveNode}
                onResize={onResizeNode}
                onRotate={onRotateNode}
                onPathNodeSelect={onPathNodeSelect}
                onPropertyChange={onNodePropertyChange}
                onSelectNode={(id) => onSelectNode?.(id)}
              />
            </div>
          ) : null}

          {activeTab === 'data' ? <div className="drawer-tool-section"><XyzDslTransactionControls
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
          <SecondaryProjectionPanel
            projections={secondaryProjections}
            onReplay={onSecondaryReplay}
            onPlaybackToggle={onSecondaryPlaybackToggle}
            onPlaybackSpeedChange={onSecondaryPlaybackSpeedChange}
            onPlaybackSeek={onSecondaryPlaybackSeek}
            onLoadHistory={onLoadSecondaryHistory}
          /></div> : null}

          {activeTab === 'source' ? <div className="drawer-tool-section"><XyzDslEditor
            actions={
              <button type="button" disabled={!hasRemoteBaseline || !hasAuthoringEdits} onClick={onResetToRemote}>
                Reset to remote
              </button>
            }
            description={describeAuthoringState(hasRemoteBaseline, hasAuthoringEdits, remoteBaselineChanged)}
            status={renderAuthoringStatus(
              hasRemoteBaseline,
              hasAuthoringEdits,
              remoteBaselineChanged,
              authoringChangeSummary,
            )}
            selectedLineNumber={selectedLineNumber}
            value={source}
            onChange={onChange}
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
          ) : null}</div> : null}

          {activeTab === 'problems' ? <div className="drawer-tool-section problems-panel">
          {problemCount === 0 ? <p className="empty-panel-message">No problems detected.</p> : null}
          {document.diagnostics.length > 0 ? (
            <details className="diagnostics" aria-label="Spatial declaration diagnostics">
              <summary>Diagnostics</summary>
              <ul>
                {document.diagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.line}-${index}`}>
                    <strong>Line {diagnostic.line}:</strong> {diagnostic.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {rejectedTransactions.length > 0 ? (
            <details className="diagnostics" aria-label="Spatial transaction diagnostics">
              <summary>Spatial transaction diagnostics</summary>
              <ul>
                {rejectedTransactions.map((rejection) => (
                  <li key={rejection.id}>
                    <strong>{rejection.id}:</strong> {rejection.memoPreview || '(empty memo)'}
                    <ul>
                      {rejection.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          </div> : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
