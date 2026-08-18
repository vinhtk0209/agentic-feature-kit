import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  assertSemanticFieldConservation,
  normalizeSemanticSpec,
  parseSemanticSpec,
  SemanticSourceInput,
  transformSemanticRequirements,
  validateSemanticSpec,
} from '../src/semantic-spec'

const root = process.cwd()
let assertions = 0
let attacks = 0

function check(name: string, run: () => void): void {
  run()
  assertions += 1
  console.log(`PASS ${name}`)
}

function attack(name: string, run: () => void, pattern: RegExp): void {
  assert.throws(run, pattern)
  attacks += 1
  console.log(`PASS attack: ${name}`)
}

const fixturePath = path.join(root, 'packages', 'core', 'test', 'fixtures', 'semantic-spec-equivalence.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  schemaVersion: string
  cases: Array<{ name: string; input: SemanticSourceInput }>
}
assert.equal(fixture.schemaVersion, '1.0.0')
assert.equal(fixture.cases.length, 2)

const confluence = normalizeSemanticSpec(fixture.cases[0].input)
const jira = normalizeSemanticSpec(fixture.cases[1].input)

check('equivalent Confluence and Jira criteria have one semantic identity', () => {
  assert.equal(confluence.semanticHash, jira.semanticHash)
  assert.notEqual(confluence.provenanceHash, jira.provenanceHash)
  assert.deepEqual(confluence.requirements[0].scenario, jira.requirements[0].scenario)
})

check('unstated API contract remains explicitly unknown', () => {
  assert.deepEqual(confluence.contracts, [{ key: 'api.contract', state: 'unknown', values: [], provenance: [] }])
  assert.deepEqual(confluence.ambiguities.map((entry) => [entry.code, entry.field]), [['API_CONTRACT_UNSPECIFIED', 'api.contract']])
})

check('JSON round trip is exact and hash-validated', () => {
  assert.deepEqual(parseSemanticSpec(JSON.stringify(confluence)), confluence)
})

check('semantic transforms conserve source fields and provenance', () => {
  const transformed = transformSemanticRequirements(confluence, (requirement) => ({
    statement: requirement.statement.replace('downloads', 'is downloaded'),
    scenario: requirement.scenario === null ? null : { ...requirement.scenario, then: requirement.scenario.then.replace('downloads', 'is downloaded') },
  }))
  assert.notEqual(transformed.semanticHash, confluence.semanticHash)
  assert.equal(transformed.provenanceHash, confluence.provenanceHash)
  assert.doesNotThrow(() => assertSemanticFieldConservation(confluence, transformed))
})

check('source-backed contract conflicts remain explicit', () => {
  const quoteA = 'API contract: GET /api/reports'
  const quoteB = 'API contract: POST /api/reports/export'
  const conflict = normalizeSemanticSpec({
    ...fixture.cases[0].input,
    paragraphs: [
      ...(fixture.cases[0].input.paragraphs ?? []),
      { anchor: 'line:20', text: quoteA },
      { anchor: 'line:21', text: quoteB },
    ],
    contractObservations: [
      { key: 'api.contract', value: 'GET /api/reports', sourceAnchor: 'line:20', sourceQuote: quoteA },
      { key: 'api.contract', value: 'POST /api/reports/export', sourceAnchor: 'line:21', sourceQuote: quoteB },
    ],
  })
  assert.equal(conflict.contracts[0].state, 'conflict')
  assert.equal(conflict.contracts[0].values.length, 2)
  assert.equal(conflict.ambiguities.find((entry) => entry.code === 'CONTRACT_CONFLICT')?.provenance.length, 2)
})

check('unstructured criteria stay intact and surface ambiguity', () => {
  const quote = 'AC1: The report export is reliable'
  const spec = normalizeSemanticSpec({
    sourceKind: 'local-file', sourceRef: 'feature.md', sourceSha256: '3'.repeat(64), title: null,
    paragraphs: [{ anchor: 'line:1', text: quote }],
    acceptanceCriteria: [{ id: 'AC-1', text: quote, sourceAnchor: 'line:1', sourceQuote: quote }],
  })
  assert.equal(spec.requirements[0].statement, 'The report export is reliable')
  assert.equal(spec.requirements[0].scenario, null)
  assert.ok(spec.ambiguities.some((entry) => entry.code === 'UNSTRUCTURED_ACCEPTANCE_CRITERION'))
})

