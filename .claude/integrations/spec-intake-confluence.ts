/** Pure, provenance-preserving B0 staging for a fetched Confluence text response. */
import { createHash, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { adaptRawUs } from './spec-intake-raw-us';
import { SpecIR, validateSpecIR } from './spec-ir';

export class ConfluenceB0SourceError extends Error {
  constructor(message: string) {
    super(`confluence-b0-source: ${message}`);
    this.name = 'ConfluenceB0SourceError';
  }
}

export interface StagedConfluenceSpec {
  stagedPath: string;
  legacyB0Bytes: number;
  sourceSha256: string;
  ir: SpecIR;
}

/** The candidate path stages exactly the legacy B0 MCP response before raw-US adaptation. */
export function stageConfluenceB0Source(source: string, stagingDir: string): StagedConfluenceSpec {
  if (typeof source !== 'string' || source.length === 0) {
    throw new ConfluenceB0SourceError('MCP response must be non-empty text');
  }
  const legacyB0Input = Buffer.from(source, 'utf8');
  const stagedPath = path.join(stagingDir, '.incoming-spec.md');
  fs.writeFileSync(stagedPath, legacyB0Input);
  const staged = fs.readFileSync(stagedPath);
  if (staged.length !== legacyB0Input.length || !timingSafeEqual(staged, legacyB0Input)) {
    throw new ConfluenceB0SourceError('candidate staging is not byte-equivalent to the legacy B0 input');
  }
  const ir = adaptRawUs(staged.toString('utf8'), stagedPath);
  validateSpecIR(ir);
  const sourceSha256 = createHash('sha256').update(legacyB0Input).digest('hex');
  if (ir.sourceSha256 !== sourceSha256) {
    throw new ConfluenceB0SourceError('Spec-IR sourceSha256 does not identify the exact legacy B0 bytes');
  }
  return { stagedPath, legacyB0Bytes: legacyB0Input.length, sourceSha256, ir };
}
