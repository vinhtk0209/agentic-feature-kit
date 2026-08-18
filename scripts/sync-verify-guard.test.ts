import assert from "node:assert/strict";
import { LegacyBackendConfigError } from "../packages/core/src/legacy-backend-config";
import {
  countVerifiedRuns,
  evaluateVerifiedSyncAdmission,
  resolveSourceVersionFromPromptContent,
} from "./sync-to-targets";

const BACKEND_URL = "https://control-plane.example.test";
const BACKEND_KEY = "synthetic-public-key-0001";

async function main(): Promise<void> {
  assert.equal(resolveSourceVersionFromPromptContent('PROMPT_VERSION: v3.25\n'), '3.25.0');
  assert.equal(resolveSourceVersionFromPromptContent('PROMPT_VERSION: v3.25.0\n'), '3.25.0');
  assert.equal(resolveSourceVersionFromPromptContent('PROMPT_VERSION: v3.25.1\n'), null, 'a malformed source version must not reach the sync guard');
  assert.equal(resolveSourceVersionFromPromptContent('# no PROMPT_VERSION\n'), null, 'a missing source version must not reach the sync guard');
  assert.equal(resolveSourceVersionFromPromptContent('PROMPT_VERSION: v3.25\nPROMPT_VERSION: v3.26\n'), null, 'duplicate source declarations must not select last-wins');

  let countedVersion: string | null = null;
  const taggedUnverified = await evaluateVerifiedSyncAdmission({
    dryRun: false,
    forceUnverified: null,
    sourceRef: "v3.24",
    resolveSourceVersion: () => "3.24.0",
    countVerifiedRuns: async (version) => { countedVersion = version; return 0; },
  });
  assert.equal(taggedUnverified.outcome, "deny", "an unverified --ref must never bypass the guard");
  assert.equal(countedVersion, "3.24.0", "the tagged source version must be queried exactly");
  assert.match(taggedUnverified.reason, /NO computed-verified run/);

  const taggedVerified = await evaluateVerifiedSyncAdmission({
    dryRun: false,
    forceUnverified: null,
    sourceRef: "v3.25",
    resolveSourceVersion: () => "3.25.0",
    countVerifiedRuns: async () => 1,
  });
  assert.deepEqual(taggedVerified, { outcome: "allow", version: "3.25.0", count: 1, forced: false });

  const dryRun = await evaluateVerifiedSyncAdmission({
    dryRun: true,
    forceUnverified: null,
    sourceRef: "v0.1",
    resolveSourceVersion: () => "0.1.0",
    countVerifiedRuns: async () => 0,
  });
  assert.equal(dryRun.outcome, "warn", "dry-run remains non-mutating and reports the real-sync refusal");

  let forceTouchedDependency = false;
  const forced = await evaluateVerifiedSyncAdmission({
    dryRun: false,
    forceUnverified: "incident rollback approved by operator",
    sourceRef: "v0.1",
    resolveSourceVersion: () => { forceTouchedDependency = true; return null; },
    countVerifiedRuns: async () => { forceTouchedDependency = true; return 0; },
  });
  assert.deepEqual(forced, { outcome: "allow", version: null, count: null, forced: true });
  assert.equal(forceTouchedDependency, false, "the explicit override stays conscious and independent of backstop availability");

  const unreachable = await evaluateVerifiedSyncAdmission({
    dryRun: false,
    forceUnverified: null,
    sourceRef: null,
    resolveSourceVersion: () => "3.25.0",
    countVerifiedRuns: async () => { throw new Error("offline"); },
  });
  assert.equal(unreachable.outcome, "deny");
  assert.match(unreachable.reason, /cannot reach Supabase/);

  const originalFetch = globalThis.fetch;
  let globalFetchCalls = 0;
  globalThis.fetch = async () => {
    globalFetchCalls += 1;
    throw new Error("global fetch tripwire reached");
  };
  try {
    for (const [label, env] of [
      ["missing", {}],
      ["URL only", { SUPABASE_URL: BACKEND_URL }],
      ["key only", { SUPABASE_ANON_KEY: BACKEND_KEY }],
      ["remote HTTP", { SUPABASE_URL: "http://remote.example.test", SUPABASE_ANON_KEY: BACKEND_KEY }],
    ] as const) {
      const before = globalFetchCalls;
      await assert.rejects(
        countVerifiedRuns("3.25.0", { env, fetch: globalThis.fetch }),
        (error: unknown) => {
          assert.ok(error instanceof LegacyBackendConfigError, `${label}: typed config refusal required`);
          assert.doesNotMatch(`${error.message}:${error.ruleId}`, /example\.test|synthetic-public-key/i);
          return true;
        },
      );
      assert.equal(globalFetchCalls, before, `${label}: config validation reached fetch`);
    }

    let request: { url: string; init?: RequestInit } | undefined;
    const count = await countVerifiedRuns("3.25.0", {
      env: { SUPABASE_URL: `${BACKEND_URL}/`, SUPABASE_ANON_KEY: BACKEND_KEY },
      fetch: async (input, init) => {
        request = { url: String(input), init };
        return {
          ok: true,
          headers: { get: (name: string) => name.toLowerCase() === "content-range" ? "0-0/1" : null },
          text: async () => "",
        } as Response;
      },
    });
    assert.equal(count, 1);
    assert.equal(request?.url, `${BACKEND_URL}/rest/v1/verify_records?select=runner_run_id&kit_version=eq.3.25.0&verified=is.true&limit=1`);
    assert.deepEqual(request?.init, {
      method: "GET",
      headers: {
        apikey: BACKEND_KEY,
        Authorization: `Bearer ${BACKEND_KEY}`,
        Prefer: "count=exact",
        Connection: "close",
      },
    });
    assert.equal(globalFetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("Canary GREEN: tagged/worktree sync share an env-configured verified=true backstop; missing config is zero-fetch and only dry-run warning or an explicit reasoned override can proceed without proof.");
}

main().catch((error) => { console.error(error); process.exit(1); });
