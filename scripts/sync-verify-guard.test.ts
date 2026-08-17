import assert from "node:assert/strict";
import { evaluateVerifiedSyncAdmission, resolveSourceVersionFromPromptContent } from "./sync-to-targets";

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

  console.log("Canary GREEN: tagged and worktree sync share the verified=true backstop; only dry-run warning or explicit reasoned override can proceed without proof.");
}

main().catch((error) => { console.error(error); process.exit(1); });
