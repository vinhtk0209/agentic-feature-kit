import {
  BlockedCentralWriterError,
  type BlockedCentralWriterReceipt,
  createUnavailableTenantReceipt,
  resolveCommandRunId,
  validateBlockedCentralWriterReceipt,
  validateCommandRunId,
  validateWriterBoundReceiptInput,
} from './core/blocked-central-writer'

export const INSTALL_WRITER_ID = 'kit.sync.install-report' as const

export type BlockedInstallReceipt = BlockedCentralWriterReceipt<typeof INSTALL_WRITER_ID>

class InstallWriterAdapterError extends Error {
  readonly ruleId: string

  constructor(ruleId: string) {
    super('install writer adapter refused')
    this.name = 'InstallWriterAdapterError'
    this.ruleId = ruleId
  }
}

function translate<T>(ruleId: string, body: () => T): T {
  try {
    return body()
  } catch (error) {
    if (error instanceof BlockedCentralWriterError) throw new InstallWriterAdapterError(ruleId)
    throw error
  }
}

export function resolveInstallCommandRunId(candidate: unknown, generate?: () => string): string {
  return translate('install.run_id', () => resolveCommandRunId(candidate, generate))
}

export function validateInstallCommandRunId(value: unknown): string {
  return translate('install.run_id', () => validateCommandRunId(value))
}

export function createBlockedInstallReceipt(input: unknown): BlockedInstallReceipt {
  return translate('install.receipt_input', () => {
    const validated = validateWriterBoundReceiptInput(input)
    return createUnavailableTenantReceipt({
      writerId: INSTALL_WRITER_ID,
      runId: validated.runId,
      createdAt: validated.createdAt,
    }) as BlockedInstallReceipt
  })
}

export function validateInstallWriterReceipt(value: unknown): BlockedInstallReceipt {
  return translate('install.receipt', () => (
    validateBlockedCentralWriterReceipt(value, INSTALL_WRITER_ID) as BlockedInstallReceipt
  ))
}
