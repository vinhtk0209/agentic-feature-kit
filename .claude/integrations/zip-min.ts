/**
 * zip-min.ts — minimal, dependency-free ZIP reader/writer for .docx/.xlsx adapters
 * (f3-spec-intake-ir, see docs/design/spec-intake-ir.md "Zero-new-dependency constraint").
 *
 * Word/Excel files are ZIP containers of XML parts. This avoids adding mammoth/xlsx/pdf-parse-class
 * dependencies to the kit's package.json (a repo-wide, sync-relevant decision out of scope for this
 * canary) by reading just enough of the ZIP central-directory format, using Node's built-in `zlib`
 * for DEFLATE. The writer exists only to build self-contained test fixtures (real .docx/.xlsx files
 * are never committed as binary blobs to this repo).
 */

import * as zlib from 'zlib';

const EOCD_SIG = 0x06054b50;
const CDFH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

export class ZipFormatError extends Error {
  constructor(reason: string) {
    super(`zip-format-fail-closed: ${reason}`);
    this.name = 'ZipFormatError';
  }
}

/** Read a ZIP archive into a Map of entry name -> decompressed content. Fail-closed on malformed input. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  if (buf.length < 22) throw new ZipFormatError(`too small to be a ZIP (${buf.length} bytes)`);

  // Locate End Of Central Directory record — search backward within the max comment window.
  const searchStart = Math.max(0, buf.length - 22 - 65535);
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= searchStart; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new ZipFormatError('no End-Of-Central-Directory record found (not a valid ZIP)');

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (cdOffset + cdSize > buf.length) throw new ZipFormatError('central directory extends past end of buffer (truncated file)');

  const entries = new Map<string, Buffer>();
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDFH_SIG) {
      throw new ZipFormatError(`central directory entry ${i} has a bad signature (corrupt/truncated)`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p = p + 46 + nameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== LFH_SIG) {
      throw new ZipFormatError(`local file header for "${name}" has a bad signature (corrupt/truncated)`);
    }
    const lfNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lfExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lfNameLen + lfExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) throw new ZipFormatError(`entry "${name}" data extends past end of buffer (truncated file)`);
    const raw = buf.subarray(dataStart, dataEnd);

    let content: Buffer;
    if (method === 0) {
      content = Buffer.from(raw);
    } else if (method === 8) {
      try {
        content = zlib.inflateRawSync(raw);
      } catch (e) {
        throw new ZipFormatError(`entry "${name}" failed DEFLATE decompression: ${(e as Error).message}`);
      }
    } else {
      throw new ZipFormatError(`entry "${name}" uses unsupported compression method ${method}`);
    }
    if (content.length !== uncompSize) {
      throw new ZipFormatError(`entry "${name}" decompressed size mismatch (expected ${uncompSize}, got ${content.length})`);
    }
    entries.set(name, content);
  }
  return entries;
}

/** Build a ZIP archive from {name, content} entries, DEFLATE-compressed. Test-fixture use only. */
export function writeZip(files: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const compressed = zlib.deflateRawSync(f.content);
    const crc = crc32(f.content);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(LFH_SIG, 0);
    lfh.writeUInt16LE(20, 4);        // version needed
    lfh.writeUInt16LE(0, 6);         // flags
    lfh.writeUInt16LE(8, 8);         // method = deflate
    lfh.writeUInt16LE(0, 10);        // mod time
    lfh.writeUInt16LE(0, 12);        // mod date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(f.content.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);        // extra length

    localParts.push(lfh, nameBuf, compressed);

    const cdfh = Buffer.alloc(46);
    cdfh.writeUInt32LE(CDFH_SIG, 0);
    cdfh.writeUInt16LE(20, 4);       // version made by
    cdfh.writeUInt16LE(20, 6);       // version needed
    cdfh.writeUInt16LE(0, 8);        // flags
    cdfh.writeUInt16LE(8, 10);       // method
    cdfh.writeUInt16LE(0, 12);
    cdfh.writeUInt16LE(0, 14);
    cdfh.writeUInt32LE(crc, 16);
    cdfh.writeUInt32LE(compressed.length, 20);
    cdfh.writeUInt32LE(f.content.length, 24);
    cdfh.writeUInt16LE(nameBuf.length, 28);
    cdfh.writeUInt16LE(0, 30);       // extra length
    cdfh.writeUInt16LE(0, 32);       // comment length
    cdfh.writeUInt16LE(0, 34);       // disk number start
    cdfh.writeUInt16LE(0, 36);       // internal attrs
    cdfh.writeUInt32LE(0, 38);       // external attrs
    cdfh.writeUInt32LE(offset, 42);  // local header offset

    centralParts.push(cdfh, nameBuf);
    offset += lfh.length + nameBuf.length + compressed.length;
  }

  const centralDirStart = offset;
  const central = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralDirStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, eocd]);
}

// Standard CRC-32 (zip/png polynomial), table-based.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
