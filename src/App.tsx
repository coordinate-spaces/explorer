import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canEditDeclarationLine, moveDeclarationPath, resizeDeclarationPath, rotateDeclarationPath, updateDeclarationProperty } from './xyzdsl/editXyzDslSource';
import type { AxisName } from './xyzdsl/types';
import { createSpatialDocument } from './model/createSpatialDocument';
import { AccumulativeSpatialTimeline, accumulativePhysicsFrameKey } from './transactions/AccumulativeSpatialTimeline';
import type { SpatialNode } from './model/SpatialNode';
import {
  findNodeById,
  findNodeByLineNumber,
  findNodePathById,
  lineNumberForNode,
  sceneHighlightIdForNode,
  selectionTargetForNodeId,
} from './selection';
import { SceneRoot } from './scene/SceneRoot';
import { fetchPublicKeyTransactions, fetchTipHeight, normalizeEndpoint } from './transactions/publicKeyTransactions';
import { createPublicKeyShareUrl, readPublicKeyFromUrl } from './transactions/publicKeyShareUrl';
import { composeSpatialEditorSourceBundle, originsForEditedSource } from './transactions/composeTransactionSources';
import { DEFAULT_OVERLAY_TRANSACTION_ENDPOINT, normalizeXyzDslTransaction, normalizeXyzDslTransactions, transactionsToRemoteEditorSource, transactionsToXyzDslSource } from './transactions/transactionXyzDsl';
import { clampPlaybackIndex, currentPlaybackTransaction, hasPlaybackReachedEnd, mergeHistoricalStreamTransactions, mergeStreamTransactions, normalizePlaybackSpeed, outgoingTransactionsForPublicKey, playbackIndexForElapsedTime, playbackTickIntervalMilliseconds, playbackTimeForElapsedTime, scaledPlaybackElapsedSeconds, sortTransactionsByTimeStable } from './transactions/streamTransactions';
import type { ActiveSecondaryTransactionStream, RemoteSpatialEditor, XyzDslTransaction, SecondaryKeyReference, SecondaryProjection, SecondaryRealtimeStatus, TransactionRange } from './transactions/types';
import { usePublicKeyTransactions } from './transactions/usePublicKeyTransactions';
import { useRealtimePublicKeyTransactions } from './transactions/useRealtimePublicKeyTransactions';
import { XyzDslDrawer } from './ui/XyzDslDrawer';
import { SelectedNodeInspector } from './ui/SelectedNodeInspector';
import { usePersistentState } from './ui/usePersistentState';

const INITIAL_XYZDSL = `"+2+4/+0+6/+1+3" : "geometry: cylinder; color: 0x333333; metalness: 0.8; roughness: 0.2"
"+2+4/+7+6/+0+10c" : "geometry: cone; color: yellow; metalness: 0.2; roughness: 0.5"
"+7+6/+0+15/+0+50c" : "geometry: sphere; color: blue; metalness: 0.1; roughness: 0.2"

"Table/+18+8/+0+5/+4+8" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0+8/+4+1/+0+8" : ""
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+0+1/+0+5/+0+1" : ""
"Table/Leg/+7+1/+0+5/+0+1" : ""
"Table/Leg/+0+1/+0+5/+7+1" : ""
"Table/Leg/+7+1/+0+5/+7+1" : ""`;

const DEFAULT_TRANSACTION_ENDPOINT = 'wss://sure-formerly-filly.ngrok-free.app/00000000e29a7850088d660489b7b9ae2da763bc3bd83324ecc54eee04840adb';

const DEFAULT_TRANSACTION_RANGE: TransactionRange = {
  startHeight: 0,
  endHeight: 0,
  limit: 500,
};

const SHARED_TRANSACTION_PUBLIC_KEY = readPublicKeyFromUrl();

interface ActiveSecondaryTransactions {
  reference: SecondaryKeyReference;
  transactions: XyzDslTransaction[];
  playbackIndex: number;
  playbackSpeed?: number;
  realtimeStatus: SecondaryRealtimeStatus;
  streamError?: string;
  replaying: boolean;
  historyLoading?: boolean;
  playbackStartedAtMs?: number;
  playbackBaseTransactionTime?: number;
}

interface LineChangeSummary {
  added: number;
  removed: number;
}

function countLines(source: string): Map<string, number> {
  const counts = new Map<string, number>();

  source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => counts.set(line, (counts.get(line) ?? 0) + 1));

  return counts;
}

function streamKeyForSecondaryReference(reference: Pick<SecondaryKeyReference, 'publicKey'>): string {
  return reference.publicKey;
}

function uniqueSecondaryReferences(references: readonly SecondaryKeyReference[]): SecondaryKeyReference[] {
  const uniqueReferences = new Map<string, SecondaryKeyReference>();

  references.forEach((reference) => {
    const key = streamKeyForSecondaryReference(reference);

    if (!uniqueReferences.has(key)) {
      uniqueReferences.set(key, reference);
    }
  });

  return [...uniqueReferences.values()];
}

