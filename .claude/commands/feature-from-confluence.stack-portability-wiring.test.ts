import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const command = fs.readFileSync(path.join(root, '.claude', 'commands', 'feature-from-confluence.md'), 'utf8')
const agentBuild = fs.readFileSync(path.join(root, '.claude', '_content', 'agent-build.md'), 'utf8')
const templates = fs.readFileSync(path.join(root, '.claude', '_content', 'templates.md'), 'utf8')

const checks: Array<[string, () => void]> = [
  ['flagship runs the synced Project Intelligence launcher', () => assert.match(command, /npx tsx \.claude\/integrations\/project-intelligence\.ts \./)],
  ['flagship runs the synced Stack Portability launcher', () => assert.match(command, /npx tsx \.claude\/integrations\/stack-portability\.ts \./)],
  ['flagship accepts only the two canonical sentinels', () => {
    assert.match(command, /@@PROJECT_PROFILE@@/)
    assert.match(command, /@@STACK_PORTABILITY@@/)
  }],
  ['flagship binds portability output to the Project Profile fingerprint', () => assert.match(command, /profileFingerprint.*repository\.fingerprint|repository\.fingerprint.*profileFingerprint/s)],
  ['needs_input stops before planning', () => assert.match(command, /STACK_PORTABILITY\.status === "needs_input"[\s\S]{0,300}STOP/)],
  ['legacy query-library framework derivation is absent', () => {
    assert.doesNotMatch(command, /Derive framework from PROJECT_CTX\.query_library/)
    assert.doesNotMatch(command, /anything else\s+→ framework = PROJECT_CTX\.query_library value/)
    assert.doesNotMatch(command, /PROJECT_CTX\./)
  }],
  ['invented HTTP and transform fallbacks are absent', () => {
    assert.doesNotMatch(command, /fallback: yourHttpClient\(\)/)
    assert.doesNotMatch(command, /Fallbacks: yourHttpClient\(\) \| transformResponse\(data\)/)
  }],
  ['agent build consumes validated portability decisions', () => {
    assert.match(agentBuild, /STACK_PORTABILITY\.framework/)
    assert.match(agentBuild, /STACK_PORTABILITY\.conventions\.http/)
    assert.doesNotMatch(agentBuild, /HTTP: \{\{PROJECT_CTX\.http_client\}\}/)
    assert.doesNotMatch(agentBuild, /RESPONSES: \{\{PROJECT_CTX\.response_transform\}\}/)
  }],
  ['template guidance uses the named-mapper policy without a target helper default', () => {
    assert.match(templates, /STACK_PORTABILITY\.conventions\.mappingPolicy/)
    assert.doesNotMatch(templates, /PROJECT_CTX\.http_client used/)
  }],
  ['package and branch decisions remain evidence-bound', () => {
    assert.doesNotMatch(command, /recommend per framework default/)
    assert.match(command, /Do not install or select a[\s\S]{0,80}"framework default" automatically/)
    assert.match(command, /current branch's configured upstream/)
    assert.doesNotMatch(command, /Confirm branch to pull from: \[develop\]/)
  }],
]

let passed = 0
for (const [name, check] of checks) {
  check()
  passed += 1
  console.log(`PASS ${name}`)
}
console.log(`stack-portability-wiring.test: ${passed} assertions passed`)
