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
});

describe('workspace information architecture', () => {
  it('uses one diagnostics center and separate auxiliary views', () => {
    expect(drawerSource).toContain('<WorkspaceDiagnostics');
    expect(drawerSource).toContain('onSelectLine={selectDiagnosticLine}');
    expect(drawerSource).toContain("setActiveView('source')");
    expect(drawerSource).toContain("auxiliaryRef.current?.scrollIntoView");
    expect(drawerSource).toContain("['connections', 'Connections']");
    expect(drawerSource).toContain("['diagnostics', `Diagnostics · ${diagnosticCount}`]");
    expect(drawerSource).toContain('physicsJointErrorCount(document.physicsJoints)');
    expect(drawerSource).not.toContain('aria-label="Spatial declaration diagnostics"');
    expect(drawerSource).not.toContain('aria-label="Spatial transaction diagnostics"');
  });
});
