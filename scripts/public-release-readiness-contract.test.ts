import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  FINAL_EVIDENCE_PATH,
  REQUIRED_PHASE_EVIDENCE_PATHS,
  assessPublicReleaseReadiness,
  type PublicReleaseReadinessInput,
} from './public-release-readiness-contract'

const requiredEvidenceText = [
  '# P17-018 Public-Release Readiness Evidence',
  '## Evidence chain',
  ...REQUIRED_PHASE_EVIDENCE_PATHS,
  '## Qualification receipts',
  'Focused R6 plan and readiness contract: PASS',
  'Canonical roadmap and parent release plan: PASS',
  'Public release/source/provider/SBOM/archive/clean-clone/nightly gates: PASS',
  'Full native kit: PASS',
  'c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e',
  '1185b9dd683a5307a2d6fd54d876bc582b538422',
  'c8446375d63d923eaec8bff417c2c5a9a5d462fe',
  '32257876893',
  '96083785935',
  '96083786167',
  '96086552834',
  'package.json remains private: true',
  '## Dashboard reconciliation',
  'Dashboard roadmap/full/TypeScript: PASS',
  'docs/evidence/post-17-public-release-readiness-dashboard-2026-08-19.md',
  '## Rollback and non-claims',
  'No public artifact is required or authorized to prove readiness.',
  'Rollback restores P17-018 to ready together with the pre-R6 manifest and evidence tree.',
].join('\n')

const beforeTasks = [
  { id: 'P17-008', status: 'done', dependencies: [], readiness: { complete: true, missing: [] }, evidence: 'docs/evidence/p17-008.md' },
  { id: 'P17-009', status: 'done', dependencies: [], readiness: { complete: true, missing: [] }, evidence: 'docs/evidence/p17-009.md' },
  { id: 'P17-013', status: 'done', dependencies: [], readiness: { complete: true, missing: [] }, evidence: 'docs/evidence/p17-013.md' },
  { id: 'P17-018', status: 'ready', dependencies: ['P17-008', 'P17-009', 'P17-013'], readiness: { complete: true, missing: [] }, evidence: FINAL_EVIDENCE_PATH },
  { id: 'P17-021', status: 'backlog', dependencies: ['P17-014'], readiness: { complete: false, missing: ['fixture'] }, evidence: 'docs/evidence/p17-021.md' },
]

function validInput(): PublicReleaseReadinessInput {
  return {
    baseline: { beforeReopened: false, afterReopened: false },
    beforeTasks: structuredClone(beforeTasks),
    afterTasks: structuredClone(beforeTasks).map((task) => task.id === 'P17-018' ? { ...task, status: 'done' } : task),
    finalEvidence: {
      path: FINAL_EVIDENCE_PATH,
      exists: true,
      tracked: true,
      regular: true,
      bytes: Buffer.byteLength(requiredEvidenceText),
      text: requiredEvidenceText,
    },
    manifestPaths: [...REQUIRED_PHASE_EVIDENCE_PATHS, FINAL_EVIDENCE_PATH, 'README.md'],
    packagePrivate: true,
  }
}

function gaps(input: PublicReleaseReadinessInput): string[] {
  return assessPublicReleaseReadiness(input).gaps
}

assert.deepEqual(gaps(validInput()), [])

