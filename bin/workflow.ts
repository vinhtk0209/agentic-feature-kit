#!/usr/bin/env -S npx tsx
/**
 * workflow — Open Core CLI for the Workflow Kit.
 *
 * Edition-aware: the --agent flag selects which edition to operate on.
 * Default is "claude" for full backward compatibility.
 *
 * Usage:
 *   npx tsx bin/workflow.ts login  [--token <token>] [--agent <name>]
 *   npx tsx bin/workflow.ts init   [--dir <path>]    [--agent <name>]
 *   npx tsx bin/workflow.ts update                   [--agent <name>]
 *   npx tsx bin/workflow.ts status                   [--agent <name>]
 *
 * License enforcement lives here — never in .claude/commands/*.md files.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { rpc } from "./lib/supabase";
import { loadConfig, saveConfig, getConfigPath } from "./lib/local-config";
import { downloadAndExtract, getLatestVersion } from "./lib/bundle";
import type { WorkflowConfig } from "./lib/local-config";

// ── Edition defaults (claude) ─────────────────────────────────────────────
// Imported from the edition module so no Claude-specific values are hardcoded
// in this platform file. Future editions: import from ./editions/<agent>.
import {
  AGENT as DEFAULT_AGENT,
  VERSION as CLAUDE_VERSION,
  TOKEN_ENV as CLAUDE_TOKEN_ENV,
} from "./editions/claude";

// ── Types ─────────────────────────────────────────────────────────────────

type VerifyResult =
  | { valid: true; owner: string; runs_used: number; max_runs: number | null }
  | { valid: false; reason: string };

interface EditionDefaults {
  agent: string;
  version: string;
  tokenEnv: string;
}

const REVOKE_MESSAGES: Record<string, string> = {
  invalid_token: "Token not recognized.",
  revoked: "This token has been revoked.",
  expired: "This token has expired.",
  quota_exceeded: "Run quota exceeded for this token.",
};

// ── Edition resolution ────────────────────────────────────────────────────

function resolveEdition(agent: string): EditionDefaults {
  // Claude is the only built-in edition. Future editions register here or via
  // a dynamic require of bin/editions/<agent>/index.ts.
  if (agent === DEFAULT_AGENT) {
    return { agent: DEFAULT_AGENT, version: CLAUDE_VERSION, tokenEnv: CLAUDE_TOKEN_ENV };
  }
  // Unknown edition: caller provides version/tokenEnv via flags or env vars.
  // Defaults are deliberately conservative so the CLI still works.
  return { agent, version: "0.0.0", tokenEnv: "WORKFLOW_TOKEN" };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function verifyToken(token: string, agent: string, version: string): Promise<VerifyResult> {
  return rpc<VerifyResult>("verify_kit_token", {
    p_token: token,
    p_checkpoint: agent, // additive — server can use or ignore; Postgres ignores unknown params
    p_kit_version: version,
  });
}

function getActiveToken(edition: EditionDefaults): string | null {
  return (
    process.env[edition.tokenEnv] ??
    loadConfig(edition.agent)?.token ??
    null
  );
}

function parseFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx !== -1 ? (args[idx + 1] ?? null) : null;
}

// ── login ─────────────────────────────────────────────────────────────────

async function login(args: string[]): Promise<number> {
  const agentName = parseFlag(args, "--agent") ?? DEFAULT_AGENT;
  const edition = resolveEdition(agentName);
  let token = parseFlag(args, "--token");

  if (!token) {
    const rl = createInterface({ input, output });
    token = (await rl.question(`Enter your ${edition.agent} license token: `)).trim();
    rl.close();
  }

  if (!token) {
    console.error("❌ No token provided.");
    return 1;
  }

  let result: VerifyResult;
  try {
    result = await verifyToken(token, edition.agent, edition.version);
  } catch (e) {
    console.error(`❌ Verification request failed: ${(e as Error).message}`);
    return 2;
  }

  if (!result.valid) {
    console.error(`❌ ${REVOKE_MESSAGES[result.reason] ?? result.reason}`);
    return 1;
  }

  const cfg: WorkflowConfig = {
    agent: edition.agent,
    token,
    owner: result.owner,
    verified_at: new Date().toISOString(),
    version: edition.version,
  };
  saveConfig(cfg);
  console.log(`✅ Logged in as ${result.owner}. Token saved to ${getConfigPath(edition.agent)}.`);
  return 0;
}

// ── init ──────────────────────────────────────────────────────────────────

async function init(args: string[]): Promise<number> {
  const agentName = parseFlag(args, "--agent") ?? DEFAULT_AGENT;
  const edition = resolveEdition(agentName);
  const destDir = parseFlag(args, "--dir") ?? process.cwd();
  const token = getActiveToken(edition);

  if (!token) {
    console.error(`❌ Not logged in. Run: npx tsx bin/workflow.ts login --agent ${edition.agent}`);
    return 1;
  }

  let result: VerifyResult;
  try {
    result = await verifyToken(token, edition.agent, edition.version);
  } catch (e) {
    console.error(`❌ License check failed: ${(e as Error).message}`);
    return 2;
  }

  if (!result.valid) {
    console.error(
      `❌ License invalid (${REVOKE_MESSAGES[result.reason] ?? result.reason}). ` +
        `Run: npx tsx bin/workflow.ts login --agent ${edition.agent}`
    );
    return 1;
  }

  console.log(`⬇️  Downloading ${edition.agent} bundle v${edition.version}...`);
  try {
    await downloadAndExtract(token, edition.agent, edition.version, destDir);
    console.log(`✅ Bundle installed to ${destDir}/`);
  } catch (e) {
    console.error(`❌ Bundle download failed: ${(e as Error).message}`);
    console.error(
      "   The server-side bundle may not yet be available. " +
        "Contact the kit maintainer or copy assets manually."
    );
    return 1;
  }

  return 0;
}

// ── update ────────────────────────────────────────────────────────────────

async function update(args: string[]): Promise<number> {
  const agentName = parseFlag(args, "--agent") ?? DEFAULT_AGENT;
  const edition = resolveEdition(agentName);
  const token = getActiveToken(edition);

  if (!token) {
    console.error(`❌ Not logged in. Run: npx tsx bin/workflow.ts login --agent ${edition.agent}`);
    return 1;
  }

  let latestVersion: string;
  try {
    latestVersion = await getLatestVersion(token, edition.agent);
  } catch (e) {
    console.error(`❌ Version check failed: ${(e as Error).message}`);
    return 2;
  }

  if (latestVersion === edition.version) {
    console.log(`✅ Already on latest version ${edition.version} (${edition.agent}).`);
    return 0;
  }

  console.log(`⬆️  Update available: ${edition.version} → ${latestVersion} (${edition.agent})`);
  return init(args);
}

// ── status ────────────────────────────────────────────────────────────────

async function status(args: string[]): Promise<number> {
  const agentName = parseFlag(args, "--agent") ?? DEFAULT_AGENT;
  const edition = resolveEdition(agentName);

  const envToken = process.env[edition.tokenEnv];
  const localCfg = loadConfig(edition.agent);
  const token = envToken ?? localCfg?.token ?? null;

  const source = envToken
    ? `${edition.tokenEnv} env var`
    : localCfg
      ? `local config (${getConfigPath(edition.agent)})`
      : "none";

  console.log(`Edition     : ${edition.agent}`);
  console.log(`Version     : ${edition.version}`);
  console.log(`Token source: ${source}`);

  if (!token) {
    console.log(`Status      : ❌ Not logged in. Run: npx tsx bin/workflow.ts login --agent ${edition.agent}`);
    return 1;
  }

  try {
    const result = await verifyToken(token, edition.agent, edition.version);
    if (result.valid) {
      const quota =
        result.max_runs === null
          ? "unlimited"
          : `${result.runs_used}/${result.max_runs}`;
      console.log(`Owner       : ${result.owner}`);
      console.log(`Status      : ✅ Valid (runs: ${quota})`);
      return 0;
    } else {
      console.log(`Status      : ❌ ${REVOKE_MESSAGES[result.reason] ?? result.reason}`);
      return 1;
    }
  } catch (e) {
    console.log(`Status      : ⚠️  Verification unavailable (${(e as Error).message})`);
    return 0;
  }
}

// ── CLI dispatch ──────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

(async () => {
  switch (cmd) {
    case "login":  process.exitCode = await login(args);  break;
    case "init":   process.exitCode = await init(args);   break;
    case "update": process.exitCode = await update(args); break;
    case "status": process.exitCode = await status(args); break;
    default:
      console.error("Usage: workflow <login|init|update|status> [options]");
      console.error("");
      console.error("  login  [--token <token>] [--agent <name>]   Authenticate and save license");
      console.error("  init   [--dir <path>]    [--agent <name>]   Download and install bundle");
      console.error("  update                   [--agent <name>]   Update to latest bundle");
      console.error("  status                   [--agent <name>]   Show auth and version info");
      console.error("");
      console.error("  --agent defaults to \"claude\" when omitted.");
      process.exitCode = 2;
  }
})();
