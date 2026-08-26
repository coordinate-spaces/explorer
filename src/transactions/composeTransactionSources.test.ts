import { describe, expect, it } from 'vitest';
import { composeTransactionSources } from './composeTransactionSources';

describe('composeTransactionSources', () => {
  const primary = '"Table/" : "color: white"\n"Table/+0d+1d/+0d+1d/+0d+1d" : ""';

  it('keeps primary XYZDSL first so secondary primitive instances can reference base objects', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"+1d+1d/+0d+1d/+0d+1d" : "ref: Table/"' },
    ]);

    expect(result).toBe(`${primary}\n"+1d+1d/+0d+1d/+0d+1d" : "ref: Table/"`);
  });

  it('omits secondary namespace declarations so they cannot overwrite the primary environment', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Table/" : "color: red"\n"Table/Leaf/+0d+1d/+0d+1d/+0d+1d" : ""' },
      { declarations: '"Table/" : "color: blue"' },
    ]);

    expect(result).toBe(`${primary}\n"Table/Leaf/+0d+1d/+0d+1d/+0d+1d" : ""`);
  });

  it('omits secondary declarations for namespaces that are not provided by the primary source', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Lamp/" : "color: yellow"\n"Lamp/+0d+1d/+0d+1d/+0d+1d" : ""' },
    ]);

    expect(result).toBe(primary);
  });

  it('keeps non-declaration secondary lines in primary namespaces as consumers', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Table/Leaf/+0d+1d/+0d+1d/+0d+1d" : "color: green"' },
    ]);

    expect(result).toBe(`${primary}\n"Table/Leaf/+0d+1d/+0d+1d/+0d+1d" : "color: green"`);
  });

  it('keeps unnamespaced secondary primitive instances', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"+2d+1d/+0d+1d/+0d+1d" : "color: purple"' },
    ]);

    expect(result).toBe(`${primary}\n"+2d+1d/+0d+1d/+0d+1d" : "color: purple"`);
  });


  it('preserves primary source leading blank lines for parser line numbers', () => {
    const primaryWithLeadingBlank = `\n${primary}`;
    const result = composeTransactionSources(primaryWithLeadingBlank, [
      { declarations: '"+2d+1d/+0d+1d/+0d+1d" : "color: purple"' },
    ]);

    expect(result).toBe(`${primaryWithLeadingBlank}\n"+2d+1d/+0d+1d/+0d+1d" : "color: purple"`);
  });

  it('supports playback cursors per secondary stream', () => {
    const result = composeTransactionSources('', [
      { declarations: '"+0d+1d/+0d+1d/+0d+1d" : ""\n"+1d+1d/+0d+1d/+0d+1d" : ""', playbackCursor: 1 },
    ]);

    expect(result).toBe('"+0d+1d/+0d+1d/+0d+1d" : ""');
  });

  it('gives the baseline precedence over colliding tenant declarations', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Table/+0d+1d/+0d+1d/+0d+1d" : "color: red"\n"Table/+2d+1d/+0d+1d/+0d+1d" : "color: blue"' },
    ]);

    expect(result).toBe(primary);
  });

  it('uses deterministic first-tenant precedence for tenant collisions', () => {
    const result = composeTransactionSources(primary, [
      { declarations: '"Table/Leaf/+1d+1d/+0d+1d/+0d+1d" : "color: red"' },
      { declarations: '"Table/Leaf/+2d+1d/+0d+1d/+0d+1d" : "color: blue"' },
    ]);

    expect(result).toBe(`${primary}\n"Table/Leaf/+1d+1d/+0d+1d/+0d+1d" : "color: red"`);
  });

  it('keeps the latest named declaration within an accumulated tenant', () => {
    const result = composeTransactionSources(primary, [{
      declarations: '"Table/Leaf/+1d+1d/+0d+1d/+0d+1d" : "color: red"\n"Table/Leaf/+2d+1d/+0d+1d/+0d+1d" : "color: blue"',
    }]);

    expect(result).toBe(`${primary}\n"Table/Leaf/+2d+1d/+0d+1d/+0d+1d" : "color: blue"`);
  });

  it('does not treat anonymous instances with matching coordinates as collisions', () => {
    const anonymous = '"+2d+1d/+0d+1d/+0d+1d" : "color: purple"';
    const result = composeTransactionSources(anonymous, [{ declarations: anonymous }]);

    expect(result).toBe(`${anonymous}\n${anonymous}`);
  });
});
