import * as fs from 'fs';
import * as path from 'path';

export const CLI_ERROR_SENTINEL = '@@CLI_ERROR@@';

export type CliErrorCode =
  | 'ARGUMENT_ERROR'
  | 'INPUT_NOT_FOUND'
  | 'INPUT_READ_FAILED'
  | 'MALFORMED_INPUT'
  | 'OUTPUT_WRITE_FAILED';

export class CliReliabilityError extends Error {
  constructor(readonly code: CliErrorCode, message: string) {
    super(message);
    this.name = 'CliReliabilityError';
  }
}

export type FlagKind = 'boolean' | 'value';

export function parseStrictFlags(
  args: readonly string[],
  specification: Readonly<Record<string, FlagKind>>,
): ReadonlyMap<string, string | true> {
  const parsed = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const kind = specification[flag];
    if (!kind) throw new CliReliabilityError('ARGUMENT_ERROR', `unknown argument: ${flag}`);
    if (parsed.has(flag)) throw new CliReliabilityError('ARGUMENT_ERROR', `duplicate argument: ${flag}`);
    if (kind === 'boolean') {
      parsed.set(flag, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new CliReliabilityError('ARGUMENT_ERROR', `missing value for ${flag}`);
    }
    parsed.set(flag, value);
    index += 1;
  }
  return parsed;
}

export function classifyFileReadError(error: unknown, target: string): CliReliabilityError {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  if (code === 'ENOENT') return new CliReliabilityError('INPUT_NOT_FOUND', `input file not found: ${target}`);
  return new CliReliabilityError('INPUT_READ_FAILED', `cannot read input file: ${target}`);
}

export function emitCliError(tool: string, error: unknown): 2 {
  const known = error instanceof CliReliabilityError
    ? error
    : new CliReliabilityError('MALFORMED_INPUT', error instanceof Error ? error.message : String(error));
  process.stderr.write(`${CLI_ERROR_SENTINEL}${JSON.stringify({
    schemaVersion: 1,
    tool,
    code: known.code,
    message: known.message,
  })}\n`);
  return 2;
}

export interface AtomicFileOps {
  existsSync(target: fs.PathLike): boolean;
  mkdirSync(target: fs.PathLike, options: { recursive: true }): string | undefined;
  writeFileSync(target: fs.PathOrFileDescriptor, data: string, options: { encoding: 'utf8'; flag: 'wx' }): void;
  renameSync(from: fs.PathLike, to: fs.PathLike): void;
  unlinkSync(target: fs.PathLike): void;
}

let atomicSequence = 0;

export function atomicWriteTextFile(target: string, content: string, ops: AtomicFileOps = fs): void {
  const resolved = path.resolve(target);
  const directory = path.dirname(resolved);
  const basename = path.basename(resolved);
  const nonce = `${process.pid}-${atomicSequence += 1}`;
  const staging = path.join(directory, `.${basename}.${nonce}.tmp`);
  const rollback = path.join(directory, `.${basename}.${nonce}.rollback`);
  let previousMoved = false;

  try {
    ops.mkdirSync(directory, { recursive: true });
    ops.writeFileSync(staging, content, { encoding: 'utf8', flag: 'wx' });
    if (ops.existsSync(resolved)) {
      ops.renameSync(resolved, rollback);
      previousMoved = true;
    }
    try {
      ops.renameSync(staging, resolved);
    } catch (error) {
      if (previousMoved && !ops.existsSync(resolved)) ops.renameSync(rollback, resolved);
      throw error;
    }
    if (previousMoved && ops.existsSync(rollback)) ops.unlinkSync(rollback);
  } catch (error) {
    if (ops.existsSync(staging)) ops.unlinkSync(staging);
    if (previousMoved && ops.existsSync(rollback) && !ops.existsSync(resolved)) {
      ops.renameSync(rollback, resolved);
    }
    throw new CliReliabilityError(
      'OUTPUT_WRITE_FAILED',
      `cannot atomically write output file: ${resolved}`,
    );
  }
}
