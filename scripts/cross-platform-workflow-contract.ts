export interface WorkflowContractResult {
  passed: boolean;
  reasons: string[];
}

function count(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

export function validateCrossPlatformWorkflow(source: string): WorkflowContractResult {
  const reasons: string[] = [];
  const requireText = (needle: string, reason: string) => {
    if (!source.includes(needle)) reasons.push(reason);
  };

  requireText('permissions:\n  contents: read', 'workflow permissions must be read-only');
  requireText('runs-on: ${{ matrix.os }}', 'kit verification must run on the matrix OS');
  requireText('fail-fast: false', 'matrix fail-fast must be disabled');
  requireText('node-version: \'24\'', 'qualification must use Node 24');
  requireText('run: npm ci\n', 'matrix must install from the lockfile');
  requireText('working-directory: .claude/mcp-server\n        run: npm ci --ignore-scripts', 'matrix must install Confluence MCP dependencies from the nested lockfile');
  requireText('QUALIFICATION_PLATFORM: ${{ matrix.platform }}', 'matrix must bind the expected platform without shell argv interpolation');
  requireText('QUALIFICATION_OUT: artifacts/cross-platform/${{ matrix.platform }}.json', 'matrix must bind the qualification artifact path');
  requireText('run: npm run test:cross-platform', 'matrix must run the platform smoke');
  requireText('run: npm run test:kit', 'matrix must run the full kit suite');
  requireText('uses: actions/upload-artifact@v4', 'matrix must upload qualification evidence');
  requireText('if-no-files-found: error', 'missing qualification evidence must fail closed');
  requireText('release-gate:', 'workflow must define a release gate');
  requireText('if: always()', 'release gate must run after success or failure');
  requireText('needs: [kit-verify]', 'release gate must depend on the complete matrix');
  requireText('MATRIX_RESULT: ${{ needs.kit-verify.result }}', 'release gate must consume the aggregate matrix result');
  requireText('uses: actions/download-artifact@v4', 'release gate must download qualification evidence');
  requireText('continue-on-error: true', 'missing artifact download must defer to the fail-closed gate');
  requireText('merge-multiple: true', 'platform artifacts must be merged for validation');
  requireText('run: npm run release:matrix-gate -- artifacts/cross-platform', 'release gate must validate both platform artifacts');

  if (count(source, /^\s*- platform: linux\s*$/gm) !== 1 || count(source, /^\s*os: ubuntu-latest\s*$/gm) < 1) {
    reasons.push('matrix must contain exactly one Linux qualification leg');
  }
  if (count(source, /^\s*- platform: windows\s*$/gm) !== 1 || count(source, /^\s*os: windows-latest\s*$/gm) !== 1) {
    reasons.push('matrix must contain exactly one Windows qualification leg');
  }
  if (/^\s*(?:- platform:\s*macos|os:\s*macos-)/m.test(source)) {
    reasons.push('macOS is not an asserted release platform');
  }

  const installAt = source.indexOf('run: npm ci\n');
  const nestedInstallAt = source.indexOf('working-directory: .claude/mcp-server\n        run: npm ci --ignore-scripts');
  const smokeAt = source.indexOf('run: npm run test:cross-platform');
  const fullAt = source.indexOf('run: npm run test:kit');
  if (!(installAt >= 0 && installAt < nestedInstallAt && nestedInstallAt < smokeAt && smokeAt < fullAt)) {
    reasons.push('matrix steps must run root install, nested MCP install, platform smoke, then full kit suite');
  }

  return { passed: reasons.length === 0, reasons: reasons.sort() };
}
