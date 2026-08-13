import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canEditDeclarationLine, moveDeclarationPath, resizeDeclarationPath, rotateDeclarationPath, updateDeclarationProperty } from './xyzdsl/editXyzDslSource';
import type { AxisName } from './xyzdsl/types';
import { createSpatialDocument } from './model/createSpatialDocument';
import { AccumulativeSpatialTimeline, accumulativePhysicsFrameKey, spatialBaselineRevision } from './transactions/AccumulativeSpatialTimeline';
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
import { secondaryCameraTargetKey, type SecondaryCameraTarget } from './scene/secondaryCamera';
import { fetchPublicKeyTransactions, fetchTipHeight, normalizeEndpoint } from './transactions/publicKeyTransactions';
import { createPublicKeyShareUrl, readPublicKeyFromUrl } from './transactions/publicKeyShareUrl';
import { composeSpatialEditorSourceBundle, originsForEditedSource } from './transactions/composeTransactionSources';
import { latestSecondaryKeyReferences, normalizeXyzDslTransactions, transactionsToXyzDslSource } from './transactions/transactionXyzDsl';
import { clampPlaybackIndex, currentPlaybackTransaction, hasPlaybackReachedEnd, mergeHistoricalStreamTransactions, mergeStreamTransactions, normalizePlaybackSpeed, outgoingTransactionsForPublicKey, playbackIndexForElapsedTime, playbackTickIntervalMilliseconds, playbackTimeForElapsedTime, scaledPlaybackElapsedSeconds, sortTransactionsByTimeStable } from './transactions/streamTransactions';
import type { ActiveSecondaryTransactionStream, XyzDslTransaction, SecondaryKeyReference, SecondaryProjection, SecondaryRealtimeStatus, TransactionRange } from './transactions/types';
import { usePublicKeyTransactions } from './transactions/usePublicKeyTransactions';
import { useRealtimePublicKeyTransactions } from './transactions/useRealtimePublicKeyTransactions';
import { XyzDslDrawer } from './ui/XyzDslDrawer';
import { SelectedNodeInspector } from './ui/SelectedNodeInspector';
import { usePersistentState } from './ui/usePersistentState';
import { advanceLocalCursor, DEFAULT_LOCAL_CURSOR_POSE, LOCAL_CURSOR_STREAM_ID, localCursorXyzDsl, type LocalCursorInput } from './simulation/localCursor';

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

const DEFAULT_SECONDARY_TRANSACTION_ENDPOINT = 'wss://ungallant-unimpeding-kade.ngrok-free.dev/000006913ccf73b5990eb4833e4cdbd5ef58061384481ff1f6cee3cb7f18b2cd';

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

function streamKeyForSecondaryReference(reference: Pick<SecondaryKeyReference, 'publicKey' | 'endpoint'>): string {
  return `${reference.publicKey}@@${reference.endpoint}`;
}

function uniqueSecondaryReferences(references: readonly SecondaryKeyReference[]): SecondaryKeyReference[] {
  return latestSecondaryKeyReferences(references);
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
    endpoint: reference.endpoint,
    publicKey: reference.publicKey,
    onTransaction: (transaction) => onTransaction(reference, transaction),
    onError: (error) => onError(reference, error),
    onStatusChange: (status) => onStatusChange(reference, status),
  });

  return null;
}

