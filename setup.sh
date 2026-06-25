#!/usr/bin/env bash
# setup.sh — one-shot fresh setup for the agentic-feature-kit.
# Run once after cloning. Safe to re-run.
#
# Usage:
#   bash setup.sh        (from repo root)
#   npm run setup
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 0. Node >=20 check ────────────────────────────────────────────────────────
if node -e "process.exit(Number(process.versions.node.split('.')[0]) < 20 ? 1 : 0)" 2>/dev/null; then
  echo "Node $(node --version 2>/dev/null)  OK"
else
  echo "WARNING: Node.js >=20 recommended (node may be missing or too old)"
  echo "   Install from https://nodejs.org  or via nvm:  nvm install 20"
fi

# ── 1. npm install (root) ─────────────────────────────────────────────────────
echo ""
echo "── 1/5  npm install (root) ──────────────────────────────────────────────"
npm install --prefix "$REPO_ROOT"

# ── 2. npm install (.claude/mcp-server) ──────────────────────────────────────
echo ""
echo "── 2/5  npm install (.claude/mcp-server) ────────────────────────────────"
npm install --prefix "$REPO_ROOT/.claude/mcp-server"

# ── 3. npm install (.claude/mcp-workflow) ────────────────────────────────────
echo ""
echo "── 3/5  npm install (.claude/mcp-workflow) ──────────────────────────────"
npm install --prefix "$REPO_ROOT/.claude/mcp-workflow"

# ── 4. Install Playwright Chromium ───────────────────────────────────────────
echo ""
echo "── 4/5  npx playwright install chromium ─────────────────────────────────"
( cd "$REPO_ROOT" && npx playwright install chromium )

# ── 5. Bootstrap env files, .mcp.json, settings.local.json ───────────────────
echo ""
echo "── 5/5  Bootstrap env files ─────────────────────────────────────────────"
bash "$REPO_ROOT/scripts/setup-env.sh"

# ── Credential checklist ──────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Credentials to fill in:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. CONFLUENCE_TOKEN"
echo "     File: .claude/mcp-server/.env"
echo "     Where to get: Confluence → your avatar → Profile → Personal Access Tokens"
echo ""
echo "  2. KIT_TOKEN"
echo "     File: .env  (or run: npm run workflow:login — writes it to OS config)"
echo "     Where to get: contact the kit maintainer"
echo ""
echo "  3. Playwright auth tokens  (optional — B11 UI verification only)"
echo "     File: .env.playwright"
echo "     Fields: PLAYWRIGHT_ACCESS_TOKEN, PLAYWRIGHT_REFRESH_TOKEN, PLAYWRIGHT_TOKEN_EXPIRES_AT"
echo "     Where to get: browser DevTools → Application → Local Storage (after login)"
echo "     Shortcut: npm run workflow:login — populates all three automatically"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Setup complete — fill in credentials above,"
echo "    then restart Claude Code and run /feature-from-confluence <url>"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
