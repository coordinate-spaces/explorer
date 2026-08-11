import { describe, expect, it } from 'vitest';
import { composeSpatialEditorSourceBundle, composeSpatialEditorSources, composeTransactionSources, originsForEditedSource } from './composeTransactionSources';
import type { XyzDslDeclarationOrigin } from '../xyzdsl/types';

describe('composeTransactionSources', () => {
  const primary = '"Table/" : "color: white"\n"Table/+0+1/+0+1/+0+1" : ""';

  it('keeps primary XYZDSL first so secondary primitive instances can reference base objects', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"+1+1/+0+1/+0+1" : "ref: Table/"' },
    ]);

    expect(result).toBe(`${primary}\n"+1+1/+0+1/+0+1" : "ref: Table/"`);
  });

  it('omits secondary namespace declarations so they cannot overwrite the primary environment', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Table/" : "color: red"\n"Table/Leaf/+0+1/+0+1/+0+1" : ""' },
      { declarations: '"Table/" : "color: blue"' },
    ]);

    expect(result).toBe(`${primary}\n"Table/Leaf/+0+1/+0+1/+0+1" : ""`);
  });

  it('omits secondary declarations for namespaces that are not provided by the primary source', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Lamp/" : "color: yellow"\n"Lamp/+0+1/+0+1/+0+1" : ""' },
    ]);

    expect(result).toBe(primary);
  });

  it('keeps non-declaration secondary lines in primary namespaces as consumers', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Table/Leaf/+0+1/+0+1/+0+1" : "color: green"' },
    ]);

    expect(result).toBe(`${primary}\n"Table/Leaf/+0+1/+0+1/+0+1" : "color: green"`);
  });

  it('keeps unnamespaced secondary primitive instances', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"+2+1/+0+1/+0+1" : "color: purple"' },
    ]);

    expect(result).toBe(`${primary}\n"+2+1/+0+1/+0+1" : "color: purple"`);
  });


  it('preserves primary source leading blank lines for parser line numbers', () => {
    const primaryWithLeadingBlank = `\n${primary}`;
    const result = composeTransactionSources(primaryWithLeadingBlank, [
      { declarations: '"+2+1/+0+1/+0+1" : "color: purple"' },
    ]);

    expect(result).toBe(`${primaryWithLeadingBlank}\n"+2+1/+0+1/+0+1" : "color: purple"`);
  });

  it('supports playback cursors per secondary stream', () => {
    const result = composeTransactionSources('', [
      { declarations: '"+0+1/+0+1/+0+1" : ""\n"+1+1/+0+1/+0+1" : ""', playbackCursor: 1 },
    ]);

    expect(result).toBe('"+0+1/+0+1/+0+1" : ""');
  });
});

describe('composeSpatialEditorSources', () => {
  it('preserves transaction weights for unchanged baseline declarations after local edits', () => {
    const baseline = '"Ball/+0+3/+0+3/+0+3" : "geometry: sphere"';
    const origins = new Map<number, XyzDslDeclarationOrigin>([
      [1, { sourceKind: 'baseline', transactionAmount: 2 }],
    ]);
    const edited = `${baseline}\n"Ball/+touch/+++" : ""`;
    const remapped = originsForEditedSource(edited, baseline, origins);
    const bundle = composeSpatialEditorSourceBundle(edited, [], '', remapped);

    expect(bundle.originsByLine.get(1)?.transactionAmount).toBe(2);
    expect(bundle.originsByLine.get(2)).toMatchObject({ sourceKind: 'baseline' });
    expect(bundle.originsByLine.get(2)?.transactionAmount).toBeUndefined();
  });

  it('does not retain transaction weight on a modified baseline declaration', () => {
    const baseline = '"Ball/+0+3/+0+3/+0+3" : "geometry: sphere"';
    const origins = new Map<number, XyzDslDeclarationOrigin>([
      [1, { sourceKind: 'baseline', transactionAmount: 2 }],
    ]);

    expect(originsForEditedSource(`${baseline};`, baseline, origins)).toEqual(new Map());
  });

  it('preserves baseline blank lines and their original editor line numbers', () => {
    const document = '"First/+0+1/+0+1/+0+1" : ""\n\n"Third/+2+1/+0+1/+0+1" : ""';
    const bundle = composeSpatialEditorSourceBundle(document, [{
      id: 'stream-a', declarations: '"+4+1/+0+1/+0+1" : ""',
    }], '"+6+1/+0+1/+0+1" : ""');

    expect(bundle.source).toBe(`${document}\n"+4+1/+0+1/+0+1" : ""\n"+6+1/+0+1/+0+1" : ""`);
    expect(bundle.originsByLine.get(1)?.sourceKind).toBe('baseline');
    expect(bundle.originsByLine.has(2)).toBe(false);
    expect(bundle.originsByLine.get(3)?.sourceKind).toBe('baseline');
    expect(bundle.originsByLine.get(4)).toMatchObject({ sourceKind: 'secondary', streamId: 'stream-a' });
    expect(bundle.originsByLine.get(5)?.sourceKind).toBe('remote-editor');
  });

  it('preserves leading and trailing baseline blanks before appended projections', () => {
    const document = '\n"Second/+0+1/+0+1/+0+1" : ""\n';
    const bundle = composeSpatialEditorSourceBundle(document, [{
      declarations: '"+2+1/+0+1/+0+1" : ""',
    }], '');

    expect(bundle.source).toBe(`${document}\n"+2+1/+0+1/+0+1" : ""`);
    expect(bundle.originsByLine.get(2)?.sourceKind).toBe('baseline');
    expect(bundle.originsByLine.get(4)?.sourceKind).toBe('secondary');
  });

  it('preserves source provenance for baseline, secondary, and editor declarations', () => {
    const bundle = composeSpatialEditorSourceBundle('"Cursor/" : ""', [{
      id: 'stream-a', publicKey: 'key-a', declarations: '"Cursor/+0+1/+0+1/+0+1" : ""', transactionTime: 42,
    }], '"+2+1/+0+1/+0+1" : ""');
    expect(bundle.originsByLine.get(1)?.sourceKind).toBe('baseline');
    expect(bundle.originsByLine.get(2)).toMatchObject({ sourceKind: 'secondary', streamId: 'stream-a', transactionTime: 42 });
    expect(bundle.originsByLine.get(3)?.sourceKind).toBe('remote-editor');
  });
  it('applies the remote editor after the document and namespace-filtered projections', () => {
    const document = '"Table/" : "color: white"';
    const result = composeSpatialEditorSources(document, [
      { declarations: '"Lamp/+0+1/+0+1/+0+1" : "color: yellow"\n"Table/+0+1/+0+1/+0+1" : "color: blue"' },
    ], '"Table/" : "color: cyan"');

    expect(result).toBe(`${document}\n"Table/+0+1/+0+1/+0+1" : "color: blue"\n"Table/" : "color: cyan"`);
  });

  it('keeps the remote editor independent when there are no secondary references', () => {
    expect(composeSpatialEditorSources('', [], '"+0+1/+0+1/+0+1" : "color: cyan"'))
      .toBe('"+0+1/+0+1/+0+1" : "color: cyan"');
  });
});
