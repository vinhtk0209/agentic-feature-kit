export const NIGHTLY_CRON = '17 3 * * *';

export const REVIEWED_ACTION_PINS = Object.freeze({
  'actions/checkout': { sha: '11d5960a326750d5838078e36cf38b85af677262', uses: 2 },
  'actions/setup-node': { sha: '49933ea5288caeca8642d1e84afbd3f7d6820020', uses: 2 },
  'actions/upload-artifact': { sha: 'ea165f8d65b6e75b540449e92b4886f43607fa02', uses: 1 },
  'actions/download-artifact': { sha: 'd3f86a106a0bac45b974a628896c90dbdf5c8093', uses: 1 },
} as const);

export interface NightlyWorkflowContractResult {
  passed: boolean;
  reasons: string[];
}

function count(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runBodies(source: string): string[] {
  const lines = source.split('\n');
  const bodies: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const tail = match[2].trim();
    if (tail !== '|' && tail !== '>') {
      bodies.push(tail);
      continue;
    }
    const block: string[] = [];
    for (index += 1; index < lines.length; index += 1) {
      const current = lines[index];
      if (current.trim() && current.search(/\S/) <= indent) {
        index -= 1;
        break;
      }
      block.push(current.trim());
    }
    bodies.push(block.join('\n'));
  }
  return bodies;
}

export function validateNightlyWorkflow(sourceText: string, readmeText: string): NightlyWorkflowContractResult {
  const source = sourceText.replace(/\r\n/g, '\n');
  const readme = readmeText.replace(/\r\n/g, '\n');
  const reasons: string[] = [];
  const exactHead = '${{ github.event.pull_request.head.sha || github.sha }}';

  if (count(source, new RegExp(`^\\s*- cron: '${escapeRegExp(NIGHTLY_CRON)}'\\s*$`, 'gm')) !== 1) {
    reasons.push('workflow must define exactly one reviewed nightly schedule');
  }
  if (count(source, /^\s{2}workflow_dispatch:\s*$/gm) !== 1) {
    reasons.push('workflow must define exactly one input-free manual dispatch');
  }
  if (!source.includes('  pull_request:\n') || !source.includes('  push:\n    branches: [develop, main]')) {
    reasons.push('existing pull-request and develop/main push triggers must remain');
  }
  if (count(source, /^permissions:\n  contents: read\s*$/gm) !== 1) {
    reasons.push('workflow must retain one top-level read-only contents permission');
  }
  if (/^\s*permissions:\s*(?:write-all|read-all)\s*$/m.test(source) || /^\s*[\w-]+:\s*write\s*$/m.test(source)) {
    reasons.push('workflow must not grant write permissions');
  }
  if (/\$\{\{\s*secrets\./i.test(source) || /^\s*[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE)[A-Z0-9_]*:\s*/m.test(source)) {
    reasons.push('workflow must not bind secrets or credential-shaped environment variables');
  }

  const uses = [...source.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
  const expectedUses: string[] = [];
  for (const [action, pin] of Object.entries(REVIEWED_ACTION_PINS)) {
    const exact = `${action}@${pin.sha}`;
    expectedUses.push(...Array(pin.uses).fill(exact));
    const actual = uses.filter((entry) => entry.startsWith(`${action}@`));
    if (actual.length !== pin.uses || actual.some((entry) => entry !== exact)) {
      reasons.push(`${action} must use the reviewed immutable SHA exactly ${pin.uses} time(s)`);
    }
  }
  if ([...uses].sort().join('\n') !== expectedUses.sort().join('\n')) {
    reasons.push('workflow action uses must match only the reviewed first-party allowlist');
  }
  if (count(source, new RegExp(`^\\s+ref: ${escapeRegExp(exactHead)}\\s*$`, 'gm')) !== 2) {
    reasons.push('both jobs must checkout the exact PR head or push SHA');
  }

  for (const required of [
    '- name: Run committed-clone release qualification',
    'CLEAN_CLONE_SOURCE: .',
    `CLEAN_CLONE_COMMIT: ${exactHead}`,
    'CLEAN_CLONE_PLATFORM: ${{ matrix.platform }}',
    'CLEAN_CLONE_OUT: artifacts/public-release/r5d/${{ matrix.platform }}.json',
    'run: npm run qualify:public-release-clean-clone',
    '            artifacts/public-release/r5d/${{ matrix.platform }}.json\n',
    '- name: Require clean-clone Linux/Windows parity',
    'run: npm run release:clean-clone-matrix-gate -- --dir artifacts/public-release/r5d',
  ]) if (!source.includes(required)) reasons.push(`missing R5D workflow contract: ${required}`);

  const commands = runBodies(source).join('\n');
  const forbiddenCommands: Array<[RegExp, string]> = [
    [/\bnpm\s+publish\b/i, 'npm publication'],
    [/\bnpm\s+run\s+sync(?::\w+)?\b/i, 'target sync'],
    [/\bgit\s+push\b/i, 'git push'],
    [/\bgh\s+(?:release|issue|pr\s+merge)\b/i, 'GitHub mutation'],
    [/\bsupabase\b/i, 'Supabase execution'],
    [/\b(?:codex|claude|copilot)\s+(?:exec|run|invoke|agent)\b/i, 'external provider execution'],
    [/\b(?:deploy|publish|release|tag)\s+(?:create|push|run)\b/i, 'deployment or release mutation'],
  ];
  for (const [pattern, label] of forbiddenCommands) {
    if (pattern.test(commands)) reasons.push(`workflow run steps must not perform ${label}`);
  }

  for (const required of [
    '- name: Publish qualification summary',
    'if: always()',
    'GITHUB_STEP_SUMMARY',
    '## Workflow Kit qualification',
    'Matrix result:',
    'Aggregate gate:',
    'Committed-clone matrix:',
    'Platforms: Linux and Windows',
    'Repository permissions: read-only',
  ]) if (!source.includes(required)) reasons.push(`missing stable job-summary contract: ${required}`);

  if (/github\.(?:head_ref|ref_name|event\.pull_request\.title|event\.head_commit\.message)|inputs\./.test(source)) {
    reasons.push('job summary must not interpolate untrusted branch, message, title, or dispatch input text');
  }

  const fullKitAt = source.indexOf('run: npm run test:kit');
  const cleanCloneAt = source.indexOf('- name: Run committed-clone release qualification');
  const uploadAt = source.indexOf('- name: Upload platform qualification');
  const legacyGateAt = source.indexOf('run: npm run release:matrix-gate -- artifacts/cross-platform');
  const cleanCloneGateAt = source.indexOf('run: npm run release:clean-clone-matrix-gate -- --dir artifacts/public-release/r5d');
  if (!(fullKitAt >= 0 && fullKitAt < cleanCloneAt && cleanCloneAt < uploadAt)) {
    reasons.push('R5D platform qualification must run after the complete kit and before artifact upload');
  }
  if (!(legacyGateAt >= 0 && legacyGateAt < cleanCloneGateAt)) {
    reasons.push('aggregate R5D parity must run after the existing platform matrix gate');
  }

  const badge = 'https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml/badge.svg';
  const workflowLink = 'https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml';
  if (!readme.includes(`[![Workflow Kit CI](${badge})](${workflowLink})`)) {
    reasons.push('README must retain the stable Workflow Kit CI badge and workflow link');
  }

  return { passed: reasons.length === 0, reasons: reasons.sort() };
}
