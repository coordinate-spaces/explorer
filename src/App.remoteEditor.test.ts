/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';

const resetEffect = appSource.match(/useEffect\(\(\) => \{\n    setRemoteEditor\(\{([\s\S]*?)\n  \}, \[remoteEditorPublicKey\]\);/)?.[0];

describe('remote editor lifecycle', () => {
  it('clears received transactions and reconnects when the primary key changes', () => {
    expect(resetEffect).toContain('publicKey: remoteEditorPublicKey');
    expect(resetEffect).toContain('endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT');
    expect(resetEffect).toContain('transactions: []');
    expect(resetEffect).toContain("realtimeStatus: 'connecting'");
  });

  it('does not reset or resubscribe for baseline or height-range changes', () => {
    expect(resetEffect).not.toContain('remoteBaselineSource');
    expect(resetEffect).not.toContain('transactionRange');
    expect(appSource).toContain('key={remoteEditorPublicKey}');
    expect(appSource).toContain('publicKey={remoteEditorPublicKey}');
  });

  it('uses the trimmed subscription identity as the reset dependency', () => {
    expect(appSource).toContain('const remoteEditorPublicKey = transactionPublicKey.trim();');
    expect(resetEffect).toContain('}, [remoteEditorPublicKey]);');
    expect(resetEffect).not.toContain('}, [transactionPublicKey]);');
  });

  it('does not load remote-editor history, leaving realtime delivery as its only input', () => {
    expect(resetEffect).not.toContain('fetchPublicKeyTransactions');
    expect(resetEffect).not.toContain('AbortController');
    expect(resetEffect).not.toContain('mergeHistoricalStreamTransactions');
    expect(appSource.match(/handleRemoteEditorTransaction[\s\S]*?\n  \}, \[remoteEditorPublicKey\]\);/)?.[0])
      .toContain('mergeStreamTransactions(existing, [normalizeXyzDslTransaction(transaction)])');
  });

  it('connects the baseline editor before simulation and cursors only after it starts', () => {
    expect(appSource).toContain("simulationMode === 'stopped' && remoteEditorPublicKey");
    expect(appSource).toContain("simulationMode !== 'stopped' ? validSecondaryKeyReferences.map");
  });

  it('keeps cursor declarations out of the authored scene while stopped without removing the remote baseline', () => {
    expect(appSource).toContain("simulationMode === 'stopped' ? [] : secondaryTransactionOverlayStreams");
    expect(appSource).not.toContain("simulationMode === 'stopped' ? '' : remoteEditorSource");
  });

  it('closes authoring UI when simulation starts', () => {
    const startSimulation = appSource.match(/const startSimulation = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[baselineRevision\]\);/)?.[0];
    expect(startSimulation).toContain("setAppMode('viewer')");
    expect(startSimulation).toContain('setDrawerOpen(false)');
    expect(appSource).toContain("authoringAvailable={simulationMode === 'stopped'}");
  });

  it('advances cursor playback only while the simulation is running', () => {
    expect(appSource).toContain("if (simulationMode !== 'running') {\n      return undefined;");
    expect(appSource).toContain('playbackBaseTransactionTime: stream.transactions[clampPlaybackIndex(stream.playbackIndex, stream.transactions.length)]?.time');
  });
});
