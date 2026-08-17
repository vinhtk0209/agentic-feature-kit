import {
  BlockedCentralWriterError,
  type BlockedCentralWriterReceipt,
  createUnavailableTenantReceipt,
  resolveCommandRunId,
  validateBlockedCentralWriterReceipt,
  validateCommandRunId,
  validateWriterBoundReceiptInput,
} from './core/blocked-central-writer'

export const RUN_VERSION_WRITER_ID = 'kit.telemetry.central-upsert' as const

export type BlockedRunVersionReceipt = BlockedCentralWriterReceipt<typeof RUN_VERSION_WRITER_ID>

class RunVersionWriterAdapterError extends Error {
  readonly ruleId: string

  constructor(ruleId: string) {
    super('run-version writer adapter refused')
    this.name = 'RunVersionWriterAdapterError'
    this.ruleId = ruleId
  }
}

function translate<T>(ruleId: string, body: () => T): T {
  try {
    return body()
  } catch (error) {
    if (error instanceof BlockedCentralWriterError) throw new RunVersionWriterAdapterError(ruleId)
    throw error
  }
}

export function resolveRunVersionCommandRunId(candidate: unknown, generate?: () => string): string {
  return translate('run_version.run_id', () => resolveCommandRunId(candidate, generate))
}

export function validateRunVersionCommandRunId(value: unknown): string {
  return translate('run_version.run_id', () => validateCommandRunId(value))
}

export function createBlockedRunVersionReceipt(input: unknown): BlockedRunVersionReceipt {
  return translate('run_version.receipt_input', () => {
    const validated = validateWriterBoundReceiptInput(input)
    return createUnavailableTenantReceipt({
      writerId: RUN_VERSION_WRITER_ID,
      runId: validated.runId,
      createdAt: validated.createdAt,
    }) as BlockedRunVersionReceipt
  })
}

export function validateRunVersionWriterReceipt(value: unknown): BlockedRunVersionReceipt {
  return translate('run_version.receipt', () => (
    validateBlockedCentralWriterReceipt(value, RUN_VERSION_WRITER_ID) as BlockedRunVersionReceipt
  ))
}
