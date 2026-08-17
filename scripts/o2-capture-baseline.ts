#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildConfluenceRefetchEnvelope,
  fetchConfluencePageViaMcp,
  parseConfluencePageIdentity,
} from '../.claude/integrations/confluence-refetch-actor';
import { stageConfluenceB0Source } from '../.claude/integrations/spec-intake-confluence';
import { sha256, validateSpecIR, type SpecIR } from '../.claude/integrations/spec-ir';

const RESULT_SENTINEL = '@@O2_BASELINE_CAPTURE@@';

export class O2BaselineCaptureError extends Error {
  constructor(message: string) {
    super(`o2-baseline-capture: ${message}`);
    this.name = 'O2BaselineCaptureError';
  }
}

export interface O2BaselineCaptureInput {
  kitRoot: string;
  env: Record<string, string | undefined>;
  outputPath: string;
  expectedSourceRef: string;
  expectedSourceSha256: string;
  expectedAcCount: number;
  replaceExisting: boolean;
}

export interface O2BaselineCaptureResult {
  sourceRef: string;
  sourceSha256: string;
  acceptanceCriteria: number;
  paragraphs: number;
  outputPath: string;
  outputSha256: string;
  replacedExisting: boolean;
  previousOutputSha256: string | null;
}

function resolveOutput(kitRoot: string, candidate: string): string {
  if (!candidate || path.isAbsolute(candidate)) {
    throw new O2BaselineCaptureError('outputPath must be repo-relative');
  }
  const baselineRoot = path.resolve(kitRoot, '.claude', 'assurance', 'baselines');
  const output = path.resolve(kitRoot, candidate);
  const relative = path.relative(baselineRoot, output);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new O2BaselineCaptureError('outputPath must stay inside .claude/assurance/baselines');
  }
  if (!output.endsWith('.spec-ir.json')) {
    throw new O2BaselineCaptureError('outputPath must end in .spec-ir.json');
  }
  if (!fs.existsSync(path.dirname(output)) || !fs.statSync(path.dirname(output)).isDirectory()) {
    throw new O2BaselineCaptureError('baseline output directory does not exist');
  }
  const realBaselineRoot = fs.realpathSync.native(baselineRoot);
  const realParent = fs.realpathSync.native(path.dirname(output));
  const realCandidate = path.join(realParent, path.basename(output));
  const realRelative = path.relative(realBaselineRoot, realCandidate);
  if (realRelative === '' || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new O2BaselineCaptureError('outputPath resolves outside .claude/assurance/baselines');
  }
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new O2BaselineCaptureError('refusing to replace a symbolic-link baseline');
  }
  return output;
}

