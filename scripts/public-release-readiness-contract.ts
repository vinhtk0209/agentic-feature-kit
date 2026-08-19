export const FINAL_EVIDENCE_PATH = 'docs/evidence/post-17-public-release-readiness.md'

export const REQUIRED_PHASE_EVIDENCE_PATHS = [
  'docs/evidence/post-17-public-release-r1-manifest-classification-2026-08-17.md',
  'docs/evidence/post-17-public-release-r2-public-entry-2026-08-17.md',
  'docs/evidence/post-17-public-release-r3a-governance-surface-2026-08-17.md',
  'docs/evidence/post-17-public-release-r3b-release-history-2026-08-17.md',
  'docs/evidence/post-17-public-release-r4a-legacy-backend-config-2026-08-18.md',
  'docs/evidence/post-17-public-release-r4b-synthetic-fixtures-2026-08-18.md',
  'docs/evidence/post-17-public-release-r4c-prompt-history-aliases-2026-08-18.md',
  'docs/evidence/post-17-public-release-r4d-private-archive-boundary-2026-08-18.md',
  'docs/evidence/post-17-public-release-r4e-operational-aliases-2026-08-18.md',
  'docs/evidence/post-17-public-release-r4f-historical-identity-aliases-2026-08-18.md',
  'docs/evidence/post-17-public-release-r5a-nightly-ci-safety-2026-08-18.md',
  'docs/evidence/post-17-public-release-r5b-binary-privacy-2026-08-18.md',
  'docs/evidence/post-17-public-release-r5c1-source-readiness-2026-08-19.md',
  'docs/evidence/post-17-public-release-r5c2a-deterministic-sbom-2026-08-19.md',
  'docs/evidence/post-17-public-release-r5c2b-strict-archive-gate-2026-08-19.md',
  'docs/evidence/post-17-public-release-r5d-clean-clone-qualification-2026-08-19.md',
] as const

export type CompletionTask = {
  id: string
  status: string
  dependencies: string[]
  readiness: { complete: boolean; missing: string[] }
  evidence: string
}

export type PublicReleaseReadinessInput = {
  baseline: { beforeReopened: boolean; afterReopened: boolean }
  beforeTasks: CompletionTask[]
  afterTasks: CompletionTask[]
  finalEvidence: {
    path: string
    exists: boolean
    tracked: boolean
    regular: boolean
    bytes: number
    text: string
  }
  manifestPaths: string[]
  packagePrivate: boolean
}

export type PublicReleaseReadinessResult = Readonly<{
  eligible: boolean
  gaps: string[]
}>

const TARGET_ID = 'P17-018'
const EXPECTED_DEPENDENCIES = ['P17-008', 'P17-009', 'P17-013'] as const
const IDENTITY_ANCHORS = [
  'c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e',
  '1185b9dd683a5307a2d6fd54d876bc582b538422',
  'c8446375d63d923eaec8bff417c2c5a9a5d462fe',
  '32257876893',
  '96083785935',
  '96083786167',
  '96086552834',
] as const
const CONTRACT_ANCHORS = [
  '# P17-018 Public-Release Readiness Evidence',
  '## Evidence chain',
  '## Qualification receipts',
  'Focused R6 plan and readiness contract: PASS',
  'Canonical roadmap and parent release plan: PASS',
  'Public release/source/provider/SBOM/archive/clean-clone/nightly gates: PASS',
  'Full native kit: PASS',
  'package.json remains private: true',
  '## Dashboard reconciliation',
  'Dashboard roadmap/full/TypeScript: PASS',
  'docs/evidence/post-17-public-release-readiness-dashboard-2026-08-19.md',
  '## Rollback and non-claims',
  'No public artifact is required or authorized to prove readiness.',
  'Rollback restores P17-018 to ready together with the pre-R6 manifest and evidence tree.',
] as const