function referencesBySecondaryProjection(references: readonly SecondaryKeyReference[]): Map<string, SecondaryKeyReference[]> {
  const grouped = new Map<string, SecondaryKeyReference[]>();

  references.forEach((reference) => {
    const key = streamKeyForSecondaryReference(reference);
    grouped.set(key, [...(grouped.get(key) ?? []), reference]);
  });

  return grouped;
}

function normalizeActiveSecondaryStream(
  stream: ActiveSecondaryTransactions | undefined,
  reference: SecondaryKeyReference,
): ActiveSecondaryTransactions {
  const transactions = outgoingTransactionsForPublicKey(
    normalizeXyzDslTransactions(stream?.transactions ?? []),
    reference.publicKey,
  );
  const defaultPlaybackIndex = transactions.length > 0 ? transactions.length - 1 : 0;
  const playbackIndex = Math.min(Math.max(stream?.playbackIndex ?? defaultPlaybackIndex, 0), defaultPlaybackIndex);

  return {
    reference,
    transactions,
    playbackIndex,
    playbackSpeed: normalizePlaybackSpeed(stream?.playbackSpeed),
    replaying: stream?.replaying === true && playbackIndex < defaultPlaybackIndex,
    realtimeStatus: stream?.realtimeStatus ?? 'connecting',
    streamError: stream?.streamError,
    historyLoading: stream?.historyLoading,
    playbackStartedAtMs: stream?.playbackStartedAtMs,
    playbackBaseTransactionTime: stream?.playbackBaseTransactionTime,
  };
}

function endpointValidationError(endpoint: string): string | undefined {
  try {
    new URL(normalizeEndpoint(endpoint));
    return undefined;
  } catch (caught) {
    return caught instanceof Error ? caught.message : 'Endpoint is not a valid WebSocket URL.';
  }
}

function summarizeLineChanges(originalSource: string, nextSource: string): LineChangeSummary {
  const originalLines = countLines(originalSource);
  const nextLines = countLines(nextSource);
  let added = 0;
  let removed = 0;

  nextLines.forEach((count, line) => {
    added += Math.max(0, count - (originalLines.get(line) ?? 0));
  });

  originalLines.forEach((count, line) => {
    removed += Math.max(0, count - (nextLines.get(line) ?? 0));
  });

  return { added, removed };
}

interface SecondaryRealtimeSubscriptionProps {
  reference: SecondaryKeyReference;
  onTransaction: (reference: SecondaryKeyReference, transaction: XyzDslTransaction) => void;
  onError: (reference: SecondaryKeyReference, error: Error) => void;
  onStatusChange: (reference: SecondaryKeyReference, status: SecondaryRealtimeStatus) => void;
}

function SecondaryRealtimeSubscription({
  reference,
  onTransaction,
  onError,
  onStatusChange,
}: SecondaryRealtimeSubscriptionProps) {
  useRealtimePublicKeyTransactions({
    endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT,
    publicKey: reference.publicKey,
    onTransaction: (transaction) => onTransaction(reference, transaction),
    onError: (error) => onError(reference, error),
    onStatusChange: (status) => onStatusChange(reference, status),
  });

  return null;
}

interface RemoteEditorRealtimeSubscriptionProps {
  publicKey: string;
  onTransaction: (transaction: XyzDslTransaction) => void;
  onError: (error: Error) => void;
  onStatusChange: (status: SecondaryRealtimeStatus) => void;
}

/** Subscribes to the canonical remote editor on the shared overlay node. */
function RemoteEditorRealtimeSubscription({
  publicKey,
  onTransaction,
  onError,
  onStatusChange,
}: RemoteEditorRealtimeSubscriptionProps) {
  useRealtimePublicKeyTransactions({
    endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT,
    publicKey,
    onTransaction,
    onError,
    onStatusChange,
  });

  return null;
}

