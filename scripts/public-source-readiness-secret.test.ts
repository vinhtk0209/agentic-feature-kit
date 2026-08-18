import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  scanTextSecrets,
  type SecretScanInput,
  type SourceManifestEntry,
  type TextSourceFile,
} from './public-source-readiness-contract';

let passed = 0;
let failed = 0;
const encoder = new TextEncoder();
const sha256 = (value: Uint8Array): string => crypto.createHash('sha256').update(value).digest('hex');

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

function textFile(filePath: string, text: string, contentKind: 'text' | 'binary' = 'text'): TextSourceFile {
  return { path: filePath, contentKind, bytes: encoder.encode(text) };
}

function input(files: TextSourceFile[], overrides: Partial<SecretScanInput> = {}): SecretScanInput {
  return { files, sha256, maxFileBytes: 4_194_304, maxFindingsPerFile: 20, maxFindings: 200, ...overrides };
}

function reconstructedControls(): string[] {
  return [
    `${'AK' + 'IA'}${'A'.repeat(16)}`,
    `${'gh' + 'p_'}${'a'.repeat(36)}`,
    `${'xo' + 'xb-'}${'a'.repeat(24)}`,
    `${'AI' + 'za'}${'a'.repeat(35)}`,
    `${'np' + 'm_'}${'a'.repeat(36)}`,
    `${'ey' + 'J'}${'a'.repeat(15)}.${'ey' + 'J'}${'b'.repeat(15)}.${'c'.repeat(20)}`,
    `${'-----BEGIN ' + 'PRIVATE KEY' + '-----'}`,
    [['post', 'gresql'].join(''), '://', 'user', ':', 's'.repeat(24), '@', 'db.example.invalid', '/app'].join(''),
    `${'sk' + '_live_'}${'a'.repeat(24)}`,
    `${'X-' + 'Amz-' + 'Credential'}=${'a'.repeat(24)}`,
  ];
}

async function main(): Promise<void> {
  await test('all ten reconstructed detector families fire without exposing matched bytes', () => {
    const controls = reconstructedControls();
    const result = scanTextSecrets(input([textFile('fixture.txt', `${controls.join('\n')}\n`)]));
    assert.equal(result.detectorFamilies, 10);
    assert.equal(result.textFiles, 1);
    assert.equal(result.findings.length, 10);
    assert.deepEqual(result.findings.map((finding) => finding.detectorId), [
      'aws-access-key',
      'github-token',
      'slack-token',
      'google-api-key',
      'npm-token',
      'jwt-bearer',
      'pem-private-key',
      'credential-uri',
      'stripe-live-key',
      'signed-cloud-or-secret-assignment',
    ]);
    const serialized = JSON.stringify(result);
    for (const control of controls) assert.equal(serialized.includes(control), false);
    for (const finding of result.findings) assert.match(finding.fingerprintSha256 ?? '', /^[a-f0-9]{64}$/);
  });

  await test('documentation placeholders, public identifiers, hashes, and split labels remain negative', () => {
    const negative = [
      'KIT_TOKEN=<your-token>',
      'password=placeholder',
      'postgresql://user:password@db.example.invalid/app',
      'npm_package_name=agentic-feature-kit',
      `sha256=${'a'.repeat(64)}`,
      `public_id=${'A'.repeat(32)}`,
      `${'X-' + 'Amz-' + 'Credential'}=<redacted>`,
      `${'BEGIN ' + 'PRIVATE'} label only`,
    ].join('\n');
    assert.deepEqual(scanTextSecrets(input([textFile('docs/example.md', negative)])).findings, []);
  });

  await test('invalid UTF-8, NUL, binary-kind drift, duplicate paths, and oversize text fail closed', () => {
    const cases: Array<{ expected: string; value: SecretScanInput }> = [
      {
        expected: 'secret-invalid-utf8',
        value: input([{ path: 'bad.txt', contentKind: 'text', bytes: new Uint8Array([0xc3, 0x28]) }]),
      },
      { expected: 'secret-nul', value: input([{ path: 'nul.txt', contentKind: 'text', bytes: new Uint8Array([65, 0, 66]) }]) },
      { expected: 'secret-content-kind-mismatch', value: input([textFile('binary.bin', 'text', 'binary')]) },
      {
        expected: 'secret-path-duplicate',
        value: input([textFile('same.txt', 'a'), textFile('same.txt', 'b')]),
      },
      { expected: 'secret-file-too-large', value: input([textFile('large.txt', '12345')], { maxFileBytes: 4 }) },
    ];
    for (const value of cases) {
      assert.ok(scanTextSecrets(value.value).findings.some((finding) => finding.code === value.expected), value.expected);
    }
  });

  await test('per-file and global finding limits fail instead of truncating silently', () => {
    const secret = reconstructedControls()[0];
    const perFile = scanTextSecrets(input([textFile('many.txt', `${secret}\n${secret}\n`)], { maxFindingsPerFile: 1 }));
    assert.ok(perFile.findings.some((finding) => finding.code === 'secret-file-finding-limit'));

    const global = scanTextSecrets(input([
      textFile('a.txt', `${secret}\n`),
      textFile('b.txt', `${secret}\n`),
    ], { maxFindings: 1 }));
    assert.ok(global.findings.some((finding) => finding.code === 'secret-global-finding-limit'));
  });

  await test('finding ordering is ordinal by path, line, and detector', () => {
    const controls = reconstructedControls();
    const result = scanTextSecrets(input([
      textFile('z.txt', `${controls[1]}\n`),
      textFile('a.txt', `${controls[0]}\n`),
    ]));
    assert.deepEqual(result.findings.map((finding) => finding.path), ['a.txt', 'z.txt']);
  });

  await test('current public manifest text set has zero secret findings', () => {
    const root = process.cwd();
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'public-release-manifest.json'), 'utf8')) as {
      entries: SourceManifestEntry[];
      limits: { maxTextFileBytes: number };
    };
    const files = manifest.entries
      .filter((entry) => entry.decision === 'include' && entry.contentKind === 'text')
      .map((entry) => ({
        path: entry.path,
        contentKind: entry.contentKind,
        bytes: new Uint8Array(fs.readFileSync(path.join(root, ...entry.path.split('/')))),
      }));
    const result = scanTextSecrets(input(files, { maxFileBytes: manifest.limits.maxTextFileBytes }));
    assert.deepEqual(result.findings, [], JSON.stringify(result.findings, null, 2));
    assert.ok(result.textFiles >= 613);
    console.log(`CURRENT textFiles=${result.textFiles} detectorFamilies=${result.detectorFamilies} findings=0`);
  });

  if (failed > 0) {
    console.error(`public-source-readiness-secret.test: FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
  console.log(`public-source-readiness-secret.test: PASS (${passed} tests)`);
}

void main();
