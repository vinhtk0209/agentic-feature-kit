import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();
const plan = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-018-r5b-binary-privacy-plan.md'), 'utf8');
const parent = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md'), 'utf8');

for (const heading of [
  '## Outcome',
  '## Reconciled baseline',
  '## B1 — Fail-closed public binary policy',
  '## A1 — Verified private binary archive',
  '## R1 — Digest-bound retained binary registry',
  '## F1 — Credential-safe public fixtures',
  '## H1 — Private canonical history and sanitized export',
  '## Test and attack matrix',
  '## Evidence contract',
  '## Rollback and stop conditions',
  '## Deferred beyond R5B',
]) assert.ok(plan.includes(heading), `missing section: ${heading}`);

for (const contract of [
  'slice=R5B, binary=B1, archive=A1, review=R1, fixture=F1, history=H1, evidence=E1',
  '19 tracked private images',
  '19,343,925 bytes',
  'ab2bdf6d9810bae96937494fd649178ece74d6a3',
  'c84b5fe1a47426ff5d72b83dd222a9b685265a05471d768633c12a4435ed4eb0',
  'a50486cbcdaa884a7fd4c33f3fa90eaaae1b88f2d8d81db1cc992f24b6be1c4b',
  '4973cda46645127c1fc9ef35858c2903ca833ec0e52eee3a4e5390f329330902',
  'current canonical repository remains private',
  'historyless sanitized export',
  'X-Amz-Credential',
  'raw PEM private-key marker',
  '3.25.0 / v3.25 / 0.5.0 / 1.3.0',
]) assert.ok(plan.includes(contract), `missing contract: ${contract}`);

assert.match(parent, /documentation link/i);
assert.match(parent, /package metadata/i);
assert.match(parent, /SBOM\/dependency/i);
assert.match(parent, /secret scanning/i);
assert.match(parent, /before archive creation/i);
assert.match(parent, /archive traversal, symlink\/reparse entries, duplicate\/case-colliding names/i);
assert.match(plan, /does not claim link, dependency-license, SBOM, archive-distribution, clean-clone, release-candidate, publication, or visibility readiness/);

console.log('post-17-public-release-r5b-plan.test: PASS (11 sections, binary/archive/fixture/history/evidence boundaries locked)');
