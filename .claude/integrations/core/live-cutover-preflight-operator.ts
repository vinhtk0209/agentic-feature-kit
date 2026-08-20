import {
  C5B_OPERATIONS,
  C5B_REASON_CODES,
  computeC5BCompletionHash,
  createC5BOperationReceipt,
  evaluateC5BPreflightPrefix,
  validateC5BPreflightPacket,
  type C5BCompletionReceipt,
  type C5BOperation,
  type C5BOperationReceipt,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from './live-cutover-preflight'

type C5BExternalOperation = Exclude<C5BOperation, 'complete_preflight'>

export type C5BPortDecision =
  | { readonly status: 'passed'; readonly evidence: Record<string, unknown> }
  | { readonly status: 'refused'; readonly reasonCode: C5BReasonCode }

export interface C5BOperatorClockPort {
  readonly now: () => string
}

export interface C5BOperatorContext {
  readonly packet: C5BPreflightPacket
  readonly receipts: readonly C5BOperationReceipt[]
}

export interface C5BOperatorPorts {
  readonly attestProject: (context: C5BOperatorContext) => Promise<unknown>
  readonly probeCatalogAcl: (context: C5BOperatorContext) => Promise<unknown>
  readonly freezeWriters: (context: C5BOperatorContext) => Promise<unknown>
  readonly createProviderRecoveryPoint: (context: C5BOperatorContext) => Promise<unknown>
  readonly createEncryptedLogicalBackup: (context: C5BOperatorContext) => Promise<unknown>
  readonly restoreIsolatedBackup: (context: C5BOperatorContext) => Promise<unknown>
  readonly verifyRestoredState: (context: C5BOperatorContext) => Promise<unknown>
  readonly cleanupIsolatedRestore: (context: C5BOperatorContext) => Promise<unknown>
  readonly unfreezeWriters: (context: C5BOperatorContext) => Promise<unknown>
}

export interface C5BOperatorDependencies {
  readonly clock: C5BOperatorClockPort
  readonly ports: C5BOperatorPorts
}

export interface C5BOperatorCompensation {
  readonly cleanupAttempted: boolean
  readonly cleanupConfirmed: boolean
  readonly unfreezeAttempted: boolean
  readonly unfreezeConfirmed: boolean
}

export type C5BOperatorFailureStage = C5BOperation | 'validate_packet' | 'operator_boundary' | 'unfreeze_writers'

export type C5BOperatorResult =
  | {
    readonly ok: true
    readonly outcome: 'completed'
    readonly reasonCode: null
    readonly failedStage: null
    readonly completion: C5BCompletionReceipt
    readonly receipts: readonly C5BOperationReceipt[]
    readonly compensation: C5BOperatorCompensation
  }
  | {
    readonly ok: false
    readonly outcome: 'blocked'
    readonly reasonCode: C5BReasonCode
    readonly failedStage: C5BOperatorFailureStage
    readonly completion: null
    readonly receipts: readonly C5BOperationReceipt[]
    readonly compensation: C5BOperatorCompensation
  }

const EXTERNAL_OPERATIONS = C5B_OPERATIONS.slice(0, 8) as readonly C5BExternalOperation[]
const PORT_METHODS = [
  'attestProject',
  'probeCatalogAcl',
  'freezeWriters',
  'createProviderRecoveryPoint',
  'createEncryptedLogicalBackup',
  'restoreIsolatedBackup',
  'verifyRestoredState',
  'cleanupIsolatedRestore',
] as const
const REASONS = new Set<C5BReasonCode>(C5B_REASON_CODES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function context(packet: C5BPreflightPacket, receipts: readonly C5BOperationReceipt[]): C5BOperatorContext {
  return deepFreeze({ packet, receipts: [...receipts] })
}

function compensation(
  cleanupAttempted: boolean,
  cleanupConfirmed: boolean,
  unfreezeAttempted: boolean,
  unfreezeConfirmed: boolean,
): C5BOperatorCompensation {
  return deepFreeze({ cleanupAttempted, cleanupConfirmed, unfreezeAttempted, unfreezeConfirmed })
}

function blockedResult(
  reasonCode: C5BReasonCode,
  failedStage: C5BOperatorFailureStage,
  receipts: readonly C5BOperationReceipt[],
  value: C5BOperatorCompensation,
): C5BOperatorResult {
  return deepFreeze({
    ok: false,
    outcome: 'blocked',
    reasonCode,
    failedStage,
    completion: null,
    receipts: [...receipts],
    compensation: value,
  })
}

function dependenciesAreUsable(value: unknown): value is C5BOperatorDependencies {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<C5BOperatorDependencies>
  if (!candidate.clock || typeof candidate.clock.now !== 'function' || !candidate.ports) return false
  return [...PORT_METHODS, 'unfreezeWriters'].every((method) => (
    typeof (candidate.ports as unknown as Record<string, unknown>)[method] === 'function'
  ))
}

function normalizeDecision(value: unknown): C5BPortDecision | null {
  if (!isRecord(value)) return null
  if (value.status === 'passed') {
    if (!exactKeys(value, ['status', 'evidence']) || !isRecord(value.evidence)) return null
    return { status: 'passed', evidence: value.evidence }
  }
  if (value.status === 'refused') {
    if (!exactKeys(value, ['status', 'reasonCode']) || typeof value.reasonCode !== 'string'
      || !REASONS.has(value.reasonCode as C5BReasonCode)) return null
    return { status: 'refused', reasonCode: value.reasonCode as C5BReasonCode }
  }
  return null
}

function unfreezeConfirmed(value: unknown): boolean {
  return isRecord(value) && exactKeys(value, ['unfreezeConfirmed']) && value.unfreezeConfirmed === true
}

function time(clock: C5BOperatorClockPort): string | null {
  try {
    const value = clock.now()
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

async function callPort(
  operation: C5BExternalOperation,
  method: (context: C5BOperatorContext) => Promise<unknown>,
  packet: C5BPreflightPacket,
  receipts: readonly C5BOperationReceipt[],
  clock: C5BOperatorClockPort,
): Promise<{ readonly receipt: C5BOperationReceipt | null; readonly reasonCode: C5BReasonCode }> {
  const startedAt = time(clock)
  if (startedAt === null) return { receipt: null, reasonCode: 'invalid_receipt' }
  let raw: unknown
  let threw = false
  try {
    raw = await method(context(packet, receipts))
  } catch {
    threw = true
  }
  const completedAt = time(clock)
  if (completedAt === null) return { receipt: null, reasonCode: 'invalid_receipt' }
  const decision = threw ? { status: 'refused', reasonCode: 'provider_operation_refused' } as const : normalizeDecision(raw)
  const receiptInput = decision === null
    ? { operation, status: 'refused' as const, reasonCode: 'invalid_receipt' as const, startedAt, completedAt, evidence: null }
    : decision.status === 'refused'
      ? { operation, status: 'refused' as const, reasonCode: decision.reasonCode, startedAt, completedAt, evidence: null }
      : { operation, status: 'passed' as const, reasonCode: null, startedAt, completedAt, evidence: decision.evidence }
  try {
    const receipt = createC5BOperationReceipt(packet, receiptInput)
    return { receipt, reasonCode: receipt.status === 'refused' ? receipt.reasonCode ?? 'operation_refused' : 'operation_refused' }
  } catch {
    return { receipt: null, reasonCode: 'invalid_receipt' }
  }
}

export async function runC5BPreflightOperator(
  packetValue: unknown,
  dependenciesValue: C5BOperatorDependencies,
): Promise<C5BOperatorResult> {
  if (!dependenciesAreUsable(dependenciesValue)) {
    return blockedResult(
      'invalid_packet',
      'operator_boundary',
      [],
      compensation(false, false, false, false),
    )
  }

  let packet: C5BPreflightPacket
  try {
    packet = validateC5BPreflightPacket(packetValue)
  } catch {
    return blockedResult(
      'invalid_packet',
      'validate_packet',
      [],
      compensation(false, false, false, false),
    )
  }

  const receipts: C5BOperationReceipt[] = []
  let writersFrozen = false
  let restoreAttempted = false
  let canonicalCleanupAttempted = false
  let cleanupConfirmed = false
  let compensationCleanupAttempted = false
  let unfreezeAttempted = false
  let writersUnfrozen = false

  const finishBlocked = async (
    initialReason: C5BReasonCode,
    initialStage: C5BOperatorFailureStage,
  ): Promise<C5BOperatorResult> => {
    let reasonCode = initialReason
    let failedStage = initialStage

    if (restoreAttempted && !canonicalCleanupAttempted) {
      compensationCleanupAttempted = true
      const cleanup = await callPort(
        'cleanup_isolated_restore',
        dependenciesValue.ports.cleanupIsolatedRestore.bind(dependenciesValue.ports),
        packet,
        receipts,
        dependenciesValue.clock,
      )
      if (cleanup.receipt?.status === 'passed') {
        cleanupConfirmed = cleanup.receipt.evidence?.cleanupConfirmed === true
          && cleanup.receipt.evidence.residualResourceCount === 0
      }
      if (!cleanupConfirmed) {
        reasonCode = 'cleanup_incomplete'
        failedStage = 'cleanup_isolated_restore'
      }
    }

    if (writersFrozen) {
      unfreezeAttempted = true
      try {
        writersUnfrozen = unfreezeConfirmed(await dependenciesValue.ports.unfreezeWriters(context(packet, receipts)))
      } catch {
        writersUnfrozen = false
      }
      if (!writersUnfrozen && reasonCode !== 'cleanup_incomplete') {
        reasonCode = 'provider_operation_refused'
        failedStage = 'unfreeze_writers'
      }
    }

    return blockedResult(
      reasonCode,
      failedStage,
      receipts,
      compensation(compensationCleanupAttempted, cleanupConfirmed, unfreezeAttempted, writersUnfrozen),
    )
  }

  for (let index = 0; index < EXTERNAL_OPERATIONS.length; index += 1) {
    const operation = EXTERNAL_OPERATIONS[index]
    if (operation === 'restore_isolated_backup') restoreAttempted = true
    if (operation === 'cleanup_isolated_restore') canonicalCleanupAttempted = true
    const method = dependenciesValue.ports[PORT_METHODS[index]].bind(dependenciesValue.ports)
    const called = await callPort(operation, method, packet, receipts, dependenciesValue.clock)
    if (called.receipt === null) return finishBlocked(called.reasonCode, operation)
    receipts.push(called.receipt)
    if (operation === 'freeze_writers' && called.receipt.status === 'passed'
      && called.receipt.evidence?.freezeConfirmed === true) writersFrozen = true
    const prefix = evaluateC5BPreflightPrefix(packet, receipts)
    if (!prefix.ok) return finishBlocked(prefix.reasonCode, operation)
    if (operation === 'cleanup_isolated_restore') cleanupConfirmed = true
  }

  unfreezeAttempted = true
  try {
    writersUnfrozen = unfreezeConfirmed(await dependenciesValue.ports.unfreezeWriters(context(packet, receipts)))
  } catch {
    writersUnfrozen = false
  }
  if (!writersUnfrozen) {
    return blockedResult(
      'provider_operation_refused',
      'unfreeze_writers',
      receipts,
      compensation(false, cleanupConfirmed, true, false),
    )
  }

  const startedAt = time(dependenciesValue.clock)
  const completedAt = time(dependenciesValue.clock)
  if (startedAt === null || completedAt === null) {
    return blockedResult(
      'invalid_receipt',
      'complete_preflight',
      receipts,
      compensation(false, cleanupConfirmed, true, true),
    )
  }
  let completionReceipt: C5BOperationReceipt
  try {
    completionReceipt = createC5BOperationReceipt(packet, {
      operation: 'complete_preflight',
      status: 'passed',
      reasonCode: null,
      startedAt,
      completedAt,
      evidence: { allStepsPassed: true, completionHash: computeC5BCompletionHash(packet, receipts) },
    })
  } catch {
    return blockedResult(
      'integrity_mismatch',
      'complete_preflight',
      receipts,
      compensation(false, cleanupConfirmed, true, true),
    )
  }
  receipts.push(completionReceipt)
  const completed = evaluateC5BPreflightPrefix(packet, receipts)
  if (!completed.ok || completed.statusCode !== 'completed') {
    return blockedResult(
      completed.ok ? 'integrity_mismatch' : completed.reasonCode,
      'complete_preflight',
      receipts,
      compensation(false, cleanupConfirmed, true, true),
    )
  }
  return deepFreeze({
    ok: true,
    outcome: 'completed',
    reasonCode: null,
    failedStage: null,
    completion: completed.receipt,
    receipts: [...receipts],
    compensation: compensation(false, cleanupConfirmed, true, true),
  })
}
