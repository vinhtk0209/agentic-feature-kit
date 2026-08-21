#!/usr/bin/env tsx
/**
 * spec-intake.ts — deterministic CLI gateway for the canonical Spec-IR adapters.
 *
 * This is the executable boundary used by workflow prompts: a source file is read as
 * inert data and exactly one typed adapter emits validated SpecIR JSON on stdout.
 * No document content is executed or interpreted as instructions here.
 *
 * Usage: npx tsx .claude/integrations/spec-intake.ts <spec-path> [--kind raw-us|word|pdf|excel]
 */

import * as fs from 'fs';
import * as path from 'path';
import { SpecAdapterError, SpecIR, validateSpecIR } from './spec-ir';
import { adaptRawUs } from './spec-intake-raw-us';
import { adaptWord } from './spec-intake-docx';
import { adaptPdf } from './spec-intake-pdf';
import { adaptExcel } from './spec-intake-xlsx';

export type IntakeKind = 'raw-us' | 'word' | 'pdf' | 'excel';

export class UnsupportedSpecInputError extends Error {
  constructor(public readonly sourceRef: string) {
    super(`spec-intake: unsupported source "${sourceRef}"; expected .md/.txt, .docx, .pdf, or .xlsx`);
    this.name = 'UnsupportedSpecInputError';
  }
}

export class SpecInputReadError extends Error {
  constructor(public readonly sourceRef: string, cause: unknown) {
    super(`spec-intake: cannot read "${sourceRef}": ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'SpecInputReadError';
  }
}

export function detectIntakeKind(sourceRef: string): IntakeKind {
  const extension = path.extname(sourceRef).toLowerCase();
  if (extension === '.md' || extension === '.txt') return 'raw-us';
  if (extension === '.docx') return 'word';
  if (extension === '.pdf') return 'pdf';
  if (extension === '.xlsx') return 'excel';
  throw new UnsupportedSpecInputError(sourceRef);
}

export function intakeSpecFile(sourceRef: string, requestedKind?: IntakeKind): SpecIR {
  const kind = requestedKind ?? detectIntakeKind(sourceRef);
  let raw: Buffer;
  try {
    raw = fs.readFileSync(sourceRef);
  } catch (error) {
    throw new SpecInputReadError(sourceRef, error);
  }

  const pendingRef = `local:${kind}:pending`;
  const candidate = (() => {
    switch (kind) {
      case 'raw-us': return adaptRawUs(raw.toString('utf8'), pendingRef);
      case 'word': return adaptWord(raw, pendingRef);
      case 'pdf': return adaptPdf(raw, pendingRef);
      case 'excel': return adaptExcel(raw, pendingRef);
    }
  })();
  return validateSpecIR({
    ...candidate,
    sourceRef: `local:${kind}:${candidate.sourceSha256}`,
  });
}

function usage(): string {
  return 'usage: spec-intake.ts <spec-path> [--kind raw-us|word|pdf|excel]';
}

function isCli(): boolean {
  return require.main === module;
}

if (isCli()) {
  const args = process.argv.slice(2);
  const sourceRef = args.find((arg) => !arg.startsWith('--'));
  const kindIndex = args.indexOf('--kind');
  const requestedKind = kindIndex >= 0 ? args[kindIndex + 1] as IntakeKind | undefined : undefined;
  if (!sourceRef || (kindIndex >= 0 && !requestedKind) || args.some((arg, index) => arg.startsWith('--') && !(arg === '--kind' && index === kindIndex))) {
    console.error(JSON.stringify({ name: 'SpecIntakeUsageError', error: usage() }));
    process.exit(1);
  }
  if (requestedKind && !['raw-us', 'word', 'pdf', 'excel'].includes(requestedKind)) {
    console.error(JSON.stringify({ name: 'SpecIntakeUsageError', error: `${usage()}; unsupported --kind "${requestedKind}"` }));
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(intakeSpecFile(sourceRef, requestedKind), null, 2));
  } catch (error) {
    const typed = error instanceof Error ? error : new Error(String(error));
    const name = error instanceof SpecAdapterError || error instanceof UnsupportedSpecInputError || error instanceof SpecInputReadError
      ? typed.name : 'SpecIntakeError';
    console.error(JSON.stringify({ name, error: typed.message }));
    process.exit(1);
  }
}