const attacks: Array<readonly [string, (input: PublicReleaseReadinessInput) => void, string]> = [
  ['baseline reopened', (input) => { input.baseline.afterReopened = true }, 'baseline-reopened'],
  ['starting baseline reopened', (input) => { input.baseline.beforeReopened = true }, 'baseline-reopened'],
  ['task removed', (input) => { input.afterTasks.pop() }, 'task-identity-drift'],
  ['task reordered', (input) => { input.afterTasks.reverse() }, 'task-identity-drift'],
  ['task added', (input) => { input.afterTasks.push({ ...input.afterTasks[0], id: 'P17-999' }) }, 'task-identity-drift'],
  ['other status changed', (input) => { input.afterTasks[0].status = 'blocked' }, 'non-target-status-drift'],
  ['target did not start ready', (input) => { input.beforeTasks.find((task) => task.id === 'P17-018')!.status = 'backlog' }, 'invalid-status-transition'],
  ['target did not finish done', (input) => { input.afterTasks.find((task) => task.id === 'P17-018')!.status = 'in_progress' }, 'invalid-status-transition'],
  ['target missing before', (input) => { input.beforeTasks = input.beforeTasks.filter((task) => task.id !== 'P17-018') }, 'task-identity-drift'],
  ['dependency drift', (input) => { input.afterTasks.find((task) => task.id === 'P17-018')!.dependencies = ['P17-008'] }, 'dependency-drift'],
  ['dependency not done', (input) => { input.afterTasks.find((task) => task.id === 'P17-009')!.status = 'blocked' }, 'non-target-status-drift'],
  ['readiness incomplete', (input) => { input.afterTasks.find((task) => task.id === 'P17-018')!.readiness.complete = false }, 'readiness-incomplete'],
  ['readiness gap present', (input) => { input.afterTasks.find((task) => task.id === 'P17-018')!.readiness.missing = ['fixture'] }, 'readiness-incomplete'],
  ['evidence authority drift', (input) => { input.afterTasks.find((task) => task.id === 'P17-018')!.evidence = 'docs/evidence/other.md' }, 'evidence-authority-drift'],
  ['evidence wrong path', (input) => { input.finalEvidence.path = 'docs/evidence/other.md' }, 'final-evidence-path'],
  ['evidence absent', (input) => { input.finalEvidence.exists = false }, 'final-evidence-unavailable'],
  ['evidence untracked', (input) => { input.finalEvidence.tracked = false }, 'final-evidence-unavailable'],
  ['evidence non-regular', (input) => { input.finalEvidence.regular = false }, 'final-evidence-unavailable'],
  ['evidence empty', (input) => { input.finalEvidence.bytes = 0 }, 'final-evidence-size'],
  ['evidence oversized', (input) => { input.finalEvidence.bytes = 256 * 1024 + 1 }, 'final-evidence-size'],
  ['evidence not admitted', (input) => { input.manifestPaths = input.manifestPaths.filter((candidate) => candidate !== FINAL_EVIDENCE_PATH) }, 'final-evidence-not-admitted'],
  ['manifest duplicate', (input) => { input.manifestPaths.push(FINAL_EVIDENCE_PATH) }, 'manifest-path-collision'],
  ['manifest case collision', (input) => { input.manifestPaths.push(FINAL_EVIDENCE_PATH.toUpperCase()) }, 'manifest-path-collision'],
  ['manifest traversal', (input) => { input.manifestPaths.push('../outside') }, 'manifest-unsafe-path'],
  ['manifest backslash', (input) => { input.manifestPaths.push('docs\\outside.md') }, 'manifest-unsafe-path'],
  ['package public', (input) => { input.packagePrivate = false }, 'package-publication-boundary'],
  ['missing phase evidence', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace(REQUIRED_PHASE_EVIDENCE_PATHS[0], '') }, 'evidence-chain-incomplete'],
  ['missing R5D merge', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e', '') }, 'evidence-identity-incomplete'],
  ['missing R5D head', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('1185b9dd683a5307a2d6fd54d876bc582b538422', '') }, 'evidence-identity-incomplete'],
  ['missing R5D tree', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('c8446375d63d923eaec8bff417c2c5a9a5d462fe', '') }, 'evidence-identity-incomplete'],
  ['missing CI run', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('32257876893', '') }, 'evidence-identity-incomplete'],
  ['missing Linux job', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('96083785935', '') }, 'evidence-identity-incomplete'],
  ['missing Windows job', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('96083786167', '') }, 'evidence-identity-incomplete'],
  ['missing aggregate job', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('96086552834', '') }, 'evidence-identity-incomplete'],
  ['missing dashboard receipt', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('docs/evidence/post-17-public-release-readiness-dashboard-2026-08-19.md', '') }, 'evidence-contract-incomplete'],
  ['missing private boundary', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('package.json remains private: true', '') }, 'evidence-contract-incomplete'],
  ['missing non-claim', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('No public artifact is required or authorized to prove readiness.', '') }, 'evidence-contract-incomplete'],
  ['missing rollback', (input) => { input.finalEvidence.text = input.finalEvidence.text.replace('Rollback restores P17-018 to ready together with the pre-R6 manifest and evidence tree.', '') }, 'evidence-contract-incomplete'],
  ['false repository publication', (input) => { input.finalEvidence.text += '\nRepository is public.' }, 'false-publication-claim'],
  ['false package publication', (input) => { input.finalEvidence.text += '\nPackage was published.' }, 'false-publication-claim'],
]

