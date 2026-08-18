import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = 'release/public-binary-review.json';
const receiptPath = 'release/private-binary-archive-receipt.json';
const privateImagePrefix = 'docs/specs/ClassDetailsModuleList/images/';
const expectedSourceCommit = 'ab2bdf6d9810bae96937494fd649178ece74d6a3';
const expectedPrivateImageCount = 19;
const expectedPrivateImageBytes = 19_343_925;
const maxBinaryBytes = 8_388_608;
const maxDimension = 8_192;
const maxPixels = 33_554_432;

const expectedBinaries = [
  {
    path: 'docs/evidence/o2-continuous-assurance-pass-2026-08-11.jpg',
    mediaType: 'image/jpeg',
    byteLength: 83_215,
    sha256: 'c84b5fe1a47426ff5d72b83dd222a9b685265a05471d768633c12a4435ed4eb0',
    decision: 'retain-reviewed-operational-evidence',
  },
  {
    path: 'docs/evidence/o2-continuous-assurance-progress-2026-08-11.jpg',
    mediaType: 'image/jpeg',
    byteLength: 88_081,
    sha256: 'a50486cbcdaa884a7fd4c33f3fa90eaaae1b88f2d8d81db1cc992f24b6be1c4b',
    decision: 'retain-reviewed-operational-evidence',
  },
  {
    path: 'docs/evidence/o2-continuous-assurance-status-2026-08-11.jpg',
    mediaType: 'image/jpeg',
    byteLength: 83_617,
    sha256: '4973cda46645127c1fc9ef35858c2903ca833ec0e52eee3a4e5390f329330902',
    decision: 'retain-reviewed-operational-evidence',
  },
] as const;

