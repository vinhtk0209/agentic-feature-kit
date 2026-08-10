import assert from "node:assert/strict";
import { evaluateVerifiedSyncAdmission } from "./sync-to-targets";

async function main(): Promise<void> {
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
