# setup-env.ps1 - Windows equivalent of setup-env.sh
# Bootstrap required env files for the agentic-feature-kit.
# Safe to re-run: never overwrites existing files.
#
# Usage:
#   pwsh scripts/setup-env.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$created  = [System.Collections.Generic.List[string]]::new()
$existed  = [System.Collections.Generic.List[string]]::new()

# -- 1. .env.playwright -------------------------------------------------------
$envPlaywright = Join-Path $repoRoot '.env.playwright'
if (-not (Test-Path $envPlaywright)) {
  @'
# Playwright environment - fill in values from your dev environment.
# Never commit this file to git.

# Base URL of the dev server (default: http://localhost:3000)
# DEV_SERVER_URL=http://localhost:3000

# PUBLIC_PATH of this app - runner prepends it automatically to every route.
# Examples: /your-app/  |  /authoring/  |  /studio/
# Leave blank or remove if the app is served at root (/).
# PUBLIC_PATH=/your-app/

# Auth tokens - copy from browser localStorage after login.
# Run `npm run workflow:login` to populate these automatically.
# PLAYWRIGHT_ACCESS_TOKEN=<your-access-token>
# PLAYWRIGHT_REFRESH_TOKEN=<your-refresh-token>
# PLAYWRIGHT_TOKEN_EXPIRES_AT=<epoch-ms>

# API path pattern used for network intercept (default: **/api/**)
# PLAYWRIGHT_API_PATH_PATTERN=**/api/**
'@ | Set-Content -Path $envPlaywright -Encoding UTF8NoBOM
  $created.Add('.env.playwright')
} else {
  $existed.Add('.env.playwright')
}

# -- 2. .claude/mcp-server/.env -----------------------------------------------
$mcpEnv     = Join-Path $repoRoot '.claude\mcp-server\.env'
$mcpExample = Join-Path $repoRoot '.claude\mcp-server\.env.example'
if (-not (Test-Path $mcpEnv)) {
  if (Test-Path $mcpExample) {
    Copy-Item $mcpExample $mcpEnv
    $created.Add('.claude/mcp-server/.env')
  } else {
    Write-Host 'WARNING: .claude/mcp-server/.env.example not found - skipping MCP server env.' -ForegroundColor Yellow
  }
} else {
  $existed.Add('.claude/mcp-server/.env')
}

# -- 3. .mcp.json (MCP server registration) -----------------------------------
$mcpJson = Join-Path $repoRoot '.mcp.json'
if (-not (Test-Path $mcpJson)) {
  @'
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
'@ | Set-Content -Path $mcpJson -Encoding UTF8NoBOM
  $created.Add('.mcp.json')
} else {
  $existed.Add('.mcp.json')
}

# -- 4. .claude/settings.local.json - enableAllProjectMcpServers --------------
$settingsLocal = Join-Path $repoRoot '.claude\settings.local.json'
if (-not (Test-Path $settingsLocal)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $settingsLocal) | Out-Null
  '{"enableAllProjectMcpServers": true}' | Set-Content $settingsLocal -Encoding UTF8NoBOM
  $created.Add('.claude/settings.local.json')
} elseif ((Get-Content $settingsLocal -Raw) -notmatch '"enableAllProjectMcpServers"') {
  $nodeScript = @'
const fs = require('fs');
const p = process.argv[1];
const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!('enableAllProjectMcpServers' in obj)) {
  const patched = { enableAllProjectMcpServers: true, ...obj };
  fs.writeFileSync(p, JSON.stringify(patched, null, 2) + '\n', 'utf8');
}
'@
  $nodeScript | node - $settingsLocal
  $created.Add('.claude/settings.local.json (patched)')
} else {
  $existed.Add('.claude/settings.local.json')
}

# -- 5. Check root .env for required tokens -----------------------------------
$rootEnv       = Join-Path $repoRoot '.env'
$missingTokens = [System.Collections.Generic.List[string]]::new()
$envContent    = ''

if (Test-Path $rootEnv) {
  $envContent = Get-Content $rootEnv -Raw
} else {
  Write-Host ''
  Write-Host 'WARNING: No .env file found at repo root.' -ForegroundColor Yellow
  Write-Host '   Copy the example and fill in your credentials:'
  Write-Host '   cp .env.example .env'
}

# KIT_TOKEN: satisfied by .env value OR by the workflow config file written by workflow:login
$kitTokenOk = $envContent -match '(?m)^KIT_TOKEN=.+'
if (-not $kitTokenOk) {
  $osConfig = if ($env:APPDATA) {
    Join-Path $env:APPDATA 'workflow\claude\config.json'
  } else {
    Join-Path $HOME '.config/workflow/claude/config.json'
  }
  if (Test-Path $osConfig) { $kitTokenOk = $true }
}
if (-not $kitTokenOk) { $missingTokens.Add('KIT_TOKEN') }

# CONFLUENCE_TOKEN: check .env only (no alternate config location)
if ($envContent -notmatch '(?m)^CONFLUENCE_TOKEN=.+') { $missingTokens.Add('CONFLUENCE_TOKEN') }

if ($missingTokens.Count -gt 0) {
  Write-Host ''
  Write-Host 'WARNING: The following tokens are missing or empty in .env:' -ForegroundColor Yellow
  foreach ($token in $missingTokens) {
    switch ($token) {
      'KIT_TOKEN'        { Write-Host '   * KIT_TOKEN        - contact the kit maintainer, or run: npm run workflow:login' }
      'CONFLUENCE_TOKEN' { Write-Host '   * CONFLUENCE_TOKEN - Confluence -> Profile -> Personal Access Tokens' }
    }
  }
}

# -- 6. Summary ---------------------------------------------------------------
Write-Host ''
Write-Host '================================================'
Write-Host '  setup-env summary'
Write-Host '================================================'
if ($created.Count -gt 0) {
  Write-Host 'Created:' -ForegroundColor Green
  $created | ForEach-Object { Write-Host "     $_" }
}
if ($existed.Count -gt 0) {
  Write-Host 'Already existed (not overwritten):'
  $existed | ForEach-Object { Write-Host "     $_" }
}
Write-Host ''
Write-Host 'Run npm run workflow:login to authenticate, then /feature-from-confluence <url> to start.'
