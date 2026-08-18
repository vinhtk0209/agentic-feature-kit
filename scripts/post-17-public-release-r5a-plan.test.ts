import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();
const plan = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-018-r5a-nightly-ci-plan.md'), 'utf8');
const parent = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md'), 'utf8');

for (const heading of [
  '## Outcome',
  '## Reconciled baseline',
  '## W1 — Preserve one workflow and one matrix',
  '## T1 — Deterministic triggers',
  '## P1 — Immutable reviewed action pins',
  '## V1 — Failure visibility',
  '## S1 — Read-only and zero-external-effect boundary',
  '## Test and attack matrix',
  '## Evidence contract',
  '## Rollback and stop conditions',
  '## Deferred beyond R5A',
]) assert.ok(plan.includes(heading), `missing section: ${heading}`);

for (const contract of [
  'slice=R5A, workflow=W1, triggers=T1, pins=P1, visibility=V1, restrictions=S1, evidence=E1',
  '17 3 * * *',
  'workflow_dispatch',
  'contents: read',
  'GITHUB_STEP_SUMMARY',
  '11d5960a326750d5838078e36cf38b85af677262',
  '49933ea5288caeca8642d1e84afbd3f7d6820020',
  'ea165f8d65b6e75b540449e92b4886f43607fa02',
  'd3f86a106a0bac45b974a628896c90dbdf5c8093',
  'manual-dispatch run identity after merge, separately from scheduled-run nonclaims',
  'Documentation link checking, package/license/secret/archive gates, dependency inventory, SBOM',
]) assert.ok(plan.includes(contract), `missing contract: ${contract}`);

assert.match(parent, /Add nightly\/manual CI while preserving P17-009's proven matrix/);
assert.match(parent, /GitHub Actions must be pinned to reviewed immutable commit SHAs/);
assert.match(parent, /no provider\s+credentials, no external provider execution, no Supabase write/);
assert.match(plan, /does not claim clean-clone, supply-chain, release-candidate, or public-release/);

console.log('post-17-public-release-r5a-plan.test: PASS (11 sections, scope/pins/restrictions/evidence/rollback locked)');
