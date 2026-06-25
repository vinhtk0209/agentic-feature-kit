# setup.ps1 - one-shot fresh setup for the agentic-feature-kit.
# Run once after cloning. Safe to re-run.
#
# Usage:
#   pwsh setup.ps1
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot

# -- 0. Node >=20 check -------------------------------------------------------
try {
  $nodeVersion = node -e "process.stdout.write(process.versions.node)" 2>$null
  $nodeMajor   = [int]($nodeVersion -split '\.')[0]
} catch {
  $nodeVersion = 'not installed'
  $nodeMajor   = 0
}
if ($nodeMajor -lt 20) {
  Write-Host "ERROR: Node.js >=20 required (found: $nodeVersion)" -ForegroundColor Red
  Write-Host "   Install from https://nodejs.org  or via nvm:  nvm install 20"
  exit 1
}
Write-Host "Node v$nodeVersion  OK" -ForegroundColor Green

# -- 1. npm install (root) ----------------------------------------------------
Write-Host ""
Write-Host "-- 1/5  npm install (root) ------------------------------------------"
npm install --prefix $repoRoot

# -- 2. npm install (.claude/mcp-server) --------------------------------------
Write-Host ""
Write-Host "-- 2/5  npm install (.claude/mcp-server) ----------------------------"
npm install --prefix (Join-Path $repoRoot '.claude\mcp-server')

# -- 3. npm install (.claude/mcp-workflow) ------------------------------------
Write-Host ""
Write-Host "-- 3/5  npm install (.claude/mcp-workflow) --------------------------"
npm install --prefix (Join-Path $repoRoot '.claude\mcp-workflow')

# -- 4. Install Playwright Chromium -------------------------------------------
Write-Host ""
Write-Host "-- 4/5  npx playwright install chromium -----------------------------"
Push-Location $repoRoot
npx playwright install chromium
Pop-Location

# -- 5. Bootstrap env files, .mcp.json, settings.local.json ------------------
Write-Host ""
Write-Host "-- 5/5  Bootstrap env files -----------------------------------------"
& (Join-Path $repoRoot 'scripts\setup-env.ps1')

# -- Credential checklist -----------------------------------------------------
Write-Host ""
Write-Host "================================================================"
Write-Host "  Credentials to fill in:"
Write-Host "================================================================"
Write-Host ""
Write-Host "  1. CONFLUENCE_TOKEN"
Write-Host "     File: .claude\mcp-server\.env"
Write-Host "     Where to get: Confluence -> your avatar -> Profile -> Personal Access Tokens"
Write-Host ""
Write-Host "  2. KIT_TOKEN"
Write-Host "     File: .env  (or run: npm run workflow:login -- writes it to OS config)"
Write-Host "     Where to get: contact the kit maintainer"
Write-Host ""
Write-Host "  3. Playwright auth tokens  (optional -- B11 UI verification only)"
Write-Host "     File: .env.playwright"
Write-Host "     Fields: PLAYWRIGHT_ACCESS_TOKEN, PLAYWRIGHT_REFRESH_TOKEN, PLAYWRIGHT_TOKEN_EXPIRES_AT"
Write-Host "     Where to get: browser DevTools -> Application -> Local Storage (after login)"
Write-Host "     Shortcut: npm run workflow:login -- populates all three automatically"
Write-Host ""
Write-Host "================================================================"
Write-Host '  Setup complete -- fill in credentials above,' -ForegroundColor Green
Write-Host '  then restart Claude Code and run /feature-from-confluence <url>' -ForegroundColor Green
Write-Host "================================================================"
