#!/usr/bin/env tsx
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { dryRunDesignToUi } from './design-to-ui-dry-run';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-dry-run-'));
try {
  const spec = path.join(dir, 'spec.md'); fs.writeFileSync(spec, '# Report\n\nAC-1: See data.\n');
  const pass = dryRunDesignToUi(spec, 'https://www.figma.com/design/Abcdef123456/report?node-id=1-2');
  assert.equal(pass.exitCode, 0); assert.ok(pass.transcript.some((line) => line.includes('[D0.5-ingest] dry-run')));
  const fail = dryRunDesignToUi(spec, undefined);
  assert.equal(fail.exitCode, 1); assert.equal(fail.transcript[0], '[D0-intake] fail reason=intake-missing-figma');
  console.log('design-to-ui dry-run tests 2/2');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
