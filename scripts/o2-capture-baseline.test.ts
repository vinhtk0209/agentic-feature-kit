import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { captureO2Baseline } from './o2-capture-baseline';
import { sha256, validateSpecIR } from '../.claude/integrations/spec-ir';

async function main(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'o2-baseline-test-'));
  const baselineDir = path.join(root, '.claude', 'assurance', 'baselines');
  fs.mkdirSync(baselineDir, { recursive: true });
  const source = [
    '# Feature',
    '| AC# | Given | When | Then |',
    '|---|---|---|---|',
    '| **AC1** | Admin | Loads | Overview appears |',
    '| **AC2** | Admin | Sorts | Rows reorder |',
  ].join('\n');
  const baseInput = {
    kitRoot: root,
    env: { O2_CONFLUENCE_URL: 'https://example.test/conf/pages/123/Feature' },
    outputPath: '.claude/assurance/baselines/feature.spec-ir.json',
    expectedSourceRef: 'confluence:123',
    expectedSourceSha256: sha256(source),
    expectedAcCount: 2,
    replaceExisting: false,
  };
  let fetchCount = 0;
  const fetchPage = async () => { fetchCount += 1; return source; };
  try {
    const first = await captureO2Baseline(baseInput, fetchPage);
    assert.equal(first.acceptanceCriteria, 2);
    assert.equal(first.replacedExisting, false);
    assert.equal(first.previousOutputSha256, null);
    const output = path.join(root, first.outputPath);
    validateSpecIR(JSON.parse(fs.readFileSync(output, 'utf8')));

    const original = fs.readFileSync(output, 'utf8');
    await assert.rejects(() => captureO2Baseline(baseInput, fetchPage), /--replace-existing/);
    assert.equal(fs.readFileSync(output, 'utf8'), original, 'refused replacement must preserve exact bytes');

    const replaced = await captureO2Baseline({ ...baseInput, replaceExisting: true }, fetchPage);
    assert.equal(replaced.replacedExisting, true);
    assert.equal(replaced.previousOutputSha256, sha256(original));
    assert.equal(replaced.outputSha256, sha256(fs.readFileSync(output)));

    await assert.rejects(
      () => captureO2Baseline({ ...baseInput, outputPath: '../escaped.spec-ir.json' }, fetchPage),
      /inside .claude\/assurance\/baselines/,
    );
    await assert.rejects(
      () => captureO2Baseline({ ...baseInput, expectedSourceSha256: '0'.repeat(64), replaceExisting: true }, fetchPage),
      /source SHA-256 mismatch/,
    );
    await assert.rejects(
      () => captureO2Baseline({ ...baseInput, expectedAcCount: 3, replaceExisting: true }, fetchPage),
      /AC count mismatch/,
    );
    assert.equal(fs.readFileSync(output, 'utf8'), original, 'failed evidence checks must not replace baseline');
    assert.equal(fetchCount, 5, 'path escape must fail before fetch; evidence attacks may fetch but never write');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('Canary GREEN: O2 baseline capture requires exact source identity/hash/AC count, stays inside the baseline root, and replaces only with explicit rollback-protected consent.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
