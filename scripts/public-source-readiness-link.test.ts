import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  analyzeMarkdownLinks,
  type MarkdownLinkAnalysisInput,
  type SourceManifestEntry,
} from './public-source-readiness-contract';

let passed = 0;
let failed = 0;

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

function baseInput(): MarkdownLinkAnalysisInput {
  const entries: SourceManifestEntry[] = [
    { path: 'docs/excluded.md', decision: 'exclude', contentKind: 'text' },
    { path: 'docs/guide.md', decision: 'include', contentKind: 'text' },
    { path: 'docs/image.png', decision: 'include', contentKind: 'binary' },
    { path: 'docs/readme.md', decision: 'include', contentKind: 'text' },
  ];
  return {
    manifestEntries: entries,
    trackedPaths: entries.map((entry) => entry.path),
    regularPaths: entries.map((entry) => entry.path),
    markdownFiles: [
      {
        path: 'docs/guide.md',
        text: '# Guide\n\n## Install\n\n## Install\n\n<a id="explicit-id"></a>\n',
      },
      {
        path: 'docs/readme.md',
        text: [
          '# Home',
          '[Guide](guide.md#install)',
          '![Diagram](image.png)',
          '[Reference][guide-ref]',
          '[guide-ref]: ./guide.md?view=full#install-1',
          '[Explicit](guide.md#explicit-id)',
          '[Local fragment](#home)',
          '[External](https://example.com/docs)',
          '`[Inline code](missing.md)`',
          '```markdown',
          '[Fenced code](missing.md)',
          '```',
          '',
        ].join('\n'),
      },
    ],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findingCodes(input: MarkdownLinkAnalysisInput): string[] {
  return analyzeMarkdownLinks(input).findings.map((finding) => finding.code);
}

async function main(): Promise<void> {
  await test('canonical inline, image, reference, query, fragment, duplicate heading, and explicit ID links pass', () => {
    const result = analyzeMarkdownLinks(baseInput());
    assert.equal(result.markdownFiles, 2);
    assert.equal(result.relativeLinks, 4);
    assert.equal(result.validLinks, 4);
    assert.deepEqual(result.findings, []);
  });

  await test('external, fragment-only, inline-code, and fenced-code destinations are not treated as repository links', () => {
    const input = baseInput();
    input.markdownFiles = [{
      path: 'docs/readme.md',
      text: [
        '# Home',
        '[Anchor](#home)',
        '[HTTPS](https://example.com)',
        '[Mail](mailto:security@example.com)',
        '<https://example.com>',
        '`[Inline](missing.md)`',
        '~~~',
        '[Fence](missing.md)',
        '~~~',
      ].join('\n'),
    }];
    const result = analyzeMarkdownLinks(input);
    assert.equal(result.relativeLinks, 0);
    assert.deepEqual(result.findings, []);
  });

  await test('missing, excluded, untracked, non-regular, and case-only targets fail with distinct codes', () => {
    const cases: Array<{ destination: string; mutate: (input: MarkdownLinkAnalysisInput) => void; code: string }> = [
      { destination: 'missing.md', mutate: () => undefined, code: 'link-target-missing' },
      { destination: 'excluded.md', mutate: () => undefined, code: 'link-target-excluded' },
      {
        destination: 'untracked.md',
        mutate: (input) => input.manifestEntries.push({ path: 'docs/untracked.md', decision: 'include', contentKind: 'text' }),
        code: 'link-target-untracked',
      },
      {
        destination: 'pipe.md',
        mutate: (input) => {
          input.manifestEntries.push({ path: 'docs/pipe.md', decision: 'include', contentKind: 'text' });
          input.trackedPaths.push('docs/pipe.md');
        },
        code: 'link-target-not-regular',
      },
      { destination: 'Guide.md', mutate: () => undefined, code: 'link-target-case-mismatch' },
    ];
    for (const value of cases) {
      const input = clone(baseInput());
      value.mutate(input);
      input.markdownFiles = [{ path: 'docs/readme.md', text: `[Target](${value.destination})\n` }];
      assert.deepEqual(findingCodes(input), [value.code], value.destination);
    }
  });

  await test('unsafe destinations fail closed before repository resolution', () => {
    const cases = new Map<string, string>([
      ['../../outside.md', 'link-target-traversal'],
      ['/absolute.md', 'link-target-absolute'],
      ['C:/absolute.md', 'link-target-absolute'],
      ['\\\\server\\share\\file.md', 'link-target-backslash'],
      ['guide%2', 'link-target-invalid-encoding'],
      ['guide%00.md', 'link-target-nul'],
    ]);
    for (const [destination, expected] of cases) {
      const input = clone(baseInput());
      input.markdownFiles = [{ path: 'docs/readme.md', text: `[Target](${destination})\n` }];
      assert.deepEqual(findingCodes(input), [expected], destination);
    }
  });

  await test('stale and ambiguous fragments fail closed', () => {
    for (const [fragment, expected] of [
      ['absent', 'link-fragment-missing'],
      ['install-2', 'link-fragment-missing'],
    ] as const) {
      const input = clone(baseInput());
      input.markdownFiles = [{ path: 'docs/readme.md', text: `[Target](guide.md#${fragment})\n` }];
      assert.deepEqual(findingCodes(input), [expected]);
    }
  });

  await test('duplicate and unresolved reference definitions fail closed', () => {
    const duplicate = clone(baseInput());
    duplicate.markdownFiles = [{
      path: 'docs/readme.md',
      text: '[Guide][ref]\n[ref]: guide.md\n[REF]: image.png\n',
    }];
    assert.deepEqual(findingCodes(duplicate), ['link-reference-duplicate']);

    const unresolved = clone(baseInput());
    unresolved.markdownFiles = [{ path: 'docs/readme.md', text: '[Guide][absent]\n' }];
    assert.deepEqual(findingCodes(unresolved), ['link-reference-missing']);
  });

  await test('current public manifest has no unresolved internal Markdown link', () => {
    const root = process.cwd();
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'public-release-manifest.json'), 'utf8')) as {
      entries: SourceManifestEntry[];
    };
    const index = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: root, encoding: 'utf8' });
    const trackedPaths: string[] = [];
    const regularPaths: string[] = [];
    for (const record of index.split('\0')) {
      if (!record) continue;
      const match = /^(\d{6}) [0-9a-f]+ \d\t(.+)$/.exec(record);
      assert.ok(match, `unexpected git index record: ${record}`);
      trackedPaths.push(match[2]);
      if (match[1] === '100644' || match[1] === '100755') regularPaths.push(match[2]);
    }
    const markdownFiles = manifest.entries
      .filter((entry) => entry.decision === 'include' && entry.contentKind === 'text' && entry.path.toLowerCase().endsWith('.md'))
      .map((entry) => ({ path: entry.path, text: fs.readFileSync(path.join(root, ...entry.path.split('/')), 'utf8') }));
    const result = analyzeMarkdownLinks({ manifestEntries: manifest.entries, trackedPaths, regularPaths, markdownFiles });
    assert.deepEqual(result.findings, [], JSON.stringify(result.findings, null, 2));
    console.log(`CURRENT markdownFiles=${result.markdownFiles} relativeLinks=${result.relativeLinks} validLinks=${result.validLinks}`);
  });

  if (failed > 0) {
    console.error(`public-source-readiness-link.test: FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
  console.log(`public-source-readiness-link.test: PASS (${passed} tests)`);
}

void main();
