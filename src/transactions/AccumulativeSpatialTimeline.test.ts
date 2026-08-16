import { describe, expect, it } from 'vitest';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { AccumulativeSpatialTimeline, accumulativePhysicsFrameKey, spatialBaselineRevision } from './AccumulativeSpatialTimeline';

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
    `"Box/+touch/${response}":""`,
    `"+${cursorX}+1/+0+1/+11+1":""`,
  ].join('\n');
}

function conditionalSource(directive: 'touch' | 'breach' , cursorX: number, response: string) {
  return source(cursorX, response).replace('+touch/', `+${directive}/`);
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
  it('reconciles active conditional physics and returns compiler diagnostics', () => {
    const source = [
      '"Target/+0+1/+0+1/+0+1":""',
      '"Target/+touch":"physics-mode: static; restitution: .8"',
      '"Shape/+3+1/+0+1/+0+1":""',
      '"Shape/Cut/+3+1/+0+1/+0+1":"operation: subtraction"',
      '"Cursor/+1+1/+0+1/+0+1":""',
    ].join('\n');
    const declarationOrigins = new Map([
      [1, { sourceKind: 'baseline' as const }], [2, { sourceKind: 'baseline' as const }],
      [3, { sourceKind: 'baseline' as const }], [4, { sourceKind: 'baseline' as const }],
      [5, { sourceKind: 'secondary' as const, streamId: 'cursor' }],
    ]);
    const timeline = new AccumulativeSpatialTimeline();
    const frame = timeline.compile(source, declarationOrigins);
    const definition = timeline.simulation.world.snapshot().definitions.find(({ id }) => id.includes('Target'));
    expect(definition).toMatchObject({ mode: 'static', restitution: .8 });
    expect(frame.document.diagnostics.some(({ message }) => message.includes('positive primitive colliders'))).toBe(true);
  });
  it('selects conditional physics from retained poses', () => {
    const baseline = '"Target/+0+1/+0+1/+0+1":""\n"Cursor/+1+1/+0+1/+0+1":""';
    const declarationOrigins = new Map([
      [1, { sourceKind: 'baseline' as const }],
      [2, { sourceKind: 'secondary' as const, streamId: 'cursor' }],
      [3, { sourceKind: 'baseline' as const }],
    ]);
    const timeline = new AccumulativeSpatialTimeline();
    const initial = timeline.compile(baseline, declarationOrigins);
    const targetId = initial.document.renderNodes.find(({ origin }) => origin?.sourceKind !== 'secondary')!.id;
    timeline.simulation.world.enqueueInputs([{ kind: 'teleport', bodyId: targetId, tick: 1, position: [10, .5, .5] }]);
    timeline.simulation.world.step(1);
    timeline.compile(`${baseline}\n"Target/+touch":"physics-mode: static"`, declarationOrigins);
    const definition = timeline.simulation.world.snapshot().definitions.find(({ id }) => id === targetId);
    expect(definition?.mode).toBe('dynamic');
  });

  it('reconciles collider-relevant conditional geometry without simulation-owned translation', () => {
    const source = '"Target/+0+2/+0+2/+0+2":""\n"Target/+touch":"geometry: sphere; rotation: 0,45,0"\n"Cursor/+2+1/+0+2/+0+2":""';
    const declarationOrigins = new Map([
      [1, { sourceKind: 'baseline' as const }], [2, { sourceKind: 'baseline' as const }],
      [3, { sourceKind: 'secondary' as const, streamId: 'cursor' }],
    ]);
    const timeline = new AccumulativeSpatialTimeline();
    timeline.compile(source, declarationOrigins);
    const definition = timeline.simulation.world.snapshot().definitions.find(({ id }) => id.includes('Target'));
    expect(definition?.colliders?.[0].shape).toBe('ball');
    expect(definition?.orientation).not.toEqual([0, 0, 0, 1]);
  });
  it('preserves authored poses until the rigid-body world advances', () => {
    const declaration = '"First/+0+1/+0+1/+0+1":""\n"Second/+0+1/+0+1/+0+1":""';
    const authored = createSpatialDocument(declaration);
    const simulated = new AccumulativeSpatialTimeline().compile(declaration).document;

    expect(authored.renderNodes.map((node) => node.transform.position[0])).toEqual([0.5, 0.5]);
    expect(simulated.renderNodes.map((node) => node.transform.position[0])).toEqual([0.5, 0.5]);
  });

  it('keeps anonymous CSG tools attached to their selected base during simulation packing', () => {
    const declaration = [
      '"+0+6/+0+6/+0+6":"geometry: sphere"',
      '"+2+2/+0+6/+2+2":"geometry: cylinder; operation: subtraction"',
    ].join('\n');
    const frame = new AccumulativeSpatialTimeline().compile(declaration);

    expect(frame.document.csgExpressions).toHaveLength(1);
    expect(frame.document.csgExpressions[0].base.geometry.kind).toBe('sphere');
    expect(frame.document.csgExpressions[0].operations[0].tool.geometry.kind).toBe('cylinder');
  });

  it('excludes a CSG cutter volume from simulation collision bounds', () => {
    const declaration = [
      '"+0+4/+0+1/+0+1":"geometry: sphere"',
      '"+3+3/+0+1/+0+1":"operation: subtraction"',
      '"Neighbor/+5+1/+0+1/+0+1":""',
    ].join('\n');
    const frame = new AccumulativeSpatialTimeline().compile(declaration);

    expect(frame.document.csgExpressions).toHaveLength(1);
    expect(frame.document.renderNodes.find((node) => node.namespacePath === 'Neighbor/')?.bounds.minX).toBe(5);
  });

  it('does not run an implicit settling step during compilation', () => {
    const declaration = [
      '"Ground/+0+1/+0+1/+0+1":""',
      '"Floating/+0+1/+5+1/+0+1":""',
      '"Cursor/+0+1/+3+1/+0+1":""',
    ].join('\n');
    const declarationOrigins = new Map<number, XyzDslDeclarationOrigin>([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'baseline' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor' }],
    ]);
    const frame = new AccumulativeSpatialTimeline().compile(declaration, declarationOrigins);

    expect(frame.document.renderNodes.find((node) => node.namespacePath === 'Floating/')?.bounds.minY).toBe(5);
    expect(frame.document.renderNodes.find((node) => node.namespacePath === 'Cursor/')?.bounds.minY).toBe(3);
  });

  it('retains each explicit touch translation across transaction frames', () => {
    const timeline = new AccumulativeSpatialTimeline();
    const first = timeline.evaluate(source(6, '+2/+0/+0'), origins());
    const second = timeline.evaluate(source(8, '+2/+0/+0'), origins());

    expect(first.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBe(9.5);
    expect(second.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBe(11.5);
  });

  it('publishes triggering facts and visual overrides after translation separates the bodies', () => {
    const declaration = source(6, '+2/+0/+0').replace(
      '"Box/+touch/+2/+0/+0":""',
      '"Box/+touch/+2/+0/+0":"color: red; geometry: box; rotation: 0,0,45"',
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

  it('does not treat a separated touch as a breach on the next frame', () => {
    const timeline = new AccumulativeSpatialTimeline();
    const first = timeline.evaluate(source(6, '+++'), origins());
    const second = timeline.evaluate(source(7, '+++'), origins());

    expect(first.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBeCloseTo(7.51);
    expect(second.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBeCloseTo(7.51);
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
    const baselineRevision = spatialBaselineRevision(source(6, '+2/+0/+0'));
    const first = accumulativePhysicsFrameKey(source(6, '+2/+0/+0'), firstOrigins, baselineRevision);
    const unrelatedEdit = accumulativePhysicsFrameKey(
      source(6, '+2/+0/+0').replace('0x33aaff', '0xff00ff'),
      firstOrigins,
      baselineRevision,
    );
    const nextCursorFrame = accumulativePhysicsFrameKey(source(6, '+2/+0/+0'), nextOrigins, baselineRevision);

    expect(unrelatedEdit).toBe(first);
    expect(nextCursorFrame).not.toBe(first);
  });

  it('binds transaction frame identity to the primary baseline revision', () => {
    const declaration = source(6, '+2/+0/+0');
    const first = accumulativePhysicsFrameKey(declaration, origins(), spatialBaselineRevision('first baseline'));
    const second = accumulativePhysicsFrameKey(declaration, origins(), spatialBaselineRevision('replacement baseline'));
    expect(second).not.toBe(first);
  });

  it('does not reuse anonymous body positions across baseline revisions', () => {
    const initial = '"+2+4/+0+6/+1+3":""\n"+2+4/+7+6/+0+10c":""\n"+7+6/+0+15/+0+50c":""';
    const remote = '"+7+1/+0+1/+11+1":""\n"+6+1/+0+1/+11+1":""\n"+4+1/+0+1/+12+1":""';
    const initialFrame = new AccumulativeSpatialTimeline(spatialBaselineRevision(initial)).compile(initial);
    const remoteFrame = new AccumulativeSpatialTimeline(spatialBaselineRevision(remote)).compile(remote);

    expect(initialFrame.document.renderNodes.map((node) => node.transform.position[0])).toEqual([4, 4, 10]);
    expect(remoteFrame.document.renderNodes.map((node) => node.transform.position[0])).toEqual([7.5, 6.5, 4.5]);
  });

  it('preserves non-accumulative relative and weighted conditional translations', () => {
    const relative = new AccumulativeSpatialTimeline().evaluate(
      conditionalSource('touch', 6, '+2/+0/+0'),
      origins(),
    );
    const weighted = new AccumulativeSpatialTimeline().evaluate(
      conditionalSource('touch', 6, '+++'),
      origins(),
    );

    expect(relative.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBe(9.5);
    expect(weighted.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary')?.transform.position[0]).toBeCloseTo(7.51);
  });

  it('preserves conditional absolute-box overrides in accumulative mode', () => {
    const frame = new AccumulativeSpatialTimeline().evaluate(
      conditionalSource('touch', 6, '+9+2/+0+1/+11+1'),
      origins(),
    );
    const target = frame.document.renderNodes.find((node) => node.origin?.sourceKind !== 'secondary');

    expect(target?.transform.position[0]).toBe(10);
    expect(target?.box.width).toBe(2);
  });

  it('moves a response target when a touch occurs elsewhere in its directive scope', () => {
    const source = [
      '"Machine/+0+10/+0+10/+0+10":""',
      '"Machine/Button/+0+1/+0+1/+0+1":""',
      '"Machine/Lever/+5+1/+0+1/+0+1":""',
      '"Machine/+touch/Lever/+2/+0/+0":""',
      '"Cursor/+1+1/+0+1/+0+1":""',
    ].join('\n');
    const timeline = new AccumulativeSpatialTimeline();
    const frame = timeline.evaluate(source, scopedOrigins());
    const lever = frame.document.renderNodes.find((node) => node.namespacePath === 'Machine/Lever/');

    expect(lever?.transform.position[0]).toBeCloseTo(3.5);
  });
});
