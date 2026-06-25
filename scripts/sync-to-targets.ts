/**
 * sync-to-targets.ts — one-way sync: claude-workflow-kit (source of truth) -> target repos.
 *
 * Architecture (locked, do not change):
 *  1. ONE direction only: source -> targets. Source always wins. No reverse sync.
 *  2. ALLOWLIST, not blocklist: only paths the kit owns (declared in sync.config.json
 *     `syncPaths`) are touched. Anything not listed is left alone in the target, so
 *     .env / secrets / mcp-server are safe because they are NOT in the allowlist.
 *  3. Manual trigger only: `npm run sync` (real) / `npm run sync -- --dry-run` (preview).
 *  4. Dry-run + report. No backup folder (the source of truth IS the backup).
 *  5. Target paths come from config (relative). Never hardcode absolute paths.
 *
 * Usage:
 *   npm run sync               # write changes, print per-target summary
 *   npm run sync:dry           # preview only, write nothing (canonical preview cmd)
 *   npm run sync -- --dry-run  # also preview — npm swallows --dry-run as its own
 *                              # reserved flag, but exposes it via npm_config_dry_run,
 *                              # which we honor so this stays safe.
 *   npx tsx scripts/sync-to-targets.ts --dry-run   # direct invocation
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

// Resolve kit root from this file's location, not from cwd.
// (DEV AZURE path has a space -> import.meta.url is URL-encoded; fileURLToPath decodes it.)
const thisFile = fileURLToPath(import.meta.url);
const KIT_ROOT = path.dirname(path.dirname(thisFile)); // scripts/ -> kit root
const SOURCE_CLAUDE = path.join(KIT_ROOT, ".claude");
const CONFIG_PATH = path.join(KIT_ROOT, "sync.config.json");
const ENV_PATH = path.join(KIT_ROOT, ".env");

/**
 * Minimal .env loader (no dotenv dependency). Reads the kit's OWN .env and sets
 * any keys not already present in process.env. Used for SUPABASE_URL / anon key.
 * Silent if the file is absent — install reporting just gets skipped downstream.
 */
function loadKitEnv(): void {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const raw of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

type SyncConfig = { targets: string[]; syncPaths: string[] };
type ChangeKind = "added" | "updated" | "unchanged";
interface FileChange {
  rel: string; // path relative to .claude/
  kind: ChangeKind;
}

function loadConfig(): SyncConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail(`Missing config: ${CONFIG_PATH}`);
  }
  let cfg: SyncConfig;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    return fail(`Invalid JSON in ${CONFIG_PATH}: ${(e as Error).message}`);
  }
  if (!Array.isArray(cfg.targets) || cfg.targets.length === 0) {
    fail("sync.config.json: `targets` must be a non-empty array");
  }
  if (!Array.isArray(cfg.syncPaths) || cfg.syncPaths.length === 0) {
    fail("sync.config.json: `syncPaths` must be a non-empty array");
  }
  return cfg;
}

// When set (via --ref), source files are read from this git ref of the kit instead
// of the working tree — this powers versioned deploy/rollback from the dashboard.
// Reads never mutate the kit working tree (git show / ls-tree are read-only).
let SRC_REF: string | null = null;

function git(args: string[], encoding?: "utf8"): string | Buffer {
  return execFileSync("git", ["-C", KIT_ROOT, ...args], {
    maxBuffer: 256 * 1024 * 1024,
    ...(encoding ? { encoding } : {}),
  });
}

/** List files (rel to .claude/) under a syncPath at SRC_REF via git ls-tree. */
function listRefFiles(syncPath: string): string[] {
  const claudePath = ".claude/" + normalizeRel(syncPath);
  let out: string;
  try {
    out = git(["ls-tree", "-r", "--name-only", SRC_REF as string, "--", claudePath], "utf8") as string;
  } catch (e) {
    console.warn(`  ! skip "${syncPath}" @ ${SRC_REF}: ${(e as Error).message.split("\n")[0]}`);
    return [];
  }
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((p) => normalizeRel(p.replace(/^\.claude\//, "")));
}

/** Read a source file (rel to .claude/) as Buffer — from git ref or working tree. */
function readSource(rel: string): Buffer {
  if (SRC_REF) return git(["show", `${SRC_REF}:.claude/${rel}`]) as Buffer;
  return fs.readFileSync(path.join(SOURCE_CLAUDE, rel));
}

/** Recursively collect file paths (relative to .claude/) under a syncPath entry. */
function collectFiles(syncPath: string): string[] {
  if (SRC_REF) return listRefFiles(syncPath);
  const abs = path.join(SOURCE_CLAUDE, syncPath);
  if (!fs.existsSync(abs)) {
    console.warn(`  ! skip "${syncPath}" — not found in source (${abs})`);
    return [];
  }
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    return [normalizeRel(syncPath)];
  }
  const out: string[] = [];
  const walk = (dirAbs: string) => {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const childAbs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        walk(childAbs);
      } else if (entry.isFile()) {
        out.push(normalizeRel(path.relative(SOURCE_CLAUDE, childAbs)));
      }
    }
  };
  walk(abs);
  return out;
}

