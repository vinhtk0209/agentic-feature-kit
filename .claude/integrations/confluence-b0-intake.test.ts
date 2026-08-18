import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  B0_CONFLUENCE_INTAKE_SENTINEL,
  runConfluenceB0Intake,
  stageConfluenceB0FromActorOutput,
} from './confluence-b0-intake';
import { formatConfluenceRefetchEnvelope, buildConfluenceRefetchEnvelope } from './confluence-refetch-actor';

const URL = 'https://wiki.example.test/pages/424242';
const SOURCE = [
  '# Synthetic Progress Reports',
  '',
  '## Acceptance Criteria',
  '',
  'AC1: Given an administrator, when reports load, then progress is visible.',
  'AC2: Given learner rows, when sorting, then completion order is deterministic.',
].join('\n');

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'confluence-b0-intake-'));
}

async function main(): Promise<void> {
  const actorOutput = formatConfluenceRefetchEnvelope(buildConfluenceRefetchEnvelope(URL, SOURCE));
  const stagingDir = tempDir();
  const result = stageConfluenceB0FromActorOutput({ rawUrl: URL, actorOutput, stagingDir });
  assert.equal(fs.readFileSync(path.join(stagingDir, '.incoming-spec.md'), 'utf8'), SOURCE);
  assert.equal(result.sourceRef, 'confluence:424242');
  assert.equal(result.acceptanceCriteria, 2);
  const ir = JSON.parse(fs.readFileSync(path.join(stagingDir, '.incoming-spec.ir.json'), 'utf8'));
  assert.equal(ir.sourceSha256, result.sourceSha256);

  let actorCalls = 0;
  const line = await runConfluenceB0Intake({
    rawUrl: URL,
    stagingDir: tempDir(),
    env: { RUNNER_CONFLUENCE_TOKEN: 'not-logged' },
    runActor: async ({ env }) => {
      actorCalls += 1;
      assert.equal(env.O2_CONFLUENCE_URL, URL);
      return actorOutput;
    },
  });
  assert.equal(actorCalls, 1);
  assert.match(line, new RegExp(`^${B0_CONFLUENCE_INTAKE_SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
  assert.doesNotMatch(line, /not-logged/);

  for (const invalid of [
    '',
    'ordinary output',
    '@@SPEC_REFETCH_RESULT@@ {not json}',
    `${actorOutput}\n${actorOutput}`,
    '@@SPEC_REFETCH_RESULT@@ {"v":1,"sourceRef":"confluence:424242","sourceSha256":"' + '0'.repeat(64) + '","sourceText":"forged"}',
  ]) {
    const untouched = tempDir();
    assert.throws(
      () => stageConfluenceB0FromActorOutput({ rawUrl: URL, actorOutput: invalid, stagingDir: untouched }),
      /spec-refetch|sentinel|sourceSha256/,
    );
    assert.equal(fs.existsSync(path.join(untouched, '.incoming-spec.md')), false, 'invalid evidence must not stage source');
    assert.equal(fs.existsSync(path.join(untouched, '.incoming-spec.ir.json')), false, 'invalid evidence must not stage IR');
  }

  console.log('Canary GREEN: provider-neutral B0 reuses the exact refetch parser, stages byte-identical source plus Spec-IR, and rejects missing/malformed/duplicate/forged sentinel evidence before writes.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
