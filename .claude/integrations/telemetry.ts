#!/usr/bin/env -S npx tsx
/**
 * telemetry.ts — Token verification + usage/error telemetry for the kit.
 *
 * Talks to a Supabase Postgres RPC backend. The anon key below is public by
 * design (Row-Level Security on the server prevents it from reading any token
 * data — it can only call the verify function and insert log/error rows).
 *
 * Reads the user's token from the KIT_TOKEN environment variable.
 *
 * CLI:
 *   npx tsx telemetry.ts verify                       # verify token (Step 0)
 *   npx tsx telemetry.ts feature <FeatureName>        # log a built feature (B12)
 *   npx tsx telemetry.ts error <type> <phase> <msg>   # report an error
 *
 * Exit codes (verify): 0 = valid · 1 = invalid/expired/quota · 2 = network/config error
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCanonicalKitVersion } from "./kit-version";
import {
  createBlockedRunVersionReceipt,
  resolveRunVersionCommandRunId,
} from "./run-version-writer-adapter";

const SUPABASE_URL = "https://vkuojxgvkxndftenrdno.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdW9qeGd2a3huZGZ0ZW5yZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjgwMzMsImV4cCI6MjA5NzAwNDAzM30.MrTuIuN1kghxMXu0yyOW9MtmXVY7xH0-2HSCwTKo2cU";

// Read version from the prompt file so each repo reports its actual installed version.
// Missing, malformed, or duplicate authority is a startup error: emitting a guessed
// version would corrupt the dashboard's provenance before any network/write path runs.
//
// FORMAT MUST MATCH scripts/sync-to-targets.ts `resolveTargetVersion()` exactly:
// `major.minor` + ".0" (e.g. "3.17.0"). Historical repo_runs rows and any future tenant-safe
// writer use this format alongside installs.kit_version. P17-016 B2C pauses new repo_runs writes
// until a tenant-attested Wave C sink exists; keep the format authority stable during that pause.
function resolveKitVersion(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.dirname(path.dirname(path.dirname(thisFile)));
  return resolveCanonicalKitVersion(repoRoot);
}
const KIT_VERSION = resolveKitVersion();

// The sidecar injects the actual runtime identity. Manual/legacy use remains Claude-compatible,
// while malformed identities fail before any network request or marker can be emitted.
const RUNNER_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;
// Keep this exact grammar aligned with kit-event.ts and the dashboard parser. Error telemetry may
// retain a human-readable message, but its machine event must carry one canonical phase only.
const KIT_PHASE_RE = /^(?:B(?:0(?:\.5)?|1|2|3|4|5|6(?:\.5)?|7|8(?:\.[56])?|9(?:\.[56])?|10(?:\.5)?|11|12(?:\.8)?)|D(?:0(?:\.5)?|1(?:\.5)?)|D-cross-2)$/;
const RUNNER = process.env.KIT_RUNNER_ID ?? "claude";
if (!RUNNER_ID_RE.test(RUNNER)) throw new Error("telemetry: invalid KIT_RUNNER_ID");
const RUN_NONCE = process.env.KIT_EVENT_NONCE;
if (RUN_NONCE !== undefined && !/^[a-f0-9]{64}$/.test(RUN_NONCE)) {
  throw new Error("telemetry: invalid KIT_EVENT_NONCE");
}

/**
 * Emit a machine-readable kit event line on stdout for the dashboard Command-Runner sidecar to
 * parse (contract: kit-dashboard/docs/design/kit-progress-event-contract.md). The sidecar reads
 * THIS run's PTY stream, so a marker printed here is inherently scoped to the current run — no DB
 * join needed. Best-effort: a broken stdout must never affect the workflow, so it never throws.
 *
 *   meta  → { type:"meta",  kitVersion, runner }   (emitted once, at verify/step0)
 *   error → { type:"error", phase }                (emitted at each telemetry error call)
 * (state/phase markers are emitted by the command file's PROGRESS DISPLAY, not here.)
 */
function emitKitEvent(ev: Record<string, unknown>): void {
  try {
    process.stdout.write(`@@KIT_EVENT@@ ${JSON.stringify({ v: 1, ...ev, ...(RUN_NONCE ? { runNonce: RUN_NONCE } : {}) })}\n`);
  } catch {
    /* stdout unavailable — telemetry markers are optional, never block */
  }
}

const headers = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  // Tell the server to close the TCP connection after each response.
  // Without this, undici keeps the socket open in a keep-alive pool and
  // Windows libuv asserts (UV_HANDLE_CLOSING) when process.exit() races
  // the in-flight socket close during event-loop teardown.
  Connection: "close",
};

