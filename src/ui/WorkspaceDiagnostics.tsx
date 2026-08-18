import type { ParseDiagnostic } from '../xyzdsl/types';
import type { RejectedTransaction } from '../transactions/types';

interface WorkspaceDiagnosticsProps {
  declarationDiagnostics: readonly ParseDiagnostic[];
  rejectedTransactions: readonly RejectedTransaction[];
  onSelectLine: (line: number) => void;
}

export function WorkspaceDiagnostics({ declarationDiagnostics, rejectedTransactions, onSelectLine }: WorkspaceDiagnosticsProps) {
  const total = declarationDiagnostics.length + rejectedTransactions.length;

  return (
    <section className="workspace-diagnostics workspace-section" aria-label="Workspace diagnostics">
      <div className="section-heading-row">
        <div>
          <p className="workspace-section-kicker">Workspace health</p>
          <h2>Diagnostics</h2>
        </div>
        <span className={`workspace-count ${total ? 'is-warning' : 'is-success'}`}>{total}</span>
      </div>

      {total === 0 ? <p className="workspace-empty-state">No declaration or transaction issues detected.</p> : null}

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