for (const [name, mutate, expectedGap] of attacks) {
  const input = validInput()
  mutate(input)
  const actual = gaps(input)
  assert.ok(actual.includes(expectedGap), `${name} must report ${expectedGap}; got ${actual.join(', ')}`)
}

const noRaw = validInput()
noRaw.finalEvidence.path = 'C:/Users/operator/private/token-value.md'
const result = assessPublicReleaseReadiness(noRaw)
assert.ok(result.gaps.includes('final-evidence-path'))
assert.doesNotMatch(JSON.stringify(result), /operator|token-value|C:\//)

const root = process.cwd()
const completionMerge = 'df2c9ea16079f83c0c16ff16a95d8bfe14df9923'
const startingCatalog = JSON.parse(execFileSync(
  'git',
  ['show', 'c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e:docs/roadmap/post-17-roadmap.json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 },
)) as { baseline: { reopened: boolean }; tasks: PublicReleaseReadinessInput['beforeTasks'] }
const completionCatalog = JSON.parse(execFileSync(
  'git',
  ['show', `${completionMerge}:docs/roadmap/post-17-roadmap.json`],
  { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 },
)) as {
  baseline: { reopened: boolean }
  tasks: PublicReleaseReadinessInput['afterTasks']
}
const currentCatalog = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8')) as {
  tasks: PublicReleaseReadinessInput['afterTasks']
}
const completionTarget = completionCatalog.tasks.find((task) => task.id === 'P17-018')
const currentTarget = currentCatalog.tasks.find((task) => task.id === 'P17-018')
assert.deepEqual(currentTarget, completionTarget, 'the current roadmap must preserve the accepted P17-018 closure')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'public-release-manifest.json'), 'utf8')) as {
  entries: Array<{ path: string; decision: string }>
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { private?: boolean }
const trackedPaths = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))
const finalEvidenceAbsolute = path.join(root, ...FINAL_EVIDENCE_PATH.split('/'))
const finalEvidenceExists = fs.existsSync(finalEvidenceAbsolute)
const finalEvidenceStats = finalEvidenceExists ? fs.lstatSync(finalEvidenceAbsolute) : undefined
const repositoryInput: PublicReleaseReadinessInput = {
  baseline: {
    beforeReopened: startingCatalog.baseline.reopened,
    afterReopened: completionCatalog.baseline.reopened,
  },
  beforeTasks: startingCatalog.tasks.map(({ id, status, dependencies, readiness, evidence }) => ({ id, status, dependencies, readiness, evidence })),
  afterTasks: completionCatalog.tasks.map(({ id, status, dependencies, readiness, evidence }) => ({ id, status, dependencies, readiness, evidence })),
  finalEvidence: {
    path: FINAL_EVIDENCE_PATH,
    exists: finalEvidenceExists,
    tracked: trackedPaths.has(FINAL_EVIDENCE_PATH),
    regular: finalEvidenceStats?.isFile() === true && !finalEvidenceStats.isSymbolicLink(),
    bytes: finalEvidenceStats?.size ?? 0,
    text: finalEvidenceExists ? fs.readFileSync(finalEvidenceAbsolute, 'utf8') : '',
  },
  manifestPaths: manifest.entries.filter((entry) => entry.decision === 'include').map((entry) => entry.path),
  packagePrivate: packageJson.private === true,
}
assert.deepEqual(
  assessPublicReleaseReadiness(repositoryInput),
  { eligible: true, gaps: [] },
  'the repository candidate must satisfy the complete R6 predicate',
)

console.log(`public-release-readiness-contract.test: PASS (1 canonical + ${attacks.length} attacks)`)
