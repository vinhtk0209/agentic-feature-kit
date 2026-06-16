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

const SUPABASE_URL = "https://vkuojxgvkxndftenrdno.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdW9qeGd2a3huZGZ0ZW5yZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjgwMzMsImV4cCI6MjA5NzAwNDAzM30.MrTuIuN1kghxMXu0yyOW9MtmXVY7xH0-2HSCwTKo2cU";

const KIT_VERSION = "3.17.0";

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
  return process.env.KIT_TOKEN ?? null;
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
async function verify(): Promise<number> {
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
    });
  } catch (e) {
    // Network/backend failure: do NOT hard-block the user on infra issues.
    console.error(`⚠️  Token verification unavailable (${(e as Error).message}). Proceeding.`);
    return 0;
  }

  if (result.valid) {
    const quota =
      result.max_runs === null ? "unlimited" : `${result.runs_used}/${result.max_runs}`;
    console.log(`✅ Token valid — ${result.owner} (runs: ${quota})`);
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
  console.log(`📊 Reported error: ${type} @ ${phase}`);
}

// ── CLI dispatch ────────────────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);
(async () => {
  let exitCode = 0;
  switch (cmd) {
    case "verify":
      exitCode = await verify();
      break;
    case "feature":
      if (!args[0]) { console.error("usage: telemetry feature <FeatureName>"); exitCode = 2; break; }
      await logFeature(args[0]);
      break;
    case "error":
      if (args.length < 3) { console.error("usage: telemetry error <type> <phase> <message>"); exitCode = 2; break; }
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
