import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { evaluateSourceReadinessDocumentation } from './public-source-readiness-contract';

const root = process.cwd();
const notes = fs.readFileSync(path.join(root, 'docs', 'releasing', 'UNRELEASED.md'), 'utf8');
const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');

for (const statement of [
  'Manifest-wide internal Markdown links: 48/48 valid',
  'Dependency license catalog: 616 unique packages across four lockfiles',
  'Manifest text secret scan: ten detector families, zero findings',
  'Nightly and manual qualification use the same read-only Linux/Windows matrix',
  'Internal-marker and private-binary remediation are complete for the current source candidate',
  'Generate deterministic SPDX 2.3 and CycloneDX 1.6 SBOM sidecars',
  'Run the final distribution-archive scanner',
  'Complete clean-clone qualification',
]) assert.ok(notes.includes(statement), `missing UNRELEASED statement: ${statement}`);

for (const stale of [
  'Resolve and requalify all 31 unresolved marker dispositions',
  'Complete dependency-license inventory and SBOM generation',
  'Add nightly qualification with bounded retention and failure ownership',
]) assert.equal(notes.includes(stale), false, `stale UNRELEASED statement: ${stale}`);

for (const statement of [
  'release/dependency-license-catalog.json',
  'release/dependency-license-policy.json',
  '616 unique name@version packages',
  '@axe-core/playwright@4.11.3',
  'axe-core@4.11.4',
  'caniuse-lite@1.0.30001799',
  'dompurify@3.4.11',
  'robust-predicates@3.0.3',
  'do not vendor `node_modules`',
  'R5C2 must re-evaluate the exact final archive contents',
]) assert.ok(notices.includes(statement), `missing third-party notice statement: ${statement}`);

assert.match(notes, /not a release announcement/i);
assert.match(notes, /does not authorize publication/i);
assert.match(notices, /not legal advice/i);

assert.deepEqual(evaluateSourceReadinessDocumentation(notes, notices), []);

const missingCurrent = evaluateSourceReadinessDocumentation(notes.replace('48/48 valid', '47/48 valid'), notices);
assert.ok(missingCurrent.some((finding) => finding.code === 'docs-required-statement-missing'));

const stale = evaluateSourceReadinessDocumentation(
  `${notes}\n- Resolve and requalify all 31 unresolved marker dispositions without hiding historical evidence.\n`,
  notices,
);
assert.ok(stale.some((finding) => finding.code === 'docs-stale-statement-present'));

const missingNotice = evaluateSourceReadinessDocumentation(notes, notices.replace('robust-predicates@3.0.3', 'removed-package'));
assert.ok(missingNotice.some((finding) => finding.code === 'notice-required-statement-missing'));

console.log('public-source-readiness-docs.test: PASS (release status and dependency-notice boundary reconciled)');
