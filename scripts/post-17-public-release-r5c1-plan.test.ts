import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();
const plan = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-018-r5c1-source-readiness-plan.md'), 'utf8');
const parent = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md'), 'utf8');

for (const heading of [
  '## Outcome',
  '## Reconciled baseline',
  '## A1 — Source-readiness architecture decision',
  '## L1 — Manifest-wide Markdown link integrity',
  '## P1 — Four-lock dependency and license policy',
  '## S1 — Manifest-wide text-secret gate',
  '## D1 — Release-note reconciliation',
  '## Test and attack matrix',
  '## Evidence contract',
  '## Rollback and stop conditions',
  '## Deferred beyond R5C1',
]) assert.ok(plan.includes(heading), `missing section: ${heading}`);

for (const contract of [
  'slice=R5C1, links=L1, licenses=P1, secrets=S1, docs=D1, architecture=A1, evidence=E1',
  'fdade1bedf9ce4798d24ccc24537637d316bfd07',
  '187 Markdown files',
  '54 relative links',
  '41 positive controls',
  'exactly 13 unresolved links',
  '613 manifest text files',
  'ten detector families',
  'four package-lock authorities',
  '749 dependency occurrences',
  '616 unique name@version packages',
  'busboy@1.6.0',
  'format@0.2.2',
  'khroma@2.1.0',
  'streamsearch@1.1.0',
  'TypeScript and Node.js',
  '512 MiB',
  '256 MiB',
  '30 seconds',
  '3.25.0 / v3.25 / 0.5.0 / 1.3.0',
]) assert.ok(plan.includes(contract), `missing contract: ${contract}`);

assert.match(parent, /documentation link/i);
assert.match(parent, /package metadata/i);
assert.match(parent, /SBOM\/dependency/i);
assert.match(parent, /secret scanning/i);
assert.match(plan, /does not claim SBOM, final-archive, clean-clone, release-candidate, publication, or visibility readiness/);

console.log('post-17-public-release-r5c1-plan.test: PASS (11 sections, architecture/link/license/secret/docs/evidence boundaries locked)');
