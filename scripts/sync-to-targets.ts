/**
 * sync-to-targets.ts — one-way sync: claude-workflow-kit (source of truth) -> target repos.
 *
 * Architecture (locked, do not change):
 *  1. ONE direction only: source -> targets. Source always wins. No reverse sync.
 *  2. ALLOWLIST, not blocklist: only paths the kit owns (declared in sync.config.json
 *     `syncPaths`) are touched. Anything not listed is left alone in the target, so
 *     .env / secrets / mcp-server are safe because they are NOT in the allowlist.
 *  3. Manual trigger only: `npm run sync` (real) / `npm run sync -- --dry-run` (preview).
 *  4. Dry-run + report. Before overwriting a target, snapshot the to-be-changed files
 *     into <target>/.kit-backup/<timestamp>/ (A-05) so a bad sync is reversible; the
 *     last 3 snapshots per target are kept. (The source of truth is still the forward
 *     backup; .kit-backup is the *target-side* undo.)
 *  5. Target paths come from config (relative). Never hardcode absolute paths.
 *
 * Usage:
 *   npm run sync               # write changes, print per-target summary
 *   npm run sync:dry           # preview only, write nothing (canonical preview cmd)
 *   npm run sync -- --dry-run  # also preview — npm swallows --dry-run as its own
 *                              # reserved flag, but exposes it via npm_config_dry_run,
 *                              # which we honor so this stays safe.
 *   npx tsx scripts/sync-to-targets.ts --dry-run   # direct invocation
 *
 *   # Guardrail: a real sync REFUSES to run if .claude/ has uncommitted changes,
 *   # so raw/unproven drafts can't leak to targets (the 2026-07-04 near-miss).
 *   npm run sync -- --force-dirty   # override the git-clean guard (conscious opt-in)
 *
 *   npm run sync:rollback -- --target ../isu-elearner-learning   # restore last snapshot
 *   npm run sync:rollback -- --target <t> --snapshot <name>      # restore a specific one
 *   npm run sync:rollback -- --target <t> --list                 # list snapshots
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

  // Classify everything first so we can snapshot the to-be-changed files BEFORE writing.
  const planned = relFiles.map((rel) => {
    const destAbs = path.join(targetClaude, rel);
    return { rel, destAbs, kind: classify(rel, destAbs) };
  });
  for (const p of planned) changes.push({ rel: p.rel, kind: p.kind });

  const toWrite = planned.filter((p) => p.kind !== "unchanged");
  if (dryRun || toWrite.length === 0) return { target: targetRel, changes };

  // A-05: snapshot the pre-images (and record added files) so this sync is reversible.
  const snap = snapshotBeforeWrite(targetRoot, toWrite);
  if (snap) console.log(`  ↻ snapshot: ${path.relative(targetRoot, snap)}`);

  for (const p of toWrite) {
    fs.mkdirSync(path.dirname(p.destAbs), { recursive: true });
    fs.writeFileSync(p.destAbs, readSource(p.rel));
  }
  return { target: targetRel, changes };
}

// ---------------------------------------------------------------------------
// A-05: target-side snapshot + rollback.
// ---------------------------------------------------------------------------

const BACKUP_DIRNAME = ".kit-backup";
const MAX_SNAPSHOTS = 3;

interface SnapshotManifest { at: string; added: string[]; updated: string[] }
interface PlannedWrite { rel: string; destAbs: string; kind: ChangeKind }

/** List snapshot folder names under a target's .kit-backup, oldest → newest. */
export function listSnapshots(backupRoot: string): string[] {
  if (!fs.existsSync(backupRoot)) return [];
  return fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // timestamp names sort chronologically
}

/** Keep only the newest `keep` snapshots; delete the rest. */
export function pruneSnapshots(backupRoot: string, keep: number = MAX_SNAPSHOTS): void {
  const snaps = listSnapshots(backupRoot);
  for (const name of snaps.slice(0, Math.max(0, snaps.length - keep))) {
    fs.rmSync(path.join(backupRoot, name), { recursive: true, force: true });
  }
}

/**
 * Snapshot the files a sync is about to change. For `updated` files we copy the current
 * (pre-overwrite) content under <snap>/.claude/<rel>; `added` files have no pre-image so
 * they're only recorded in the manifest (rollback deletes them). Returns the snapshot dir.
 */