function getToken(): string | null {
  if (process.env.KIT_TOKEN) return process.env.KIT_TOKEN;
  // Fallback: read token saved by `workflow login` so users don't need KIT_TOKEN in .env
  try {
    // Config is stored under workflow/claude/ — the agent-scoped layout used
    // by bin/lib/local-config.ts. "claude" is fixed here because telemetry.ts
    // is always the Claude edition (it ships inside .claude/).
    const dir =
      process.platform === "win32"
        ? path.join(
            process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
            "workflow", "claude"
          )
        : path.join(os.homedir(), ".config", "workflow", "claude");
    const raw = fs.readFileSync(path.join(dir, "config.json"), "utf8");
    return (JSON.parse(raw) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

/** Resolve the token_id for the current token (needed for log/error inserts). */
async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

type VerifyResult =
  | { valid: true; owner: string; runs_used: number; max_runs: number | null }
  | { valid: false; reason: string };

// Returns the intended exit code instead of calling process.exit() directly.
// Callers must schedule process.exit() via setImmediate() so that libuv has
// one event-loop cycle to process the server-side connection-close event
// before we tear down the process (avoids the Windows UV_HANDLE_CLOSING assert).
async function verify(runId: string): Promise<number> {
  const token = getToken();
  if (!token) {
    console.error("❌ KIT_TOKEN not set. Add KIT_TOKEN=<your-token> to your .env.");
    return 1;
  }
  let result: VerifyResult;
  try {
    result = await rpc<VerifyResult>("verify_kit_token", {
      p_token: token,
      p_kit_version: KIT_VERSION,
      p_checkpoint: "step0",
    });
  } catch (e) {
    // Network/backend failure: do NOT hard-block the user on infra issues.
    console.error(`⚠️  Token verification unavailable (${(e as Error).message}). Proceeding.`);
    return 0;
  }

  if (result.valid === true) {
    const quota =
      result.max_runs === null ? "unlimited" : `${result.runs_used}/${result.max_runs}`;
    console.log(`✅ Token valid — ${result.owner} (runs: ${quota})`);
    // Announce the version that is actually running to the sidecar (step0). This is the single
    // version source (resolveKitVersion → PROMPT_VERSION). It preserves the value a future
    // tenant-safe run-version writer will use and flags to the sidecar that this run emits markers
    // at all — so it can tell a measured-0 metric from an unmeasured (marker-less) run.
    emitKitEvent({ type: "meta", kitVersion: KIT_VERSION, runner: RUNNER });
    // Trusted v2 tenant context and the Wave C sink do not exist yet. Emit one closed local
    // compatibility receipt; never treat legacy auth success as tenant proof or central-write access.
    const receipt = createBlockedRunVersionReceipt({ runId, createdAt: new Date().toISOString() });
    console.log(`@@PRIVACY_RECEIPT@@ ${JSON.stringify(receipt)}`);
    return 0;
  } else {
    const msg: Record<string, string> = {
      invalid_token: "Token not recognized.",
      revoked: "This token has been revoked.",
      expired: "This token has expired.",
      quota_exceeded: "Run quota exceeded for this token.",
    };
    console.error(`❌ ${msg[result.reason] ?? result.reason}`);
    return 1;
  }
}

/** Best-effort insert into a telemetry table; never throws to the caller. */
async function insert(table: string, row: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!res.ok) console.error(`⚠️  telemetry ${table}: ${res.status}`);
  } catch (e) {
    console.error(`⚠️  telemetry ${table} skipped: ${(e as Error).message}`);
  }
}

/** Look up the caller's token_id via the verify function's side channel. */
async function tokenId(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  try {
    return await rpc<string | null>("token_id_for", { p_token: token });
  } catch {
    return null;
  }
}

async function logFeature(featureName: string): Promise<void> {
  const id = await tokenId();
  await insert("usage_logs", {
    token_id: id,
    event_type: "feature_built",
    kit_version: KIT_VERSION,
    feature_name: featureName,
  });
  console.log(`📊 Logged feature: ${featureName}`);
}

async function reportError(type: string, phase: string, message: string): Promise<void> {
  const id = await tokenId();
  await insert("error_reports", {
    token_id: id,
    error_type: type,
    phase,
    message,
    kit_version: KIT_VERSION,
  });
  // Deterministic per-run error signal for the sidecar (error_count). This runs at the kit's
  // scripted error call site, so it is reliably tied to the current run's stream — unlike the
  // error_reports row above, which is keyed by token_id and can't be joined back to one run.
  emitKitEvent({ type: "error", phase });
  console.log(`📊 Reported error: ${type} @ ${phase}`);
}

// ── CLI dispatch ────────────────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);
(async () => {
  let exitCode = 0;
  switch (cmd) {
    case "verify":
      exitCode = await verify(resolveRunVersionCommandRunId(undefined));
      break;
    case "feature":
      if (!args[0]) { console.error("usage: telemetry feature <FeatureName>"); exitCode = 2; break; }
      await logFeature(args[0]);
      break;
    case "error":
      if (args.length < 3) { console.error("usage: telemetry error <type> <phase> <message>"); exitCode = 2; break; }
      if (!KIT_PHASE_RE.test(args[1])) { console.error("telemetry error: phase must be one canonical phase ID"); exitCode = 2; break; }
      await reportError(args[0], args[1], args.slice(2).join(" "));
      break;
    default:
      console.error("usage: telemetry <verify|feature|error> ...");
      exitCode = 2;
  }
  // Set the exit code and let Node.js exit naturally when the event loop drains.
  //
  // Do NOT call process.exit() here. On Windows, calling process.exit() while
  // undici has in-flight uv_async_t handles (used for its thread→event-loop
  // signalling) triggers an assertion in libuv's async.c and corrupts the exit
  // code to 127. undici unref()s its worker handles, so once the TCP socket is
  // fully closed (guaranteed by Connection:close above) the loop is empty and
  // the process exits cleanly with process.exitCode.
  process.exitCode = exitCode;
})();