function replaceFileWithRollback(output: string, content: string, replaceExisting: boolean): {
  replacedExisting: boolean;
  previousOutputSha256: string | null;
} {
  const existed = fs.existsSync(output);
  if (existed && !replaceExisting) {
    throw new O2BaselineCaptureError('baseline already exists; --replace-existing is required');
  }
  const previous = existed ? fs.readFileSync(output) : null;
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
  const rollback = `${output}.rollback-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try {
    if (!existed) {
      fs.renameSync(temporary, output);
    } else {
      fs.renameSync(output, rollback);
      try {
        fs.renameSync(temporary, output);
        fs.unlinkSync(rollback);
      } catch (error) {
        if (fs.existsSync(output)) fs.unlinkSync(output);
        fs.renameSync(rollback, output);
        throw error;
      }
    }
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    if (fs.existsSync(rollback) && !fs.existsSync(output)) fs.renameSync(rollback, output);
  }
  return {
    replacedExisting: existed,
    previousOutputSha256: previous ? sha256(previous) : null,
  };
}

export async function captureO2Baseline(
  input: O2BaselineCaptureInput,
  fetchPage: (url: string, env: Record<string, string | undefined>) => Promise<string> = fetchConfluencePageViaMcp,
): Promise<O2BaselineCaptureResult> {
  const output = resolveOutput(input.kitRoot, input.outputPath);
  if (!/^confluence:\d+$/.test(input.expectedSourceRef)) {
    throw new O2BaselineCaptureError('expectedSourceRef must be confluence:<numeric-page-id>');
  }
  if (!/^[a-f0-9]{64}$/.test(input.expectedSourceSha256)) {
    throw new O2BaselineCaptureError('expectedSourceSha256 must be lowercase SHA-256');
  }
  if (!Number.isSafeInteger(input.expectedAcCount) || input.expectedAcCount <= 0) {
    throw new O2BaselineCaptureError('expectedAcCount must be a positive safe integer');
  }
  const rawUrl = input.env.O2_CONFLUENCE_URL?.trim();
  if (!rawUrl) throw new O2BaselineCaptureError('O2_CONFLUENCE_URL is required');
  const identity = parseConfluencePageIdentity(rawUrl);
  if (identity.sourceRef !== input.expectedSourceRef) {
    throw new O2BaselineCaptureError(`sourceRef mismatch: expected ${input.expectedSourceRef}, got ${identity.sourceRef}`);
  }

  const sourceText = await fetchPage(identity.url, input.env);
  const envelope = buildConfluenceRefetchEnvelope(identity.url, sourceText);
  if (envelope.sourceSha256 !== input.expectedSourceSha256) {
    throw new O2BaselineCaptureError(
      `source SHA-256 mismatch: expected ${input.expectedSourceSha256}, got ${envelope.sourceSha256}`,
    );
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'o2-baseline-capture-'));
  let baseline: SpecIR;
  try {
    const staged = stageConfluenceB0Source(sourceText, stagingDir);
    baseline = validateSpecIR({ ...staged.ir, sourceRef: identity.sourceRef });
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  if (baseline.acceptanceCriteria.length !== input.expectedAcCount) {
    throw new O2BaselineCaptureError(
      `AC count mismatch: expected ${input.expectedAcCount}, got ${baseline.acceptanceCriteria.length}`,
    );
  }

  const content = `${JSON.stringify(baseline, null, 2)}\n`;
  const write = replaceFileWithRollback(output, content, input.replaceExisting);
  return {
    sourceRef: identity.sourceRef,
    sourceSha256: envelope.sourceSha256,
    acceptanceCriteria: baseline.acceptanceCriteria.length,
    paragraphs: baseline.paragraphs.length,
    outputPath: path.relative(input.kitRoot, output).replace(/\\/g, '/'),
    outputSha256: sha256(content),
    ...write,
  };
}

function requiredArg(args: string[], name: string): string {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1 || indexes[0] === args.length - 1 || args[indexes[0] + 1].startsWith('--')) {
    throw new O2BaselineCaptureError(`${name} is required exactly once`);
  }
  return args[indexes[0] + 1];
}

function parseCli(args: string[]): Omit<O2BaselineCaptureInput, 'kitRoot' | 'env'> {
  const allowed = new Set([
    '--output', '--confirm-source-ref', '--confirm-source-sha256', '--expected-ac-count', '--replace-existing',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!allowed.has(arg)) throw new O2BaselineCaptureError(`unknown argument ${arg}`);
    if (arg !== '--replace-existing') index += 1;
  }
  const replaceCount = args.filter((arg) => arg === '--replace-existing').length;
  if (replaceCount !== 1) throw new O2BaselineCaptureError('--replace-existing is required exactly once');
  const expectedAcCount = Number(requiredArg(args, '--expected-ac-count'));
  return {
    outputPath: requiredArg(args, '--output'),
    expectedSourceRef: requiredArg(args, '--confirm-source-ref'),
    expectedSourceSha256: requiredArg(args, '--confirm-source-sha256'),
    expectedAcCount,
    replaceExisting: true,
  };
}

if (require.main === module) {
  captureO2Baseline({ kitRoot: process.cwd(), env: process.env, ...parseCli(process.argv.slice(2)) })
    .then((result) => process.stdout.write(`${RESULT_SENTINEL} ${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
