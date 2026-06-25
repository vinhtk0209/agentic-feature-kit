/**
 * bundle.ts — Platform-level bundle download and extraction.
 *
 * All functions take an explicit `agent` parameter so the same code serves
 * every edition (claude, copilot, codex, …). The backend RPC is designed
 * agent-generic: get_bundle_url(p_token, p_agent, p_version).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { rpc, RPC_HEADERS } from "./supabase";

export async function getBundleUrl(
  token: string,
  agent: string,
  version: string
): Promise<string> {
  const result = await rpc<{ url: string }>("get_bundle_url", {
    p_token: token,
    p_agent: agent,
    p_version: version,
  });
  return result.url;
}

export async function getLatestVersion(token: string, agent: string): Promise<string> {
  const result = await rpc<{ version: string }>("get_latest_version", {
    p_token: token,
    p_agent: agent,
  });
  return result.version;
}

export async function downloadAndExtract(
  token: string,
  agent: string,
  version: string,
  destDir: string
): Promise<void> {
  const url = await getBundleUrl(token, agent, version);

  const res = await fetch(url, { headers: { Connection: RPC_HEADERS.Connection } });
  if (!res.ok) throw new Error(`Bundle download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const tmpFile = path.join(
    os.tmpdir(),
    `workflow-bundle-${agent}-${Date.now()}.tar.gz`
  );
  try {
    fs.writeFileSync(tmpFile, buffer);
    fs.mkdirSync(destDir, { recursive: true });
    execSync(`tar -xz -C "${destDir}" --strip-components=1 -f "${tmpFile}"`, {
      stdio: "inherit",
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // best-effort cleanup
    }
  }
}
