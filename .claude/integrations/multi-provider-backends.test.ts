/**
 * Offline attack suite for I2-A. Adapters, capability probes, execution, and gates are injected;
 * it never launches a provider CLI, contacts a provider, reads credentials, or writes a bundle.
 */
import * as assert from 'assert';
import { normalizeConfig } from './model-config';
import {
  ProviderRegistry,
  backendKey,
  createEvidenceBinding,
  identityFromModelConfig,
  normalizeCost,
  verifyEvidenceBinding,
  type ProviderAdapter,
} from './multi-provider-backends';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const cfg = normalizeConfig({
  primary: 'claude',
  models: {
    claude: { id: 'claude-fixture', provider: 'claude' },
    'claude-fast': { id: 'claude-fast-fixture', provider: 'claude' },
    codex: { id: 'codex-fixture', provider: 'codex' },
  },
});

function adapter(modelKey = 'codex', output = 'plausible but wrong diff'): ProviderAdapter {
  const identity = identityFromModelConfig(cfg, modelKey, 'fixture-v1');
  return {
    identity,
    async capabilityProbe() { return { provider: identity.provider, capabilities: ['execute-phase', 'evidence-binding'] }; },
    async executePhase() { return { output }; },
  };
}

async function main() {
  await test('untrusted backend cannot execute even when an adapter is registered', async () => {
    const registry = new ProviderRegistry();
    let executed = false;
    const candidate: ProviderAdapter = { ...adapter(), async executePhase() { executed = true; return { output: 'x' }; } };
    registry.register(candidate);
    await assert.rejects(() => registry.execute(backendKey(candidate.identity), 'same prompt', async () => ({ passed: true, detail: 'should not run' })), /not trusted/);
    assert.equal(executed, false);
  });

  await test('two trusted backend keys run the exact same gate and plausible wrong output fails without provider branching', async () => {
    const claude = adapter('claude', 'looks polished but omits AC-07');
    const codex = adapter('codex', 'looks polished but omits AC-07');
    const registry = new ProviderRegistry([claude, codex]);
    const claudeKey = backendKey(claude.identity);
    const codexKey = backendKey(codex.identity);
    await registry.trust(claudeKey);
    await registry.trust(codexKey);
    const seen: string[] = [];
    const sameGate = async (output: string) => {
      seen.push(output);
      return { passed: !output.includes('omits AC-07'), detail: 'AC-07 missing' };
    };
    const [claudeResult, codexResult] = await Promise.all([
      registry.execute(claudeKey, 'same phase prompt', sameGate),
      registry.execute(codexKey, 'same phase prompt', sameGate),
    ]);
    assert.equal(claudeResult.gate.passed, false);
    assert.equal(codexResult.gate.passed, false);
    assert.deepEqual(seen, ['looks polished but omits AC-07', 'looks polished but omits AC-07']);
  });

  await test('two configured models from one provider coexist under non-aliasing backend keys', async () => {
    const standard = adapter('claude');
    const fast = adapter('claude-fast');
    const registry = new ProviderRegistry([standard, fast]);
    const standardKey = backendKey(standard.identity);
    const fastKey = backendKey(fast.identity);
    assert.notEqual(standardKey, fastKey);
    await registry.trust(standardKey);
    await registry.trust(fastKey);
    assert.equal(registry.getTrusted(standardKey)?.identity.modelKey, 'claude');
    assert.equal(registry.getTrusted(fastKey)?.identity.modelKey, 'claude-fast');
  });

  await test('runtime-malformed capability probes fail closed before trust', async () => {
    const candidate = adapter();
    const registry = new ProviderRegistry([candidate]);
    candidate.capabilityProbe = async () => ({ provider: 'codex', capabilities: ['execute-phase', ''] } as unknown as Awaited<ReturnType<ProviderAdapter['capabilityProbe']>>);
    const key = backendKey(candidate.identity);
    await assert.rejects(() => registry.trust(key), /probe is malformed/);
    assert.equal(registry.getTrusted(key), undefined);
  });

  await test('registered identity mutations and malformed execution output fail before the gate', async () => {
    const mutatedBeforeTrust = adapter();
    const preTrustRegistry = new ProviderRegistry([mutatedBeforeTrust]);
    const preTrustKey = backendKey(mutatedBeforeTrust.identity);
    mutatedBeforeTrust.identity.modelId = 'substituted-model';
    await assert.rejects(() => preTrustRegistry.trust(preTrustKey), /identity changed after registration/);

    const mutatedDuringTrust = adapter('claude');
    const duringTrustRegistry = new ProviderRegistry([mutatedDuringTrust]);
    const duringTrustKey = backendKey(mutatedDuringTrust.identity);
    mutatedDuringTrust.capabilityProbe = async () => {
      mutatedDuringTrust.identity.adapterVersion = 'substituted-adapter';
      return { provider: 'claude', capabilities: ['execute-phase', 'evidence-binding'] };
    };
    await assert.rejects(() => duringTrustRegistry.trust(duringTrustKey), /identity changed after registration/);

    let gated = false;
    const malformedOutput = adapter();
    const outputRegistry = new ProviderRegistry([malformedOutput]);
    const outputKey = backendKey(malformedOutput.identity);
    malformedOutput.executePhase = async () => ({ output: 42 } as unknown as { output: string });
    await outputRegistry.trust(outputKey);
    await assert.rejects(() => outputRegistry.execute(outputKey, 'same phase prompt', async () => {
      gated = true;
      return { passed: true, detail: 'must not execute' };
    }), /execution output is malformed/);
    assert.equal(gated, false);

    let costGated = false;
    const malformedCost = adapter();
    const costRegistry = new ProviderRegistry([malformedCost]);
    const costKey = backendKey(malformedCost.identity);
    malformedCost.executePhase = async () => ({ output: 'x', cost: { status: 'known', inputTokens: 0.5, outputTokens: 0, costUsd: 0 } as never });
    await costRegistry.trust(costKey);
    await assert.rejects(() => costRegistry.execute(costKey, 'same phase prompt', async () => {
      costGated = true;
      return { passed: true, detail: 'must not execute' };
    }), /execution cost is malformed/);
    assert.equal(costGated, false);
  });

  await test('backend identity binding is tamper-evident and immutable by hash verification', async () => {
    const registry = new ProviderRegistry([adapter()]);
    const trusted = await registry.trust(backendKey(adapter().identity));
    const binding = createEvidenceBinding({ trusted, cost: normalizeCost(undefined) });
    assert.equal(verifyEvidenceBinding(binding), true);
    const forged = { ...binding, identity: { ...binding.identity, provider: 'claude' } };
    assert.equal(verifyEvidenceBinding(forged), false, 'provider replacement must invalidate binding hash');
    assert.throws(() => createEvidenceBinding({ trusted: { ...trusted, capabilityHash: 'not-a-sha256' }, cost: normalizeCost(undefined) }), /capability hash/);
    assert.equal(verifyEvidenceBinding({ ...binding, capabilityHash: 'not-a-sha256' }), false);
  });

  await test('missing backend cost remains explicit unknown/null, never fabricated zero', () => {
    const unknown = normalizeCost(undefined);
    assert.deepEqual(unknown, { status: 'unknown', inputTokens: null, outputTokens: null, costUsd: null });
    const measuredZero = normalizeCost({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
    assert.equal(measuredZero.status, 'known', 'reported zero is distinct from unmeasured');
    assert.throws(() => normalizeCost({ inputTokens: 0.5, outputTokens: 0, costUsd: 0 }), /malformed/);
    assert.throws(() => normalizeCost({ inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 0, costUsd: 0 }), /malformed/);
    assert.throws(() => normalizeCost({ inputTokens: 0, outputTokens: 0, costUsd: Number.NaN }), /malformed/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
