import {
  BlockedCentralWriterError,
  type BlockedCentralWriterReceipt,
  createUnavailableTenantReceipt,
  resolveCommandRunId as resolveSharedCommandRunId,
  validateBlockedCentralWriterReceipt,
  validateCommandRunId as validateSharedCommandRunId,
  validateWriterBoundReceiptInput,
} from './core/blocked-central-writer'

export const VERIFICATION_WRITER_ID = 'kit.verification.record' as const

export type BlockedVerificationReceipt = BlockedCentralWriterReceipt<typeof VERIFICATION_WRITER_ID>

class VerificationWriterAdapterError extends Error {
  readonly ruleId: string

  constructor(ruleId: string) {
    super('verification writer adapter refused')
    this.name = 'VerificationWriterAdapterError'
    this.ruleId = ruleId
  }
}

function translate<T>(ruleId: string, body: () => T): T {
  try {
    return body()
  } catch (error) {
    if (error instanceof BlockedCentralWriterError) {
      throw new VerificationWriterAdapterError(ruleId)
    }
    throw error
  }
}

export function resolveCommandRunId(candidate: unknown, generate?: () => string): string {
  return translate('verification.run_id', () => resolveSharedCommandRunId(candidate, generate))
}

export function validateCommandRunId(value: unknown): string {
  return translate('verification.run_id', () => validateSharedCommandRunId(value))
}

export function createBlockedVerificationReceipt(input: unknown): BlockedVerificationReceipt {
  return translate('verification.receipt_input', () => {
    const validated = validateWriterBoundReceiptInput(input)
    return createUnavailableTenantReceipt({
      writerId: VERIFICATION_WRITER_ID,
      runId: validated.runId,
      createdAt: validated.createdAt,
    }) as BlockedVerificationReceipt
  })
}

export function validateVerificationWriterReceipt(value: unknown): BlockedVerificationReceipt {
  return translate('verification.receipt', () => (
    validateBlockedCentralWriterReceipt(value, VERIFICATION_WRITER_ID) as BlockedVerificationReceipt
  ))
}
