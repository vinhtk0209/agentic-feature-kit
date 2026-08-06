/**
 * contract-probe.pickhttp-ambiguous.test.ts — attack-suite for f2-resolver-hardening.
 *
 * pickHttpFile silently picked the first array match on ambiguous multi-.http directories
 * (Array.find order, effectively fs.readdirSync order — not a meaningful selection signal).
 * These tests prove the fail-closed replacement: ambiguous tiers throw a typed error listing
 * candidates, unless a single explicit ".primary.http"/".primary.full.http" marker resolves it.
 *
 * Standalone, no jest. Run:  npx tsx .claude/integrations/contract-probe.pickhttp-ambiguous.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pickHttpFile, resolveContractHttp, AmbiguousHttpFileError } from './contract-probe';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
function assertThrows(fn: () => void, msgSub: string, label: string) {
  try {
    fn();
  } catch (e) {
    assert(e instanceof AmbiguousHttpFileError, `${label}: expected AmbiguousHttpFileError, got ${(e as Error)?.constructor?.name}: ${(e as Error).message}`);
    assert((e as Error).message.includes(msgSub), `${label}: expected message to include "${msgSub}", got: ${(e as Error).message}`);
    return;
  }
  throw new Error(`${label}: expected pickHttpFile to throw, it returned normally`);
}

// ─── Tier 1 ambiguity: multiple *.full.http, no primary marker ────────────────────────────

test('T1 — two *.full.http candidates, no marker → fail-closed', () => {
  assertThrows(() => pickHttpFile(['A.full.http', 'B.full.http']), 'A.full.http', 'T1');
});

test('T1b — thrown error lists every ambiguous candidate', () => {
  try {
    pickHttpFile(['A.full.http', 'B.full.http', 'C.full.http']);
    throw new Error('expected throw');
  } catch (e) {
    const msg = (e as Error).message;
    for (const f of ['A.full.http', 'B.full.http', 'C.full.http']) {
      assert(msg.includes(f), `candidate list must include ${f}: ${msg}`);
    }
  }
});

// ─── Tier 2 ambiguity: no *.full.http, multiple plain *.http, no marker ───────────────────

test('T2 — two plain *.http candidates (no .full.http present), no marker → fail-closed', () => {
  assertThrows(() => pickHttpFile(['legacy.http', 'old.http']), 'legacy.http', 'T2');
});

// ─── Not ambiguous: existing single-candidate behavior unchanged ──────────────────────────

test('T3 — single *.full.http among plain *.http files → unambiguous, returns it (unchanged)', () => {
  assert(pickHttpFile(['a.http', 'b.full.http']) === 'b.full.http', 'must still prefer the lone *.full.http');
});

test('T3b — single plain *.http, no *.full.http → unambiguous, returns it (unchanged)', () => {
  assert(pickHttpFile(['only.http']) === 'only.http', 'must still fall back to the lone *.http');
});

test('T3c — no .http files at all → empty string (unchanged)', () => {
  assert(pickHttpFile(['notes.md', 'types.ts']) === '', 'no .http candidates → empty, no throw');
});

// ─── Explicit selection marker resolves ambiguity ──────────────────────────────────────────

test('T4 — ambiguous *.full.http set, exactly one carries .primary.full.http → marker wins, no throw', () => {
  const got = pickHttpFile(['A.full.http', 'B.primary.full.http', 'C.full.http']);
  assert(got === 'B.primary.full.http', `expected the primary-marked file to win, got "${got}"`);
});

test('T5 — ambiguous plain *.http set, exactly one carries .primary.http → marker wins, no throw', () => {
  const got = pickHttpFile(['legacy.http', 'old.primary.http']);
  assert(got === 'old.primary.http', `expected the primary-marked file to win, got "${got}"`);
});

test('T6 — TWO files both carry the primary marker → still ambiguous, fail-closed', () => {
  assertThrows(() => pickHttpFile(['A.primary.full.http', 'B.primary.full.http']), 'A.primary.full.http', 'T6');
});

// ─── resolveContractHttp propagates the fail-closed error (does not swallow it) ────────────

test('T7 — resolveContractHttp propagates AmbiguousHttpFileError from an ambiguous components dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cprobe-ambig-'));
  const comp = path.join(tmp, 'docs', 'components', 'Feat');
  const specs = path.join(tmp, 'docs', 'specs', 'Feat');
  fs.mkdirSync(comp, { recursive: true });
  fs.mkdirSync(specs, { recursive: true });
  fs.writeFileSync(path.join(comp, 'A.full.http'), '# a');
  fs.writeFileSync(path.join(comp, 'B.full.http'), '# b');
  try {
    let threw = false;
    try {
      resolveContractHttp(comp, specs);
    } catch (e) {
      threw = true;
      assert(e instanceof AmbiguousHttpFileError, `expected AmbiguousHttpFileError, got ${(e as Error)?.constructor?.name}`);
    }
    assert(threw, 'resolveContractHttp must propagate the ambiguity error, not swallow it into a silent pick');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
