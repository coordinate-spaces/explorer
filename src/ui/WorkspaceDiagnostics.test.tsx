import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpatialSimulationSession } from '../simulation/SpatialSimulationSession';
import { WorkspaceDiagnostics } from './WorkspaceDiagnostics';

const documentedPendulum = [
  '"Pendulum/+0+1/+0+1/+0+1" : ""',
  '"Pendulum/Anchor/+45c+10c/+8+1/+45c+10c" : "body: Anchor; physics-mode: static"',
  '"Pendulum/Ceiling/+0+4/+8+1/+0+1" : "body: Anchor; physics-mode: static"',
  '"Pendulum/Rod/+83c+20c/+304c+5/+45c+10c" : "body: Rod; mass: 1; rotation: 0,0,10; joint: revolute; joint-parent: Pendulum/Anchor/; joint-anchor: 0.5 8 0.5; joint-axis: 0 0 1; joint-limits: -170 170; joint-damping: 0.05"',
].join('\n');

function diagnostics(source: string): string {
  const session = new SpatialSimulationSession(source);
  const { document } = session.frame();
  const markup = renderToStaticMarkup(<WorkspaceDiagnostics
    declarationDiagnostics={document.diagnostics}
    rejectedTransactions={[]}
    physicsJoints={document.physicsJoints}
    onSelectLine={() => undefined}
  />);
  session.dispose();
  return markup;
}

describe('workspace articulation diagnostics', () => {
  it('reports the documented pendulum constraint installed in the active session', () => {
    const markup = diagnostics(documentedPendulum);
    expect(markup).toContain('Installed joints <span>1</span>');
    expect(markup).toContain('<strong>revolute</strong>');
    expect(markup).toContain('joint:');
    expect(markup).toContain('Parent:');
    expect(markup).toContain('Child:');
  });

  it('reports an invalid parent as rejected and not installed', () => {
    const markup = diagnostics(documentedPendulum.replace('joint-parent: Pendulum/Anchor/', 'joint-parent: Pendulum/Missing/'));
    expect(markup).toContain('Installed joints <span>0</span>');
    expect(markup).toContain('Rod declares a revolute joint, but no constraint was installed in the active physics world.');
    expect(markup).toContain('Joint parent &quot;Pendulum/Missing/&quot; was not found.');
  });
});
