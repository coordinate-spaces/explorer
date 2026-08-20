import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
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
const assertionMaximum = (names: readonly string[]) => Math.max(0, ...results.flatMap(({ assertions }) => assertions)
  .filter(({ name }) => names.includes(name)).map(({ actualValue }) => typeof actualValue === 'number' ? actualValue : 0));

(enabled ? describe : describe.skip)(`Release ${release} articulation gate`, () => {
  it.each(fixtures)('passes $id', (fixture) => {
    const result = new SimulationExampleRunner().run(fixture);
    results.push(result);
    expect(result.assertions.filter(({ passed }) => !passed).map(({ message }) => message).join('\n')).toBe('');
  });

  if (release === 'B') {
    it('uses the explicitly selected passive-only capability profile', () => {
      expect(process.env.RELEASE_B_CAPABILITIES).toBe(RELEASE_B_CAPABILITIES.id);
      expect(fixtures.every(({ capabilities }) => capabilities === RELEASE_B_CAPABILITIES)).toBe(true);
      expect(fixtures.every(({ capabilities }) => Object.entries(capabilities)
        .filter(([key]) => key !== 'id' && key !== 'label').every(([, enabled]) => enabled === false))).toBe(true);
    });

    it('does not cross the Release C dependency or input boundary', () => {
      const releaseBRoot = resolve('src/examples/releaseB');
      const sources = [resolve('src/examples/fixtures.ts'), ...RELEASE_B_FIXTURES.map(() => resolve(releaseBRoot, 'catalog.ts'))];
      for (const source of new Set(sources)) {
        expect(readFileSync(source, 'utf8'), `${relative(process.cwd(), source)} imports Release C examples`).not.toMatch(/(?:from|import\s*)[\s\S]*releaseC/);
      }
      for (const fixture of RELEASE_B_FIXTURES) {
        expect(fixture.inputs.some(({ kind }) => kind.startsWith('joint-')), `${fixture.id} emits a joint-motor input`).toBe(false);
        expect(fixture.source, `${fixture.id} declares motor properties`).not.toMatch(/(?:^|;)\s*motor-/m);
        expect(fixture.capabilities, `${fixture.id} enables active-controller capabilities`).toEqual(RELEASE_B_CAPABILITIES);
      }
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
    passed: results.every(({ passed }) => passed), fixtures: results.map(({ fixture }) => fixture.id),
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