export default function App() {
  const [authoringSource, setAuthoringSource] = useState(INITIAL_XYZDSL);
  const [remoteBaselineAppliedToEditor, setRemoteBaselineAppliedToEditor] = useState('');
  const latestRemoteBaselineRef = useRef('');
  const [appMode, setAppMode] = useState<'viewer' | 'editor'>('viewer');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedLeafNodeId, setSelectedLeafNodeId] = useState<string | undefined>();
  const [selectedSceneHighlightNodeId, setSelectedSceneHighlightNodeId] = useState<string | undefined>();
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | undefined>();
  const [transactionPublicKey, setTransactionPublicKey] = usePersistentState(
    'xyzdsl-transaction-public-key',
    '',
    SHARED_TRANSACTION_PUBLIC_KEY,
  );
  const [transactionRange, setTransactionRange] = useState<TransactionRange>(DEFAULT_TRANSACTION_RANGE);
  const [tipHeight, setTipHeight] = useState<number | undefined>();
  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState<string | undefined>();
  const [activeSecondaryTransactions, setActiveSecondaryTransactions] = usePersistentState<Record<string, ActiveSecondaryTransactions>>('xyzdsl-active-secondary-transaction-streams-v2', {});
  const [secondaryTransactionError, setSecondaryTransactionError] = useState<string | undefined>();
  const [remoteEditor, setRemoteEditor] = useState<RemoteSpatialEditor>({
    publicKey: '',
    endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT,
    transactions: [],
    realtimeStatus: 'connecting',
  });
  const remoteEditorPublicKey = transactionPublicKey.trim();

  useEffect(() => {
    setActiveSecondaryTransactions((streams) => {
      const playbackStartedAtMs = Date.now();

      return Object.fromEntries(Object.entries(streams).map(([streamKey, stream]) => {
        const playbackBaseTransactionTime = stream.replaying
          ? stream.transactions[clampPlaybackIndex(stream.playbackIndex, stream.transactions.length)]?.time
          : undefined;

        return [streamKey, {
          ...stream,
          historyLoading: false,
          playbackStartedAtMs: stream.replaying ? playbackStartedAtMs : undefined,
          playbackBaseTransactionTime,
        }];
      }));
    });
  }, [setActiveSecondaryTransactions]);

  const transactionPublicKeyShareUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    return createPublicKeyShareUrl(transactionPublicKey, window.location.href);
  }, [transactionPublicKey]);

  useEffect(() => {
    if (SHARED_TRANSACTION_PUBLIC_KEY !== undefined) {
      setTransactionPublicKey(SHARED_TRANSACTION_PUBLIC_KEY);
    }
  }, [setTransactionPublicKey]);

  const {
    transactions: historicalTransactions,
    loading: transactionsLoading,
    error: transactionError,
    reload: reloadTransactions,
  } = usePublicKeyTransactions({
    endpoint: DEFAULT_TRANSACTION_ENDPOINT,
    publicKey: transactionPublicKey,
    range: transactionRange,
  });
  const transactions = historicalTransactions;
  const loadTipHeight = useCallback((onTipLoaded?: () => void) => {
    const controller = new AbortController();
    setTipLoading(true);
    setTipError(undefined);

    fetchTipHeight(DEFAULT_TRANSACTION_ENDPOINT, controller.signal)
      .then((height) => {
        setTipHeight(height);
        setTransactionRange((range) => ({
          ...range,
          startHeight: height,
          endHeight: Math.min(range.endHeight, height),
          limit: DEFAULT_TRANSACTION_RANGE.limit,
        }));
        onTipLoaded?.();
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          return;
        }

        setTipError(caught instanceof Error ? caught.message : 'Unable to load blockchain tip.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTipLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => loadTipHeight(), [loadTipHeight]);

  useEffect(() => {
    if (appMode === 'viewer') {
      setDrawerOpen(false);
    }
  }, [appMode]);

  const transactionXyzDsl = useMemo(
    () => transactionsToXyzDslSource(transactions, { publicKey: transactionPublicKey }),
    [transactions, transactionPublicKey],
  );
  const primaryRemoteBaselineSource = transactionXyzDsl.source;
  const secondaryKeyReferences = useMemo(
    () => uniqueSecondaryReferences(transactionXyzDsl.secondaryKeys),
    [transactionXyzDsl.secondaryKeys],
  );

  const handleSecondaryRealtimeTransaction = useCallback((reference: SecondaryKeyReference, transaction: XyzDslTransaction) => {
    const streamKey = streamKeyForSecondaryReference(reference);

    setActiveSecondaryTransactions((streams) => {
      const current = normalizeActiveSecondaryStream(streams[streamKey], reference);
      const transactions = sortTransactionsByTimeStable(mergeStreamTransactions(current.transactions, [transaction]));

      return {
        ...streams,
        [streamKey]: {
          ...current,
          reference,
          transactions,
          playbackIndex: current.replaying ? current.playbackIndex : Math.max(0, transactions.length - 1),
          streamError: undefined,
        },
      };
    });
  }, [setActiveSecondaryTransactions, transactionPublicKey]);

  const handleRemoteEditorTransaction = useCallback((transaction: XyzDslTransaction) => {
    if (!remoteEditorPublicKey || transaction.from !== remoteEditorPublicKey) {
      return;
    }

    setRemoteEditor((editor) => {
      const existing = editor.publicKey === remoteEditorPublicKey ? editor.transactions : [];
      return {
        publicKey: remoteEditorPublicKey,
        endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT,
        transactions: sortTransactionsByTimeStable(mergeStreamTransactions(existing, [normalizeXyzDslTransaction(transaction)])),
        realtimeStatus: editor.realtimeStatus,
      };
    });
  }, [remoteEditorPublicKey]);

  const handleRemoteEditorStatusChange = useCallback((realtimeStatus: SecondaryRealtimeStatus) => {
    setRemoteEditor((editor) => ({
      ...editor,
      realtimeStatus,
      streamError: realtimeStatus === 'connected' ? undefined : editor.streamError,
    }));
  }, []);

  const handleRemoteEditorError = useCallback((error: Error) => {
    setRemoteEditor((editor) => ({ ...editor, realtimeStatus: 'error', streamError: error.message }));
  }, []);

  const handleSecondaryRealtimeStatusChange = useCallback((
    reference: SecondaryKeyReference,
    realtimeStatus: SecondaryRealtimeStatus,
  ) => {
    const streamKey = streamKeyForSecondaryReference(reference);

    setActiveSecondaryTransactions((streams) => {
      const current = normalizeActiveSecondaryStream(streams[streamKey], reference);

      return {
        ...streams,
        [streamKey]: {
          ...current,
          realtimeStatus,
          streamError: realtimeStatus === 'connected' ? undefined : current.streamError,
        },
      };
    });
  }, [setActiveSecondaryTransactions, transactionPublicKey]);

  const handleSecondaryRealtimeError = useCallback((reference: SecondaryKeyReference, error: Error) => {
    const streamKey = streamKeyForSecondaryReference(reference);
    setSecondaryTransactionError(error.message);
    setActiveSecondaryTransactions((streams) => {
      const current = normalizeActiveSecondaryStream(streams[streamKey], reference);

      return {
        ...streams,
        [streamKey]: {
          ...current,
          realtimeStatus: 'error',
          streamError: error.message,
        },
      };
    });
  }, [setActiveSecondaryTransactions, transactionPublicKey]);

  useEffect(() => {
    const endpointError = endpointValidationError(DEFAULT_OVERLAY_TRANSACTION_ENDPOINT);
    setSecondaryTransactionError(endpointError
      ? `Invalid shared secondary endpoint: ${endpointError}`
      : undefined);

    if (secondaryKeyReferences.length === 0) {
      setActiveSecondaryTransactions({});
      return;
    }

    setActiveSecondaryTransactions((streams) => {
      const activeStreamKeys = new Set(secondaryKeyReferences.map(streamKeyForSecondaryReference));
      const nextStreams = Object.fromEntries(Object.entries(streams).filter(([key]) => activeStreamKeys.has(key)));

      secondaryKeyReferences.forEach((reference) => {
        const streamKey = streamKeyForSecondaryReference(reference);
        const validationError = endpointError;
        const current = normalizeActiveSecondaryStream(nextStreams[streamKey], reference);

        nextStreams[streamKey] = validationError
          ? { ...current, realtimeStatus: 'error', streamError: validationError }
          : current;
      });

      return nextStreams;
    });
  }, [secondaryKeyReferences, setActiveSecondaryTransactions, transactionPublicKey]);

  const validSecondaryKeyReferences = endpointValidationError(DEFAULT_OVERLAY_TRANSACTION_ENDPOINT) === undefined
    ? secondaryKeyReferences
    : [];

  useEffect(() => {
    const replayingStreams = Object.values(activeSecondaryTransactions).filter((stream) => stream.replaying);

    if (replayingStreams.length === 0) {
      return undefined;
    }

    const playbackTickMilliseconds = Math.min(...replayingStreams.map((stream) => playbackTickIntervalMilliseconds(
      stream.transactions,
      stream.playbackSpeed,
    )));

    const interval = window.setInterval(() => {
      setActiveSecondaryTransactions((streams) => Object.fromEntries(Object.entries(streams).map(([streamKey, stream]) => {
        if (!stream.replaying) {
          return [streamKey, stream];
        }

        const playbackStartedAtMs = stream.playbackStartedAtMs ?? Date.now();
        const playbackBaseTransactionTime = stream.playbackBaseTransactionTime ?? stream.transactions[0]?.time ?? 0;
        const elapsedSeconds = scaledPlaybackElapsedSeconds(
          (Date.now() - playbackStartedAtMs) / 1000,
          stream.playbackSpeed,
        );
        const playbackIndex = playbackIndexForElapsedTime(
          stream.transactions,
          elapsedSeconds,
          playbackBaseTransactionTime,
        );

        return [streamKey, {
          ...stream,
          playbackStartedAtMs,
          playbackBaseTransactionTime,
          playbackIndex,
          replaying: !hasPlaybackReachedEnd(
            stream.transactions,
            playbackIndex,
            elapsedSeconds,
            playbackBaseTransactionTime,
          ),
        }];
      })));
    }, playbackTickMilliseconds);

    return () => window.clearInterval(interval);
  }, [activeSecondaryTransactions, setActiveSecondaryTransactions]);

  const secondaryTransactionStreams = useMemo<ActiveSecondaryTransactionStream[]>(() => Object.values(activeSecondaryTransactions)
    .map(({ reference, transactions: secondaryTransactions, playbackIndex, playbackSpeed, replaying, realtimeStatus, streamError, historyLoading }) => ({
      publicKey: reference.publicKey,
      endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT,
      transactions: secondaryTransactions,
      playbackIndex,
      playbackSpeed: normalizePlaybackSpeed(playbackSpeed),
      replaying,
      realtimeStatus,
      streamError,
      historyLoading,
      currentTransactionRejectedDiagnostics: [],
    })), [activeSecondaryTransactions]);

  const secondaryTransactionOverlayStreams = useMemo(() => secondaryTransactionStreams
    .map(({ publicKey, endpoint, transactions: secondaryTransactions, playbackIndex }) => {
      const currentTransaction = currentPlaybackTransaction(secondaryTransactions, playbackIndex);
      const xyzdslResult = transactionsToXyzDslSource(currentTransaction ? [currentTransaction] : [], {
        publicKey,
      });

      return {
        id: `${publicKey}@@${endpoint}`,
        publicKey,
        endpoint,
        transactionId: currentTransaction?.signature,
        transactionTime: currentTransaction?.time,
        transactionAmount: currentTransaction?.amount,
        declarations: xyzdslResult.source,
        xyzdslResult,
      };
    }), [secondaryTransactionStreams]);
  const secondaryTransactionStreamsWithDiagnostics = useMemo<ActiveSecondaryTransactionStream[]>(() => {
    const diagnosticsByStreamId = new Map(
      secondaryTransactionOverlayStreams.map((stream) => [stream.id, stream.xyzdslResult.rejected]),
    );

    return secondaryTransactionStreams.map((stream) => ({
      ...stream,
      currentTransactionRejectedDiagnostics: diagnosticsByStreamId.get(`${stream.publicKey}@@${stream.endpoint}`) ?? [],
    }));
  }, [secondaryTransactionOverlayStreams, secondaryTransactionStreams]);
  const remoteEditorSource = useMemo(() => transactionsToRemoteEditorSource(
    remoteEditor.transactions,
    remoteEditor.publicKey,
  ), [remoteEditor.publicKey, remoteEditor.transactions]);
  const secondaryProjections = useMemo<SecondaryProjection[]>(() => {
    const referencesByProjection = referencesBySecondaryProjection(transactionXyzDsl.secondaryKeys);

    return secondaryTransactionStreamsWithDiagnostics.map((stream) => ({
      ...stream,
      references: referencesByProjection.get(streamKeyForSecondaryReference(stream)) ?? [],
      compositionPolicy: 'consume-primary-namespaces',
    }));
  }, [secondaryTransactionStreamsWithDiagnostics, transactionXyzDsl.secondaryKeys]);
  const remoteBaselineSource = primaryRemoteBaselineSource;
  const hasRemoteBaseline = remoteBaselineSource.trim().length > 0;
  const hasAuthoringEdits = hasRemoteBaseline
    ? authoringSource !== remoteBaselineAppliedToEditor
    : authoringSource !== INITIAL_XYZDSL;
  const remoteBaselineChanged = hasRemoteBaseline && remoteBaselineSource !== remoteBaselineAppliedToEditor;

  useEffect(() => {
    if (!hasRemoteBaseline) {
      return;
    }

    const previousRemoteBaseline = latestRemoteBaselineRef.current;

    if (remoteBaselineSource === previousRemoteBaseline) {
      return;
    }

    latestRemoteBaselineRef.current = remoteBaselineSource;

    const currentHasEdits = remoteBaselineAppliedToEditor.trim().length > 0
      ? authoringSource !== remoteBaselineAppliedToEditor
      : authoringSource !== INITIAL_XYZDSL;

    if (currentHasEdits) {
      return;
    }

    setRemoteBaselineAppliedToEditor(remoteBaselineSource);
    setAuthoringSource(remoteBaselineSource);
  }, [authoringSource, hasRemoteBaseline, remoteBaselineAppliedToEditor, remoteBaselineSource]);

  useEffect(() => {
    setRemoteEditor({
      publicKey: remoteEditorPublicKey,
      endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT,
      transactions: [],
      realtimeStatus: 'connecting',
    });
  }, [remoteEditorPublicKey]);

  const authoringChangeSummary = useMemo(
    () => summarizeLineChanges(remoteBaselineAppliedToEditor, authoringSource),
    [authoringSource, remoteBaselineAppliedToEditor],
  );
  const authoringOriginsByLine = useMemo(
    () => originsForEditedSource(authoringSource, primaryRemoteBaselineSource, transactionXyzDsl.originsByLine),
    [authoringSource, primaryRemoteBaselineSource, transactionXyzDsl.originsByLine],
  );
  const renderedBundle = useMemo(
    () => composeSpatialEditorSourceBundle(authoringSource, secondaryTransactionOverlayStreams, remoteEditorSource,
      authoringOriginsByLine),
    [authoringOriginsByLine, authoringSource, remoteEditorSource, secondaryTransactionOverlayStreams],
  );
  const renderedSource = renderedBundle.source;
  const accumulativeTimelineRef = useRef<AccumulativeSpatialTimeline | undefined>(undefined);
  const evaluatedPhysicsFrameRef = useRef<string | undefined>(undefined);
  const [document, setDocument] = useState(() => createSpatialDocument(renderedBundle.source, {
    originsByLine: renderedBundle.originsByLine,
  }));
  useEffect(() => {
    accumulativeTimelineRef.current ??= new AccumulativeSpatialTimeline();
    const frameKey = accumulativePhysicsFrameKey(renderedBundle.source, renderedBundle.originsByLine);
    const isNewTransactionFrame = frameKey !== undefined && frameKey !== evaluatedPhysicsFrameRef.current;
    if (isNewTransactionFrame) evaluatedPhysicsFrameRef.current = frameKey;
    const frame = isNewTransactionFrame
      ? accumulativeTimelineRef.current.evaluate(renderedBundle.source, renderedBundle.originsByLine)
      : accumulativeTimelineRef.current.compile(renderedBundle.source, renderedBundle.originsByLine);
    setDocument(frame.document);
  }, [renderedBundle]);
  const selectedNode = useMemo(
    () => findNodeById(document.nodes, selectedNodeId) ?? findNodeByLineNumber(document.nodes, selectedLineNumber),
    [document.nodes, selectedLineNumber, selectedNodeId],
  );
  const selectedNodeLineNumber = lineNumberForNode(selectedNode) ?? selectedLineNumber;
  const selectedHierarchyPath = useMemo(() => {
    const leafPath = findNodePathById(document.nodes, selectedLeafNodeId);

    if (selectedNode && leafPath.some((node) => node.id === selectedNode.id)) {
      return leafPath;
    }

    return selectedNode ? findNodePathById(document.nodes, selectedNode.id) : [];
  }, [document.nodes, selectedLeafNodeId, selectedNode]);
  const selectedSceneNodeId = selectedSceneHighlightNodeId ?? sceneHighlightIdForNode(document.nodes, selectedNode) ?? selectedNodeId;
  const selectedNodeCanEdit = selectedNodeLineNumber !== undefined && canEditDeclarationLine(authoringSource, selectedNodeLineNumber);


  const handleSecondaryReplay = useCallback((publicKey: string) => {
    const streamKey = streamKeyForSecondaryReference({ publicKey });

    setActiveSecondaryTransactions((streams) => {
      const stream = streams[streamKey];

      if (!stream) {
        return streams;
      }

      return {
        ...streams,
        [streamKey]: {
          ...stream,
          playbackIndex: 0,
          replaying: stream.transactions.length > 1,
          playbackStartedAtMs: Date.now(),
          playbackBaseTransactionTime: stream.transactions[0]?.time,
        },
      };
    });
  }, [setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackToggle = useCallback((publicKey: string) => {
    const streamKey = streamKeyForSecondaryReference({ publicKey });

    setActiveSecondaryTransactions((streams) => {
      const stream = streams[streamKey];

      if (!stream) {
        return streams;
      }

      return {
        ...streams,
        [streamKey]: {
          ...stream,
          replaying: !stream.replaying && stream.playbackIndex < stream.transactions.length - 1,
          playbackStartedAtMs: !stream.replaying ? Date.now() : stream.playbackStartedAtMs,
          playbackBaseTransactionTime: !stream.replaying
            ? stream.transactions[stream.playbackIndex]?.time
            : stream.playbackBaseTransactionTime,
        },
      };
    });
  }, [setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackSpeedChange = useCallback((
    publicKey: string,
    playbackSpeed: number,
  ) => {
    const streamKey = streamKeyForSecondaryReference({ publicKey });

    setActiveSecondaryTransactions((streams) => {
      const stream = streams[streamKey];

      if (!stream) {
        return streams;
      }

      const now = Date.now();
      const playbackStartedAtMs = stream.playbackStartedAtMs ?? now;
      const playbackBaseTransactionTime = stream.playbackBaseTransactionTime ?? stream.transactions[0]?.time ?? 0;
      const elapsedSeconds = (now - playbackStartedAtMs) / 1000;
      const playbackTime = playbackTimeForElapsedTime(
        playbackBaseTransactionTime,
        elapsedSeconds,
        stream.playbackSpeed,
      );

      return {
        ...streams,
        [streamKey]: {
          ...stream,
          playbackSpeed: normalizePlaybackSpeed(playbackSpeed),
          playbackIndex: stream.replaying
            ? playbackIndexForElapsedTime(stream.transactions, 0, playbackTime)
            : stream.playbackIndex,
          playbackStartedAtMs: stream.replaying ? now : stream.playbackStartedAtMs,
          playbackBaseTransactionTime: stream.replaying
            ? playbackTime
            : stream.playbackBaseTransactionTime,
        },
      };
    });
  }, [setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackSeek = useCallback((
    publicKey: string,
    playbackIndex: number,
  ) => {
    const streamKey = streamKeyForSecondaryReference({ publicKey });

    setActiveSecondaryTransactions((streams) => {
      const stream = streams[streamKey];

      if (!stream) {
        return streams;
      }

      return {
        ...streams,
        [streamKey]: {
          ...stream,
          playbackIndex: clampPlaybackIndex(playbackIndex, stream.transactions.length),
          replaying: false,
          playbackStartedAtMs: undefined,
          playbackBaseTransactionTime: undefined,
        },
      };
    });
  }, [setActiveSecondaryTransactions]);

  const handleLoadSecondaryHistory = useCallback((publicKey: string) => {
    const streamKey = streamKeyForSecondaryReference({ publicKey });
    const controller = new AbortController();

    setActiveSecondaryTransactions((streams) => {
      const stream = streams[streamKey];

      return stream ? {
        ...streams,
        [streamKey]: {
          ...stream,
          historyLoading: true,
        },
      } : streams;
    });

    fetchPublicKeyTransactions({ endpoint: DEFAULT_OVERLAY_TRANSACTION_ENDPOINT, publicKey, range: transactionRange, signal: controller.signal })
      .then((historicalTransactions) => {
        setActiveSecondaryTransactions((streams) => {
          const stream = streams[streamKey];

          if (!stream) {
            return streams;
          }

          const outgoingHistoricalTransactions = outgoingTransactionsForPublicKey(
            normalizeXyzDslTransactions(historicalTransactions),
            publicKey,
          );
          const transactions = sortTransactionsByTimeStable(mergeHistoricalStreamTransactions(stream.transactions, outgoingHistoricalTransactions));
          return {
            ...streams,
            [streamKey]: {
              ...stream,
              transactions,
              playbackIndex: stream.replaying ? stream.playbackIndex : Math.max(0, transactions.length - 1),
              historyLoading: false,
            },
          };
        });
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          return;
        }

        setSecondaryTransactionError(caught instanceof Error ? caught.message : 'Unable to load secondary transaction history.');
        setActiveSecondaryTransactions((streams) => {
          const stream = streams[streamKey];

          return stream ? {
            ...streams,
            [streamKey]: {
              ...stream,
              historyLoading: false,
            },
          } : streams;
        });
      });

    return () => controller.abort();
  }, [setActiveSecondaryTransactions, transactionRange]);

  const handleAuthoringSourceChange = useCallback((nextSource: string) => {
    setAuthoringSource(nextSource);
  }, []);

  const handleModeChange = useCallback((mode: 'viewer' | 'editor') => {
    setAppMode(mode);

    if (mode === 'editor') {
      setDrawerOpen(true);
    }
  }, []);

  const handleSelectNode = useCallback((id: string | undefined) => {
    if (id === undefined) {
      setSelectedNodeId(undefined);
      setSelectedLeafNodeId(undefined);
      setSelectedSceneHighlightNodeId(undefined);
      setSelectedLineNumber(undefined);
      return;
    }

    const targetNode = selectionTargetForNodeId(document.nodes, id);

    setSelectedLeafNodeId(id);
    setSelectedSceneHighlightNodeId(id);
    setSelectedNodeId(targetNode?.id ?? id);
    setSelectedLineNumber(lineNumberForNode(targetNode));
  }, [document.nodes]);

  const handleSelectHierarchyNode = useCallback((id: string) => {
    const targetNode = findNodeById(document.nodes, id);

    setSelectedNodeId(targetNode?.id ?? id);
    setSelectedLineNumber(lineNumberForNode(targetNode));
  }, [document.nodes]);

  const handleSelectExactNode = useCallback((id: string) => {
    const targetNode = findNodeById(document.nodes, id);

    setSelectedLeafNodeId(id);
    setSelectedSceneHighlightNodeId(sceneHighlightIdForNode(document.nodes, targetNode));
    setSelectedNodeId(targetNode?.id ?? id);
    setSelectedLineNumber(lineNumberForNode(targetNode));
  }, [document.nodes]);

  const editSelectedDeclaration = useCallback((edit: (source: string, lineNumber: number) => string) => {
    if (selectedNodeLineNumber === undefined) {
      return;
    }

    setAuthoringSource((source) => edit(source, selectedNodeLineNumber));
  }, [selectedNodeLineNumber]);

  const moveSelectedDeclaration = useCallback((axis: AxisName, delta: number) => {
    editSelectedDeclaration((source, lineNumber) => moveDeclarationPath(source, lineNumber, axis, delta, document.coordinateSpace));
  }, [document.coordinateSpace, editSelectedDeclaration]);

  const resizeSelectedDeclaration = useCallback((axis: AxisName, delta: number) => {
    editSelectedDeclaration((source, lineNumber) => resizeDeclarationPath(source, lineNumber, axis, delta));
  }, [editSelectedDeclaration]);

  const rotateSelectedDeclaration = useCallback((axis: AxisName, deltaDegrees: number) => {
    const inheritedRotation = selectedNode?.localTransform?.rotation ?? selectedNode?.transform.rotation;
    const inheritedRotationDegrees = inheritedRotation?.map((radian) => (radian * 180) / Math.PI) as [number, number, number] | undefined;

    editSelectedDeclaration((source, lineNumber) => rotateDeclarationPath(source, lineNumber, axis, deltaDegrees, inheritedRotationDegrees));
  }, [editSelectedDeclaration, selectedNode]);

  const updateSelectedDeclarationProperty = useCallback((key: string, value: string) => {
    editSelectedDeclaration((source, lineNumber) => updateDeclarationProperty(source, lineNumber, key, value));
  }, [editSelectedDeclaration]);

  const resetAuthoringToRemote = useCallback(() => {
    if (!hasRemoteBaseline) {
      return;
    }

    if (hasAuthoringEdits && !window.confirm('Discard local spatial declaration edits and reset to the latest remote declarations?')) {
      return;
    }

    setAuthoringSource(remoteBaselineSource);
    setRemoteBaselineAppliedToEditor(remoteBaselineSource);
  }, [hasAuthoringEdits, hasRemoteBaseline, remoteBaselineSource]);

  return (
    <main className={`app-shell app-shell--${appMode}`}>
      {remoteEditorPublicKey && endpointValidationError(DEFAULT_OVERLAY_TRANSACTION_ENDPOINT) === undefined ? (
        <RemoteEditorRealtimeSubscription
          key={remoteEditorPublicKey}
          publicKey={remoteEditorPublicKey}
          onTransaction={handleRemoteEditorTransaction}
          onError={handleRemoteEditorError}
          onStatusChange={handleRemoteEditorStatusChange}
        />
      ) : null}
      {validSecondaryKeyReferences.map((reference) => (
        <SecondaryRealtimeSubscription
          key={streamKeyForSecondaryReference(reference)}
          reference={reference}
          onTransaction={handleSecondaryRealtimeTransaction}
          onError={handleSecondaryRealtimeError}
          onStatusChange={handleSecondaryRealtimeStatusChange}
        />
      ))}
      <SceneRoot
        document={document}
        selectedNodeId={selectedSceneNodeId}
        onSelectNode={handleSelectNode}
      />
      {appMode === 'editor' ? (
        <SelectedNodeInspector
          canEdit={selectedNodeCanEdit}
          node={selectedNode}
          selectionPath={selectedHierarchyPath}
          onClearSelection={() => handleSelectNode(undefined)}
          onMove={moveSelectedDeclaration}
          onPathNodeSelect={handleSelectHierarchyNode}
          onPropertyChange={updateSelectedDeclarationProperty}
          onResize={resizeSelectedDeclaration}
          onSelectNode={handleSelectExactNode}
          onRotate={rotateSelectedDeclaration}
        />
      ) : null}
      <XyzDslDrawer
        appMode={appMode}
        document={document}
        isOpen={drawerOpen}
        source={authoringSource}
        selectedLineNumber={selectedNodeLineNumber}
        transactionPublicKey={transactionPublicKey}
        transactionPublicKeyShareUrl={transactionPublicKeyShareUrl}
        transactionRange={transactionRange}
        transactionsLoading={transactionsLoading}
        transactionError={transactionError ?? secondaryTransactionError}
        tipHeight={tipHeight}
        tipLoading={tipLoading}
        tipError={tipError}
        transactionCount={transactions.length}
        acceptedTransactionCount={transactionXyzDsl.source ? transactionXyzDsl.source.split('\n').filter(Boolean).length : 0}
        mappedTransactionSource={remoteBaselineSource}
        rejectedTransactions={transactionXyzDsl.rejected}
        secondaryProjections={secondaryProjections}
        remoteEditor={remoteEditor}
        hasRemoteBaseline={hasRemoteBaseline}
        hasAuthoringEdits={hasAuthoringEdits}
        remoteBaselineChanged={remoteBaselineChanged}
        authoringChangeSummary={authoringChangeSummary}
        onChange={handleAuthoringSourceChange}
        onModeChange={handleModeChange}
        onResetToRemote={resetAuthoringToRemote}
        onTransactionPublicKeyChange={setTransactionPublicKey}
        onTransactionRangeChange={setTransactionRange}
        onReloadTransactions={reloadTransactions}
        onUseTransactionTip={loadTipHeight}
        onSecondaryReplay={handleSecondaryReplay}
        onSecondaryPlaybackToggle={handleSecondaryPlaybackToggle}
        onSecondaryPlaybackSpeedChange={handleSecondaryPlaybackSpeedChange}
        onSecondaryPlaybackSeek={handleSecondaryPlaybackSeek}
        onLoadSecondaryHistory={handleLoadSecondaryHistory}
        selectedNodeId={selectedNode?.id}
        onSelectNode={handleSelectExactNode}
      />
    </main>
  );
}
