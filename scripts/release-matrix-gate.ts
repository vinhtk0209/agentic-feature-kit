#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { validateCrossPlatformResult, type QualifiedPlatform } from './cross-platform-smoke';

export const RELEASE_MATRIX_SENTINEL = '@@RELEASE_MATRIX@@';

export function verifyReleaseMatrix(directory: string, matrixResult: unknown): Readonly<{
  status: 'pass' | 'fail';
  matrixResult: string;
  platforms: QualifiedPlatform[];
  reasons: string[];
}> {
  const reasons: string[] = [];
  if (matrixResult !== 'success') reasons.push(`matrix result is ${String(matrixResult)}`);
  try {
    const actual = fs.readdirSync(directory)
      .filter((entry) => entry.toLowerCase().endsWith('.json'))
      .sort();
    const expected = ['linux.json', 'windows.json'];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      reasons.push(`qualification files must be exactly ${expected.join(', ')}`);
    }
  } catch {
    reasons.push('qualification directory is missing or unreadable');
  }
  const platforms: QualifiedPlatform[] = [];
  for (const platform of ['linux', 'windows'] as const) {
    const target = path.join(directory, `${platform}.json`);
    try {
      const result = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (!validateCrossPlatformResult(result) || result.platform !== platform || result.status !== 'pass') {
        reasons.push(`${platform} qualification is invalid or failed`);
      } else platforms.push(platform);
    } catch {
      reasons.push(`${platform} qualification is missing or unreadable`);
    }
  }
  reasons.sort();
  return {
    status: reasons.length === 0 && platforms.length === 2 ? 'pass' : 'fail',
    matrixResult: typeof matrixResult === 'string' ? matrixResult : 'unknown',
    platforms,
    reasons,
  };
}

const launcher = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (require.main === module && /release-matrix-gate\.(?:ts|js|cjs|mjs)$/.test(launcher)) {
  if (process.argv.length !== 3) {
    process.stderr.write('usage: release-matrix-gate.ts <qualification-directory>\n');
    process.exitCode = 2;
  } else {
    const result = verifyReleaseMatrix(path.resolve(process.argv[2]), process.env.MATRIX_RESULT);
    process.stdout.write(`${RELEASE_MATRIX_SENTINEL}${JSON.stringify(result)}\n`);
    process.exitCode = result.status === 'pass' ? 0 : 1;
  }
}
