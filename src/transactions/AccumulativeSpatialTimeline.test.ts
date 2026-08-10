import { describe, expect, it } from 'vitest';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { AccumulativeSpatialTimeline, accumulativePhysicsFrameKey } from './AccumulativeSpatialTimeline';

function origins(cursorAmount = 1_000_000) {
  return new Map<number, XyzDslDeclarationOrigin>([
    [1, { sourceKind: 'baseline', transactionAmount: 1_000_000 }],
    [2, { sourceKind: 'baseline' }],
    [3, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: cursorAmount }],
  ]);
}

function source(cursorX: number, response: string) {
  return [
    '"Box/+7+1/+0+1/+11+1" : "geometry: sphere; color: 0x33aaff"',
    `"Box/+contact/${response}":""`,
    `"+${cursorX}+1/+0+1/+11+1":""`,
  ].join('\n');
}

function conditionalSource(directive: 'probe' | 'breach' | 'contact', cursorX: number, response: string) {
  return source(cursorX, response).replace('+contact/', `+${directive}/`);
}

function scopedOrigins() {
  return new Map<number, XyzDslDeclarationOrigin>([
    [1, { sourceKind: 'baseline' }],
    [2, { sourceKind: 'baseline' }],
    [3, { sourceKind: 'baseline' }],
    [4, { sourceKind: 'baseline' }],
    [5, { sourceKind: 'secondary', streamId: 'cursor' }],
  ]);
}

describe('AccumulativeSpatialTimeline', () => {
  it('retains each explicit contact translation across transaction frames', () => {
    const timeline = new AccumulativeSpatialTimeline();
    const first = timeline.evaluate(source(6, '+2/+0/+0'), origins());
    const second = timeline.evaluate(source(8, '+2/+0/+0'), origins());

    expect(first.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBe(9.5);
    expect(second.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBe(11.5);
  });

  it('publishes triggering facts and visual overrides after contact separates the bodies', () => {
    const declaration = source(6, '+2/+0/+0').replace(
      '"Box/+contact/+2/+0/+0":""',
      '"Box/+contact/+2/+0/+0":"color: red; geometry: box; rotation: 0,0,45"',
    );
    const frame = new AccumulativeSpatialTimeline().evaluate(declaration, origins());
    const target = frame.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary');

    expect(frame.document.interactions).toHaveLength(1);
    expect(target?.activeInteractions).toHaveLength(1);
    expect(target?.transform.position[0]).toBe(9.5);
    expect(target?.transform.rotation[2]).toBeCloseTo(Math.PI / 4);
    expect(target?.material.color).toBe('red');
    expect(target?.geometry.kind).toBe('box');
  });

  it('retains each weighted contact translation across transaction frames', () => {
    const timeline = new AccumulativeSpatialTimeline();
    const first = timeline.evaluate(source(6, '+++'), origins());
    const second = timeline.evaluate(source(7, '+++'), origins());

    expect(first.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBeCloseTo(7.51);
    expect(second.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBeGreaterThan(7.51);
  });

  it('does not advance when a completed document is read repeatedly', () => {
    const timeline = new AccumulativeSpatialTimeline();
    const frame = timeline.evaluate(source(6, '+2/+0/+0'), origins());
    const first = frame.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position;
    const second = frame.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position;
    expect(second).toEqual(first);
    expect(frame.tick).toBe(1);
  });

  it('compiles UI-only changes without advancing retained physics', () => {
    const timeline = new AccumulativeSpatialTimeline();
    const evaluated = timeline.evaluate(source(6, '+2/+0/+0'), origins());
    const recompiled = timeline.compile(
      source(6, '+2/+0/+0').replace('0x33aaff', '0xff00ff'),
      origins(),
    );

    expect(recompiled.tick).toBe(evaluated.tick);
    expect(recompiled.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBe(9.5);
  });

  it('keys physics advancement to secondary transaction identity and declaration', () => {
    const firstOrigins = origins();
    firstOrigins.set(3, { ...firstOrigins.get(3)!, transactionId: 'cursor-frame-1' });
    const nextOrigins = origins();
    nextOrigins.set(3, { ...nextOrigins.get(3)!, transactionId: 'cursor-frame-2' });
    const first = accumulativePhysicsFrameKey(source(6, '+2/+0/+0'), firstOrigins);
    const unrelatedEdit = accumulativePhysicsFrameKey(
      source(6, '+2/+0/+0').replace('0x33aaff', '0xff00ff'),
      firstOrigins,
    );
    const nextCursorFrame = accumulativePhysicsFrameKey(source(6, '+2/+0/+0'), nextOrigins);

    expect(unrelatedEdit).toBe(first);
    expect(nextCursorFrame).not.toBe(first);
  });

  it('preserves non-contact relative and weighted conditional translations', () => {
    const relative = new AccumulativeSpatialTimeline().evaluate(
      conditionalSource('probe', 6, '+2/+0/+0'),
      origins(),
    );
    const weighted = new AccumulativeSpatialTimeline().evaluate(
      conditionalSource('probe', 6, '+++'),
      origins(),
    );

    expect(relative.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBe(9.5);
    expect(weighted.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBeCloseTo(7.51);
  });

  it('preserves conditional absolute-box overrides in accumulative mode', () => {
    const frame = new AccumulativeSpatialTimeline().evaluate(
      conditionalSource('probe', 6, '+9+2/+0+1/+11+1'),
      origins(),
    );
    const target = frame.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary');

    expect(target?.transform.position[0]).toBe(10);
    expect(target?.box.width).toBe(2);
  });

  it('moves a response target when contact occurs elsewhere in its directive scope', () => {
    const source = [
      '"Machine/+0+10/+0+10/+0+10":""',
      '"Machine/Button/+0+1/+0+1/+0+1":""',
      '"Machine/Lever/+5+1/+0+1/+0+1":""',
      '"Machine/+contact/Lever/+2/+0/+0":""',
      '"Cursor/+1+1/+0+1/+0+1":""',
    ].join('\n');
    const timeline = new AccumulativeSpatialTimeline();
    const frame = timeline.evaluate(source, scopedOrigins());
    const lever = frame.document.renderNodes.find((node) => node.namespacePath === 'Machine/Lever/');

    expect(lever?.transform.position[0]).toBe(3.5);
  });
});
