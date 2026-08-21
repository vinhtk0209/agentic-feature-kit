#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import { SpecAdapterError as ResultAdapterError } from './core/spec-adapter'
import { adaptSpecIR } from './core/spec-adapter-spec-ir'
import {
  SpecAdapterError as IntakeAdapterError,
  SpecIrValidationError,
  type SpecIR,
} from './spec-ir'
import {
  SpecInputReadError,
  UnsupportedSpecInputError,
  intakeSpecFile,
  type IntakeKind,
} from './spec-intake'

export interface ComposedSpecAdapterArtifacts {
  ir: SpecIR
  result: ReturnType<typeof adaptSpecIR>
}

export function composeSpecAdapterArtifactsFromFile(
  sourcePath: string,
  requestedKind?: IntakeKind,
): ComposedSpecAdapterArtifacts {
  const ir = intakeSpecFile(sourcePath, requestedKind)
  return { ir, result: adaptSpecIR(ir) }
}

function atomicWriteJson(targetPath: string, value: unknown): void {
  const resolved = path.resolve(targetPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  const temporary = `${resolved}.tmp-${process.pid}`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    fs.renameSync(temporary, resolved)
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true })
  }
}

interface CliArgs {
  sourcePath: string
  irOutputPath: string
  requestedKind?: IntakeKind
}

function parseCliArgs(argv: string[]): CliArgs | null {
  if (argv.length < 3 || !argv[0] || argv[0].startsWith('--')) return null
  let irOutputPath: string | undefined
  let requestedKind: IntakeKind | undefined
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) return null
    if (flag === '--ir-output' && irOutputPath === undefined) irOutputPath = value
    else if (flag === '--kind' && requestedKind === undefined && ['raw-us', 'word', 'pdf', 'excel'].includes(value)) {
      requestedKind = value as IntakeKind
    } else return null
  }
  return irOutputPath ? { sourcePath: argv[0], irOutputPath, requestedKind } : null
}

function closedErrorCode(error: unknown): string {
  if (error instanceof SpecInputReadError) return 'SPEC_INPUT_READ_FAILED'
  if (error instanceof UnsupportedSpecInputError) return 'SPEC_INPUT_UNSUPPORTED'
  if (error instanceof IntakeAdapterError || error instanceof SpecIrValidationError) return 'SPEC_IR_INVALID'
  if (error instanceof ResultAdapterError) return 'SPEC_ADAPTER_INVALID'
  return 'COMPOSE_FAILED'
}

if (require.main === module) {
  const args = parseCliArgs(process.argv.slice(2))
  if (args === null) {
    process.stderr.write('spec-adapter-compose:USAGE_INVALID\n')
    process.exit(1)
  }
  try {
    const artifacts = composeSpecAdapterArtifactsFromFile(args.sourcePath, args.requestedKind)
    atomicWriteJson(args.irOutputPath, artifacts.ir)
    process.stdout.write(`${JSON.stringify(artifacts.result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`spec-adapter-compose:${closedErrorCode(error)}\n`)
    process.exit(1)
  }
}
