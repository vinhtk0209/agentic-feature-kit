import {
  SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  SpecAdapterError,
  createSpecAdapterDescriptor,
  createSpecAdapterResult,
  type SpecAdapterResult,
} from './spec-adapter'
import { SpecIrValidationError, validateSpecIR, type SpecIR } from './spec-ir'

export const SPEC_IR_ADAPTER_DESCRIPTOR = createSpecAdapterDescriptor({
  schemaVersion: SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  adapterId: 'spec-ir-v1',
  providerId: 'spec-ir',
  inputKind: 'spec-ir-v1',
  outputSchemaVersion: SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  sourceKinds: ['confluence', 'excel', 'pdf', 'raw-us', 'word'],
  configurationRequirements: [],
  unsupportedBehavior: 'explicit-field-names',
})

/** Convert an already parsed SpecIR into the provider-neutral result contract without reparsing. */
export function adaptSpecIR(value: SpecIR): SpecAdapterResult {
  let ir: SpecIR
  try {
    ir = validateSpecIR(value)
  } catch (error) {
    if (error instanceof SpecIrValidationError) throw new SpecAdapterError('spec-ir-v1', 'INVALID_RESULT')
    throw error
  }
  return createSpecAdapterResult({
    descriptor: SPEC_IR_ADAPTER_DESCRIPTOR,
    source: {
      sourceKind: ir.sourceKind,
      sourceRef: ir.sourceRef,
      sourceSha256: ir.sourceSha256,
      title: ir.title,
      paragraphs: ir.paragraphs,
      acceptanceCriteria: ir.acceptanceCriteria,
    },
    unsupportedFields: ir.warnings.length === 0 ? [] : ['warnings'],
  })
}
