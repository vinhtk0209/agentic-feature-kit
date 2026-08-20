import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getC5BConnectionMaterialProcessEnvironments,
  isC5BConnectionMaterialQualificationBound,
  isC5BConnectionMaterialQualificationCurrent,
  qualifyC5BConnectionMaterial,
  type C5BConnectionMaterialBinding,
  type C5BConnectionMaterialQualification,
  type C5BConnectionMaterialQualificationConfig,
} from '../src/live-cutover-connection-material-qualification-node'

const sourceService = 'source_db'
const isolatedService = 'restore_db'
const recipient = `age1${'q'.repeat(58)}`
const identityPrefix = ['AGE', 'SECRET', 'KEY', '1'].join('-')
const identity = `${identityPrefix}${'Q'.repeat(58)}`
const rawSecretControl = 'synthetic-credential-must-never-escape'

const serviceText = [
  `[${sourceService}]`,
  'host=source.example.invalid',
  'port=5432',
  'dbname=postgres',
  'user=backup_user',
  'sslmode=verify-full',
  'sslrootcert=system',
  'connect_timeout=5',
  '',
  `[${isolatedService}]`,
  'host=127.0.0.1',
  'port=55432',
  'dbname=restore',
  'user=restore_user',
  'sslmode=verify-full',
  'sslrootcert=system',
  'connect_timeout=5',
  '',
].join('\n')

const passText = [
  `source.example.invalid:5432:postgres:backup_user:${rawSecretControl}`,
  `127.0.0.1:55432:restore:restore_user:${rawSecretControl}-isolated`,
  '',
].join('\n')

interface Fixture {
  readonly config: C5BConnectionMaterialQualificationConfig
  readonly binding: C5BConnectionMaterialBinding
  readonly paths: {
    readonly destination: string
    readonly service: string
    readonly pass: string
    readonly recipients: string
    readonly identity: string
  }
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function writeFixture(
  root: string,
  overrides: {
    readonly serviceText?: string
    readonly passText?: string
    readonly recipientsText?: string
    readonly identityText?: string
    readonly platform?: NodeJS.Platform
    readonly environmentSource?: NodeJS.ProcessEnv
  } = {},
): Fixture {
  const material = path.join(root, 'material')
  const destination = path.join(root, 'protected')
  fs.mkdirSync(material, { recursive: true, mode: 0o700 })
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 })
  const service = path.join(material, 'pg_service.conf')
  const pass = path.join(material, 'pgpass.conf')
  const recipients = path.join(material, 'recipients.txt')
  const identityPath = path.join(material, 'identity.txt')
  fs.writeFileSync(service, overrides.serviceText ?? serviceText, { mode: 0o600 })
  fs.writeFileSync(pass, overrides.passText ?? passText, { mode: 0o600 })
  fs.writeFileSync(recipients, overrides.recipientsText ?? `${recipient}\n`, { mode: 0o600 })
  fs.writeFileSync(identityPath, overrides.identityText ?? `# synthetic fixture\n${identity}\n`, { mode: 0o600 })
  if (process.platform !== 'win32') {
    for (const file of [service, pass, recipients, identityPath]) fs.chmodSync(file, 0o600)
    fs.chmodSync(destination, 0o700)
  }
  const expected = (filePath: string) => ({
    path: filePath,
    sha256: sha256(fs.readFileSync(filePath)),
    maxBytes: 64 * 1024,
  })
  const platform = overrides.platform ?? process.platform
  const config: C5BConnectionMaterialQualificationConfig = {
    destinationCapabilityId: 'protected_backup',
    destinationDirectory: destination,
    sourceServiceCapability: sourceService,
    isolatedServiceCapability: isolatedService,
    pgServiceFile: expected(service),
    pgPassFile: expected(pass),
    recipientsFile: expected(recipients),
    identityFile: expected(identityPath),
    qualificationTtlMs: 3_600_000,
    maxQualificationTtlMs: 7_200_000,
    now: () => '2026-08-20T01:00:00.000Z',
    platform,
    environmentSource: overrides.environmentSource ?? {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
    },
  }
  const binding: C5BConnectionMaterialBinding = {
    destinationCapabilityId: config.destinationCapabilityId,
    destinationDirectory: config.destinationDirectory,
    sourceServiceCapability: config.sourceServiceCapability,
    isolatedServiceCapability: config.isolatedServiceCapability,
    pgServiceFile: config.pgServiceFile.path,
    pgPassFile: config.pgPassFile.path,
    recipientsFile: config.recipientsFile.path,
    identityFile: config.identityFile.path,
  }
  return { config, binding, paths: { destination, service, pass, recipients, identity: identityPath } }
}