function snapshotBeforeWrite(targetRoot: string, toWrite: PlannedWrite[]): string | null {
  if (toWrite.length === 0) return null;
  const backupRoot = path.join(targetRoot, BACKUP_DIRNAME);
  fs.mkdirSync(backupRoot, { recursive: true });
  // Never let snapshots get committed into the target, regardless of its .gitignore.
  fs.writeFileSync(path.join(backupRoot, ".gitignore"), "*\n");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapDir = path.join(backupRoot, stamp);
  fs.mkdirSync(snapDir, { recursive: true });

  const added: string[] = [];
  const updated: string[] = [];
  for (const p of toWrite) {
    if (p.kind === "added") { added.push(p.rel); continue; }
    const snapFile = path.join(snapDir, ".claude", p.rel);
    fs.mkdirSync(path.dirname(snapFile), { recursive: true });
    fs.copyFileSync(p.destAbs, snapFile);
    updated.push(p.rel);
  }
  const manifest: SnapshotManifest = { at: new Date().toISOString(), added, updated };
  fs.writeFileSync(path.join(snapDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  pruneSnapshots(backupRoot);
  return snapDir;
}

/**
 * Apply a snapshot back onto a target's .claude/: restore `updated` files from the
 * snapshot's pre-images and delete `added` files (they didn't exist before the sync).
 * Returns counts. Pure w.r.t. FS paths — unit-tested.
 */
export function applyRollback(
  targetClaude: string,
  snapDir: string,
  manifest: SnapshotManifest
): { restored: number; removed: number } {
  let restored = 0;
  let removed = 0;
  for (const rel of manifest.updated) {
    const from = path.join(snapDir, ".claude", rel);
    const to = path.join(targetClaude, rel);
    if (fs.existsSync(from)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      restored += 1;
    }
  }
  for (const rel of manifest.added) {
    const to = path.join(targetClaude, rel);
    if (fs.existsSync(to)) { fs.rmSync(to); removed += 1; }
  }
  return { restored, removed };
}

/** CLI rollback for one target. */
function rollbackTarget(targetRel: string, snapshotName: string | null, list: boolean): void {
  const targetRoot = path.resolve(KIT_ROOT, targetRel);
  const backupRoot = path.join(targetRoot, BACKUP_DIRNAME);
  const snaps = listSnapshots(backupRoot);

  if (list) {
    console.log(`\nSnapshots for ${targetRel} (${backupRoot}):`);
    if (snaps.length === 0) console.log("  (none)");
    for (const s of snaps) console.log(`  • ${s}`);
    console.log("");
    return;
  }

  if (snaps.length === 0) fail(`No snapshots in ${backupRoot} — nothing to roll back.`);
  const chosen = snapshotName ?? snaps[snaps.length - 1];
  if (!snaps.includes(chosen)) fail(`Snapshot "${chosen}" not found. Available: ${snaps.join(", ")}`);

  const snapDir = path.join(backupRoot, chosen);
  let manifest: SnapshotManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(snapDir, "manifest.json"), "utf8"));
  } catch (e) {
    return fail(`Cannot read manifest for snapshot "${chosen}": ${(e as Error).message}`);
  }
  const { restored, removed } = applyRollback(path.join(targetRoot, ".claude"), snapDir, manifest);
  console.log(`\n✅ Rolled back ${targetRel} to snapshot ${chosen}`);
  console.log(`   restored ${restored} file(s), removed ${removed} added file(s).`);
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
// Guardrail: refuse to sync an uncommitted (dirty) .claude/ working tree.
//
// git-clean is the only "proven-ish" signal that cannot be self-reported around:
// verify_complete is a self-written string (memory.ts) and test_status="enforced"
// is a self-declared label that already drifts (lesson-registry.ts). A COMMITTED
// change has at minimum passed a deliberate human gate; a dirty-tree change has
// passed nothing. This does NOT prove the evolution works (that is the measurement
// layer's job) — it only stops accidental sync of raw drafts. Override with
// --force-dirty. Skipped when SRC_REF is set: a `--ref` deploy reads source from a
// committed git ref, not the working tree, so working-tree dirtiness is irrelevant.
// ---------------------------------------------------------------------------
function assertCleanClaudeTree(dryRun: boolean, forceDirty: boolean): void {
  if (SRC_REF) return; // --ref reads a committed ref; working-tree state does not apply

  let dirty: string;
  try {
    dirty = (git(["status", "--porcelain", "--", ".claude"], "utf8") as string).trim();
  } catch (e) {
    const first = (e as Error).message.split("\n")[0];
    if (dryRun) { console.warn(`  ! could not check .claude/ git state: ${first}`); return; }
    fail(`cannot verify .claude/ git state (${first}). Refusing to sync. Use --force-dirty to override.`);
  }

  if (!dirty) return; // clean tree → proceed

  const lines = dirty.split(/\r?\n/);
  if (forceDirty) {
    console.warn(`\n⚠️  .claude/ has ${lines.length} uncommitted change(s) — syncing anyway (--force-dirty):`);
    for (const l of lines) console.warn(`     ${l}`);
    console.warn("");
    return;
  }

  console.error(`\nERROR: .claude/ has ${lines.length} uncommitted change(s) — refusing to sync unproven/uncommitted evolutions:`);
  for (const l of lines) console.error(`  ${l}`);
  console.error(
    "\nA committed change has at least passed a deliberate human gate; a dirty tree has passed nothing.\n" +
    "This does NOT prove the change works — it only prevents accidental sync of raw drafts.\n" +
    "Commit the change first, or re-run with --force-dirty to override consciously.\n"
  );
  if (dryRun) { console.warn("(dry run — a real sync would exit non-zero here.)\n"); return; }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Install reporting (Part B): after syncing a target, record which kit version
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

function argValue(name: string): string | null {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return null;
  const a = process.argv[i];
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : process.argv[i + 1] ?? null;
}

async function main() {
  // A-05 rollback mode: restore a target from its .kit-backup snapshot, then exit.
  if (process.argv.includes("--rollback")) {
    const target = argValue("target");
    if (!target) fail("--rollback requires --target <relative-path>");
    rollbackTarget(target as string, argValue("snapshot"), process.argv.includes("--list"));
    return;
  }

  // npm reserves --dry-run and strips it before the script sees argv, but exposes it
  // as npm_config_dry_run=true. Honor that so `npm run sync -- --dry-run` is still safe.
  const dryRun =
    process.argv.includes("--dry-run") ||
    process.argv.includes("--preview") ||
    process.env.npm_config_dry_run === "true";
  const forceDirty = process.argv.includes("--force-dirty");

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

  assertCleanClaudeTree(dryRun, forceDirty);

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

// Run the CLI only when invoked directly (not when imported by a test).
if (process.argv[1] && /sync-to-targets\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  main();
}
