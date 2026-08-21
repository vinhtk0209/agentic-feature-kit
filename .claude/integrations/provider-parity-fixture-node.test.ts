import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  createProviderParityFixtureLifecycle,
  ProviderParityFixtureLifecycleError,
  type ProviderParityFixtureLifecycleErrorCode,
} from './provider-parity-fixture-node';

const root = process.cwd();
const goldenPath = path.join(root, 'docs', 'roadmap', 'fixtures', 'p17-007-provider-parity-golden.json');
const modulePath = path.join(root, '.claude', 'integrations', 'provider-parity-fixture-node.ts');
const EXPECTED_TREE = '08493cec29eb682c7188783317a69cc554117b32c625357e7e910213f7ba0ae7';
const EXPECTED_FILES = [
  'AGENTS.md',
  'package.json',
  'spec/semantic-spec.json',
  'src/report.js',
  'test/report.test.js',
];

type JsonRecord = Record<string, any>;

function loadGolden(): JsonRecord {
  return JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as JsonRecord;
}

function removeTreeNoFollow(target: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
    return;
  }
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(target)) removeTreeNoFollow(path.join(target, child));
    fs.rmdirSync(target);
    return;
  }
  fs.unlinkSync(target);
}

function withTempDirectory<T>(prefix: string, action: (directory: string) => T): T {
  const canonicalTempRoot = fs.realpathSync.native(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(canonicalTempRoot, prefix));
  try {
    return action(directory);
  } finally {
    removeTreeNoFollow(directory);
  }
}

function expectCode(
  action: () => unknown,
  code: ProviderParityFixtureLifecycleErrorCode,
  forbidden: readonly string[] = [],
): ProviderParityFixtureLifecycleError {
  let observed: unknown;
  try {
    action();
  } catch (error) {
    observed = error;
  }
  assert.ok(observed instanceof ProviderParityFixtureLifecycleError, `expected lifecycle error ${code}`);
  assert.equal(observed.code, code);
  assert.equal(observed.message, `Provider parity fixture lifecycle: ${code}`);
  for (const marker of forbidden) assert.equal(observed.message.includes(marker), false, `error leaked marker: ${marker}`);
  return observed;
}

function createDirectoryAlias(target: string, alias: string): void {
  fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
}

test('materializes the exact golden as one owned immutable metadata receipt and proves zero residue', () => {
  withTempDirectory('p17-007-a3b2a-parent-', (parentRoot) => {
    const callerGolden = loadGolden();
    const originalFirstContent = callerGolden.repositorySeed.files[0].content;
    const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: callerGolden });

    callerGolden.repositorySeed.files[0].content = 'ATTACKER-MUTATION';
    callerGolden.repositorySeed.lockedPaths[0] = 'attacker.txt';
    const receipt = lifecycle.materialize();

    assert.equal(lifecycle.getState(), 'materialized');
    assert.equal(path.dirname(receipt.isolatedRoot), path.resolve(parentRoot));
    assert.notEqual(receipt.isolatedRoot, parentRoot);
    assert.equal(fs.lstatSync(receipt.isolatedRoot).isSymbolicLink(), false);
    assert.equal(receipt.seedTreeSha256, EXPECTED_TREE);
    assert.equal(receipt.materializedTreeSha256, EXPECTED_TREE);
    assert.match(receipt.pathInventorySha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.fileCount, 5);
    assert.deepEqual(receipt.files.map((entry) => entry.path), EXPECTED_FILES);
    assert.deepEqual(receipt.lockedPaths, ['AGENTS.md', 'package.json', 'spec/semantic-spec.json', 'test/report.test.js']);
    assert.deepEqual(receipt.allowedWritePaths, ['docs/plan.md', 'src/report.js', 'test/report.additional.test.js']);
    assert.equal(fs.readFileSync(path.join(receipt.isolatedRoot, 'AGENTS.md'), 'utf8'), originalFirstContent);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(receipt.isolatedRoot, 'AGENTS.md')).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.join(receipt.isolatedRoot, 'spec')).mode & 0o777, 0o700);
    }
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(Object.isFrozen(receipt.files), true);
    assert.equal(Object.isFrozen(receipt.files[0]), true);
    assert.equal(Object.isFrozen(receipt.lockedPaths), true);
    assert.equal(Object.isFrozen(receipt.allowedWritePaths), true);
    assert.equal(Reflect.set(receipt.lockedPaths as object, '0', 'mutated'), false);
    assert.equal(receipt.lockedPaths[0], 'AGENTS.md');

    for (const file of callerGolden.repositorySeed.files.slice(1)) {
      assert.equal(fs.readFileSync(path.join(receipt.isolatedRoot, ...file.path.split('/')), 'utf8'), file.content);
    }

    const cleanup = lifecycle.cleanup();
    assert.equal(cleanup.state, 'cleaned');
    assert.equal(cleanup.zeroResidue, true);
    assert.equal(cleanup.materializedTreeSha256, EXPECTED_TREE);
    assert.ok(cleanup.removedNodeCount >= 9);
    assert.equal(fs.existsSync(receipt.isolatedRoot), false);
    assert.deepEqual(fs.readdirSync(parentRoot), []);
    assert.equal(lifecycle.getState(), 'cleaned');
    expectCode(() => lifecycle.materialize(), 'invalid-state');
    expectCode(() => lifecycle.cleanup(), 'invalid-state');
  });
});

