import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canEditDeclarationLine, moveDeclarationPath, resizeDeclarationPath, rotateDeclarationPath, updateDeclarationProperty } from './xyzdsl/editXyzDslSource';
import type { AxisName } from './xyzdsl/types';
import { createSpatialDocument } from './model/createSpatialDocument';
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
import { composeTransactionSources } from './transactions/composeTransactionSources';
import { normalizeXyzDslTransactions, transactionsToXyzDslSource } from './transactions/transactionXyzDsl';
import { clampPlaybackIndex, hasPlaybackReachedEnd, normalizePlaybackSpeed, outgoingTransactionsForPublicKey, playbackIndexForElapsedTime, playbackTickIntervalMilliseconds, playbackTimeForElapsedTime, scaledPlaybackElapsedSeconds, sortTransactionsByTimeStable } from './transactions/streamTransactions';
import type { ActiveSecondaryTenant, XyzDslTransaction, SecondaryKeyReference, SecondaryTenant, TransactionRange } from './transactions/types';
import { usePublicKeyTransactions } from './transactions/usePublicKeyTransactions';
import { XyzDslDrawer } from './ui/XyzDslDrawer';
import { usePersistentState } from './ui/usePersistentState';

const INITIAL_XYZDSL = `"+2d+4d/+0d+6d/+1d+3d" : "geometry: cylinder; color: 0x333333; metalness: 0.8; roughness: 0.2"
"+2d+4d/+7d+6d/+0d+10m" : "geometry: cone; color: yellow; metalness: 0.2; roughness: 0.5"
"+7d+6d/+0d+15d/+0d+50m" : "geometry: sphere; color: blue; metalness: 0.1; roughness: 0.2"

"Table/+18d+8d/+0d+5d/+4d+8d" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+0d+1d/+0d+5d/+0d+1d" : ""
"Table/Leg/+7d+1d/+0d+5d/+0d+1d" : ""
"Table/Leg/+0d+1d/+0d+5d/+7d+1d" : ""
"Table/Leg/+7d+1d/+0d+5d/+7d+1d" : ""`;

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
  enabled: boolean;
  transactionRange: TransactionRange;
  /** True while migrating persisted tenants that predate per-tenant ranges. */
  rangeNeedsTip?: boolean;
  transactions: XyzDslTransaction[];
  playbackIndex: number;
  playbackSpeed?: number;
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

