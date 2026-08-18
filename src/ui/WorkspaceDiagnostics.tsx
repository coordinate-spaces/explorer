import type { ParseDiagnostic } from '../xyzdsl/types';
import type { RejectedTransaction } from '../transactions/types';
import type { PhysicsJointDiagnostic } from '../model/SpatialDocument';

interface WorkspaceDiagnosticsProps {
  declarationDiagnostics: readonly ParseDiagnostic[];
  rejectedTransactions: readonly RejectedTransaction[];
  physicsJoints?: readonly PhysicsJointDiagnostic[];
  onSelectLine: (line: number) => void;
  sessionIdentifier?: string;
  readOnly?: boolean;
  physicsTick?: number;
}

export function physicsJointErrorCount(physicsJoints: readonly PhysicsJointDiagnostic[] = []): number {
  return physicsJoints.filter(({ articulation }) => !articulation || articulation.error).length;
}

export function WorkspaceDiagnostics({ declarationDiagnostics, rejectedTransactions, physicsJoints = [], onSelectLine, sessionIdentifier, readOnly = false, physicsTick }: WorkspaceDiagnosticsProps) {
  const installedJoints = physicsJoints.flatMap(({ articulation }) => articulation ? [articulation] : []);
  const articulationErrors = physicsJointErrorCount(physicsJoints);
  const total = declarationDiagnostics.length + rejectedTransactions.length + articulationErrors;
  const number = (value: number | undefined) => value === undefined ? 'n/a' : Number.isFinite(value) ? value.toFixed(8) : String(value);
  const position = (value: readonly number[] | undefined) => value ? `[${value.map((component) => number(component)).join(', ')}]` : 'n/a';

  return (
    <section className="workspace-diagnostics workspace-section" aria-label="Workspace diagnostics">
      <div className="section-heading-row">
        <div>
          <p className="workspace-section-kicker">Workspace health</p>
          <h2>Diagnostics</h2>
        </div>
        <span className={`workspace-count ${total ? 'is-warning' : 'is-success'}`}>{total}</span>
      </div>

      {sessionIdentifier ? <p className="diagnostics-session">Session/revision: <code>{sessionIdentifier}</code></p> : null}
      <p className="diagnostics-tick">Physics tick: <output>{physicsTick ?? 0}</output></p>

      {total === 0 ? <p className="workspace-empty-state">No declaration, transaction, or physics installation issues detected.</p> : null}

      <div className="diagnostic-group physics-joint-diagnostics">
        <h3>Installed joints <span>{installedJoints.length}</span></h3>
        {physicsJoints.length === 0 ? <p className="workspace-empty-state">No joint declarations are present in the active simulation.</p> : (
          <ul>
            {physicsJoints.map((joint) => joint.articulation ? (
              <li key={joint.nodeId}>
                <div className={`diagnostic-row ${joint.articulation.error ? 'diagnostic-row-error' : ''}`}>
                  <span>{joint.articulation.id}</span>
                  <strong>{joint.articulation.kind}</strong>
                  <small>Handle: {joint.articulation.hasActiveHandle ? 'active' : 'missing'}</small>
                  <small>Tick: {joint.articulation.tick}</small>
                  <small>Parent: {joint.articulation.parentEntityId} ({joint.articulation.parentMode ?? 'unknown'})</small>
                  <small>Child: {joint.articulation.childEntityId} ({joint.articulation.childMode ?? 'unknown'})</small>
                  <small>Pivot error: {number(joint.articulation.pivotError)}</small>
                  <small>Mesh-anchor error: {number(joint.meshAnchorError)}</small>
                  <small>Parent anchor world: {position(joint.articulation.parentAnchorWorld)}</small>
                  <small>Child anchor world: {position(joint.articulation.childAnchorWorld)}</small>
                  {joint.articulation.kind === 'revolute' ? <small>Coordinate: {number(joint.articulation.coordinate)} rad; limits: {joint.articulation.limits ? `${number(joint.articulation.limits[0])} to ${number(joint.articulation.limits[1])} rad` : 'none'}</small> : null}
                  {joint.articulation.error ? <strong>Physics error: {joint.articulation.error}</strong> : null}
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
                <button type="button" disabled={readOnly} onClick={() => onSelectLine(diagnostic.line)}>
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
