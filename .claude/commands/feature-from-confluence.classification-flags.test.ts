import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prompt = fs.readFileSync(path.join(__dirname, 'feature-from-confluence.md'), 'utf8');

assert.match(prompt, /`--baseline`/, 'the workflow must expose an explicit BASELINE decision flag');
assert.match(prompt, /`--new`/, 'the workflow must expose an explicit NEW decision flag');
assert.match(prompt, /mutually exclusive/i, 'classification flags must fail closed when contradictory');
assert.match(prompt, /TASK_TYPE_OVERRIDE/, 'classification intent must be stored separately from the source URL');
assert.match(prompt, /strip.*--baseline.*--new.*SPEC_INPUT/is, 'classification flags must never contaminate the source URL');
assert.match(prompt, /TASK_TYPE_OVERRIDE\s*==\s*BASELINE[\s\S]*continue[\s\S]*B1[–-]B12/i,
  'explicit BASELINE must continue the evidence-producing full workflow instead of exiting early');
assert.match(prompt, /score[\s\S]*TASK_TYPE_OVERRIDE\s*==\s*NEW/i,
  'explicit NEW must remain distinguishable from score-based BASELINE detection');
assert.match(prompt, /--baseline[\s\S]*do(?:es)? not bypass[\s\S]*(B9|D-cross-2)/i,
  'classification intent must not weaken independent safety gates');

console.log('Canary GREEN: explicit BASELINE/NEW intent is stripped from source input, contradiction fails closed, and BASELINE still runs the full evidence-producing workflow without bypassing safety gates.');
