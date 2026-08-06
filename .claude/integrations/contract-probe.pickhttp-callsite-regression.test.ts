/**
 * contract-probe.pickhttp-callsite-regression.test.ts — f2-resolver-hardening ripple check.
 *
 * pickHttpFile/resolveContractHttp now throw AmbiguousHttpFileError on an ambiguous multi-.http
 * dir (see contract-probe.pickhttp-ambiguous.test.ts). Two callers each already had their own
 * "unresolvable contract" fallback path, established and tested before this change:
 *   - d-cross-2.ts reconcileFeature(): typed ReconcileResult, cause 'missing-declared-contract'
 *   - playwright-runner.ts resolveFeatureEndpoints(): httpFile='' -> deriveFeatureEndpoints('', ...)
 * These tests prove an ambiguous dir now degrades into that SAME existing fallback instead of
 * throwing out of the caller uncaught. (b11-runner.ts's runContractProbe() is CLI-only/unexported,
 * consistent with this repo's existing test boundary for that file — verified by code reading, not
 * a unit test here.)
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/contract-probe.pickhttp-callsite-regression.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reconcileFeature } from './d-cross-2';
import { resolveFeatureEndpoints, EndpointDerivationError } from './playwright-runner';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

function makeAmbiguousComponentsDir(): { tmp: string; comp: string; specs: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cprobe-callsite-'));
  const comp = path.join(tmp, 'docs', 'components', 'Feat');
  const specs = path.join(tmp, 'docs', 'specs', 'Feat');
  fs.mkdirSync(comp, { recursive: true });
  fs.mkdirSync(specs, { recursive: true });
  fs.writeFileSync(path.join(comp, 'A.full.http'), '# a');
  fs.writeFileSync(path.join(comp, 'B.full.http'), '# b');
  return { tmp, comp, specs };
}

test('reconcileFeature: ambiguous components dir degrades to missing-declared-contract, does not throw', () => {
  const { tmp, comp, specs } = makeAmbiguousComponentsDir();
  try {
    const apiPath = path.join(tmp, 'api.ts');
    const typesPath = path.join(tmp, 'types.ts');
    fs.writeFileSync(apiPath, 'export const x = 1;');
    fs.writeFileSync(typesPath, 'export interface X {}');

    const result = reconcileFeature({
      apiPath, typesPath, feature: 'Feat',
      componentsDir: comp, specsDir: specs,
    });
    assert(result.verdict === 'error', `expected a typed error result, got: ${JSON.stringify(result)}`);
    assert(result.reason === 'missing-declared-contract',
      `expected reason 'missing-declared-contract' (the pre-existing unresolvable-contract fallback), got: ${JSON.stringify(result)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveFeatureEndpoints: ambiguous components dir degrades to the SAME EndpointDerivationError as any other unresolvable-.http case (not AmbiguousHttpFileError, not an unhandled throw)', () => {
  const { tmp, comp, specs } = makeAmbiguousComponentsDir();
  try {
    // resolveFeatureEndpoints resolves docs/components/<featureName> and docs/specs/<featureName>
    // relative to process.cwd() — point cwd at tmp for this call only.
    const prevCwd = process.cwd();
    process.chdir(tmp);
    try {
      let threw = false;
      try {
        resolveFeatureEndpoints('Feat', undefined, { dataGate: true });
      } catch (e) {
        threw = true;
        assert(e instanceof EndpointDerivationError,
          `expected the pre-existing EndpointDerivationError (same as any other unresolvable-.http case), got ${(e as Error)?.constructor?.name}: ${(e as Error).message}`);
      }
      assert(threw, 'expected resolveFeatureEndpoints to fail closed via its own established error path');
    } finally {
      process.chdir(prevCwd);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
