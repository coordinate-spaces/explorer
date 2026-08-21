import { describe, expect, it } from 'vitest';
import { transactionSummary } from './XyzDslDrawer';
import drawerSource from './XyzDslDrawer.tsx?raw';

describe('transactionSummary', () => {
  it('does not display terminal path filler', () => {
    expect(transactionSummary({
      time: 100,
      from: 'sender',
      to: '+2+4/+6+6/+4+300000000000000000000000000000000=',
      amount: 1,
      fee: 0,
      memo: ' geometry: box ',
    })).toBe('from sender · to +2+4/+6+6/+4+3 · memo geometry: box');
  });
});

describe('runtime secondary controls', () => {
  it('keeps cursor playback controls available when authoring is unavailable', () => {
    expect(drawerSource).toContain('!authoringAvailable && secondaryProjections.length > 0');
    expect(drawerSource).toContain('className="runtime-playback-controls"');
    expect(drawerSource.match(/className="runtime-playback-controls"[\s\S]*?<SecondaryProjectionPanel/)?.[0])
      .toContain('<SecondaryProjectionPanel');
  });

  it('presents declaration and transaction failures in one workspace diagnostics section', () => {
    expect(drawerSource.match(/aria-label="Workspace diagnostics"/g)).toHaveLength(1);
    expect(drawerSource).toContain('<h3>Declarations</h3>');
    expect(drawerSource).toContain('<h3>Transactions</h3>');
    expect(drawerSource).not.toContain('aria-label="Spatial transaction diagnostics"');
  });
});
