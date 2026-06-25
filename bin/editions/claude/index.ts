/**
 * Claude edition constants.
 *
 * To add a new edition (e.g. Copilot), create bin/editions/copilot/index.ts
 * exporting the same shape. No changes to bin/lib/ are required.
 */

/** Identifier sent to backend RPCs as `p_agent`. */
export const AGENT = "claude" as const;

/** Current version of this edition's command bundle. */
export const VERSION = "3.17.0";

/** Subdirectory inside a project where the bundle extracts to. */
export const DEST_DIR = ".claude";

/** Environment variable name this edition reads its license token from. */
export const TOKEN_ENV = "KIT_TOKEN";
