/**
 * telemetry-mock-runner.ts — test harness for telemetry.ts CLI tests.
 *
 * Patches globalThis.fetch BEFORE requiring telemetry.ts so no real
 * Supabase calls are made. Behaviour is controlled by env vars:
 *
 *   MOCK_VERIFY_RESULT   'valid' (default) | 'invalid' | 'quota'
 *   MOCK_FETCH_FAIL      '1' → throw a network error (tests fail-open path)
 *
 * Usage (via telemetry.test.ts):
 *   npx tsx .claude/integrations/telemetry-mock-runner.ts <telemetry-args...>
 *
 * process.argv is passed through unchanged, so telemetry.ts CLI dispatch
 * sees the same args as if it were called directly.
 */

const MOCK_VERIFY = process.env.MOCK_VERIFY_RESULT ?? 'valid';
const FAIL = process.env.MOCK_FETCH_FAIL === '1';

// Replace native fetch with a deterministic mock — Supabase is never contacted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = async (url: string, init?: { method?: string }): Promise<any> => {
  const u = String(url);
  const kind = u.includes('verify_kit_token') ? 'verify_rpc'
    : u.includes('token_id_for') ? 'token_id_rpc'
    : u.includes('/rest/v1/repo_runs') ? 'repo_runs_write'
    : u.includes('/rest/v1/') ? 'legacy_insert'
    : 'other';
  // Safe test-only observation: never output URL, headers, body, token, owner, or credentials.
  console.log(`@@MOCK_FETCH@@ ${JSON.stringify({ kind, method: init?.method ?? 'GET' })}`);
  if (FAIL) throw new Error('mock network error');

  if (u.includes('verify_kit_token')) {
    const body =
      MOCK_VERIFY === 'invalid' ? { valid: false, reason: 'invalid_token' }
      : MOCK_VERIFY === 'quota'  ? { valid: false, reason: 'quota_exceeded' }
      : { valid: true, runs_used: 1, max_runs: 5 };
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
  }

  if (u.includes('token_id_for')) {
    return { ok: true, json: async () => 'mock-id', text: async () => '"mock-id"' };
  }

  // usage_logs / error_reports inserts — 201 minimal, best-effort callers ignore errors
  return { ok: true, json: async () => ({}), text: async () => '' };
};

// Run telemetry CLI. process.argv slice(2) = [cmd, ...args] inherited from this process,
// which is what telemetry.ts reads for its CLI dispatch.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./telemetry');