/** Normalize to forward-slash, no trailing slash, relative to .claude/. */
function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

function classify(rel: string, destAbs: string): ChangeKind {
  if (!fs.existsSync(destAbs)) return "added";
  const a = readSource(rel);
  const b = fs.readFileSync(destAbs);
  return a.equals(b) ? "unchanged" : "updated";
}

function syncTarget(
  targetRel: string,
  relFiles: string[],
  dryRun: boolean
): { target: string; changes: FileChange[] } {
  const targetRoot = path.resolve(KIT_ROOT, targetRel);
  const targetClaude = path.join(targetRoot, ".claude");
  const changes: FileChange[] = [];

  if (!fs.existsSync(targetClaude)) {
    console.warn(
      `  ! target "${targetRel}" has no .claude/ (${targetClaude}) — skipping`
    );
    return { target: targetRel, changes };
  }

  for (const rel of relFiles) {
    const destAbs = path.join(targetClaude, rel);
    const kind = classify(rel, destAbs);
    changes.push({ rel, kind });

    if (kind === "unchanged" || dryRun) continue;
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.writeFileSync(destAbs, readSource(rel));
  }
  return { target: targetRel, changes };
}

function printReport(
  result: { target: string; changes: FileChange[] },
  dryRun: boolean
) {
  const added = result.changes.filter((c) => c.kind === "added");
  const updated = result.changes.filter((c) => c.kind === "updated");
  const unchanged = result.changes.filter((c) => c.kind === "unchanged");

  console.log(`\n${result.target}`);
  const verb = dryRun ? "would be" : "";
  for (const c of [...added, ...updated]) {
    console.log(`  ${c.kind === "added" ? "+" : "~"} ${c.kind.padEnd(7)} ${c.rel}`);
  }
  console.log(
    `  => ${updated.length} updated, ${added.length} added, ${unchanged.length} unchanged` +
      (dryRun && added.length + updated.length > 0 ? `  (${verb} written)` : "")
  );
}

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Install reporting (Phần B): after syncing a target, record which kit version
// now lives on that repo into Supabase `installs` (upsert on `repo`).
// ---------------------------------------------------------------------------

interface InstallReport {
  repo: string; // stable repo id = basename of the target path
  kitVersion: string; // e.g. "3.17.0", matching usage_logs.kit_version format
}

/**
 * Parse PROMPT_VERSION from a target's OWN command file so we record what was
 * actually synced there. Returns null if the file/marker is missing.
 *
 * FORMAT MUST MATCH telemetry.ts `resolveKitVersion()` exactly: `major.minor` + ".0"
 * (e.g. "3.17.0"). The dashboard compares installs.kit_version (written here) with
 * repo_runs.last_run_version (written by telemetry); if these two diverge in format,
 * "installed vs running" will mismatch falsely. Keep both in lockstep.
 */
function resolveTargetVersion(targetRel: string): string | null {
  const cmdFile = path.resolve(
    KIT_ROOT,
    targetRel,
    ".claude",
    "commands",
    "feature-from-confluence.md"
  );
  try {
    const content = fs.readFileSync(cmdFile, "utf8");
    const m = content.match(/PROMPT_VERSION:\s*v([\d.]+)/);
    return m ? m[1] + ".0" : null;
  } catch {
    return null;
  }
}

/**
 * Upsert install rows into Supabase via PostgREST. The ENTIRE block is best-effort:
 * any failure (missing env, network, Supabase down) only warns — it must NEVER
 * block or fail the file sync that already succeeded.
 */
