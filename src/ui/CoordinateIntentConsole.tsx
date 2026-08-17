import type { ParseDiagnostic } from '../xyzdsl/types';
import type { LocalCoordinateIntent } from '../simulation/localCursor';

interface CoordinateIntentConsoleProps {
  declaration: string;
  intent: LocalCoordinateIntent;
  diagnostics: readonly ParseDiagnostic[];
}

export function CoordinateIntentConsole({ declaration, intent, diagnostics }: CoordinateIntentConsoleProps) {
  const intentDiagnostics = diagnostics.filter(({ message }) => /intent|controller|definition/i.test(message));
  return <details className="coordinate-intent-console" open>
    <summary>Coordinate intent · frame {intent.sequence}</summary>
    <dl>
      <div><dt>Definition</dt><dd>{intent.namespace || 'Not selected'}</dd></div>
      <div><dt>Mode</dt><dd>{intent.mode}</dd></div>
      <div><dt>Pointer</dt><dd>{intent.pointer.map((value) => value.toFixed(2)).join(', ')}</dd></div>
      <div><dt>Stream</dt><dd>local-simulation / local-frame-{intent.sequence}</dd></div>
    </dl>
    <div className="coordinate-intent-instruction">
      <span>Non-renderable XYZDSL instruction</span>
      <button type="button" onClick={() => void navigator.clipboard?.writeText(declaration)}>Copy</button>
      <code>{declaration}</code>
    </div>
    {intentDiagnostics.length ? <ul className="coordinate-intent-diagnostics">
      {intentDiagnostics.map((diagnostic, index) => <li key={`${diagnostic.line}-${index}`}>Line {diagnostic.line}: {diagnostic.message}</li>)}
    </ul> : <p className="coordinate-intent-ok">Definition resolved; runtime motion and collisions are physics-owned.</p>}
  </details>;
}
