import { describe, expect, it } from 'vitest';
import {
  createSpatialDocument,
  MAX_WEIGHTED_TRANSLATION,
  MIN_TRANSACTION_AMOUNT,
  weightedTranslationDistance,
} from './createSpatialDocument';
import { interactionTransitions } from '../transactions/interactionTimeline';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';
import { composeTransforms } from './transform';

function origins(secondaryLine: number): Map<number, XyzDslDeclarationOrigin> {
  return new Map([
    [1, { sourceKind: 'baseline' }],
    [2, { sourceKind: 'baseline' }],
    [secondaryLine, { sourceKind: 'secondary', streamId: 'controller-a', transactionTime: 10 }],
  ]);
}

describe('secondary projection interactions', () => {
  it('keeps secondary cursors out of sizing and detects probes across the X seam', () => {
    const document = createSpatialDocument(`"Target/+0+1/+0+1/+0+1" : ""
"Cursor/+39+1/+0+1/+0+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'cursor' }],
    ]) });

    expect(document.coordinateSpace.width).toBe(40);
    expect(document.interactions).toMatchObject([{
      state: 'probe',
      targetNamespace: 'Target/',
      cursorNamespace: 'Cursor/',
      normal: [1, 0, 0],
    }]);
  });

  it('wraps rendered secondary cursors across multiple X/Z spans before evaluating interactions', () => {
    const document = createSpatialDocument(`"Target/+1+1/+0+1/+1+1" : ""
"Cursor/+81+1/+0+1/+81+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'cursor' }],
    ]) });
    const cursor = document.nodes.find((node) => node.namespacePath === 'Cursor/');

    expect(document.coordinateSpace).toMatchObject({ width: 40, depth: 40 });
    expect(cursor?.box).toMatchObject({ x: 81, z: 81 });
    expect(cursor?.transform.position).toEqual([1.5, 0.5, 1.5]);
    expect(cursor?.bounds).toMatchObject({ minX: 1, maxX: 2, minZ: 1, maxZ: 2 });
    expect(document.interactions).toMatchObject([{
      state: 'breach',
      targetNamespace: 'Target/',
      cursorNamespace: 'Cursor/',
    }]);
  });

  it('leaves in-range secondary cursor coordinates unchanged', () => {
    const document = createSpatialDocument(`"Target/+10+1/+0+1/+10+1" : ""
"Cursor/+12+1/+0+1/+13+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'cursor' }],
    ]) });
    const cursor = document.nodes.find((node) => node.namespacePath === 'Cursor/');

    expect(cursor?.box).toMatchObject({ x: 12, z: 13 });
    expect(cursor?.transform.position).toEqual([12.5, 0.5, 13.5]);
  });

  it('keeps secondary cursor descendants aligned when their cursor root wraps', () => {
    const document = createSpatialDocument(`"Target/+0+1/+0+1/+0+1" : ""
"Cursor/+81+1/+0+1/+81+1" : ""
"Cursor/Tip/+2+1/+0+1/+3+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'cursor' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor' }],
    ]) });
    const cursor = document.nodes.find((node) => node.namespacePath === 'Cursor/');
    const tip = cursor?.children?.find((node) => node.namespacePath === 'Cursor/Tip/');

    expect(cursor?.transform.position).toEqual([1, 0, 1]);
    expect(tip?.transform.position).toEqual([3.5, 0.5, 4.5]);
  });

  it('wraps a nested cursor by its world position beneath a rotated and scaled ancestor', () => {
    const document = createSpatialDocument(`"Frame/+4+2/+0+2/+4+2" : "rotation: 0, 90, 0"
"Frame/Cursor/+81+1/+0+1/+3+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'cursor' }],
    ]) });
    const frame = document.nodes.find((node) => node.namespacePath === 'Frame/');
    const cursor = frame?.children?.find((node) => node.namespacePath === 'Frame/Cursor/');
    const recomposed = frame?.worldTransform && cursor?.localTransform
      ? composeTransforms(frame.worldTransform, cursor.localTransform)
      : undefined;

    expect(cursor?.transform.position[0]).toBeGreaterThanOrEqual(0);
    expect(cursor?.transform.position[0]).toBeLessThan(document.coordinateSpace.width);
    expect(cursor?.transform.position[2]).toBeGreaterThanOrEqual(0);
    expect(cursor?.transform.position[2]).toBeLessThan(document.coordinateSpace.depth);
    expect(recomposed?.position[0]).toBeCloseTo(cursor!.transform.position[0]);
    expect(recomposed?.position[2]).toBeCloseTo(cursor!.transform.position[2]);
  });

  it('translates one millimetre for equal minimum transaction amounts', () => {
    const document = createSpatialDocument(`"Ball/+2+3/+0+3/+4+3" : "geometry: sphere;"
"Ball/+probe/+++" : ""
"Cursor/+5+1/+0+1/+4+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline', transactionAmount: MIN_TRANSACTION_AMOUNT }],
      [2, { sourceKind: 'baseline' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: MIN_TRANSACTION_AMOUNT }],
    ]) });
    const ball = document.renderNodes.find((node) => node.namespacePath === 'Ball/');

    expect(weightedTranslationDistance(MIN_TRANSACTION_AMOUNT, MIN_TRANSACTION_AMOUNT)).toBe(0.01);
    expect(document.interactions?.[0]).toMatchObject({ normal: [-1, 0, 0], cursorWeight: MIN_TRANSACTION_AMOUNT });
    expect(ball?.box).toMatchObject({ x: 1.99, y: 0, z: 4, width: 3, height: 3, depth: 3 });
  });

  it('keeps contact translation active for both exact probes and breaches', () => {
    const compile = (cursorX: string) => createSpatialDocument(`"Ball/+2+3/+0+3/+4+3" : "geometry: sphere"
"Ball/+contact/+++" : ""
"Cursor/+${cursorX}+1/+0+1/+4+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline', transactionAmount: MIN_TRANSACTION_AMOUNT }],
      [2, { sourceKind: 'baseline' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: MIN_TRANSACTION_AMOUNT }],
    ]) });

    const touching = compile('5');
    const shallowBreach = compile('450c');
    const nextBreachFrame = compile('425c');

    expect(touching.interactions).toMatchObject([{ state: 'probe', normal: [-1, 0, 0] }]);
    expect(touching.renderNodes.find((node) => node.namespacePath === 'Ball/')?.box.x).toBe(1.99);
    expect(shallowBreach.interactions).toMatchObject([{ state: 'breach', penetration: 0.5, normal: [-1, 0, 0] }]);
    expect(shallowBreach.renderNodes.find((node) => node.namespacePath === 'Ball/')?.box.x).toBe(1.49);
    expect(nextBreachFrame.renderNodes.find((node) => node.namespacePath === 'Ball/')?.box.x).toBe(1.24);
  });

  it('uses the nearest exit distance when the cursor is contained by the target', () => {
    const document = createSpatialDocument(`"Target/+0+10/+0+10/+0+10" : ""
"Target/+contact/+++" : ""
"Cursor/+4+1/+4+1/+4+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline', transactionAmount: MIN_TRANSACTION_AMOUNT }],
      [2, { sourceKind: 'baseline' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: MIN_TRANSACTION_AMOUNT }],
    ]) });
    const target = document.renderNodes.find((node) => node.namespacePath === 'Target/');

    expect(document.interactions).toMatchObject([{
      state: 'breach',
      penetration: 1,
      resolutionDistance: 5,
      normal: [1, 0, 0],
    }]);
    expect(target?.bounds.minX).toBeCloseTo(5.01);
  });

  it('resolves contact penetration before ordinary collision packing', () => {
    const document = createSpatialDocument(`"Obstacle/+0+2/+0+3/+4+3" : ""
"Ball/+2+3/+0+3/+4+3" : "geometry: sphere"
"Ball/+contact/+++" : ""
"Cursor/+5+1/+0+1/+4+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'baseline', transactionAmount: MIN_TRANSACTION_AMOUNT }],
      [3, { sourceKind: 'baseline' }],
      [4, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: MIN_TRANSACTION_AMOUNT }],
    ]) });
    const ball = document.renderNodes.find((node) => node.namespacePath === 'Ball/');

    expect(document.interactions).toMatchObject([{ state: 'probe', targetNamespace: 'Ball/' }]);
    expect(ball?.box.x).toBe(1.99);
    expect(ball?.bounds.minX).toBe(2);
  });

  it('scales unequal valid transaction amounts before translating in the polar-opposite direction', () => {
    const distance = weightedTranslationDistance(6_000_000, 2_000_000);
    const document = createSpatialDocument(`"Ball/+2+3/+0+3/+4+3" : ""
"Ball/+probe/+++" : ""
"Cursor/+5+1/+0+1/+4+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline', transactionAmount: 2_000_000 }],
      [2, { sourceKind: 'baseline' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: 6_000_000 }],
    ]) });

    expect(distance).toBe(0.03);
    expect(document.renderNodes.find((node) => node.namespacePath === 'Ball/')?.box.x).toBe(2 - distance);
  });

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -1],
    ['non-finite', Number.POSITIVE_INFINITY],
  ])('uses the atomic minimum for %s transaction amounts', (_label, invalidAmount) => {
    const distance = weightedTranslationDistance(invalidAmount, invalidAmount);
    const document = createSpatialDocument(`"Ball/+2+3/+0+3/+4+3" : ""
"Ball/+probe/+++" : ""
"Cursor/+5+1/+0+1/+4+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline', transactionAmount: invalidAmount }],
      [2, { sourceKind: 'baseline' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: invalidAmount }],
    ]) });

    expect(distance).toBe(0.01);
    expect(document.renderNodes.find((node) => node.namespacePath === 'Ball/')?.box.x).toBe(2 - distance);
  });

  it('caps the converted project distance at 100 units in the polar-opposite direction', () => {
    const distance = weightedTranslationDistance(20_000_000_000, MIN_TRANSACTION_AMOUNT);
    const document = createSpatialDocument(`"Ball/+2+3/+0+3/+4+3" : ""
"Ball/+probe/+++" : ""
"Cursor/+5+1/+0+1/+4+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline', transactionAmount: MIN_TRANSACTION_AMOUNT }],
      [2, { sourceKind: 'baseline' }],
      [3, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: 20_000_000_000 }],
    ]) });

    expect(distance).toBe(MAX_WEIGHTED_TRANSLATION);
    expect(document.renderNodes.find((node) => node.namespacePath === 'Ball/')?.box.x).toBe(22);
  });

  it("uses the translated target's weight for a conditional activated by another scope member", () => {
    const document = createSpatialDocument(`"Machine/+0+10/+0+10/+0+10" : ""
"Machine/Button/+0+1/+0+1/+0+1" : ""
"Machine/Lever/+5+1/+0+1/+0+1" : ""
"Machine/+probe/Lever/+++" : ""
"Cursor/+1+1/+0+1/+0+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline', transactionAmount: 1 }],
      [2, { sourceKind: 'baseline', transactionAmount: 2 }],
      [3, { sourceKind: 'baseline', transactionAmount: 10 }],
      [4, { sourceKind: 'baseline' }],
      [5, { sourceKind: 'secondary', streamId: 'cursor', transactionAmount: 20 }],
    ]) });
    const lever = document.renderNodes.find((node) => node.namespacePath === 'Machine/Lever/');

    expect(document.interactions?.[0]).toMatchObject({ targetNamespace: 'Machine/Button/', cursorWeight: 20 });
    expect(lever?.box.x).toBe(4.98);
  });

  it('detects probe before packing and applies inferred-direction translation without resizing', () => {
    const document = createSpatialDocument(`"Rod/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Rod/+probe/+4/+0/+0" : "rotation: 90,90,0"
"Cursor/+1+1/+0+1/+0+1" : ""`, { originsByLine: origins(3) });
    const rod = document.renderNodes.find((node) => node.namespacePath === 'Rod/');
    const cursor = document.renderNodes.find((node) => node.namespacePath === 'Cursor/');

    expect(document.interactions).toMatchObject([{ state: 'probe', streamId: 'controller-a', normal: [-1, 0, 0] }]);
    expect(rod?.box).toMatchObject({ x: 36, width: 1, height: 5, depth: 1 });
    expect(rod?.transform.rotation).toEqual([Math.PI / 2, Math.PI / 2, 0]);
    expect(cursor?.box.x).toBe(1);
  });

  it('detects breach and applies a complete absolute box override', () => {
    const document = createSpatialDocument(`"Rod/+0+2/+0+2/+0+2" : "color: blue"
"Rod/+breach/+9+1/+3+4/+5+2" : "color: red"
"Cursor/+1+2/+0+1/+0+1" : ""`, { originsByLine: origins(3) });
    const rod = document.renderNodes.find((node) => node.namespacePath === 'Rod/');

    expect(document.interactions?.[0].state).toBe('breach');
    expect(rod?.box).toMatchObject({ x: 9, y: 3, z: 5, width: 1, height: 4, depth: 2 });
    expect(rod?.material.color).toBe('red');
  });

  it('merges conditional texture attributes without dropping base channels or presets', () => {
    const document = createSpatialDocument(`"Rod/+0+1/+0+1/+0+1" : "texture: wood.oak; normal-texture: bump.noise"
"Rod/+probe" : "texture-repeat: 3 4"
"Cursor/+1+1/+0+1/+0+1" : ""`, { originsByLine: origins(3) });
    const material = document.renderNodes.find((node) => node.namespacePath === 'Rod/')?.material;

    expect(material?.textures?.map).toMatchObject({ preset: 'wood.oak', repeat: [3, 4] });
    expect(material?.textures?.normalMap).toMatchObject({ preset: 'bump.noise' });
  });

  it('merges a conditional channel attribute into its inherited texture specification', () => {
    const document = createSpatialDocument(`"Rod/+0+1/+0+1/+0+1" : "texture: wood.oak; normal-texture: bump.noise"
"Rod/+probe" : "normal-texture-repeat: 5 6"
"Cursor/+1+1/+0+1/+0+1" : ""`, { originsByLine: origins(3) });
    const material = document.renderNodes.find((node) => node.namespacePath === 'Rod/')?.material;

    expect(material?.textures?.map).toEqual({ preset: 'wood.oak' });
    expect(material?.textures?.normalMap).toEqual({ preset: 'bump.noise', repeat: [5, 6] });
  });

  it('retains the base geometry kind for a partial conditional geometry override', () => {
    const document = createSpatialDocument(`"Rod/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Rod/+probe" : "operation: subtraction"
"Cursor/+1+1/+0+1/+0+1" : ""`, { originsByLine: origins(3) });
    const rod = document.nodes.find((node) => node.namespacePath === 'Rod/');

    expect(rod?.geometry.kind).toBe('cylinder');
    expect(rod?.geometry.operation).toBe('subtraction');
  });

  it('applies conditional content overrides to the effective node', () => {
    const document = createSpatialDocument(`"Card/+0+1/+0+1/+0+1" : "content-kind: text; content-text: Waiting"
"Card/+probe" : "content-kind: text; content-text: Active"
"Cursor/+1+1/+0+1/+0+1" : ""`, { originsByLine: origins(3) });
    const card = document.renderNodes.find((node) => node.namespacePath === 'Card/');

    expect(card?.content).toMatchObject({ kind: 'text', text: 'Active' });
  });

  it('attributes identical cursor namespaces to independent streams without replacement', () => {
    const source = `"Rod/+0+1/+0+1/+0+1" : ""
"Cursor/+1+1/+0+1/+0+1" : ""
"Cursor/+0+1/+1+1/+0+1" : ""`;
    const map = new Map<number, XyzDslDeclarationOrigin>([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'alice' }],
      [3, { sourceKind: 'secondary', streamId: 'bob' }],
    ]);
    const facts = createSpatialDocument(source, { originsByLine: map }).interactions ?? [];
    expect(new Set(facts.map((fact) => fact.streamId))).toEqual(new Set(['alice', 'bob']));
  });

  it('derives enter, stay, and leave independently', () => {
    const fact = createSpatialDocument(`"Rod/+0+1/+0+1/+0+1" : ""
"Cursor/+1+1/+0+1/+0+1" : ""`, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'controller' }],
    ]) }).interactions![0];
    expect(interactionTransitions([], [fact])[0].kind).toBe('enter');
    expect(interactionTransitions([fact], [fact])[0].kind).toBe('stay');
    expect(interactionTransitions([fact], [])[0].kind).toBe('leave');
  });

  it('does not treat edge-only contact as a probe', () => {
    const source = `"Rod/+0+1/+0+1/+0+1" : ""
"Cursor/+1+1/+1+1/+0+1" : ""`;
    const facts = createSpatialDocument(source, { originsByLine: new Map([
      [1, { sourceKind: 'baseline' }],
      [2, { sourceKind: 'secondary', streamId: 'controller' }],
    ]) }).interactions;
    expect(facts).toEqual([]);
  });
});