async function reportInstalls(
  reports: InstallReport[],
  dryRun: boolean
): Promise<void> {
  if (reports.length === 0) return;

  if (dryRun) {
    console.log("\nInstall report (dry run — nothing sent to Supabase):");
    for (const r of reports) {
      console.log(`  would report version ${r.kitVersion} for repo ${r.repo}`);
    }
    return;
  }

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.warn(
        "\n⚠️  Skipping install report: SUPABASE_URL / SUPABASE_ANON_KEY not set in .env."
      );
      return;
    }

    const synced_at = new Date().toISOString();
    const headers = {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      // Upsert on the primary key (repo); return nothing to keep it light.
      Prefer: "resolution=merge-duplicates,return=minimal",
      // Match telemetry.ts: avoid the Windows undici keep-alive teardown assert.
      Connection: "close",
    };

    console.log("\nInstall report:");
    for (const r of reports) {
      try {
        const res = await fetch(`${url}/rest/v1/installs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            repo: r.repo,
            kit_version: r.kitVersion,
            synced_at,
          }),
        });
        if (!res.ok) {
          console.warn(
            `  ⚠️  ${r.repo}: report failed (${res.status} ${await res.text()})`
          );
        } else {
          console.log(`  ✓ ${r.repo} → ${r.kitVersion}`);
        }
      } catch (e) {
        console.warn(`  ⚠️  ${r.repo}: report failed (${(e as Error).message})`);
      }
    }
  } catch (e) {
    // Defensive: nothing here may bubble up and fail the sync.
    console.warn(`\n⚠️  Install report skipped: ${(e as Error).message}`);
  }
}

/**
 * Close undici's global dispatcher so no keep-alive sockets/timers linger at exit.
 * On Windows, dangling fetch handles can trip a libuv assert during teardown that
 * hard-aborts the process with a non-zero code — flaky, and fatal when the script
 * is run via child_process (e.g. the dashboard's /api/sync). Best-effort.
 */
async function closeFetchSockets(): Promise<void> {
  try {
    const sym = Symbol.for("undici.globalDispatcher.1");
    const dispatcher = (globalThis as Record<symbol, unknown>)[sym] as
      | { close?: () => Promise<void> }
      | undefined;
    if (dispatcher?.close) await dispatcher.close();
  } catch {
    /* ignore */
  }
}

async function main() {
  // npm reserves --dry-run and strips it before the script sees argv, but exposes it
  // as npm_config_dry_run=true. Honor that so `npm run sync -- --dry-run` is still safe.
  const dryRun =
    process.argv.includes("--dry-run") ||
    process.argv.includes("--preview") ||
    process.env.npm_config_dry_run === "true";

  // --ref <gitref> / --ref=<gitref>: deploy a specific kit version from git instead
  // of the working tree. Validated up front so a bad ref fails clearly, not mid-write.
  const refIdx = process.argv.findIndex((a) => a === "--ref" || a.startsWith("--ref="));
  if (refIdx !== -1) {
    const a = process.argv[refIdx];
    SRC_REF = a.includes("=") ? a.slice(a.indexOf("=") + 1) : process.argv[refIdx + 1];
    if (!SRC_REF) fail("--ref requires a git ref (tag/commit) value");
    try {
      git(["rev-parse", "--verify", "--quiet", `${SRC_REF}^{commit}`], "utf8");
    } catch {
      fail(`--ref: unknown git ref "${SRC_REF}" in ${KIT_ROOT}`);
    }
  }

  loadKitEnv();
  const cfg = loadConfig();

  console.log(
    `sync-to-targets ${dryRun ? "(DRY RUN — no files written)" : ""}`.trim()
  );
  console.log(`source: ${SRC_REF ? `git ref ${SRC_REF} @ ${KIT_ROOT}` : SOURCE_CLAUDE}`);
  console.log(`syncPaths: ${cfg.syncPaths.join(", ")}`);

  // Collect source files once (same set applies to every target).
  const relFiles = cfg.syncPaths.flatMap(collectFiles);
  if (relFiles.length === 0) {
    fail("No files resolved from syncPaths — nothing to sync.");
  }

  let totalWrites = 0;
  const installReports: InstallReport[] = [];
  for (const targetRel of cfg.targets) {
    const result = syncTarget(targetRel, relFiles, dryRun);
    printReport(result, dryRun);
    totalWrites += result.changes.filter((c) => c.kind !== "unchanged").length;

    // Record the version now installed on this target (read from ITS file).
    const repo = path.basename(targetRel);
    const kitVersion = resolveTargetVersion(targetRel);
    if (kitVersion) {
      installReports.push({ repo, kitVersion });
    } else {
      console.warn(
        `  ! ${repo}: no PROMPT_VERSION found — skipping install report for this repo`
      );
    }
  }

  // Best-effort install report; never blocks the sync above.
  await reportInstalls(installReports, dryRun);
  await closeFetchSockets();

  console.log(
    `\n${dryRun ? "Dry run complete." : "Sync complete."} ` +
      `${totalWrites} file change(s) across ${cfg.targets.length} target(s).`
  );
}

main();
