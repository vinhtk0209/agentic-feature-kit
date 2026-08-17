#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {
  GoldenCandidate,
  PhaseEnvelope,
  compareCandidateToGolden,
  createPhaseEnvelope,
  resumeFromPhaseEnvelopes,
  validateBoundaryContract,
  validatePhaseEnvelope,
  verifyEnvelopeContent,
} from './workflow-orchestrator'

export const ORCHESTRATOR_RESULT_SENTINEL = '@@ORCHESTRATOR_RESULT@@' as const
export const ORCHESTRATOR_STDIN_MAX_BYTES = 4 * 1024 * 1024

type Mode = 'create-envelope' | 'validate-envelope' | 'resume' | 'compare-golden'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: unknown, keys: string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} fields must be exactly ${expected.join(', ')}`)
}

export function executeOrchestratorRequest(mode: Mode, request: unknown, boundaryInput: unknown, goldenInput: unknown): unknown {
  const contract = validateBoundaryContract(boundaryInput)
  if (mode === 'create-envelope') {
    exactKeys(request, ['input'], 'create-envelope request')
    const envelope = createPhaseEnvelope(request.input as Omit<PhaseEnvelope, 'schemaVersion' | 'contractVersion' | 'envelopeHash'>)
    return validatePhaseEnvelope(envelope, contract)
  }
  if (mode === 'validate-envelope') {
    exactKeys(request, ['contents', 'envelope'], 'validate-envelope request')
    exactKeys(request.contents, Object.keys(request.contents as Record<string, unknown>), 'validate-envelope contents')
    const entries = Object.entries(request.contents).map(([uri, content]) => {
      if (typeof content !== 'string') throw new Error(`validate-envelope content for ${uri} must be a string`)
      return [uri, content] as const
    })
    return verifyEnvelopeContent(request.envelope, contract, new Map(entries))
  }
  if (mode === 'resume') {
    exactKeys(request, ['conditionalDisposition', 'envelopes'], 'resume request')
    if (!Array.isArray(request.envelopes)) throw new Error('resume envelopes must be an array')
    if (!isRecord(request.conditionalDisposition)) throw new Error('resume conditionalDisposition must be an object')
    return resumeFromPhaseEnvelopes(contract, request.envelopes, request.conditionalDisposition as any)
  }
  exactKeys(request, ['candidate'], 'compare-golden request')
  return { issues: compareCandidateToGolden(request.candidate as GoldenCandidate, goldenInput) }
}

async function readBoundedStdin(limit = ORCHESTRATOR_STDIN_MAX_BYTES): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > limit) throw new Error(`stdin exceeds ${limit} bytes`)
    chunks.push(buffer)
  }
  if (total === 0) throw new Error('stdin JSON request is required')
  return Buffer.concat(chunks).toString('utf8')
}

function emit(payload: unknown): void {
  process.stdout.write(`${ORCHESTRATOR_RESULT_SENTINEL}${JSON.stringify(payload)}\n`)
}

function resolveContractRoot(): string {
  const candidates = [
    process.env.AGENTIC_FEATURE_KIT_ROOT,
    process.cwd(),
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', '..', '..'),
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  for (const candidate of candidates) {
    const root = path.resolve(candidate)
    if (
      fs.existsSync(path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json'))
      && fs.existsSync(path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-golden.json'))
    ) return root
  }
  throw new Error('packaged orchestrator contracts are unavailable')
}

export async function runWorkflowOrchestratorCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const modes: Mode[] = ['create-envelope', 'validate-envelope', 'resume', 'compare-golden']
  if (args.length !== 1 || !modes.includes(args[0] as Mode)) {
    emit({ schemaVersion: '1.0.0', ok: false, error: 'usage: workflow-orchestrator-cli <create-envelope|validate-envelope|resume|compare-golden>' })
    return 2
  }
  try {
    const requestText = await readBoundedStdin()
    let request: unknown
    try {
      request = JSON.parse(requestText) as unknown
    } catch {
      throw new Error('stdin must contain exactly one valid JSON value')
    }
    const contractRoot = resolveContractRoot()
    const boundary = JSON.parse(fs.readFileSync(path.join(contractRoot, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json'), 'utf8')) as unknown
    const golden = JSON.parse(fs.readFileSync(path.join(contractRoot, 'docs', 'roadmap', 'post-17-orchestrator-golden.json'), 'utf8')) as unknown
    const result = executeOrchestratorRequest(args[0] as Mode, request, boundary, golden)
    emit({ schemaVersion: '1.0.0', ok: true, result })
    return 0
  } catch (error) {
    emit({ schemaVersion: '1.0.0', ok: false, error: error instanceof Error ? error.message : String(error) })
    return 1
  }
}

if (require.main === module) {
  void runWorkflowOrchestratorCli().then((code) => process.exit(code))
}
