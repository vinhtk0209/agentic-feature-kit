import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, 'p2-operator-demo.ts'), 'utf8');

assert.ok(source.includes("const FIXED_PROMPT = 'Reply with exactly I2_CODEX_LIVE_OK and nothing else.'"));
assert.ok(source.includes("const ROLES = ['dev', 'design', 'ui', 'figma'] as const"));
assert.ok(source.includes('validateP2RoleTransportSet(manifests)'));
assert.ok(source.includes('requireBackendBinding: true'));
assert.ok(source.includes("process.env.P2_OPERATOR_DEMO_CONFIRM !== 'run-four-read-only-codex-roles'"));
assert.ok(!/worktree\s+remove|Remove-Item|rm\s+-rf|argv\s*:/.test(source));

console.log('1 passed, 0 failed');
