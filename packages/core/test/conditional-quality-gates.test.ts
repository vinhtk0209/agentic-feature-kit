import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inspectProject, ProjectProfile } from '../src/project-intelligence'
import {
  CONDITIONAL_GATES_SENTINEL,
  ConditionalGateRequest,
  evaluateConditionalQualityGates,
  validateConditionalGateResult,
} from '../src/conditional-quality-gates'

interface Fixture { files: Record<string, string> }

const repositoryRoot = process.cwd()
const fixturesRoot = path.join(repositoryRoot, '.claude', 'integrations', 'fixtures', 'project-intelligence')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'conditional-quality-gates-'))
let assertions = 0
let attacks = 0

function fixture(name: string): Fixture {
  return JSON.parse(fs.readFileSync(path.join(fixturesRoot, `${name}.json`), 'utf8')) as Fixture
}

function profile(name: string, value: Fixture = fixture(name)): ProjectProfile {
  const root = path.join(scratch, name)
  fs.mkdirSync(root, { recursive: true })
  for (const [relative, content] of Object.entries(value.files)) {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  return inspectProject(root)
}

function request(project: ProjectProfile, overrides: Partial<ConditionalGateRequest['feature']> = {}): ConditionalGateRequest {
  return {
    profile: structuredClone(project),
    feature: {
      changeScope: 'ui',
      desiredRoute: '/reports',
      files: [
        { path: 'src/reports/messages.ts', content: "import { defineMessages } from 'react-intl'; export const messages = defineMessages({ title: { id: 'reports.title', defaultMessage: 'Reports' } })" },
        { path: 'src/reports/ReportsPage.tsx', content: "import styled from 'styled-components'; import { useIntl } from 'react-intl'; const Root = styled.main``; export function Reports(){ const { formatMessage } = useIntl(); return <Root>{formatMessage({id:'reports.title'})}</Root> }" },
        { path: 'src/routes.tsx', content: "export const routes = [{ path: '/reports', element: 'Reports' }]" },
      ],
      ...overrides,
    },
  }
}

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

try {
  const react = profile('react-web')
  const noI18n = profile('no-i18n')
  const vue = profile('vue')
  const conflict = profile('contradictory-router')
  const unknown = profile('unknown', { files: { 'package.json': '{"dependencies":{}}', 'package-lock.json': '{}' } })

  const passing = evaluateConditionalQualityGates(request(react))
  check('detected React i18n, router, and CSS-in-JS gates pass with cited evidence', () => {
    assert.equal(passing.status, 'pass')
    assert.deepEqual(passing.gates.map((gate) => [gate.id, gate.status]), [
      ['i18n-completeness', 'pass'], ['router-registration', 'pass'], ['style-ownership', 'pass'],
    ])
    assert.ok(passing.gates.every((gate) => gate.evidence.length > 0))
    assert.ok(passing.gates[2].evidence.includes('feature-file:src/reports/ReportsPage.tsx'))
  })

  check('i18n-enabled project fails when feature messages and usage are absent', () => {
    const result = evaluateConditionalQualityGates(request(react, {
      files: [
        { path: 'src/reports/ReportsPage.tsx', content: "import styled from 'styled-components'; const Root = styled.main``; export const Reports = () => <Root>Reports</Root>" },
        { path: 'src/routes.tsx', content: "export const routes = [{ path: '/reports' }]" },
      ],
    }))
    assert.equal(result.status, 'fail')
    assert.deepEqual(result.gates[0].findings, ['i18n-message-source-missing', 'i18n-usage-missing'])
  })

  check('i18n-absent project disables only the i18n gate', () => {
    const result = evaluateConditionalQualityGates(request(noI18n, {
      files: [
        { path: 'src/reports/ReportsPage.tsx', content: "export const Reports = () => <main className='grid'>Reports</main>" },
        { path: 'src/routes.tsx', content: "export const routes = [{ path: '/reports' }]" },
      ],
    }))
    assert.equal(result.status, 'pass', JSON.stringify(result.gates))
    assert.deepEqual(result.gates.map((gate) => gate.status), ['not_applicable', 'pass', 'pass'])
    assert.ok(result.gates[0].evidence.includes('project-profile:gates.i18n=false'))
  })

  check('registered and unregistered routes produce distinct evidence-backed verdicts', () => {
    const result = evaluateConditionalQualityGates(request(react, {
      desiredRoute: '/missing',
    }))
    assert.equal(result.status, 'fail')
    assert.equal(result.gates[1].status, 'fail')
    assert.deepEqual(result.gates[1].findings, ['route-registration-missing'])
    assert.ok(result.gates[1].evidence.includes('feature-change:desired-route=/missing'))
  })

  check('SCSS project accepts owned SCSS without requiring CSS-in-JS', () => {
    const result = evaluateConditionalQualityGates(request(vue, {
      desiredRoute: '/catalog',
      files: [
        { path: 'src/catalog/i18n/en.json', content: '{"title":"Catalog"}' },
        { path: 'src/catalog/CatalogPage.vue', content: "<template><main>{{ $t('title') }}</main></template><script>import { useI18n } from 'vue-i18n'</script>" },
        { path: 'src/router.ts', content: "export const routes = [{ path: '/catalog' }]" },
        { path: 'src/catalog/CatalogPage.scss', content: '.catalog { display: grid; }' },
      ],
    }))
    assert.equal(result.status, 'pass', JSON.stringify(result.gates))
    assert.equal(result.gates[2].status, 'pass')
    assert.ok(result.gates[2].evidence.includes('feature-file:src/catalog/CatalogPage.scss'))
  })

  check('conflicting and unknown Project Profiles fail closed before feature claims', () => {
    for (const project of [conflict, unknown]) {
      const result = evaluateConditionalQualityGates(request(project))
      assert.equal(result.status, 'needs_input')
      assert.ok(result.gates.every((gate) => gate.status === 'needs_input'))
      assert.ok(result.gates.every((gate) => gate.evidence.some((entry) => entry.startsWith('project-profile:issue:'))))
    }
  })

  check('explicit non-UI scope makes all three UI gates non-applicable', () => {
    const result = evaluateConditionalQualityGates(request(react, { changeScope: 'non-ui', desiredRoute: null, files: [] }))
    assert.equal(result.status, 'pass')
    assert.ok(result.gates.every((gate) => gate.status === 'not_applicable' && gate.applicable === false))
    assert.ok(result.gates.every((gate) => gate.evidence.includes('feature-change:scope=non-ui')))
  })

  check('result is deterministic, hash-validated, and schema is closed', () => {
    assert.deepEqual(evaluateConditionalQualityGates(request(react)), passing)
    assert.deepEqual(validateConditionalGateResult(structuredClone(passing)), passing)
    const schema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'docs', 'schemas', 'conditional-quality-gates.schema.json'), 'utf8'))
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(schema.additionalProperties, false)
  })

  check('source CLI emits one envelope and uses verdict exit codes', () => {
    const tsxCli = path.join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
    const child = spawnSync(process.execPath, [tsxCli, 'packages/core/src/conditional-quality-gates.ts'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      input: JSON.stringify(request(react)),
      shell: false,
    })
    assert.equal(child.status, 0, child.stderr)
    const lines = child.stdout.trim().split(/\r?\n/)
    assert.equal(lines.length, 1)
    assert.ok(lines[0].startsWith(CONDITIONAL_GATES_SENTINEL))
    assert.deepEqual(validateConditionalGateResult(JSON.parse(lines[0].slice(CONDITIONAL_GATES_SENTINEL.length))), passing)
  })

  attack('forged Project Profile fingerprint is rejected', () => {
    const forged = request(react)
    forged.profile.repository.fingerprint = '0'.repeat(64)
    evaluateConditionalQualityGates(forged)
  }, /profile fingerprint mismatch/)

  attack('path traversal evidence is rejected', () => evaluateConditionalQualityGates(request(react, {
    files: [{ path: '../routes.tsx', content: "path: '/reports'" }],
  })), /must stay inside the feature evidence root/)

  attack('duplicate file evidence is rejected', () => evaluateConditionalQualityGates(request(react, {
    files: [{ path: 'src/a.tsx', content: '' }, { path: 'src/a.tsx', content: '' }],
  })), /duplicate feature file/)

  attack('extra request fields fail closed', () => evaluateConditionalQualityGates({ ...request(react), providerOverride: true }), /request fields must be exactly/)

  attack('missing desired route needs input instead of passing', () => {
    const result = evaluateConditionalQualityGates(request(react, { desiredRoute: null }))
    assert.equal(result.status, 'needs_input')
    throw new Error(result.gates[1].findings.join(','))
  }, /desired-route-missing/)

  attack('result hash tampering is rejected', () => {
    const forged = structuredClone(passing)
    forged.resultHash = '0'.repeat(64)
    validateConditionalGateResult(forged)
  }, /resultHash mismatch/)

  attack('a gate cannot drop all evidence', () => {
    const forged = structuredClone(passing)
    forged.gates[0].evidence = []
    validateConditionalGateResult(forged)
  }, /must cite evidence/)

  attack('overall status cannot contradict gate decisions', () => {
    const forged = structuredClone(passing)
    forged.status = 'fail'
    validateConditionalGateResult(forged)
  }, /status does not match gate decisions/)

  console.log(`conditional-quality-gates: ${assertions} assertions and ${attacks} attacks passed`)
} finally {
  fs.rmSync(scratch, { recursive: true, force: true })
}