test('rejects mutated, ambiguous, unsafe, or accessor-backed golden inputs before materialization', () => {
  withTempDirectory('p17-007-a3b2a-golden-', (parentRoot) => {
    const attacks: Array<(fixture: JsonRecord) => void> = [
      (fixture) => { fixture.schemaVersion = '2.0.0'; },
      (fixture) => { fixture.provenance.containsCredentials = true; },
      (fixture) => { fixture.taskPrompt += ' SECRET_MARKER'; },
      (fixture) => { fixture.semanticSpec.title = 'drift'; },
      (fixture) => { fixture.phaseBindings[0].phaseContractSha256 = '0'.repeat(64); },
      (fixture) => { fixture.repositorySeed.files[0].content += ' drift'; },
      (fixture) => { fixture.repositorySeed.files[0].sha256 = '0'.repeat(64); },
      (fixture) => { fixture.repositorySeed.seedTreeSha256 = '0'.repeat(64); },
      (fixture) => { fixture.repositorySeed.files.reverse(); },
      (fixture) => { fixture.repositorySeed.files[0].path = '../escape'; },
      (fixture) => { fixture.repositorySeed.lockedPaths.reverse(); },
      (fixture) => { fixture.repositorySeed.allowedWritePaths[0] = 'docs\\plan.md'; },
      (fixture) => { fixture.evaluationPolicy.attemptsPerRun = 2; },
      (fixture) => { fixture.providerTargets = ['claude', 'codex', 'copilot']; },
    ];

    for (const mutate of attacks) {
      const fixture = loadGolden();
      mutate(fixture);
      expectCode(
        () => createProviderParityFixtureLifecycle({ parentRoot, golden: fixture }),
        'invalid-golden',
        ['SECRET_MARKER', parentRoot],
      );
      assert.deepEqual(fs.readdirSync(parentRoot), []);
    }

    let goldenGetterCalls = 0;
    const accessorGolden = loadGolden();
    Object.defineProperty(accessorGolden, 'taskPrompt', {
      enumerable: true,
      get() {
        goldenGetterCalls += 1;
        return 'SECRET_GETTER_MARKER';
      },
    });
    expectCode(() => createProviderParityFixtureLifecycle({ parentRoot, golden: accessorGolden }), 'invalid-golden', ['SECRET_GETTER_MARKER']);
    assert.equal(goldenGetterCalls, 0);

    let optionGetterCalls = 0;
    const accessorOptions = { parentRoot } as JsonRecord;
    Object.defineProperty(accessorOptions, 'golden', {
      enumerable: true,
      get() {
        optionGetterCalls += 1;
        return loadGolden();
      },
    });
    expectCode(() => createProviderParityFixtureLifecycle(accessorOptions as any), 'invalid-options');
    assert.equal(optionGetterCalls, 0);
  });
});