type ReviewEntry = typeof expectedBinaries[number];
type ReviewRegistry = {
  schemaVersion: '1.0.0';
  artifactId: 'agentic-feature-kit-public-binary-review';
  reviewedBinaries: ReviewEntry[];
};
type ArchiveReceipt = {
  schemaVersion: '1.0.0';
  artifactId: 'agentic-feature-kit-private-binary-archive-receipt';
  archiveId: 'p17-018-r5b-private-binary-archive-2026-08-18';
  format: 'zip';
  sourceCommit: string;
  artifactCount: number;
  totalSourceBytes: number;
  archiveSha256: string;
  privateManifestSha256: string;
  status: 'verified-private';
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactObject(value: unknown, keys: string[], label: string): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} object`);
  const object = value as Record<string, unknown>;
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), `${label} exact keys`);
  return object;
}

function parseReviewRegistry(text: string): ReviewRegistry {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('binary review registry must be valid JSON'); }
  const object = exactObject(parsed, ['schemaVersion', 'artifactId', 'reviewedBinaries'], 'binary review registry');
  assert.equal(object.schemaVersion, '1.0.0');
  assert.equal(object.artifactId, 'agentic-feature-kit-public-binary-review');
  assert.ok(Array.isArray(object.reviewedBinaries), 'reviewedBinaries array');
  assert.equal(object.reviewedBinaries.length, expectedBinaries.length, 'exact reviewed binary count');
  const normalized = (object.reviewedBinaries as unknown[]).map((value, index) => {
    const entry = exactObject(value, ['path', 'mediaType', 'byteLength', 'sha256', 'decision'], `review entry ${index}`);
    assert.match(String(entry.path), /^docs\/evidence\/[a-z0-9][a-z0-9.-]*\.jpg$/);
    assert.equal(entry.path, path.posix.normalize(String(entry.path)));
    assert.equal(entry.mediaType, 'image/jpeg');
    assert.ok(Number.isSafeInteger(entry.byteLength) && Number(entry.byteLength) > 0 && Number(entry.byteLength) <= maxBinaryBytes);
    assert.match(String(entry.sha256), /^[0-9a-f]{64}$/);
    assert.equal(entry.decision, 'retain-reviewed-operational-evidence');
    return entry;
  });
  assert.deepEqual(normalized, expectedBinaries, 'registry must equal exact reviewed rows and ordinal paths');
  return object as ReviewRegistry;
}

function parseArchiveReceipt(text: string): ArchiveReceipt {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('binary archive receipt must be valid JSON'); }
  const object = exactObject(parsed, [
    'schemaVersion', 'artifactId', 'archiveId', 'format', 'sourceCommit', 'artifactCount',
    'totalSourceBytes', 'archiveSha256', 'privateManifestSha256', 'status',
  ], 'binary archive receipt');
  assert.equal(object.schemaVersion, '1.0.0');
  assert.equal(object.artifactId, 'agentic-feature-kit-private-binary-archive-receipt');
  assert.equal(object.archiveId, 'p17-018-r5b-private-binary-archive-2026-08-18');
  assert.equal(object.format, 'zip');
  assert.equal(object.sourceCommit, expectedSourceCommit);
  assert.equal(object.artifactCount, expectedPrivateImageCount);
  assert.equal(object.totalSourceBytes, expectedPrivateImageBytes);
  assert.match(String(object.archiveSha256), /^[0-9a-f]{64}$/);
  assert.match(String(object.privateManifestSha256), /^[0-9a-f]{64}$/);
  assert.equal(object.status, 'verified-private');
  const serialized = JSON.stringify(object);
  assert.doesNotMatch(serialized, /paths?|files?|items?|perFile|absolute|hostname|user|person|token|projectRef|content/i);
  return object as ArchiveReceipt;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertDimensions(width: number, height: number): void {
  assert.ok(width > 0 && height > 0, 'image dimensions must be positive');
  assert.ok(width <= maxDimension && height <= maxDimension, 'image dimension limit');
  assert.ok(width * height <= maxPixels, 'image pixel limit');
}

function inspectPng(bytes: Buffer): { width: number; height: number } {
  assert.ok(bytes.length <= maxBinaryBytes, 'PNG byte limit');
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature');
  let offset = 8;
  let seenHeader = false;
  let seenData = false;
  let seenEnd = false;
  let width = 0;
  let height = 0;
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, 'PNG truncated chunk');
    const length = bytes.readUInt32BE(offset);
    assert.ok(length <= maxBinaryBytes && offset + 12 + length <= bytes.length, 'PNG chunk length');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.ok(['IHDR', 'IDAT', 'IEND'].includes(type), `PNG unsafe or unknown chunk: ${type}`);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.equal(bytes.readUInt32BE(dataEnd), crc32(bytes.subarray(offset + 4, dataEnd)), `PNG CRC: ${type}`);
    if (type === 'IHDR') {
      assert.equal(seenHeader, false, 'duplicate PNG IHDR');
      assert.equal(offset, 8, 'PNG IHDR first');
      assert.equal(length, 13, 'PNG IHDR length');
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      assertDimensions(width, height);
      seenHeader = true;
    } else if (type === 'IDAT') {
      assert.ok(seenHeader && !seenEnd, 'PNG IDAT order');
      seenData = true;
    } else {
      assert.ok(seenHeader && seenData && !seenEnd, 'PNG IEND order');
      assert.equal(length, 0, 'PNG IEND length');
      seenEnd = true;
    }
    offset += 12 + length;
    if (seenEnd) break;
  }
  assert.ok(seenHeader && seenData && seenEnd, 'PNG required chunks');
  assert.equal(offset, bytes.length, 'PNG trailing bytes');
  return { width, height };
}

function inspectJpeg(bytes: Buffer): { width: number; height: number } {
  assert.ok(bytes.length <= maxBinaryBytes, 'JPEG byte limit');
  assert.ok(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8, 'JPEG SOI');
  let offset = 2;
  let seenJfif = false;
  let seenFrame = false;
  let seenScan = false;
  let width = 0;
  let height = 0;
  while (offset < bytes.length) {
    assert.equal(bytes[offset], 0xff, 'JPEG marker prefix');
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    assert.ok(offset < bytes.length, 'JPEG truncated marker');
    const marker = bytes[offset++];
    assert.notEqual(marker, 0x00, 'JPEG stuffed byte outside scan');
    if (marker === 0xd9) {
      assert.ok(seenFrame && seenScan, 'JPEG frame and scan required');
      assert.equal(offset, bytes.length, 'JPEG trailing bytes');
      return { width, height };
    }
    assert.ok(!seenScan, 'JPEG segment after scan');
    assert.ok(offset + 2 <= bytes.length, 'JPEG truncated segment length');
    const length = bytes.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= bytes.length, 'JPEG segment length');
    const dataStart = offset + 2;
    const dataEnd = offset + length;
    if (marker === 0xe0) {
      assert.equal(seenJfif, false, 'duplicate JPEG APP0');
      assert.ok(bytes.subarray(dataStart, dataStart + 5).equals(Buffer.from('JFIF\0', 'ascii')), 'JPEG APP0 must be JFIF');
      seenJfif = true;
    } else if (marker === 0xc0) {
      assert.equal(seenFrame, false, 'duplicate JPEG SOF0');
      assert.ok(length >= 11, 'JPEG SOF0 length');
      assert.equal(bytes[dataStart], 8, 'JPEG precision');
      height = bytes.readUInt16BE(dataStart + 1);
      width = bytes.readUInt16BE(dataStart + 3);
      assertDimensions(width, height);
      seenFrame = true;
    } else if (marker === 0xda) {
      assert.ok(seenJfif && seenFrame, 'JPEG SOS order');
      seenScan = true;
      offset = dataEnd;
      while (offset < bytes.length - 1) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const next = bytes[offset + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        if (next === 0xd9) { offset += 2; assert.equal(offset, bytes.length, 'JPEG trailing bytes'); return { width, height }; }
        throw new Error(`JPEG unsafe marker in scan: ff${next.toString(16)}`);
      }
      throw new Error('JPEG missing EOI');
    } else {
      assert.ok([0xdb, 0xc4].includes(marker), `JPEG unsafe or unknown segment: ff${marker.toString(16)}`);
    }
    offset = dataEnd;
  }
  throw new Error('JPEG missing EOI');
}

function pngChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([header, data, checksum]);
}

function validPng(width = 1, height = 1): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function jpegSegment(marker: number, data: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, data.length + 2]);
  return Buffer.concat([header, data]);
}

function validJpeg(width = 1, height = 1): Buffer {
  const sof = Buffer.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.concat([Buffer.from('JFIF\0', 'ascii'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])])),
    jpegSegment(0xdb, Buffer.alloc(65, 1)),
    jpegSegment(0xc0, sof),
    jpegSegment(0xc4, Buffer.from([0, 0])),
    jpegSegment(0xda, Buffer.from([3, 1, 0, 2, 0, 3, 0, 0, 63, 0])),
    Buffer.from([1, 2, 0xff, 0x00, 3, 0xff, 0xd9]),
  ]);
}

let attacks = 0;
function attack(name: string, body: () => void, expected: RegExp): void {
  assert.throws(body, expected, name);
  console.log(`PASS attack: ${name}`);
  attacks += 1;
}

const validRegistry: ReviewRegistry = {
  schemaVersion: '1.0.0',
  artifactId: 'agentic-feature-kit-public-binary-review',
  reviewedBinaries: expectedBinaries.map((entry) => ({ ...entry })),
};
const validReceipt: ArchiveReceipt = {
  schemaVersion: '1.0.0',
  artifactId: 'agentic-feature-kit-private-binary-archive-receipt',
  archiveId: 'p17-018-r5b-private-binary-archive-2026-08-18',
  format: 'zip',
  sourceCommit: expectedSourceCommit,
  artifactCount: expectedPrivateImageCount,
  totalSourceBytes: expectedPrivateImageBytes,
  archiveSha256: 'a'.repeat(64),
  privateManifestSha256: 'b'.repeat(64),
  status: 'verified-private',
};

assert.deepEqual(parseReviewRegistry(`${JSON.stringify(validRegistry)}\n`).reviewedBinaries, validRegistry.reviewedBinaries);
assert.equal(parseArchiveReceipt(`${JSON.stringify(validReceipt)}\n`).archiveId, validReceipt.archiveId);
assert.deepEqual(inspectPng(validPng()), { width: 1, height: 1 });
assert.deepEqual(inspectJpeg(validJpeg()), { width: 1, height: 1 });
console.log('PASS canonical registry, receipt, PNG, and JPEG fixtures');

attack('registry invalid JSON', () => parseReviewRegistry('{'), /valid JSON/);
attack('registry extra root field', () => parseReviewRegistry(JSON.stringify({ ...validRegistry, paths: [] })), /exact keys/);
attack('registry duplicate path', () => parseReviewRegistry(JSON.stringify({ ...validRegistry, reviewedBinaries: [validRegistry.reviewedBinaries[0], validRegistry.reviewedBinaries[0], validRegistry.reviewedBinaries[2]] })), /exact reviewed rows/);
attack('registry traversal', () => parseReviewRegistry(JSON.stringify({ ...validRegistry, reviewedBinaries: [{ ...validRegistry.reviewedBinaries[0], path: '../escape.jpg' }, ...validRegistry.reviewedBinaries.slice(1)] })), /did not match/);
attack('registry media drift', () => parseReviewRegistry(JSON.stringify({ ...validRegistry, reviewedBinaries: [{ ...validRegistry.reviewedBinaries[0], mediaType: 'image/png' }, ...validRegistry.reviewedBinaries.slice(1)] })), /strictly equal/);
attack('registry digest drift', () => parseReviewRegistry(JSON.stringify({ ...validRegistry, reviewedBinaries: [{ ...validRegistry.reviewedBinaries[0], sha256: '0'.repeat(64) }, ...validRegistry.reviewedBinaries.slice(1)] })), /exact reviewed rows/);
attack('receipt extra private paths', () => parseArchiveReceipt(JSON.stringify({ ...validReceipt, paths: ['private.png'] })), /exact keys/);
attack('receipt wrong source', () => parseArchiveReceipt(JSON.stringify({ ...validReceipt, sourceCommit: '0'.repeat(40) })), /strictly equal/);
attack('receipt wrong count', () => parseArchiveReceipt(JSON.stringify({ ...validReceipt, artifactCount: 18 })), /strictly equal/);
attack('receipt wrong bytes', () => parseArchiveReceipt(JSON.stringify({ ...validReceipt, totalSourceBytes: 1 })), /strictly equal/);
attack('receipt digest malformed', () => parseArchiveReceipt(JSON.stringify({ ...validReceipt, archiveSha256: 'abc' })), /did not match/);
attack('PNG bad signature', () => inspectPng(Buffer.from('not png')), /signature/);
attack('PNG CRC drift', () => { const value = validPng(); value[value.length - 1] ^= 1; inspectPng(value); }, /CRC/);
attack('PNG unsafe metadata', () => { const value = validPng(); inspectPng(Buffer.concat([value.subarray(0, value.length - 12), pngChunk('tEXt', Buffer.from('secret')), value.subarray(value.length - 12)])); }, /unsafe or unknown/);
attack('PNG trailing bytes', () => inspectPng(Buffer.concat([validPng(), Buffer.from([0])])), /trailing/);
attack('PNG excessive dimensions', () => inspectPng(validPng(maxDimension + 1, 1)), /dimension/);
attack('JPEG bad signature', () => inspectJpeg(Buffer.from([0xff, 0x00, 0xff, 0xd9])), /SOI/);
attack('JPEG EXIF metadata', () => { const value = validJpeg(); inspectJpeg(Buffer.concat([value.subarray(0, 2), jpegSegment(0xe1, Buffer.from('Exif\0\0')), value.subarray(2)])); }, /unsafe or unknown/);
attack('JPEG comment metadata', () => { const value = validJpeg(); inspectJpeg(Buffer.concat([value.subarray(0, 2), jpegSegment(0xfe, Buffer.from('comment')), value.subarray(2)])); }, /unsafe or unknown/);
attack('JPEG trailing bytes', () => inspectJpeg(Buffer.concat([validJpeg(), Buffer.from([0])])), /trailing/);
attack('JPEG excessive dimensions', () => inspectJpeg(validJpeg(maxDimension + 1, 1)), /dimension/);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
function trackedPaths(): Set<string> {
  const buffer = execFileSync('git', ['-C', root, 'ls-files', '-z']);
  return new Set(buffer.toString('utf8').split('\0').filter(Boolean));
}

const currentGaps: string[] = [];
function current(name: string, body: () => void): void {
  try { body(); } catch { currentGaps.push(name); }
}

current('metadata-only private binary archive receipt', () => parseArchiveReceipt(read(receiptPath)));
current('exact retained binary review registry', () => parseReviewRegistry(read(registryPath)));
current('private image tree absent from tracked HEAD', () => {
  const remaining = [...trackedPaths()].filter((entry) => entry.startsWith(privateImagePrefix));
  assert.deepEqual(remaining, []);
});
current('public manifest binary authority', () => {
  const manifest = JSON.parse(read('release/public-release-manifest.json')) as { entries: Array<{ path: string; decision: string; contentKind: string }> };
  const binaries = manifest.entries.filter((entry) => entry.decision === 'include' && entry.contentKind === 'binary');
  assert.deepEqual(binaries.map((entry) => entry.path), expectedBinaries.map((entry) => entry.path));
  assert.equal(manifest.entries.some((entry) => entry.path.startsWith(privateImagePrefix)), false);
  for (const required of [registryPath, receiptPath, 'docs/roadmap/p17-018-r5b-binary-privacy-plan.md', 'scripts/post-17-public-release-r5b-plan.test.ts', 'scripts/public-binary-review-contract.test.ts']) {
    assert.ok(manifest.entries.some((entry) => entry.path === required && entry.decision === 'include'));
  }
});
current('retained JPEG bytes and container structure', () => {
  for (const expected of expectedBinaries) {
    const bytes = fs.readFileSync(path.join(root, expected.path));
    assert.equal(bytes.length, expected.byteLength);
    assert.equal(sha256(bytes), expected.sha256);
    inspectJpeg(bytes);
  }
});
current('credential-safe Figma fixture', () => {
  const fixture = read('.claude/integrations/figma-rest-source.fixture.json');
  assert.match(fixture, /https:\/\/example\.invalid\/design\/thumbnail\.jpg/);
  assert.doesNotMatch(fixture, new RegExp(['X', 'Amz'].join('-'), 'i'));
  assert.doesNotMatch(fixture, /AKIA[0-9A-Z]{16}/);
  assert.doesNotMatch(fixture, /s3-alpha\.figma\.com/i);
});
current('privacy attack uses reconstructed private-key marker', () => {
  const source = read('packages/core/test/privacy-policy.test.ts');
  const marker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  assert.equal(source.includes(marker), false);
  assert.match(source, /\['-----BEGIN ', 'PRIVATE KEY-----'\]\.join\(''\)/);
});
current('package registers both R5B gates', () => {
  const packageJson = read('package.json');
  assert.match(packageJson, /test:post-17-public-release-r5b-plan/);
  assert.match(packageJson, /test:public-binary-review-contract/);
});

assert.deepEqual(currentGaps, [], `R5B binary current-tree gaps: ${currentGaps.join(', ')}`);
console.log(`public-binary-review-contract.test: PASS (${attacks} attacks, 7 current surfaces)`);