async function qualifyFixture(fixture: Fixture): Promise<C5BConnectionMaterialQualification> {
  const result = await qualifyC5BConnectionMaterial(fixture.config)
  assert.equal(result.status, 'qualified')
  if (result.status !== 'qualified') throw new Error('synthetic qualification refused')
  return result.capability
}

let passed = 0
let failed = 0
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  FAIL ${name}`)
    console.error(error)
  }
}

async function main(): Promise<void> {
  const canonicalTempRoot = fs.realpathSync.native(os.tmpdir())
  const scratch = fs.mkdtempSync(path.join(canonicalTempRoot, 'c5b-connection-material-'))

  await test('qualifies exact material into frozen metadata-only capability and receipt', async () => {
    const fixture = writeFixture(path.join(scratch, 'success'))
    const result = await qualifyC5BConnectionMaterial(fixture.config)
    assert.equal(result.status, 'qualified')
    if (result.status !== 'qualified') return
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.capability), true)
    assert.equal(Object.isFrozen(result.receipt), true)
    assert.deepEqual(Object.keys(result.capability).sort(), ['kind', 'receiptHash'])
    assert.deepEqual(Object.keys(result.receipt).sort(), [
      'schemaVersion', 'policyVersion', 'bindingHash', 'fileCount', 'serviceCount', 'recipientCount',
      'qualifiedAt', 'expiresAt', 'destinationIdentityHash', 'receiptHash',
    ].sort())
    assert.equal(result.receipt.fileCount, 4)
    assert.equal(result.receipt.serviceCount, 2)
    assert.equal(result.receipt.recipientCount, 1)
    const serialized = JSON.stringify(result)
    for (const prohibited of [
      fixture.paths.service, fixture.paths.pass, fixture.paths.recipients, fixture.paths.identity,
      sourceService, isolatedService, 'source.example.invalid', 'backup_user', rawSecretControl,
      recipient, identity,
    ]) assert.equal(serialized.includes(prohibited), false)
    assert.equal(isC5BConnectionMaterialQualificationBound(result.capability, fixture.binding), true)
  })

  await test('builds separate explicit environments and removes every ambient redirect', async () => {
    const fixture = writeFixture(path.join(scratch, 'environment'), {
      platform: process.platform,
      environmentSource: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: 'ambient-path',
        HOME: 'ambient-home',
        USERPROFILE: 'ambient-profile',
        PGPASSWORD: rawSecretControl,
        PGSERVICEFILE: 'ambient-service',
        PGPASSFILE: 'ambient-pass',
        PGHOST: 'ambient-host',
        SUPABASE_SERVICE_ROLE_KEY: rawSecretControl,
        HTTPS_PROXY: 'ambient-proxy',
        NODE_OPTIONS: '--require attacker',
      },
    })
    const capability = await qualifyFixture(fixture)
    const environments = await getC5BConnectionMaterialProcessEnvironments(capability, {
      ...fixture.binding,
      observedAt: '2026-08-20T01:10:00.000Z',
    })
    assert.ok(environments)
    const runtimeBase = process.platform === 'win32'
      ? Object.fromEntries(Object.entries({ SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR })
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0))
      : {}
    assert.deepEqual(environments?.sourcePostgresql, {
      LANG: 'C',
      LC_ALL: 'C',
      ...runtimeBase,
      PGSERVICEFILE: fixture.paths.service,
      PGPASSFILE: fixture.paths.pass,
      PGCONNECT_TIMEOUT: '5',
    })
    assert.deepEqual(environments?.isolatedPostgresql, {
      LANG: 'C',
      LC_ALL: 'C',
      ...runtimeBase,
      PGSERVICEFILE: fixture.paths.service,
      PGPASSFILE: fixture.paths.pass,
      PGCONNECT_TIMEOUT: '5',
    })
    assert.deepEqual(environments?.age, {
      LANG: 'C', LC_ALL: 'C', ...runtimeBase,
    })
    assert.equal(Object.isFrozen(environments), true)
    assert.equal(Object.isFrozen(environments?.sourcePostgresql), true)
    assert.equal(Object.isFrozen(environments?.isolatedPostgresql), true)
    assert.equal(Object.isFrozen(environments?.age), true)
    assert.equal(JSON.stringify(environments).includes(rawSecretControl), false)
    if (process.platform === 'win32') {
      const spoofed = writeFixture(path.join(scratch, 'environment-spoof'), {
        platform: process.platform,
        environmentSource: {
          SystemRoot: `${process.env.SystemRoot ?? 'C:\\Windows'}-attacker`,
          WINDIR: process.env.WINDIR,
        },
      })
      assert.deepEqual(await qualifyC5BConnectionMaterial(spoofed.config), {
        status: 'refused', reasonCode: 'invalid_configuration',
      })
    }
  })

  await test('refuses invalid shape, aliases, collisions, missing, empty, oversized, and digest mismatch', async () => {
    const invalidRoot = path.join(scratch, 'invalid-files')
    const fixture = writeFixture(invalidRoot)
    const cases: unknown[] = [
      null,
      { ...fixture.config, extra: true },
      { ...fixture.config, sourceServiceCapability: isolatedService },
      { ...fixture.config, platform: 'unsupported' as NodeJS.Platform },
      { ...fixture.config, platform: (process.platform === 'win32' ? 'linux' : 'win32') as NodeJS.Platform },
      { ...fixture.config, destinationDirectory: path.parse(fixture.paths.destination).root },
      { ...fixture.config, pgPassFile: { ...fixture.config.pgPassFile, path: fixture.paths.service } },
      {
        ...fixture.config,
        pgServiceFile: {
          ...fixture.config.pgServiceFile,
          path: `${invalidRoot}${path.sep}material${path.sep}..${path.sep}material${path.sep}pg_service.conf`,
        },
      },
      { ...fixture.config, pgServiceFile: { ...fixture.config.pgServiceFile, path: path.join(invalidRoot, 'missing.conf') } },
      { ...fixture.config, pgServiceFile: { ...fixture.config.pgServiceFile, maxBytes: 1 } },
      { ...fixture.config, pgServiceFile: { ...fixture.config.pgServiceFile, sha256: '0'.repeat(64) } },
    ]
    const empty = writeFixture(path.join(scratch, 'empty'))
    fs.writeFileSync(empty.paths.recipients, '')
    cases.push({
      ...empty.config,
      recipientsFile: { ...empty.config.recipientsFile, sha256: sha256('') },
    })
    for (const value of cases) {
      const result = await qualifyC5BConnectionMaterial(value)
      assert.deepEqual(result, { status: 'refused', reasonCode: 'invalid_configuration' })
      assert.equal(JSON.stringify(result).includes(rawSecretControl), false)
    }
  })

  await test('refuses service redirection, missing or duplicate sections, weak transport, and equal coordinates', async () => {
    const mutations = [
      serviceText.replace(`[${sourceService}]`, '[missing_source]'),
      `${serviceText}\n[${sourceService}]\nhost=duplicate.example.invalid\n`,
      serviceText.replace('sslmode=verify-full', 'sslmode=prefer'),
      serviceText.replace('connect_timeout=5', 'connect_timeout=0'),
      serviceText.replace('user=backup_user', `password=${rawSecretControl}`),
      serviceText.replace('user=backup_user', 'passfile=other.conf'),
      serviceText.replace('user=backup_user', 'service=other_service'),
      serviceText.replace('user=backup_user', 'sslkey=unqualified.key'),
      `${serviceText}\n[extra_service]\nhost=extra.invalid\nport=5432\ndbname=extra\nuser=extra\nsslmode=verify-full\nsslrootcert=system\nconnect_timeout=5\n`,
      serviceText.replace('host=127.0.0.1', 'host=source.example.invalid')
        .replace('port=55432', 'port=5432')
        .replace('dbname=restore', 'dbname=postgres')
        .replace('user=restore_user', 'user=backup_user'),
    ]
    for (let index = 0; index < mutations.length; index += 1) {
      const fixture = writeFixture(path.join(scratch, `service-${index}`), { serviceText: mutations[index] })
      assert.deepEqual(await qualifyC5BConnectionMaterial(fixture.config), {
        status: 'refused', reasonCode: 'invalid_configuration',
      })
    }
  })

  await test('refuses wildcard, duplicate, malformed, empty, unmatched, or permission-wide pass records', async () => {
    const mutations = [
      passText.replace('source.example.invalid', '*'),
      `${passText.trim()}\n${passText.split('\n')[0]}\n`,
      passText.replace(`:${rawSecretControl}\n`, ':\n'),
      passText.replace('source.example.invalid:5432:postgres:backup_user', 'other.invalid:5432:postgres:backup_user'),
      passText.replace(':5432:', ':bad-port:'),
      ` ${passText.trim()}\n`,
      `${passText.trim()}\nextra.invalid:5432:db:user:password\n`,
    ]
    for (let index = 0; index < mutations.length; index += 1) {
      const fixture = writeFixture(path.join(scratch, `pass-${index}`), { passText: mutations[index] })
      assert.deepEqual(await qualifyC5BConnectionMaterial(fixture.config), {
        status: 'refused', reasonCode: 'invalid_configuration',
      })
    }
    if (process.platform !== 'win32') {
      const wide = writeFixture(path.join(scratch, 'pass-permissions'))
      fs.chmodSync(wide.paths.pass, 0o644)
      assert.deepEqual(await qualifyC5BConnectionMaterial(wide.config), {
        status: 'refused', reasonCode: 'invalid_configuration',
      })
      const wideIdentity = writeFixture(path.join(scratch, 'identity-permissions'))
      fs.chmodSync(wideIdentity.paths.identity, 0o644)
      assert.deepEqual(await qualifyC5BConnectionMaterial(wideIdentity.config), {
        status: 'refused', reasonCode: 'invalid_configuration',
      })
    }
  })

  await test('refuses recipient injection and identity substitution or multiplicity', async () => {
    const recipientMutations = [
      '',
      `${recipient}\n${recipient}\n`,
      `${recipient} --output leaked\n`,
      'ssh-ed25519 synthetic',
      '# comments are not accepted in the public recipient file\n',
    ]
    for (let index = 0; index < recipientMutations.length; index += 1) {
      const fixture = writeFixture(path.join(scratch, `recipient-${index}`), { recipientsText: recipientMutations[index] })
      assert.deepEqual(await qualifyC5BConnectionMaterial(fixture.config), {
        status: 'refused', reasonCode: 'invalid_configuration',
      })
    }
    const identityMutations = [
      `${recipient}\n`,
      `${identity}\n${identity}\n`,
      `${['-----BEGIN ', 'PRIVATE KEY-----'].join('')}\n${identity}\n`,
      `${identityPrefix}INVALID!\n`,
      `${identity}\u0000\n`,
    ]
    for (let index = 0; index < identityMutations.length; index += 1) {
      const fixture = writeFixture(path.join(scratch, `identity-${index}`), { identityText: identityMutations[index] })
      assert.deepEqual(await qualifyC5BConnectionMaterial(fixture.config), {
        status: 'refused', reasonCode: 'invalid_configuration',
      })
    }
  })

  await test('forged, stale, rollback-time, cross-config, and replaced capabilities fail closed', async () => {
    const fixture = writeFixture(path.join(scratch, 'currentness'))
    const capability = await qualifyFixture(fixture)
    assert.equal(await isC5BConnectionMaterialQualificationCurrent(capability, {
      ...fixture.binding, observedAt: '2026-08-20T01:10:00.000Z',
    }), true)
    assert.equal(isC5BConnectionMaterialQualificationBound({ ...capability }, fixture.binding), false)
    assert.equal(await isC5BConnectionMaterialQualificationCurrent(capability, {
      ...fixture.binding, observedAt: '2026-08-20T00:59:59.999Z',
    }), false)
    assert.equal(await isC5BConnectionMaterialQualificationCurrent(capability, {
      ...fixture.binding, observedAt: '2026-08-20T02:00:00.001Z',
    }), false)
    assert.equal(isC5BConnectionMaterialQualificationBound(capability, {
      ...fixture.binding, sourceServiceCapability: 'other_source',
    }), false)
    fs.writeFileSync(fixture.paths.identity, `${identity}\n# replaced\n`)
    assert.equal(await isC5BConnectionMaterialQualificationCurrent(capability, {
      ...fixture.binding, observedAt: '2026-08-20T01:20:00.000Z',
    }), false)
    assert.equal(await getC5BConnectionMaterialProcessEnvironments(capability, {
      ...fixture.binding, observedAt: '2026-08-20T01:21:00.000Z',
    }), null)
    if (process.platform !== 'win32') {
      const permissionFixture = writeFixture(path.join(scratch, 'currentness-permissions'))
      const permissionCapability = await qualifyFixture(permissionFixture)
      fs.chmodSync(permissionFixture.paths.identity, 0o644)
      assert.equal(await isC5BConnectionMaterialQualificationCurrent(permissionCapability, {
        ...permissionFixture.binding, observedAt: '2026-08-20T01:10:00.000Z',
      }), false)
    }
  })

  await test('runtime source denies process, network, provider, raw logging, and broad deletion', () => {
    const source = fs.readFileSync(path.join(
      process.cwd(), 'packages', 'core', 'src', 'live-cutover-connection-material-qualification-node.ts',
    ), 'utf8')
    for (const forbidden of [
      /\bspawn(?:Sync)?\s*\(/,
      /(?:^|[^.A-Za-z0-9_])exec(?:File|Sync)?\s*\(/m,
      /\bfetch\s*\(/,
      /@supabase|createClient\s*\(/,
      /console\.(?:log|error|warn)\s*\(/,
      /rmSync\([^\n]+recursive\s*:\s*true/,
    ]) assert.doesNotMatch(source, forbidden)
    assert.match(source, /WeakMap/)
    assert.match(source, /readonly files: readonly FileSnapshot\[\]/)
    assert.doesNotMatch(source, /readonly files: readonly ReadFileSnapshot\[\]/)
    assert.match(source, /current\.mode === expected\.mode/)
    assert.match(source, /realpathSync\.native/)
    assert.match(source, /createReadStream/)
  })

  fs.rmSync(scratch, { recursive: true, force: true })
  if (failed > 0) {
    console.error(`C5B connection-material qualification: FAIL (${failed} failed, ${passed} passed)`)
    process.exit(1)
  }
  console.log(`C5B connection-material qualification: PASS (${passed} groups)`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
