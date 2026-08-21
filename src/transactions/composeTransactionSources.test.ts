import { describe, expect, it } from 'vitest';
import { composeTransactionSources } from './composeTransactionSources';

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
