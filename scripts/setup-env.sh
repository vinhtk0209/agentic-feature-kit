#!/usr/bin/env bash
# Bootstrap required env files for the agentic-feature-kit.
# Safe to re-run: never overwrites existing files.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREATED=()
EXISTED=()

# ── 1. .env.playwright ────────────────────────────────────────────────────────
ENV_PLAYWRIGHT="$REPO_ROOT/.env.playwright"
if [ ! -f "$ENV_PLAYWRIGHT" ]; then
  cat > "$ENV_PLAYWRIGHT" <<'ENVEOF'
# Playwright environment — fill in values from your dev environment.
# Never commit this file to git.

# Base URL of the dev server (default: http://localhost:3000)
# DEV_SERVER_URL=http://localhost:3000

# PUBLIC_PATH of this app — runner prepends it automatically to every route.
# Examples: /your-app/  |  /authoring/  |  /studio/
# Leave blank or remove if the app is served at root (/).
# PUBLIC_PATH=/your-app/

# Auth tokens — copy from browser localStorage after login.
# Run `npm run workflow:login` to populate these automatically.
# PLAYWRIGHT_ACCESS_TOKEN=<your-access-token>
# PLAYWRIGHT_REFRESH_TOKEN=<your-refresh-token>
# PLAYWRIGHT_TOKEN_EXPIRES_AT=<epoch-ms>

# API path pattern used for network intercept (default: **/api/**)
# PLAYWRIGHT_API_PATH_PATTERN=**/api/**
ENVEOF
  CREATED+=(".env.playwright")
else
  EXISTED+=(".env.playwright")
fi

# ── 2. .claude/mcp-server/.env ───────────────────────────────────────────────
MCP_ENV="$REPO_ROOT/.claude/mcp-server/.env"
MCP_EXAMPLE="$REPO_ROOT/.claude/mcp-server/.env.example"
if [ ! -f "$MCP_ENV" ]; then
  if [ -f "$MCP_EXAMPLE" ]; then
    cp "$MCP_EXAMPLE" "$MCP_ENV"
    CREATED+=(".claude/mcp-server/.env")
  else
    echo "⚠️  .claude/mcp-server/.env.example not found — skipping MCP server env."
  fi
else
  EXISTED+=(".claude/mcp-server/.env")
fi

# ── 3. .mcp.json (MCP server registration) ───────────────────────────────────
MCP_JSON="$REPO_ROOT/.mcp.json"
if [ ! -f "$MCP_JSON" ]; then
  cat > "$MCP_JSON" <<'MCPEOF'
{
  "mcpServers": {
    "confluence-mcp": {
      "command": "npx",
      "args": ["tsx", ".claude/mcp-server/index.ts"]
    },
    "feature-workflow": {
      "command": "npx",
      "args": ["tsx", ".claude/mcp-workflow/index.ts"]
    }
  }
}
MCPEOF
  CREATED+=(".mcp.json")
else
  EXISTED+=(".mcp.json")
fi

# ── 4. .claude/settings.local.json — enableAllProjectMcpServers ──────────────
SETTINGS_LOCAL="$REPO_ROOT/.claude/settings.local.json"
if [ ! -f "$SETTINGS_LOCAL" ]; then
  mkdir -p "$REPO_ROOT/.claude"
  printf '{\n  "enableAllProjectMcpServers": true\n}\n' > "$SETTINGS_LOCAL"
  CREATED+=(".claude/settings.local.json")
elif ! grep -q '"enableAllProjectMcpServers"' "$SETTINGS_LOCAL" 2>/dev/null; then
  node - "$SETTINGS_LOCAL" <<'NODEOF'
const fs = require('fs');
const p = process.argv[1];
const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!('enableAllProjectMcpServers' in obj)) {
  const patched = { enableAllProjectMcpServers: true, ...obj };
  fs.writeFileSync(p, JSON.stringify(patched, null, 2) + '\n', 'utf8');
}
NODEOF
  CREATED+=(".claude/settings.local.json (patched)")
else
  EXISTED+=(".claude/settings.local.json")
fi

# ── 5. Check root .env for required tokens ───────────────────────────────────
ROOT_ENV="$REPO_ROOT/.env"
MISSING_TOKENS=()
ENV_CONTENT=""

if [ -f "$ROOT_ENV" ]; then
  ENV_CONTENT=$(cat "$ROOT_ENV")
else
  echo ""
  echo "⚠️  No .env file found at repo root."
  echo "   Copy the example and fill in your credentials:"
  echo "   cp .env.example .env"
fi

# KIT_TOKEN: satisfied by .env value OR by the workflow config file written by `workflow:login`.
KIT_TOKEN_OK=false
echo "$ENV_CONTENT" | grep -qE '^KIT_TOKEN=.+' 2>/dev/null && KIT_TOKEN_OK=true
if [ "$KIT_TOKEN_OK" = false ]; then
  OS_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/workflow/claude/config.json"
  [ -f "$OS_CONFIG" ] && KIT_TOKEN_OK=true
fi
[ "$KIT_TOKEN_OK" = false ] && MISSING_TOKENS+=("KIT_TOKEN")

# CONFLUENCE_TOKEN: check .env only (no alternate config location)
echo "$ENV_CONTENT" | grep -qE '^CONFLUENCE_TOKEN=.+' 2>/dev/null || MISSING_TOKENS+=("CONFLUENCE_TOKEN")

if [ "${#MISSING_TOKENS[@]}" -gt 0 ]; then
  echo ""
  echo "⚠️  The following tokens are missing or empty in .env:"
  for token in "${MISSING_TOKENS[@]}"; do
    case "$token" in
      KIT_TOKEN)
        echo "   • KIT_TOKEN        — contact the kit maintainer, or run: npm run workflow:login"
        ;;
      CONFLUENCE_TOKEN)
        echo "   • CONFLUENCE_TOKEN — Confluence → Profile → Personal Access Tokens"
        ;;
    esac
  done
fi

# ── 6. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  setup-env summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "${#CREATED[@]}" -gt 0 ]; then
  echo "✅ Created:"
  for f in "${CREATED[@]}"; do echo "     $f"; done
fi
if [ "${#EXISTED[@]}" -gt 0 ]; then
  echo "⏭  Already existed (not overwritten):"
  for f in "${EXISTED[@]}"; do echo "     $f"; done
fi
echo ""
echo "Run npm run workflow:login to authenticate, then /feature-from-confluence <url> to start."
