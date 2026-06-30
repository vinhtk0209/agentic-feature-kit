/**
 * Copilot edition constants.
 *
 * Mirrors bin/editions/claude/index.ts so the installer (bin/lib) can treat editions
 * uniformly. The actual Copilot artifacts (.github/copilot-instructions.md + prompt files)
 * are generated locally from the Claude command source by scripts/build-copilot-edition.ts
 * (`npm run build:copilot`) — see docs/EDITIONS.md.
 */

/** Identifier sent to backend RPCs as `p_agent`. */
export const AGENT = "copilot" as const;

/** Current version of this edition's command bundle (tracks the kit's PROMPT_VERSION). */
export const VERSION = "3.17.0";

/** Subdirectory inside a project where the Copilot bundle lives. */
export const DEST_DIR = ".github";

/** Environment variable name this edition reads its license token from (if used). */
export const TOKEN_ENV = "COPILOT_TOKEN";
