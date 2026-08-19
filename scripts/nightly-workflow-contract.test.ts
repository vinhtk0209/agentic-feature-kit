import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REVIEWED_ACTION_PINS, validateNightlyWorkflow } from './nightly-workflow-contract';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'workflow-kit-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');

assert.deepEqual(validateNightlyWorkflow(workflow, readme), { passed: true, reasons: [] });

const checkoutPin = REVIEWED_ACTION_PINS['actions/checkout'].sha;
const attacks: Array<[string, string, string]> = [
  ['missing schedule', workflow.replace("    - cron: '17 3 * * *'\n", ''), readme],
  ['missing manual dispatch', workflow.replace('  workflow_dispatch:\n', ''), readme],
  ['write permission', workflow.replace('  contents: read', '  contents: write'), readme],
  ['floating action tag', workflow.replace(`actions/checkout@${checkoutPin}`, 'actions/checkout@v4'), readme],
  ['third-party action', workflow.replace('    steps:\n', `    steps:\n      - uses: example/action@${'a'.repeat(40)}\n`), readme],
  ['secret binding', workflow.replace('    steps:\n', '    env:\n      RELEASE_TOKEN: ${{ secrets.RELEASE_TOKEN }}\n    steps:\n'), readme],
  ['publication command', workflow.replace('run: npm ci\n', 'run: npm publish\n'), readme],
  ['provider execution', workflow.replace('run: npm ci\n', 'run: codex exec release\n'), readme],
  ['implicit merge-ref checkout', workflow.replace(/\n\s+with:\n\s+ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/, ''), readme],
  ['missing committed-clone qualification', workflow.replace(/\n\s+- name: Run committed-clone release qualification[\s\S]*?\n\s+- name: Upload platform qualification/, '\n      - name: Upload platform qualification'), readme],
  ['missing R5D artifact upload', workflow.replace('          artifacts/public-release/r5d/${{ matrix.platform }}.json\n', ''), readme],
  ['nested merged artifact root', workflow.replace('          path: artifacts\n          merge-multiple: true', '          path: artifacts/cross-platform\n          merge-multiple: true'), readme],
  ['missing R5D aggregate gate', workflow.replace(/\n\s+- name: Require clean-clone Linux\/Windows parity\n\s+run: npm run release:clean-clone-matrix-gate -- --dir artifacts\/public-release\/r5d/, ''), readme],
  ['missing summary', workflow.replace('- name: Publish qualification summary', '- name: Hidden result'), readme],
  ['untrusted summary input', workflow.replace('Repository permissions: read-only', 'Repository permissions: read-only ${{ github.head_ref }}'), readme],
  ['stale badge', workflow, readme.replace('workflow-kit-ci.yml/badge.svg', 'nightly.yml/badge.svg')],
];

for (const [name, attackedWorkflow, attackedReadme] of attacks) {
  const result = validateNightlyWorkflow(attackedWorkflow, attackedReadme);
  assert.equal(result.passed, false, `${name} attack unexpectedly passed`);
  assert.ok(result.reasons.length > 0, `${name} attack produced no reason`);
}

console.log(`nightly-workflow-contract.test: PASS (canonical + ${attacks.length} attacks)`);
