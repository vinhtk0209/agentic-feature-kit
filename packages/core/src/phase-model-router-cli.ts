#!/usr/bin/env node

import {
  PHASE_MODEL_ROUTING_SCHEMA_VERSION,
  PhaseModelRoutingDecision,
  routePhaseModel,
} from './phase-model-router'

export const PHASE_MODEL_ROUTING_SENTINEL = '@@PHASE_MODEL_ROUTING@@' as const
export const PHASE_MODEL_ROUTING_STDIN_MAX_BYTES = 512 * 1024
export const PHASE_MODEL_ROUTING_OUTPUT_MAX_BYTES = 256 * 1024

interface RoutingCliInput {
  matrix: unknown
  request: unknown
  candidates: unknown[]
}

type CliFailure = 'stdin_required' | 'stdin_too_large' | 'invalid_json' | 'invalid_request' | 'output_too_large'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateCliInput(value: unknown): RoutingCliInput {
  if (!isRecord(value)) throw new Error('invalid_input')
  const actual = Object.keys(value).sort()
  const expected = ['candidates', 'matrix', 'request']
  if (JSON.stringify(actual) !== JSON.stringify(expected) || !Array.isArray(value.candidates)) throw new Error('invalid_input')
  return value as unknown as RoutingCliInput
}

async function readBoundedStdin(limit = PHASE_MODEL_ROUTING_STDIN_MAX_BYTES): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > limit) throw new Error('stdin_too_large')
    chunks.push(buffer)
  }
  if (total === 0) throw new Error('stdin_required')
  return Buffer.concat(chunks).toString('utf8')
}

export function serializePhaseModelRoutingEnvelope(payload: unknown): string {
  const output = `${PHASE_MODEL_ROUTING_SENTINEL}${JSON.stringify(payload)}\n`
  if (Buffer.byteLength(output) > PHASE_MODEL_ROUTING_OUTPUT_MAX_BYTES) throw new Error('output_too_large')
  return output
}

function safeFailure(error: unknown): CliFailure {
  if (error instanceof Error && ['stdin_required', 'stdin_too_large', 'output_too_large'].includes(error.message)) return error.message as CliFailure
  return 'invalid_request'
}

export function executePhaseModelRoutingInput(value: unknown, evaluatedAt: string): PhaseModelRoutingDecision {
  const input = validateCliInput(value)
  return routePhaseModel(input.matrix, input.request, input.candidates, evaluatedAt)
}

export async function runPhaseModelRouterCli(args: string[] = process.argv.slice(2), now: () => Date = () => new Date()): Promise<number> {
  if (args.length !== 1 || args[0] !== 'route') {
    process.stdout.write(serializePhaseModelRoutingEnvelope({ schemaVersion: PHASE_MODEL_ROUTING_SCHEMA_VERSION, ok: false, error: 'invalid_usage' }))
    return 2
  }
  try {
    const inputText = await readBoundedStdin()
    let input: unknown
    try {
      input = JSON.parse(inputText) as unknown
    } catch {
      throw new Error('invalid_json')
    }
    const result = executePhaseModelRoutingInput(input, now().toISOString())
    process.stdout.write(serializePhaseModelRoutingEnvelope({ schemaVersion: PHASE_MODEL_ROUTING_SCHEMA_VERSION, ok: true, result }))
    return result.status === 'needs_input' ? 1 : 0
  } catch (error) {
    const failure = error instanceof Error && error.message === 'invalid_json' ? 'invalid_json' : safeFailure(error)
    let output: string
    try {
      output = serializePhaseModelRoutingEnvelope({ schemaVersion: PHASE_MODEL_ROUTING_SCHEMA_VERSION, ok: false, error: failure })
    } catch {
      output = `${PHASE_MODEL_ROUTING_SENTINEL}{"schemaVersion":"${PHASE_MODEL_ROUTING_SCHEMA_VERSION}","ok":false,"error":"output_too_large"}\n`
    }
    process.stdout.write(output)
    return 2
  }
}

if (require.main === module) {
  void runPhaseModelRouterCli().then((code) => process.exit(code))
}