function safeManifestPath(candidate: string): boolean {
  if (!candidate || candidate.includes('\\') || candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) return false
  const segments = candidate.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function assessPublicReleaseReadiness(input: PublicReleaseReadinessInput): PublicReleaseReadinessResult {
  const gaps: string[] = []
  const add = (gap: string): void => {
    if (!gaps.includes(gap)) gaps.push(gap)
  }

  if (input.baseline.beforeReopened || input.baseline.afterReopened) add('baseline-reopened')

  const beforeIds = input.beforeTasks.map((task) => task.id)
  const afterIds = input.afterTasks.map((task) => task.id)
  if (!sameStrings(beforeIds, afterIds)) add('task-identity-drift')

  const beforeTarget = input.beforeTasks.find((task) => task.id === TARGET_ID)
  const afterTarget = input.afterTasks.find((task) => task.id === TARGET_ID)
  if (!beforeTarget || !afterTarget) add('task-identity-drift')

  if (beforeTarget?.status !== 'ready' || afterTarget?.status !== 'done') add('invalid-status-transition')

  for (const beforeTask of input.beforeTasks) {
    if (beforeTask.id === TARGET_ID) continue
    const afterTask = input.afterTasks.find((task) => task.id === beforeTask.id)
    if (afterTask && afterTask.status !== beforeTask.status) add('non-target-status-drift')
  }

  if (beforeTarget && afterTarget && (
    !sameStrings(beforeTarget.dependencies, EXPECTED_DEPENDENCIES)
    || !sameStrings(afterTarget.dependencies, beforeTarget.dependencies)
  )) add('dependency-drift')

  if (afterTarget) {
    for (const dependency of afterTarget.dependencies) {
      if (input.afterTasks.find((task) => task.id === dependency)?.status !== 'done') add('dependency-not-done')
    }
    if (!afterTarget.readiness.complete || afterTarget.readiness.missing.length > 0) add('readiness-incomplete')
    if (afterTarget.evidence !== FINAL_EVIDENCE_PATH) add('evidence-authority-drift')
  }

  if (input.finalEvidence.path !== FINAL_EVIDENCE_PATH) add('final-evidence-path')
  if (!input.finalEvidence.exists || !input.finalEvidence.tracked || !input.finalEvidence.regular) add('final-evidence-unavailable')
  if (!Number.isSafeInteger(input.finalEvidence.bytes) || input.finalEvidence.bytes <= 0 || input.finalEvidence.bytes > 256 * 1024) {
    add('final-evidence-size')
  }

  const foldedPaths = new Set<string>()
  for (const candidate of input.manifestPaths) {
    if (!safeManifestPath(candidate)) add('manifest-unsafe-path')
    const folded = candidate.normalize('NFC').toLocaleLowerCase('en-US')
    if (foldedPaths.has(folded)) add('manifest-path-collision')
    foldedPaths.add(folded)
  }
  if (!input.manifestPaths.includes(FINAL_EVIDENCE_PATH)) add('final-evidence-not-admitted')
  if (REQUIRED_PHASE_EVIDENCE_PATHS.some((candidate) => !input.manifestPaths.includes(candidate))) {
    add('evidence-chain-not-admitted')
  }

  if (!input.packagePrivate) add('package-publication-boundary')
  if (REQUIRED_PHASE_EVIDENCE_PATHS.some((candidate) => !input.finalEvidence.text.includes(candidate))) {
    add('evidence-chain-incomplete')
  }
  if (IDENTITY_ANCHORS.some((anchor) => !input.finalEvidence.text.includes(anchor))) add('evidence-identity-incomplete')
  if (CONTRACT_ANCHORS.some((anchor) => !input.finalEvidence.text.includes(anchor))) add('evidence-contract-incomplete')
  if (/(?:repository|package|plugin|bundle|release)\s+(?:is|was|has been)\s+(?:public|published|released|available)\b/i.test(input.finalEvidence.text)) {
    add('false-publication-claim')
  }

  return { eligible: gaps.length === 0, gaps }
}
