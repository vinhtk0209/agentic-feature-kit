#!/usr/bin/env tsx
/** Offline transcript for the flag-gated Design-to-UI invocation; it never contacts Figma. */
import { runD0 } from './design-intake';

export function dryRunDesignToUi(specPath: string | undefined, figma: string | undefined): { exitCode: 0 | 1; transcript: string[] } {
  const d0 = runD0({ specPath, figma });
  if (!d0.ok) return { exitCode: 1, transcript: [`[D0-intake] fail reason=${d0.reason}`, `detail=${d0.detail}`] };
  return {
    exitCode: 0,
    transcript: [
      `[D0-intake] ok figma_key=${d0.fileKey} spec_fields=${d0.spec.paragraphs.length}`,
      '[D0.5-ingest] dry-run cache-check=planned mcp_call=not-executed',
      '[D1] handoff=DesignModel.json+SpecIR only',
      '[D1.5-enrichment] checkpoint=required',
    ],
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  if (!args.includes('--dry-run')) {
    console.error('usage: design-to-ui-dry-run.ts --dry-run --spec <path> --figma <figma-ref>');
    process.exit(1);
  }
  const result = dryRunDesignToUi(value('--spec'), value('--figma'));
  console.log(result.transcript.join('\n'));
  process.exit(result.exitCode);
}