check('canonical offline Confluence baseline conserves all 19 criteria and quotes', () => {
  const baselinePath = path.join(root, '.claude', 'assurance', 'baselines', 'us-ad-095-progress-reports.spec-ir.json')
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as SemanticSourceInput
  const spec = normalizeSemanticSpec(baseline)
  assert.equal(spec.requirements.length, 19)
  assert.equal(spec.sourceDocuments[0].sourceSha256, '0ad01bee97a2d662654b98aea6d6f4a260cfd8d011beab8bedc47b595a937efc')
  for (const [index, requirement] of spec.requirements.entries()) {
    const source = baseline.acceptanceCriteria[index]
    assert.equal(requirement.id, source.id)
    assert.equal(requirement.provenance[0].anchor, source.sourceAnchor)
    assert.equal(requirement.provenance[0].quote, source.sourceQuote)
  }
})

check('JSON Schema declares the exact public version and closed top-level shape', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'schemas', 'semantic-spec.schema.json'), 'utf8'))
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(schema.properties.schemaVersion.const, '1.0.0')
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.$defs.contract.properties.state.enum, ['known', 'unknown', 'conflict'])
})

attack('a fabricated source quote cannot enter normalization', () => normalizeSemanticSpec({
  ...fixture.cases[0].input,
  acceptanceCriteria: [{ ...fixture.cases[0].input.acceptanceCriteria[0], sourceQuote: 'fabricated quote' }],
}), /provenance does not resolve literally/)

attack('a fabricated contract observation cannot enter normalization', () => normalizeSemanticSpec({
  ...fixture.cases[0].input,
  contractObservations: [{ key: 'api.contract', value: 'GET /api/reports', sourceAnchor: 'line:12', sourceQuote: 'invented contract' }],
}), /contract observation .* provenance does not resolve literally/)

attack('duplicate acceptance IDs fail closed', () => normalizeSemanticSpec({
  ...fixture.cases[0].input,
  acceptanceCriteria: [fixture.cases[0].input.acceptanceCriteria[0], fixture.cases[0].input.acceptanceCriteria[0]],
}), /duplicate acceptance criterion/)

attack('a guessed value cannot masquerade as an unknown contract', () => {
  const forged = structuredClone(confluence) as any
  forged.contracts[0].values = ['GET /guessed']
  validateSemanticSpec(forged)
}, /unknown contract .* cannot carry guessed values|semanticHash mismatch/)

attack('required unknown ambiguity cannot be removed', () => {
  const forged = structuredClone(confluence)
  forged.ambiguities = []
  validateSemanticSpec(forged)
}, /unknown contract .* requires API_CONTRACT_UNSPECIFIED ambiguity/)

attack('semantic hash tampering fails closed', () => {
  const forged = structuredClone(confluence)
  forged.semanticHash = '0'.repeat(64)
  validateSemanticSpec(forged)
}, /semanticHash mismatch/)

attack('provenance hash tampering fails closed', () => {
  const forged = structuredClone(confluence)
  forged.provenanceHash = '0'.repeat(64)
  validateSemanticSpec(forged)
}, /provenanceHash mismatch/)

attack('undeclared source provenance fails closed', () => {
  const forged = structuredClone(confluence)
  forged.requirements[0].provenance[0].sourceRef = 'jira:invented'
  validateSemanticSpec(forged)
}, /undeclared source document/)

attack('extra document fields fail closed', () => validateSemanticSpec({ ...confluence, inferredApi: true }), /fields must be exactly/)

attack('lossy cross-source transform fails field conservation', () => assertSemanticFieldConservation(confluence, jira), /lost or changed conserved fields/)

attack('invalid JSON fails with a stable error', () => parseSemanticSpec('{bad'), /input is not valid JSON/)

attack('empty criteria fail closed', () => normalizeSemanticSpec({ ...fixture.cases[0].input, acceptanceCriteria: [] }), /at least one acceptance criterion/)

console.log(`semantic-spec: ${assertions} assertions and ${attacks} attacks passed`)