export default function App() {
  const [authoringSource, setAuthoringSource] = useState(INITIAL_XYZDSL);
  const [remoteBaselineAppliedToEditor, setRemoteBaselineAppliedToEditor] = useState('');
  const latestRemoteBaselineRef = useRef('');
  const [appMode, setAppMode] = useState<'viewer' | 'editor'>('viewer');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [simulationMode, setSimulationMode] = useState<'stopped' | 'running' | 'paused'>('stopped');
  const [simulationSource, setSimulationSource] = useState<'remote' | 'local'>('remote');
  const [localCursorPose, setLocalCursorPose] = useState(DEFAULT_LOCAL_CURSOR_POSE);
  const [localCursorCaptured, setLocalCursorCaptured] = useState(false);
  const [secondaryCameraTarget, setSecondaryCameraTarget] = useState<SecondaryCameraTarget | undefined>();
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
          // UI ranges name inclusive block heights; the request serializer turns
          // this into the protocol's exclusive upper boundary (height + 1).
          startHeight: height,
          // Requests run backwards, so never leave the lower bound above the tip.
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
    () => transactionsToXyzDslSource(transactions, {
      publicKey: transactionPublicKey,
      nodeEndpoints: { primary: DEFAULT_TRANSACTION_ENDPOINT, secondary: DEFAULT_SECONDARY_TRANSACTION_ENDPOINT },
    }),
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
    const invalidReference = secondaryKeyReferences.find((reference) => endpointValidationError(reference.endpoint));
    const endpointError = invalidReference ? endpointValidationError(invalidReference.endpoint) : undefined;
    setSecondaryTransactionError(endpointError
      ? `Invalid secondary endpoint: ${endpointError}`
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
        const validationError = endpointValidationError(reference.endpoint);
        const current = normalizeActiveSecondaryStream(nextStreams[streamKey], reference);

        nextStreams[streamKey] = validationError
          ? { ...current, realtimeStatus: 'error', streamError: validationError }
          : current;
      });

      return nextStreams;
    });
  }, [secondaryKeyReferences, setActiveSecondaryTransactions, transactionPublicKey]);

  const validSecondaryKeyReferences = secondaryKeyReferences.filter(
    (reference) => endpointValidationError(reference.endpoint) === undefined,
  );

  useEffect(() => {
    if (simulationMode !== 'stopped') return;

    setActiveSecondaryTransactions((streams) => {
      let changed = false;
      const entries = Object.entries(streams).map(([streamKey, stream]) => {
        if (stream.realtimeStatus === 'closed') return [streamKey, stream];
        changed = true;
        return [streamKey, { ...stream, realtimeStatus: 'closed' as const }];
      });
      return changed ? Object.fromEntries(entries) : streams;
    });
  }, [setActiveSecondaryTransactions, simulationMode]);

  useEffect(() => {
    const playbackStartedAtMs = Date.now();
    setActiveSecondaryTransactions((streams) => Object.fromEntries(Object.entries(streams).map(([streamKey, stream]) => [
      streamKey,
      stream.replaying ? {
        ...stream,
        playbackStartedAtMs: simulationMode === 'running' ? playbackStartedAtMs : undefined,
        playbackBaseTransactionTime: stream.transactions[clampPlaybackIndex(stream.playbackIndex, stream.transactions.length)]?.time,
      } : stream,
    ])));
  }, [setActiveSecondaryTransactions, simulationMode]);

  useEffect(() => {
    if (simulationMode !== 'running') {
      return undefined;
    }

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
  }, [activeSecondaryTransactions, setActiveSecondaryTransactions, simulationMode]);

  const secondaryTransactionStreams = useMemo<ActiveSecondaryTransactionStream[]>(() => Object.values(activeSecondaryTransactions)
    .map(({ reference, transactions: secondaryTransactions, playbackIndex, playbackSpeed, replaying, realtimeStatus, streamError, historyLoading }) => ({
      publicKey: reference.publicKey,
      endpoint: reference.endpoint,
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
  const secondaryProjections = useMemo<SecondaryProjection[]>(() => {
    const referencesByProjection = referencesBySecondaryProjection(secondaryKeyReferences);

    return secondaryTransactionStreamsWithDiagnostics.map((stream) => ({
      ...stream,
      references: referencesByProjection.get(streamKeyForSecondaryReference(stream)) ?? [],
      compositionPolicy: 'consume-primary-namespaces',
    }));
  }, [secondaryKeyReferences, secondaryTransactionStreamsWithDiagnostics]);
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



  const authoringChangeSummary = useMemo(
    () => summarizeLineChanges(remoteBaselineAppliedToEditor, authoringSource),
    [authoringSource, remoteBaselineAppliedToEditor],
  );
  const authoringOriginsByLine = useMemo(
    () => originsForEditedSource(authoringSource, primaryRemoteBaselineSource, transactionXyzDsl.originsByLine),
    [authoringSource, primaryRemoteBaselineSource, transactionXyzDsl.originsByLine],
  );
  const localCursorStream = useMemo(() => ({
    id: LOCAL_CURSOR_STREAM_ID,
    transactionId: `local-frame-${localCursorPose.sequence}`,
    transactionTime: localCursorPose.sequence,
    declarations: localCursorXyzDsl(localCursorPose),
    bypassNamespacePolicy: true,
  }), [localCursorPose]);
  const renderedBundle = useMemo(
    () => composeSpatialEditorSourceBundle(
      authoringSource,
      simulationMode === 'stopped' ? [] : simulationSource === 'local' ? [localCursorStream] : secondaryTransactionOverlayStreams,
      authoringOriginsByLine,
    ),
    [authoringOriginsByLine, authoringSource, localCursorStream, secondaryTransactionOverlayStreams, simulationMode, simulationSource],
  );
  const renderedSource = renderedBundle.source;
  const baselineRevision = useMemo(() => spatialBaselineRevision(authoringSource), [authoringSource]);
  const accumulativeTimelineRef = useRef<AccumulativeSpatialTimeline | undefined>(undefined);
  const simulationBaselineRevisionRef = useRef<string | undefined>(undefined);
  const evaluatedPhysicsFrameRef = useRef<string | undefined>(undefined);
  const [document, setDocument] = useState(() => createSpatialDocument(renderedBundle.source, {
    originsByLine: renderedBundle.originsByLine,
  }));
  const secondaryCameraChoices = useMemo(() => {
    const choices = new Map<string, SecondaryCameraTarget>();
    document.renderNodes.forEach((node) => {
      if (node.origin?.sourceKind !== 'secondary') return;
      const target = {
        streamId: node.origin.streamId ?? node.origin.publicKey ?? 'secondary',
        cursorNamespace: node.namespacePath ?? node.id,
      };
      choices.set(secondaryCameraTargetKey(target), target);
    });
    return [...choices.values()].sort((a, b) => a.cursorNamespace.localeCompare(b.cursorNamespace)
      || a.streamId.localeCompare(b.streamId));
  }, [document.renderNodes]);
  useEffect(() => {
    if (!secondaryCameraTarget) return;
    const selectedKey = secondaryCameraTargetKey(secondaryCameraTarget);
    if (simulationMode === 'stopped' || !secondaryCameraChoices.some((choice) => secondaryCameraTargetKey(choice) === selectedKey)) {
      setSecondaryCameraTarget(undefined);
    }
  }, [secondaryCameraChoices, secondaryCameraTarget, simulationMode]);
  useEffect(() => {
    if (simulationMode === 'stopped') {
      setDocument(createSpatialDocument(renderedBundle.source, { originsByLine: renderedBundle.originsByLine }));
      return;
    }
    if (simulationBaselineRevisionRef.current !== baselineRevision) {
      accumulativeTimelineRef.current = undefined;
      simulationBaselineRevisionRef.current = undefined;
      evaluatedPhysicsFrameRef.current = undefined;
      setSimulationMode('stopped');
      setDocument(createSpatialDocument(renderedBundle.source, { originsByLine: renderedBundle.originsByLine }));
      return;
    }
    accumulativeTimelineRef.current ??= new AccumulativeSpatialTimeline(baselineRevision);
    const frameKey = accumulativePhysicsFrameKey(renderedBundle.source, renderedBundle.originsByLine, baselineRevision);
    const isNewTransactionFrame = simulationMode === 'running' && frameKey !== undefined && frameKey !== evaluatedPhysicsFrameRef.current;
    if (isNewTransactionFrame) evaluatedPhysicsFrameRef.current = frameKey;
    const frame = isNewTransactionFrame
      ? accumulativeTimelineRef.current.evaluate(renderedBundle.source, renderedBundle.originsByLine)
      : accumulativeTimelineRef.current.compile(renderedBundle.source, renderedBundle.originsByLine);
    setDocument(frame.document);
  }, [baselineRevision, renderedBundle, simulationMode]);

  const startSimulation = useCallback(() => {
    accumulativeTimelineRef.current = new AccumulativeSpatialTimeline(baselineRevision);
    simulationBaselineRevisionRef.current = baselineRevision;
    evaluatedPhysicsFrameRef.current = undefined;
    if (simulationSource === 'local') setLocalCursorPose({ ...DEFAULT_LOCAL_CURSOR_POSE, position: [...DEFAULT_LOCAL_CURSOR_POSE.position], rotation: [...DEFAULT_LOCAL_CURSOR_POSE.rotation], size: [...DEFAULT_LOCAL_CURSOR_POSE.size] });
    setAppMode('viewer');
    setDrawerOpen(false);
    setSimulationMode('running');
  }, [baselineRevision, simulationSource]);

  const stopSimulation = useCallback(() => {
    accumulativeTimelineRef.current = undefined;
    simulationBaselineRevisionRef.current = undefined;
    evaluatedPhysicsFrameRef.current = undefined;
    setLocalCursorCaptured(false);
    setSimulationMode('stopped');
  }, []);
  const handleLocalCursorInput = useCallback((input: LocalCursorInput) => {
    if (simulationMode !== 'running' || simulationSource !== 'local') return;
    setLocalCursorPose((pose) => advanceLocalCursor(pose, input, document.coordinateSpace));
  }, [document.coordinateSpace, simulationMode, simulationSource]);
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
    const streamKey = Object.keys(activeSecondaryTransactions).find((key) => activeSecondaryTransactions[key]?.reference.publicKey === publicKey) ?? '';

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
  }, [activeSecondaryTransactions, setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackToggle = useCallback((publicKey: string) => {
    const streamKey = Object.keys(activeSecondaryTransactions).find((key) => activeSecondaryTransactions[key]?.reference.publicKey === publicKey) ?? '';

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
  }, [activeSecondaryTransactions, setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackSpeedChange = useCallback((
    publicKey: string,
    playbackSpeed: number,
  ) => {
    const streamKey = Object.keys(activeSecondaryTransactions).find((key) => activeSecondaryTransactions[key]?.reference.publicKey === publicKey) ?? '';

    setActiveSecondaryTransactions((streams) => {
      const stream = streams[streamKey];

      if (!stream) {
        return streams;
      }

      const normalizedPlaybackSpeed = normalizePlaybackSpeed(playbackSpeed);
      if (simulationMode !== 'running') {
        return {
          ...streams,
          [streamKey]: {
            ...stream,
            playbackSpeed: normalizedPlaybackSpeed,
            playbackStartedAtMs: undefined,
            playbackBaseTransactionTime: stream.transactions[clampPlaybackIndex(stream.playbackIndex, stream.transactions.length)]?.time,
          },
        };
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
          playbackSpeed: normalizedPlaybackSpeed,
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
  }, [activeSecondaryTransactions, setActiveSecondaryTransactions, simulationMode]);

  const handleSecondaryPlaybackSeek = useCallback((
    publicKey: string,
    playbackIndex: number,
  ) => {
    const streamKey = Object.keys(activeSecondaryTransactions).find((key) => activeSecondaryTransactions[key]?.reference.publicKey === publicKey) ?? '';

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
  }, [activeSecondaryTransactions, setActiveSecondaryTransactions]);

  const handleLoadSecondaryHistory = useCallback((publicKey: string) => {
    const streamKey = Object.keys(activeSecondaryTransactions).find((key) => activeSecondaryTransactions[key]?.reference.publicKey === publicKey) ?? '';
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

    const endpoint = activeSecondaryTransactions[streamKey]?.reference.endpoint;
    if (!endpoint) return () => controller.abort();

    fetchPublicKeyTransactions({ endpoint, publicKey, range: transactionRange, signal: controller.signal })
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
  }, [activeSecondaryTransactions, setActiveSecondaryTransactions, transactionRange]);

  const handleAuthoringSourceChange = useCallback((nextSource: string) => {
    setAuthoringSource(nextSource);
  }, []);

  const handleModeChange = useCallback((mode: 'viewer' | 'editor') => {
    if (mode === 'editor' && simulationMode !== 'stopped') {
      return;
    }
    setAppMode(mode);

    if (mode === 'editor') {
      setDrawerOpen(true);
    }
  }, [simulationMode]);

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
      {simulationMode !== 'stopped' && simulationSource === 'remote' ? validSecondaryKeyReferences.map((reference) => (
        <SecondaryRealtimeSubscription
          key={streamKeyForSecondaryReference(reference)}
          reference={reference}
          onTransaction={handleSecondaryRealtimeTransaction}
          onError={handleSecondaryRealtimeError}
          onStatusChange={handleSecondaryRealtimeStatusChange}
        />
      )) : null}
      <SceneRoot
        document={document}
        selectedNodeId={selectedSceneNodeId}
        onSelectNode={handleSelectNode}
        secondaryCameraTarget={simulationMode === 'stopped' ? undefined : secondaryCameraTarget}
        localCursorControl={simulationMode !== 'stopped' && simulationSource === 'local' ? {
          enabled: simulationMode === 'running',
          captured: localCursorCaptured,
          onCaptureChange: setLocalCursorCaptured,
          onInput: handleLocalCursorInput,
        } : undefined}
      />
      <div className="simulation-controls" aria-label="Simulation controls">
        <span>Simulation: {simulationMode}</span>
        {simulationMode === 'stopped' ? (
          <>
            <label className="simulation-camera-control">Source
              <select aria-label="Simulation source" value={simulationSource} onChange={(event) => setSimulationSource(event.target.value as 'remote' | 'local')}>
                <option value="remote">Remote overlays</option>
                <option value="local">Local cursor</option>
              </select>
            </label>
            <button type="button" onClick={startSimulation}>Start simulation</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setSimulationMode((mode) => mode === 'running' ? 'paused' : 'running')}>
              {simulationMode === 'running' ? 'Pause' : 'Resume'}
            </button>
            <button type="button" onClick={stopSimulation}>Stop and reset</button>
            {simulationSource === 'local' ? (
              <span className="local-cursor-status" title="Click the scene to capture the mouse; press Escape to release.">
                {localCursorCaptured ? 'Mouse captured' : 'Click scene · WASD · Space/Shift · mouse'} · frame {localCursorPose.sequence}
                {' · '}XYZ {localCursorPose.position.map((value) => value.toFixed(2)).join(', ')}
                {' · '}{document.interactions?.length ?? 0} interaction{document.interactions?.length === 1 ? '' : 's'}
              </span>
            ) : null}
            <label className="simulation-camera-control">
              Camera
              <select
                aria-label="Simulation camera"
                value={secondaryCameraTarget ? secondaryCameraTargetKey(secondaryCameraTarget) : ''}
                onChange={(event) => setSecondaryCameraTarget(
                  secondaryCameraChoices.find((choice) => secondaryCameraTargetKey(choice) === event.target.value),
                )}
              >
                <option value="">Orbit view</option>
                {secondaryCameraChoices.map((choice) => (
                  <option key={secondaryCameraTargetKey(choice)} value={secondaryCameraTargetKey(choice)}>
                    {choice.cursorNamespace} · {choice.streamId.length > 20 ? `${choice.streamId.slice(0, 10)}…${choice.streamId.slice(-6)}` : choice.streamId}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <XyzDslDrawer
        appMode={appMode}
        authoringAvailable={simulationMode === 'stopped'}
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
        inspector={appMode === 'editor' && selectedNode ? (
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
      />
    </main>
  );
}
