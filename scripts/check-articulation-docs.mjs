import { readFileSync } from 'node:fs';

const contract = readFileSync(new URL('../docs/experimental-articulation.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const requiredContractText = [
  '## Canonical articulation coordinate-space contract',
  '### Current behavior, including the historical world-space ambiguity',
  '### Required contract (normative and implemented)',
  '| Component-local authored space |',
  '| Body-local physics space |',
  '| Mounted scene space |',
  'Runtime, published, and mounted world-space observations **MUST NOT** be fed',
  'runtime world pose       --X--> authored component-local definition',
];

for (const text of requiredContractText) {
  if (!contract.includes(text)) throw new Error(`Missing articulation contract text: ${text}`);
}

if (/\| `joint-anchor` \| (?:Absolute )?[Ww]orld-space/.test(contract)) {
  throw new Error('joint-anchor must not be defined merely as world-space');
}

const canonicalLink =
  '(docs/experimental-articulation.md#canonical-articulation-coordinate-space-contract)';
if (!readme.includes(canonicalLink)) throw new Error('README must link to the canonical articulation contract');

console.log('Canonical articulation documentation checks passed.');
