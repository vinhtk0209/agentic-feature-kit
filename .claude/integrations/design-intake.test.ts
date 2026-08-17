#!/usr/bin/env tsx
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DesignModel } from './design-source';
import { D0Success, VersionedDesignSource, runD0, runD05 } from './design-intake';

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn(); passed += 1; console.log(`PASS ${name}`);
}

function spec(dir: string): string {
  const file = path.join(dir, 'feature.md');
  fs.writeFileSync(file, '# Progress report\n\nAC-1: A learner can view progress.\n');
  return file;
}

function model(assets: Array<{ ref: string; type: string }> = []): DesignModel {
  return {
    schemaVersion: 1, source: 'figma', hash: 'a'.repeat(64),
    screens: [{ ref: 'https://www.figma.com/design/Abcdef123456/progress?node-id=1-2', name: 'Progress report', assets, components: [], textNodes: [], tree: { id: '1:2', name: 'Progress report', type: 'FRAME', children: [] }, tokens: { colors: [], textStyles: [], namedStyles: [] } }],
  };
}

class FakeSource implements VersionedDesignSource {
  id = 'fake'; calls = 0; version = 'v1'; next: DesignModel = model(); fail?: Error;
  async getFileVersion(): Promise<string> { return this.version; }
  async resolveCluster(): Promise<DesignModel> { this.calls += 1; if (this.fail) throw this.fail; return this.next; }
}

async function main(): Promise<void> {
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-intake-'));
try {
  await test('D0 rejects missing and malformed dual inputs with exact reason codes', () => {
    assert.equal(runD0({ figma: 'Abcdef123456' }).reason, 'intake-missing-confluence');
    assert.equal(runD0({ specPath: spec(root) }).reason, 'intake-missing-figma');
    assert.equal(runD0({ specPath: path.join(root, 'unknown.foo'), figma: 'Abcdef123456' }).reason, 'intake-malformed-confluence');
    assert.equal(runD0({ specPath: spec(root), figma: 'https://example.com/not-figma' }).reason, 'intake-malformed-figma-key');
  });

  const intake = runD0({ specPath: spec(root), figma: 'https://www.figma.com/design/Abcdef123456/progress?node-id=1-2' });
  assert.ok(intake.ok); const validIntake = intake as D0Success;

  await test('D0.5 writes complete artifacts then reuses only a version-matched cache', async () => {
    const source = new FakeSource(); const out = path.join(root, 'artifacts');
    const fresh = await runD05({ intake: validIntake, artifactDir: out, source });
    assert.equal(fresh.ok, true); assert.equal(fresh.ok && fresh.source, 'mcp-fresh'); assert.equal(source.calls, 1);
    assert.ok(fs.existsSync(path.join(out, 'DesignModel.json'))); assert.ok(fs.existsSync(path.join(out, 'image-annotations.md')));
    const cached = await runD05({ intake: validIntake, artifactDir: out, source });
    assert.equal(cached.ok && cached.source, 'cache-hit'); assert.equal(source.calls, 1);
    source.version = 'v2';
    const stale = await runD05({ intake: validIntake, artifactDir: out, source });
    assert.equal(stale.ok && stale.source, 'mcp-fresh'); assert.equal(source.calls, 2);
  });

  await test('D0.5 fails closed for a node-id/provider outage and unresolved image content hashes', async () => {
    const outage = new FakeSource(); outage.fail = new Error('node-id mismatch');
    const failed = await runD05({ intake: validIntake, artifactDir: path.join(root, 'outage'), source: outage });
    assert.equal(failed.ok, false); assert.equal(!failed.ok && failed.reason, 'ingest-mcp-failed');
    const badAsset = new FakeSource(); badAsset.next = model([{ type: 'png', ref: 'screens/progress.png' }]);
    const invalid = await runD05({ intake: validIntake, artifactDir: path.join(root, 'bad-asset'), source: badAsset });
    assert.equal(invalid.ok, false); assert.equal(!invalid.ok && invalid.reason, 'ingest-image-hash-unresolved');
    assert.equal(fs.existsSync(path.join(root, 'bad-asset', 'DesignModel.json')), false);
  });

  await test('D0.5 cannot be affected by a screenshot-diff false-positive storm', () => {
    const implementation = fs.readFileSync(path.join(__dirname, 'design-intake.ts'), 'utf8');
    assert.equal(implementation.includes('playwright-runner'), false);
    assert.equal(implementation.includes('pixelmatch'), false);
    assert.equal(implementation.includes('visual-diff'), false);
  });
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log(`design-intake tests ${passed}/4`);
}

main().catch((error) => { console.error(error); process.exit(1); });