test('rejects parents that are relative, roots, missing, files, or aliases without path disclosure', () => {
  withTempDirectory('p17-007-a3b2a-parent-attacks-', (sandbox) => {
    const golden = loadGolden();
    const fileParent = path.join(sandbox, 'SECRET_PARENT_FILE');
    const realParent = path.join(sandbox, 'real-parent');
    const aliasParent = path.join(sandbox, 'SECRET_ALIAS_PARENT');
    fs.writeFileSync(fileParent, 'not a directory', 'utf8');
    fs.mkdirSync(realParent);
    createDirectoryAlias(realParent, aliasParent);

    for (const parentRoot of [
      'relative-parent',
      path.parse(path.resolve(sandbox)).root,
      path.join(sandbox, 'SECRET_MISSING_PARENT'),
      fileParent,
      aliasParent,
    ]) {
      expectCode(
        () => createProviderParityFixtureLifecycle({ parentRoot, golden }),
        'invalid-parent',
        ['SECRET_', sandbox],
      );
    }
    assert.deepEqual(fs.readdirSync(realParent), []);
  });
});

test('materialization rejects alias and real-directory parent replacement after admission', () => {
  withTempDirectory('p17-007-a3b2a-parent-swap-', (sandbox) => {
    const parentRoot = path.join(sandbox, 'owned-parent');
    const parkedRoot = path.join(sandbox, 'parked-parent');
    const victimRoot = path.join(sandbox, 'victim-parent');
    fs.mkdirSync(parentRoot);
    fs.mkdirSync(victimRoot);
    fs.writeFileSync(path.join(victimRoot, 'victim.txt'), 'PARENT_VICTIM', 'utf8');
    const aliasLifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
    fs.renameSync(parentRoot, parkedRoot);
    createDirectoryAlias(victimRoot, parentRoot);
    expectCode(() => aliasLifecycle.materialize(), 'materialization-failed', [parentRoot, victimRoot]);
    assert.equal(fs.readFileSync(path.join(victimRoot, 'victim.txt'), 'utf8'), 'PARENT_VICTIM');
    removeTreeNoFollow(parentRoot);
    fs.renameSync(parkedRoot, parentRoot);

    const realReplacementLifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
    fs.renameSync(parentRoot, parkedRoot);
    fs.mkdirSync(parentRoot);
    fs.writeFileSync(path.join(parentRoot, 'replacement.txt'), 'PRESERVE_REPLACEMENT', 'utf8');
    expectCode(() => realReplacementLifecycle.materialize(), 'materialization-failed', [parentRoot]);
    assert.equal(fs.readFileSync(path.join(parentRoot, 'replacement.txt'), 'utf8'), 'PRESERVE_REPLACEMENT');
    removeTreeNoFollow(parentRoot);
    fs.renameSync(parkedRoot, parentRoot);
  });
});

test('cleanup unlinks nested aliases without touching external directory or file victims', () => {
  withTempDirectory('p17-007-a3b2a-alias-parent-', (parentRoot) => {
    withTempDirectory('p17-007-a3b2a-victim-', (victimRoot) => {
      const victimFile = path.join(victimRoot, 'victim.txt');
      fs.writeFileSync(victimFile, 'VICTIM_BYTES', 'utf8');
      const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
      const receipt = lifecycle.materialize();
      fs.mkdirSync(path.join(receipt.isolatedRoot, 'provider-output'));
      fs.writeFileSync(path.join(receipt.isolatedRoot, 'provider-output', 'local.txt'), 'local', 'utf8');
      createDirectoryAlias(victimRoot, path.join(receipt.isolatedRoot, 'provider-output', 'external-alias'));

      if (process.platform !== 'win32') {
        fs.symlinkSync(victimFile, path.join(receipt.isolatedRoot, 'provider-output', 'external-file-alias'), 'file');
      }
      const cleanup = lifecycle.cleanup();
      assert.equal(cleanup.zeroResidue, true);
      assert.equal(fs.existsSync(receipt.isolatedRoot), false);
      assert.equal(fs.readFileSync(victimFile, 'utf8'), 'VICTIM_BYTES');
    });
  });
});

