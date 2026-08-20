import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { RELEASE_B_CAPABILITIES, RELEASE_C_CAPABILITIES } from '../physics/articulationCapabilities';
import { RELEASE_B_FIXTURES } from './releaseB/catalog';
import { RELEASE_C_FIXTURES } from './releaseC/catalog';
import { SimulationExampleRunner, type SimulationExampleResult } from './SimulationExampleRunner';

type Release = 'B' | 'C';
const requestedRelease = process.env.ARTICULATION_RELEASE;
const release: Release = requestedRelease === 'C' ? 'C' : 'B';
const enabled = requestedRelease === 'B' || requestedRelease === 'C';
const fixtures = release === 'B' ? RELEASE_B_FIXTURES : RELEASE_C_FIXTURES;
const results: SimulationExampleResult[] = [];
const gateAssertions: { readonly name: string; readonly passed: boolean; readonly details?: string }[] = [];
const assertionMaximum = (names: readonly string[]) => Math.max(0, ...results.flatMap(({ assertions }) => assertions)
  .filter(({ name }) => names.includes(name)).map(({ actualValue }) => typeof actualValue === 'number' ? actualValue : 0));
const check = (name: string, passed: boolean, details?: string) => {
  gateAssertions.push({ name, passed, details });
};
const expectChecksSince = (start: number) => expect(gateAssertions.slice(start).filter(({ passed }) => !passed)
  .map(({ name, details }) => details ?? name).join('\n')).toBe('');

const resolveLocalImport = (from: string, specifier: string): string | undefined => {
  if (!specifier.startsWith('.')) return undefined;
  const target = resolve(dirname(from), specifier);
  const candidates = extname(target) ? [target] : [target, `${target}.ts`, `${target}.tsx`, resolve(target, 'index.ts'), resolve(target, 'index.tsx')];
  return candidates.find((candidate) => existsSync(candidate));
};

/** Follow every local static/dynamic import reachable from a release catalog. */
const localDependencyGraph = (entry: string): ReadonlySet<string> => {
  const pending = [entry]; const visited = new Set<string>();
  const importPattern = /(?:import\s*(?:[^'"()]*?\s+from\s*)?|export\s+[^'"]*?\s+from\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
  while (pending.length > 0) {
    const source = pending.pop()!;
    if (visited.has(source)) continue;
    visited.add(source);
    for (const match of readFileSync(source, 'utf8').matchAll(importPattern)) {
      const dependency = resolveLocalImport(source, match[1]!);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
};

(enabled ? describe : describe.skip)(`Release ${release} articulation gate`, () => {
  it.each(fixtures)('passes $id', (fixture) => {
    const result = new SimulationExampleRunner().run(fixture);
    results.push(result);
    expect(result.assertions.filter(({ passed }) => !passed).map(({ message }) => message).join('\n')).toBe('');
  });

  if (release === 'B') {
    it('uses the explicitly selected passive-only capability profile', () => {
      const assertionStart = gateAssertions.length;
      check('Release B capability environment selected', process.env.RELEASE_B_CAPABILITIES === RELEASE_B_CAPABILITIES.id,
        `Expected RELEASE_B_CAPABILITIES=${RELEASE_B_CAPABILITIES.id}; received ${process.env.RELEASE_B_CAPABILITIES ?? '<unset>'}.`);
      check('Release B fixtures use the canonical capability object', fixtures.every(({ capabilities }) => capabilities === RELEASE_B_CAPABILITIES));
      check('Release B active-controller capabilities are disabled', fixtures.every(({ capabilities }) => Object.entries(capabilities)
        .filter(([key]) => key !== 'id' && key !== 'label').every(([, active]) => active === false)));
      expectChecksSince(assertionStart);
    });

    it('does not cross the Release C dependency or input boundary', () => {
      const assertionStart = gateAssertions.length;
      const releaseCRoot = resolve('src/examples/releaseC');
      const dependencies = localDependencyGraph(resolve('src/examples/releaseB/catalog.ts'));
      const releaseCDependencies = [...dependencies].filter((source) => source === releaseCRoot || source.startsWith(`${releaseCRoot}/`));
      check('Release B dependency graph excludes Release C examples', releaseCDependencies.length === 0,
        `Release B reaches Release C through: ${releaseCDependencies.map((source) => relative(process.cwd(), source)).join(', ')}`);
      for (const fixture of RELEASE_B_FIXTURES) {
        check(`${fixture.id} emits no joint-motor input`, !fixture.inputs.some(({ kind }) => kind.startsWith('joint-')));
        check(`${fixture.id} declares no motor properties`, !/\bmotor-[\w-]+\s*:/i.test(fixture.source));
        check(`${fixture.id} enables no active-controller capabilities`, fixture.capabilities === RELEASE_B_CAPABILITIES
          && Object.entries(fixture.capabilities).filter(([key]) => key !== 'id' && key !== 'label').every(([, active]) => active === false));
      }
      expectChecksSince(assertionStart);
    });
  }
});

afterAll(() => {
  const reportPath = process.env.ARTICULATION_REPORT;
  if (!reportPath || results.length === 0) return;
  const transitions = results.flatMap(({ samples }) => samples.flatMap(({ transitions: sampleTransitions }) => sampleTransitions))
    .reduce((counts, transition) => ({ ...counts, [transition.kind]: counts[transition.kind] + 1 }), { enter: 0, stay: 0, leave: 0 });
  const report = {
    schemaVersion: 1, release, capabilities: release === 'B' ? RELEASE_B_CAPABILITIES : RELEASE_C_CAPABILITIES,
    passed: results.every(({ passed }) => passed) && gateAssertions.every(({ passed }) => passed),
    fixtures: results.map(({ fixture }) => fixture.id),
    assertions: {
      fixtures: results.flatMap(({ fixture, assertions }) => assertions.map((assertion) => ({ fixture: fixture.id, name: assertion.name, passed: assertion.passed }))),
      gate: gateAssertions,
    },
    metrics: {
      maximumPivotError: assertionMaximum(['maximum pivot error']),
      maximumLimitOvershoot: assertionMaximum(['maximum limit overshoot']),
      maximumReplayDivergence: assertionMaximum(['snapshot replay divergence', 'motor replay divergence']),
      maximumMotorSpeed: assertionMaximum(['maximum speed']),
      maximumMotorEffort: assertionMaximum(['maximum applied effort']),
      targetError: assertionMaximum(['target convergence']),
      interactionTransitionCounts: transitions,
    },
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
});
