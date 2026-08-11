#!/usr/bin/env tsx
/** Provider-neutral Confluence B0 intake using the canonical O2 actor and refetch contract. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSpecRefetchEnvelope } from './spec-refetch-contract';
import {
  parseConfluencePageIdentity,
  runConfluenceRefetchActor,
} from './confluence-refetch-actor';
import { stageConfluenceB0Source } from './spec-intake-confluence';

type Env = Record<string, string | undefined>;

export const B0_CONFLUENCE_INTAKE_SENTINEL = '@@B0_CONFLUENCE_INTAKE@@';

export interface B0ConfluenceIntakeResult {
  v: 1;
  sourceRef: string;
  sourceSha256: string;
  sourceBytes: number;
  paragraphs: number;
  acceptanceCriteria: number;
  stagedSourcePath: string;
  stagedIrPath: string;
}

export function stageConfluenceB0FromActorOutput(input: {
  rawUrl: string;
  actorOutput: string;
  stagingDir: string;
}): B0ConfluenceIntakeResult {
  const identity = parseConfluencePageIdentity(input.rawUrl);
  const envelope = parseSpecRefetchEnvelope(input.actorOutput, identity.sourceRef);
  const stagingDir = path.resolve(input.stagingDir);
  fs.mkdirSync(stagingDir, { recursive: true });
  const candidateDir = fs.mkdtempSync(path.join(stagingDir, '.confluence-b0-candidate-'));
  try {
    const staged = stageConfluenceB0Source(envelope.sourceText, candidateDir);
    if (staged.sourceSha256 !== envelope.sourceSha256) {
      throw new Error('confluence-b0-intake: staged source hash does not match the parsed refetch envelope');
    }
    const stagedSourcePath = path.join(stagingDir, '.incoming-spec.md');
    const stagedIrPath = path.join(stagingDir, '.incoming-spec.ir.json');
    const encodedIr = `${JSON.stringify(staged.ir, null, 2)}\n`;

    // Both final writes occur only after the actor envelope and canonical Spec-IR have validated.
    fs.copyFileSync(staged.stagedPath, stagedSourcePath);
    fs.writeFileSync(stagedIrPath, encodedIr, 'utf8');

    return {
      v: 1,
      sourceRef: envelope.sourceRef,
      sourceSha256: envelope.sourceSha256,
      sourceBytes: staged.legacyB0Bytes,
      paragraphs: staged.ir.paragraphs.length,
      acceptanceCriteria: staged.ir.acceptanceCriteria.length,
      stagedSourcePath,
      stagedIrPath,
    };
  } finally {
    fs.rmSync(candidateDir, { recursive: true, force: true });
  }
}

export async function runConfluenceB0Intake(input: {
  rawUrl: string;
  stagingDir: string;
  env: Env;
  runActor?: (input: { env: Env }) => Promise<string>;
}): Promise<string> {
  const identity = parseConfluencePageIdentity(input.rawUrl);
  const runActor = input.runActor ?? runConfluenceRefetchActor;
  const actorOutput = await runActor({
    env: { ...input.env, O2_CONFLUENCE_URL: identity.url },
  });
  const result = stageConfluenceB0FromActorOutput({
    rawUrl: identity.url,
    actorOutput,
    stagingDir: input.stagingDir,
  });
  return `${B0_CONFLUENCE_INTAKE_SENTINEL} ${JSON.stringify(result)}`;
}

function parseCliArgs(argv: string[]): { rawUrl: string; stagingDir: string } {
  const rawUrl = argv[0];
  const stagingIndex = argv.indexOf('--staging-dir');
  const stagingDir = stagingIndex >= 0 ? argv[stagingIndex + 1] : 'docs/specs';
  const allowedLength = stagingIndex >= 0 ? 3 : 1;
  if (!rawUrl || !stagingDir || argv.length !== allowedLength || (stagingIndex >= 0 && stagingIndex !== 1)) {
    throw new Error('usage: confluence-b0-intake.ts <confluence-url> [--staging-dir <directory>]');
  }
  return { rawUrl, stagingDir };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(token|pass(?:word)?|authorization)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 500);
}

if (require.main === module) {
  let args: { rawUrl: string; stagingDir: string };
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`confluence-b0-intake: ${safeError(error)}`);
    process.exit(1);
  }
  runConfluenceB0Intake({ ...args, env: process.env })
    .then((line) => { process.stdout.write(`${line}\n`); })
    .catch((error) => {
      console.error(`confluence-b0-intake: ${safeError(error)}`);
      process.exitCode = 1;
    });
}
