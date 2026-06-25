/**
 * local-config.ts — Platform-level persistent config storage.
 *
 * Configs are scoped per agent edition under:
 *   Windows: %APPDATA%\workflow\<agent>\config.json
 *   Unix:    ~/.config/workflow/<agent>/config.json
 *
 * This keeps Claude and Copilot (etc.) credentials separate while sharing
 * one storage mechanism.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface WorkflowConfig {
  agent: string;        // which edition this token belongs to (e.g. "claude")
  token: string;
  owner: string;
  verified_at: string;  // ISO 8601
  version: string;      // edition version at time of login
}

export function getConfigPath(agent = "claude"): string {
  const base =
    process.platform === "win32"
      ? path.join(
          process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
          "workflow"
        )
      : path.join(os.homedir(), ".config", "workflow");
  return path.join(base, agent, "config.json");
}

export function loadConfig(agent = "claude"): WorkflowConfig | null {
  try {
    const raw = fs.readFileSync(getConfigPath(agent), "utf8");
    return JSON.parse(raw) as WorkflowConfig;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: WorkflowConfig): void {
  const cfgPath = getConfigPath(cfg.agent);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  const tmp = cfgPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
  fs.renameSync(tmp, cfgPath);
}
