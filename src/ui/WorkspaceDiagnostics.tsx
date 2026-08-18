import type { ParseDiagnostic } from '../xyzdsl/types';
import type { RejectedTransaction } from '../transactions/types';
import type { PhysicsJointDiagnostic } from '../model/SpatialDocument';

interface WorkspaceDiagnosticsProps {
  declarationDiagnostics: readonly ParseDiagnostic[];
  rejectedTransactions: readonly RejectedTransaction[];
  physicsJoints?: readonly PhysicsJointDiagnostic[];
  onSelectLine: (line: number) => void;
}

export function WorkspaceDiagnostics({ declarationDiagnostics, rejectedTransactions, physicsJoints = [], onSelectLine }: WorkspaceDiagnosticsProps) {
  const installedJoints = physicsJoints.flatMap(({ articulation }) => articulation ? [articulation] : []);
  const missingJoints = physicsJoints.length - installedJoints.length;
  const total = declarationDiagnostics.length + rejectedTransactions.length + missingJoints;

  return (
    <section className="workspace-diagnostics workspace-section" aria-label="Workspace diagnostics">
      <div className="section-heading-row">
        <div>
          <p className="workspace-section-kicker">Workspace health</p>
          <h2>Diagnostics</h2>
        </div>
        <span className={`workspace-count ${total ? 'is-warning' : 'is-success'}`}>{total}</span>
      </div>

      {total === 0 ? <p className="workspace-empty-state">No declaration, transaction, or physics installation issues detected.</p> : null}

      <div className="diagnostic-group physics-joint-diagnostics">
        <h3>Installed joints <span>{installedJoints.length}</span></h3>
        {physicsJoints.length === 0 ? <p className="workspace-empty-state">No joint declarations are present in the active simulation.</p> : (
          <ul>
            {physicsJoints.map((joint) => joint.articulation ? (
              <li key={joint.nodeId}>
                <div className="diagnostic-row">
                  <span>{joint.articulation.id}</span>
                  <strong>{joint.articulation.kind}</strong>
                  <small>Parent: {joint.articulation.parentEntityId}</small>
                  <small>Child: {joint.articulation.childEntityId}</small>
                </div>
              </li>
            ) : (
              <li key={joint.nodeId}>
                <div className="diagnostic-row diagnostic-row-error">
                  <span>Not installed</span>
                  <strong>{joint.nodeName} declares a {joint.kind} joint, but no constraint was installed in the active physics world.</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {declarationDiagnostics.length > 0 ? (
        <div className="diagnostic-group">
          <h3>Declarations <span>{declarationDiagnostics.length}</span></h3>
          <ul>
            {declarationDiagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.line}-${index}`}>
                <button type="button" onClick={() => onSelectLine(diagnostic.line)}>
                  <span>Line {diagnostic.line}</span>
                  <strong>{diagnostic.message}</strong>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rejectedTransactions.length > 0 ? (
        <div className="diagnostic-group">
          <h3>Rejected transactions <span>{rejectedTransactions.length}</span></h3>
          <ul>
            {rejectedTransactions.map((rejection) => (
              <li key={rejection.id}>
                <div className="diagnostic-row">
                  <span>{rejection.id}</span>
                  <strong>{rejection.memoPreview || '(empty memo)'}</strong>
                  <small>{rejection.reasons.join(' ')}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
