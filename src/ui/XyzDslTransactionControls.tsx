import { useState, type ChangeEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { TransactionRange } from '../transactions/types';

interface XyzDslTransactionControlsProps {
  publicKey: string;
  publicKeyShareUrl?: string;
  range: TransactionRange;
  loading: boolean;
  tipHeight?: number;
  tipLoading: boolean;
  error?: string;
  tipError?: string;
  transactionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  secondaryTenantCount: number;
  onPublicKeyChange: (publicKey: string) => void;
  onRangeChange: (range: TransactionRange) => void;
  onReload: () => void;
  onUseTip: () => void;
}

function numberValue(event: ChangeEvent<HTMLInputElement>, fallback: number): number {
  const value = Number(event.target.value);
  return Number.isFinite(value) ? value : fallback;
}

function clampHeight(value: number, max: number): number {
  return Math.min(Math.max(Math.round(value), 0), max);
}

export function XyzDslTransactionControls({
  publicKey,
  publicKeyShareUrl,
  range,
  loading,
  tipHeight,
  tipLoading,
  error,
  tipError,
  transactionCount,
  acceptedCount,
  rejectedCount,
  secondaryTenantCount,
  onPublicKeyChange,
  onRangeChange,
  onReload,
  onUseTip,
}: XyzDslTransactionControlsProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const sliderMax = Math.max(tipHeight ?? 0, range.startHeight, range.endHeight, 1);
  const lowerHeight = Math.min(range.startHeight, range.endHeight);
  const upperHeight = Math.max(range.startHeight, range.endHeight);

  const lowerPercent = (lowerHeight / sliderMax) * 100;
  const upperPercent = (upperHeight / sliderMax) * 100;

  function updateWindow(nextLower: number, nextUpper: number) {
    onRangeChange({
      ...range,
      startHeight: clampHeight(Math.max(nextLower, nextUpper), sliderMax),
      endHeight: clampHeight(Math.min(nextLower, nextUpper), sliderMax),
    });
  }

  function valueFromPointer(track: HTMLElement, clientX: number): number {
    const rect = track.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return clampHeight(ratio * sliderMax, sliderMax);
  }

  function startPointerDrag(thumb: 'lower' | 'upper', track: HTMLElement, pointerId: number, clientX: number) {
    track.setPointerCapture?.(pointerId);

    const updateFromClientX = (nextClientX: number) => {
      const nextValue = valueFromPointer(track, nextClientX);
      if (thumb === 'lower') {
        updateWindow(nextValue, upperHeight);
      } else {
        updateWindow(lowerHeight, nextValue);
      }
    };

    const handlePointerMove = (event: PointerEvent) => updateFromClientX(event.clientX);
    const stopPointerDrag = () => {
      track.releasePointerCapture?.(pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopPointerDrag);
      window.removeEventListener('pointercancel', stopPointerDrag);
    };

    updateFromClientX(clientX);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopPointerDrag, { once: true });
    window.addEventListener('pointercancel', stopPointerDrag, { once: true });
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const nextValue = valueFromPointer(event.currentTarget, event.clientX);
    const thumb = Math.abs(nextValue - lowerHeight) <= Math.abs(nextValue - upperHeight) ? 'lower' : 'upper';
    startPointerDrag(thumb, event.currentTarget, event.pointerId, event.clientX);
  }

  function handleThumbPointerDown(thumb: 'lower' | 'upper', event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest<HTMLElement>('.dual-range-slider');
    if (track) {
      startPointerDrag(thumb, track, event.pointerId, event.clientX);
    }
  }

  async function copyShareLink() {
    if (!publicKeyShareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publicKeyShareUrl);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  function handleThumbKeyDown(thumb: 'lower' | 'upper', event: KeyboardEvent<HTMLButtonElement>) {
    const largeStep = Math.max(10, Math.round(sliderMax / 20));
    const currentValue = thumb === 'lower' ? lowerHeight : upperHeight;
    const applyValue = (nextValue: number) => {
      if (thumb === 'lower') {
        updateWindow(nextValue, upperHeight);
      } else {
        updateWindow(lowerHeight, nextValue);
      }
    };

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        applyValue(currentValue - 1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        applyValue(currentValue + 1);
        break;
      case 'PageDown':
        event.preventDefault();
        applyValue(currentValue - largeStep);
        break;
      case 'PageUp':
        event.preventDefault();
        applyValue(currentValue + largeStep);
        break;
      case 'Home':
        event.preventDefault();
        applyValue(0);
        break;
      case 'End':
        event.preventDefault();
        applyValue(sliderMax);
        break;
    }
  }

  return (
    <section className="transaction-controls" aria-label="Spatial transaction loader">
      <div className="section-heading-row">
        <h2>Spatial transactions</h2>
        <button type="button" disabled={loading || !publicKey.trim()} onClick={onReload}>
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      <details className="transaction-config">
        <summary>Transaction source</summary>

        <label>
          <span>Public key</span>
          <input
            value={publicKey}
            placeholder="Enter a public key"
            onChange={(event) => {
              setCopyStatus('idle');
              onPublicKeyChange(event.target.value);
            }}
          />
        </label>

        <div className="transaction-share-row">
          <button type="button" disabled={!publicKeyShareUrl} onClick={copyShareLink}>
            Copy public key link
          </button>
          <small>
            {copyStatus === 'copied'
              ? 'Share link copied.'
              : copyStatus === 'error'
                ? 'Unable to copy link.'
                : publicKeyShareUrl
                  ? 'Encodes this public key into the URL.'
                  : 'Enter a public key to create a share link.'}
          </small>
        </div>

        <div className="transaction-range-grid">
          <label>
            <span>Start height</span>
            <input
              type="number"
              min={0}
              value={range.startHeight}
              onChange={(event) => onRangeChange({ ...range, startHeight: numberValue(event, range.startHeight) })}
            />
          </label>
          <label>
            <span>End height</span>
            <input
              type="number"
              min={0}
              value={range.endHeight}
              onChange={(event) => onRangeChange({ ...range, endHeight: numberValue(event, range.endHeight) })}
            />
          </label>
          <label>
            <span>Limit</span>
            <input
              type="number"
              min={1}
              value={range.limit}
              onChange={(event) => onRangeChange({ ...range, limit: Math.max(1, numberValue(event, range.limit)) })}
            />
          </label>
        </div>

        <div className="transaction-tip-row">
          <button type="button" disabled={tipLoading} onClick={onUseTip}>
            {tipLoading ? 'Loading tip…' : 'Set start to tip'}
          </button>
          <span>{tipHeight === undefined ? 'Tip unknown' : `Tip: ${tipHeight}`}</span>
        </div>

        <div className="transaction-range-slider" aria-label="Height window range">
          <span>Height window</span>
          <div className="dual-range-slider" onPointerDown={handleTrackPointerDown}>
            <div className="dual-range-track" />
            <div
              className="dual-range-selection"
              style={{ left: `${lowerPercent}%`, right: `${100 - upperPercent}%` }}
            />
            <button
              aria-label="End height"
              aria-valuemax={sliderMax}
              aria-valuemin={0}
              aria-valuenow={lowerHeight}
              className="dual-range-thumb"
              role="slider"
              style={{ left: `${lowerPercent}%` }}
              type="button"
              onKeyDown={(event) => handleThumbKeyDown('lower', event)}
              onPointerDown={(event) => handleThumbPointerDown('lower', event)}
            />
            <button
              aria-label="Start height"
              aria-valuemax={sliderMax}
              aria-valuemin={0}
              aria-valuenow={upperHeight}
              className="dual-range-thumb"
              role="slider"
              style={{ left: `${upperPercent}%` }}
              type="button"
              onKeyDown={(event) => handleThumbKeyDown('upper', event)}
              onPointerDown={(event) => handleThumbPointerDown('upper', event)}
            />
          </div>
          <small>{lowerHeight} - {upperHeight}</small>
        </div>
      </details>

      <p className="transaction-status">
        {transactionCount} fetched · {acceptedCount} mapped · {secondaryTenantCount} secondary tenant{secondaryTenantCount === 1 ? '' : 's'} · {rejectedCount} rejected
      </p>
      {error ? <p className="transaction-error">{error}</p> : null}
      {tipError ? <p className="transaction-error">{tipError}</p> : null}
    </section>
  );
}