function referencesBySecondaryTenant(
  references: readonly SecondaryKeyReference[],
  activeReferences: readonly SecondaryKeyReference[],
): Map<string, SecondaryKeyReference[]> {
  const grouped = new Map<string, SecondaryKeyReference[]>();
  const activeByPublicKey = new Map(activeReferences.map((reference) => [reference.publicKey, reference]));

  references.forEach((reference) => {
    const activeReference = activeByPublicKey.get(reference.publicKey);
    if (!activeReference) return;
    const key = streamKeyForSecondaryReference(activeReference);
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
    transactionRange: stream?.transactionRange ?? DEFAULT_TRANSACTION_RANGE,
    rangeNeedsTip: stream?.rangeNeedsTip ?? (stream?.transactionRange === undefined),
    transactions,
    playbackIndex,
    playbackSpeed: normalizePlaybackSpeed(stream?.playbackSpeed),
    replaying: stream?.replaying === true && playbackIndex < defaultPlaybackIndex,
    enabled: stream?.enabled ?? true,
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
  const activeSecondaryTransactionsRef = useRef(activeSecondaryTransactions);
  activeSecondaryTransactionsRef.current = activeSecondaryTransactions;
  const secondaryHistoryControllersRef = useRef(new Map<string, AbortController>());
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
        // Keep UI ranges inclusive; fetchPublicKeyTransactions converts the
        // newest block to the protocol's exclusive upper boundary.
        setTipHeight(height);
        setTransactionRange((range) => ({
          ...range,
          startHeight: height,
          // This is a backwards range, so its end must not exceed its start.
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
      primaryEndpoint: DEFAULT_TRANSACTION_ENDPOINT,
      secondaryEndpoint: DEFAULT_SECONDARY_TRANSACTION_ENDPOINT,
    }),
    [transactions, transactionPublicKey],
  );
  const primaryRemoteBaselineSource = transactionXyzDsl.source;
  const secondaryKeyReferences = useMemo(
    () => transactionXyzDsl.latestSecondaryKeys,
    [transactionXyzDsl.latestSecondaryKeys],
  );

  useEffect(() => {
    setSecondaryTransactionError(undefined);

    if (secondaryKeyReferences.length === 0) {
      setActiveSecondaryTransactions({});
      return;
    }

    setActiveSecondaryTransactions((tenants) => {
      const nextTenants: Record<string, ActiveSecondaryTransactions> = {};

      secondaryKeyReferences.forEach((reference) => {
        const key = streamKeyForSecondaryReference(reference);
        const validationError = endpointValidationError(reference.endpoint);
        const current = normalizeActiveSecondaryStream(tenants[key], reference);
        nextTenants[key] = validationError ? { ...current, streamError: validationError } : current;
      });

      return nextTenants;
    });
  }, [secondaryKeyReferences, setActiveSecondaryTransactions, transactionPublicKey]);

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

  const secondaryTransactionStreams = useMemo<ActiveSecondaryTenant[]>(() => Object.values(activeSecondaryTransactions)
    .map(({ reference, enabled, transactionRange: tenantRange, transactions: secondaryTransactions, playbackIndex, playbackSpeed, replaying, streamError, historyLoading }) => ({
      publicKey: reference.publicKey,
      endpoint: reference.endpoint,
      enabled,
      transactionRange: tenantRange,
      transactions: secondaryTransactions,
      playbackIndex,
      playbackSpeed: normalizePlaybackSpeed(playbackSpeed),
      replaying,
      streamError,
      historyLoading,
      rejectedDiagnostics: [],
    })), [activeSecondaryTransactions]);

  const secondaryTransactionOverlayStreams = useMemo(() => secondaryTransactionStreams
    .map(({ publicKey, endpoint, enabled, transactions: secondaryTransactions, playbackIndex }) => {
      const accumulatedTransactions = secondaryTransactions.slice(0, playbackIndex + 1);
      const xyzdslResult = transactionsToXyzDslSource(accumulatedTransactions, {
        publicKey,
      });

      return {
        id: `${publicKey}@@${endpoint}`,
        declarations: xyzdslResult.source,
        enabled,
        xyzdslResult,
      };
    }), [secondaryTransactionStreams]);
  const secondaryTransactionStreamsWithDiagnostics = useMemo<ActiveSecondaryTenant[]>(() => {
    const diagnosticsByStreamId = new Map(
      secondaryTransactionOverlayStreams.map((stream) => [stream.id, stream.xyzdslResult.rejected]),
    );

    return secondaryTransactionStreams.map((stream) => ({
      ...stream,
      rejectedDiagnostics: diagnosticsByStreamId.get(`${stream.publicKey}@@${stream.endpoint}`) ?? [],
    }));
  }, [secondaryTransactionOverlayStreams, secondaryTransactionStreams]);
  const secondaryTenants = useMemo<SecondaryTenant[]>(() => {
    const referencesByTenant = referencesBySecondaryTenant(transactionXyzDsl.secondaryKeys, secondaryKeyReferences);

    return secondaryTransactionStreamsWithDiagnostics.map((stream) => ({
      ...stream,
      references: referencesByTenant.get(streamKeyForSecondaryReference(stream)) ?? [],
      compositionPolicy: 'consume-primary-namespaces',
    }));
  }, [secondaryKeyReferences, secondaryTransactionStreamsWithDiagnostics, transactionXyzDsl.secondaryKeys]);
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
  const renderedSource = useMemo(
    () => composeTransactionSources(authoringSource, secondaryTransactionOverlayStreams.filter((tenant) => tenant.enabled)),
    [authoringSource, secondaryTransactionOverlayStreams],
  );
  const document = useMemo(() => createSpatialDocument(renderedSource), [renderedSource]);
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
    const reference = secondaryKeyReferences.find((candidate) => candidate.publicKey === publicKey);
    if (!reference) return;
    const streamKey = streamKeyForSecondaryReference(reference);

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
  }, [secondaryKeyReferences, setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackToggle = useCallback((publicKey: string) => {
    const reference = secondaryKeyReferences.find((candidate) => candidate.publicKey === publicKey);
    if (!reference) return;
    const streamKey = streamKeyForSecondaryReference(reference);

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
  }, [secondaryKeyReferences, setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackSpeedChange = useCallback((
    publicKey: string,
    playbackSpeed: number,
  ) => {
    const reference = secondaryKeyReferences.find((candidate) => candidate.publicKey === publicKey);
    if (!reference) return;
    const streamKey = streamKeyForSecondaryReference(reference);

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
  }, [secondaryKeyReferences, setActiveSecondaryTransactions]);

  const handleSecondaryPlaybackSeek = useCallback((
    publicKey: string,
    playbackIndex: number,
  ) => {
    const reference = secondaryKeyReferences.find((candidate) => candidate.publicKey === publicKey);
    if (!reference) return;
    const streamKey = streamKeyForSecondaryReference(reference);

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
  }, [secondaryKeyReferences, setActiveSecondaryTransactions]);

  const handleLoadSecondaryHistory = useCallback((publicKey: string, rangeOverride?: TransactionRange) => {
    const reference = secondaryKeyReferences.find((candidate) => candidate.publicKey === publicKey);
    if (!reference) return;
    const streamKey = streamKeyForSecondaryReference(reference);
    const tenant = activeSecondaryTransactionsRef.current[streamKey];
    const tenantRange = rangeOverride ?? tenant?.transactionRange ?? DEFAULT_TRANSACTION_RANGE;
    const rangeNeedsTip = tenant?.rangeNeedsTip ?? (tenant?.transactionRange === undefined);
    secondaryHistoryControllersRef.current.get(streamKey)?.abort();
    const controller = new AbortController();
    secondaryHistoryControllersRef.current.set(streamKey, controller);

    setActiveSecondaryTransactions((streams) => {
      const stream = streams[streamKey];

      return stream ? {
        ...streams,
        [streamKey]: {
          ...stream,
          historyLoading: true,
          streamError: undefined,
        },
      } : streams;
    });

    const resolvedRange = rangeOverride || !rangeNeedsTip
      ? Promise.resolve(tenantRange)
      : fetchTipHeight(reference.endpoint, controller.signal).then((tipHeight) => ({
        startHeight: tipHeight,
        endHeight: 0,
        limit: DEFAULT_TRANSACTION_RANGE.limit,
      }));

    resolvedRange
      .then((range) => {
        setActiveSecondaryTransactions((streams) => {
          const stream = streams[streamKey];
          return stream ? {
            ...streams,
            [streamKey]: { ...stream, transactionRange: range, rangeNeedsTip: false },
          } : streams;
        });
        return fetchPublicKeyTransactions({ endpoint: reference.endpoint, publicKey, range, signal: controller.signal });
      })
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
          const transactions = sortTransactionsByTimeStable(outgoingHistoricalTransactions);
          return {
            ...streams,
            [streamKey]: {
              ...stream,
              transactions,
              playbackIndex: stream.replaying ? stream.playbackIndex : Math.max(0, transactions.length - 1),
              historyLoading: false,
              streamError: undefined,
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
              streamError: caught instanceof Error ? caught.message : 'Unable to load secondary tenant history.',
            },
          } : streams;
        });
      })
      .finally(() => {
        if (secondaryHistoryControllersRef.current.get(streamKey) === controller) {
          secondaryHistoryControllersRef.current.delete(streamKey);
        }
      });

    return () => {
      controller.abort();
      if (secondaryHistoryControllersRef.current.get(streamKey) === controller) {
        secondaryHistoryControllersRef.current.delete(streamKey);
      }
    };
  }, [secondaryKeyReferences, setActiveSecondaryTransactions]);

  useEffect(() => {
    const abortRequests = secondaryKeyReferences
      .map((reference) => handleLoadSecondaryHistory(reference.publicKey))
      .filter((cleanup): cleanup is () => void => cleanup !== undefined);

    return () => abortRequests.forEach((abort) => abort());
  }, [handleLoadSecondaryHistory, secondaryKeyReferences]);

  const handleSecondaryEnabledChange = useCallback((publicKey: string, enabled: boolean) => {
    setActiveSecondaryTransactions((tenants) => Object.fromEntries(Object.entries(tenants).map(([key, tenant]) => [
      key,
      tenant.reference.publicKey === publicKey ? { ...tenant, enabled } : tenant,
    ])));
  }, [setActiveSecondaryTransactions]);

  const handleSecondaryRangeChange = useCallback((publicKey: string, range: TransactionRange) => {
    setActiveSecondaryTransactions((tenants) => Object.fromEntries(Object.entries(tenants).map(([key, tenant]) => [
      key,
      tenant.reference.publicKey === publicKey ? { ...tenant, transactionRange: range, rangeNeedsTip: false } : tenant,
    ])));
    handleLoadSecondaryHistory(publicKey, range);
  }, [handleLoadSecondaryHistory, setActiveSecondaryTransactions]);

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
    editSelectedDeclaration((source, lineNumber) => moveDeclarationPath(source, lineNumber, axis, delta));
  }, [editSelectedDeclaration]);

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
      <SceneRoot
        document={document}
        selectedNodeId={selectedSceneNodeId}
        onSelectNode={handleSelectNode}
      />
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
        secondaryTenants={secondaryTenants}
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
        onSecondaryEnabledChange={handleSecondaryEnabledChange}
        onSecondaryRangeChange={handleSecondaryRangeChange}
        selectedNodeId={selectedNode?.id}
        onSelectNode={handleSelectExactNode}
        selectedNode={selectedNode}
        selectedNodeCanEdit={selectedNodeCanEdit}
        selectionPath={selectedHierarchyPath}
        onClearSelection={() => handleSelectNode(undefined)}
        onMoveNode={moveSelectedDeclaration}
        onResizeNode={resizeSelectedDeclaration}
        onRotateNode={rotateSelectedDeclaration}
        onPathNodeSelect={handleSelectHierarchyNode}
        onNodePropertyChange={updateSelectedDeclarationProperty}
      />
    </main>
  );
}