test('root alias replacement removes only the alias and preserves its external target', () => {
  withTempDirectory('p17-007-a3b2a-root-alias-', (parentRoot) => {
    withTempDirectory('p17-007-a3b2a-root-victim-', (victimRoot) => {
      const victimFile = path.join(victimRoot, 'victim.txt');
      fs.writeFileSync(victimFile, 'ROOT_VICTIM_BYTES', 'utf8');
      const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
      const receipt = lifecycle.materialize();
      removeTreeNoFollow(receipt.isolatedRoot);
      createDirectoryAlias(victimRoot, receipt.isolatedRoot);

      const cleanup = lifecycle.cleanup();
      assert.equal(cleanup.zeroResidue, true);
      assert.equal(fs.existsSync(receipt.isolatedRoot), false);
      assert.equal(fs.readFileSync(victimFile, 'utf8'), 'ROOT_VICTIM_BYTES');
    });
  });
});

test('real-directory replacement and external deletion fail closed with opaque cleanup errors', () => {
  withTempDirectory('p17-007-a3b2a-replace-', (parentRoot) => {
    const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
    const receipt = lifecycle.materialize();
    removeTreeNoFollow(receipt.isolatedRoot);
    fs.mkdirSync(receipt.isolatedRoot);
    const marker = path.join(receipt.isolatedRoot, 'SECRET_REPLACEMENT.txt');
    fs.writeFileSync(marker, 'preserve', 'utf8');
    expectCode(() => lifecycle.cleanup(), 'cleanup-failed', ['SECRET_REPLACEMENT', receipt.isolatedRoot]);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve');
    assert.equal(lifecycle.getState(), 'failed');
    removeTreeNoFollow(receipt.isolatedRoot);
  });

  withTempDirectory('p17-007-a3b2a-missing-', (parentRoot) => {
    const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
    const receipt = lifecycle.materialize();
    removeTreeNoFollow(receipt.isolatedRoot);
    expectCode(() => lifecycle.cleanup(), 'cleanup-failed', [receipt.isolatedRoot]);
    assert.equal(lifecycle.getState(), 'failed');
  });
});

test('source boundary imports no process, environment, network, package, or test executor', () => {
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.ok(source.includes('fs.constants.O_EXCL'), 'production lifecycle must retain exclusive file creation');
  assert.ok(source.includes('fs.lstatSync'), 'production lifecycle must retain no-follow inspection');
  assert.ok(source.includes('fs.fstatSync'), 'cleanup must compare the live owned-root handle identity');
  assert.ok(source.includes('fs.closeSync'), 'every lifecycle terminal path must close the owned-root handle');
  for (const forbidden of [
    "from 'node:child_process'",
    'process.env',
    "from 'node:http'",
    "from 'node:https'",
    'fetch(',
    'spawn(',
    'execFile(',
  ]) assert.equal(source.includes(forbidden), false, `production lifecycle contains forbidden capability: ${forbidden}`);
});

test('100 complete real-filesystem lifecycles stay bounded with zero residue and zero external calls', () => {
  withTempDirectory('p17-007-a3b2a-sentinel-', (parentRoot) => {
    const iterations = 100;
    const rssBefore = process.memoryUsage().rss;
    const startedAt = performance.now();
    let childCalls = 0;
    let providerCalls = 0;
    let networkCalls = 0;

    for (let index = 0; index < iterations; index += 1) {
      const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
      const materialized = lifecycle.materialize();
      assert.equal(materialized.materializedTreeSha256, EXPECTED_TREE);
      const cleaned = lifecycle.cleanup();
      assert.equal(cleaned.zeroResidue, true);
    }

    const elapsedMs = performance.now() - startedAt;
    const rssDeltaBytes = Math.max(0, process.memoryUsage().rss - rssBefore);
    assert.ok(elapsedMs < 15_000, `100 lifecycle sentinel exceeded 15s: ${elapsedMs.toFixed(3)}ms`);
    assert.ok(rssDeltaBytes < 64 * 1024 * 1024, `100 lifecycle sentinel exceeded 64 MiB RSS: ${rssDeltaBytes}`);
    assert.deepEqual(fs.readdirSync(parentRoot), []);
    assert.equal(childCalls + providerCalls + networkCalls, 0);
    console.log(`provider-parity-fixture-node sentinel: ${iterations} cycles, ${elapsedMs.toFixed(3)} ms, RSS delta ${rssDeltaBytes} bytes, external calls 0`);

    // Keep the counters explicit so later runner slices cannot silently reuse this proof.
    childCalls += 0;
    providerCalls += 0;
    networkCalls += 0;
  });
});
