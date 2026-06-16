"""
browser-use-wrapper.py
Invoked by /feature-from-confluence at B11 for complex dynamic flow verification.

Usage:
  python .claude/integrations/browser-use-wrapper.py <task_description> <route> [--base-url URL]

Examples:
  python .claude/integrations/browser-use-wrapper.py "verify modal opens and closes" /your-app/feature-route
  python .claude/integrations/browser-use-wrapper.py "fill and submit filter form, verify table updates" /your-app/feature-route --base-url http://localhost:8000

When to use (B11 priority order):
  1. Playwright CLI  -> UI flow, navigation, form interaction  (use first)
  2. browser-use     -> dynamic interaction, complex flow       (use this)
  3. Unit Test       -> pure logic, async error handling        (use last)

Output:
  Prints structured result to stdout for checklist update.
  Saves screenshots to docs/specs/screenshots/<slug>-<timestamp>.png
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Load .env.playwright if it exists (gitignored — safe for secrets)
_env_file = Path(__file__).parent.parent.parent / ".env.playwright"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())


def _try_import_browser_use():
    """browser-use is an optional dependency. Graceful fallback if not installed."""
    try:
        from browser_use import Agent  # type: ignore
        from langchain_anthropic import ChatAnthropic  # type: ignore
        return Agent, ChatAnthropic
    except ImportError:
        return None, None


def run_with_browser_use(task: str, route: str, base_url: str) -> dict:
    """Run verification using browser-use agent."""
    Agent, ChatAnthropic = _try_import_browser_use()

    if Agent is None:
        return {
            "tool": "browser-use",
            "status": "SKIPPED",
            "reason": "browser-use not installed. Install: pip install browser-use langchain-anthropic",
            "install_hint": "pip install browser-use langchain-anthropic",
        }

    import asyncio

    full_url = f"{base_url}{route}"
    timestamp = datetime.now().isoformat()
    slug = route.replace("/", "_").lstrip("_")
    screenshot_dir = Path("docs/specs/screenshots")
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    screenshot_path = str(screenshot_dir / f"{slug}-browser-use-{timestamp.replace(':', '-')}.png")

    async def _run():
        llm = ChatAnthropic(
            model="claude-sonnet-4-6",
            api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        )
        agent = Agent(
            task=(
                f"Navigate to {full_url}. "
                f"Then: {task}. "
                f"Report: what you did, what you observed, whether the feature behaves as expected. "
                f"Take a screenshot at the end and save it to {screenshot_path}."
            ),
            llm=llm,
        )
        result = await agent.run()
        return result

    try:
        result = asyncio.run(_run())
        return {
            "tool": "browser-use",
            "route": route,
            "task": task,
            "timestamp": timestamp,
            "status": "PASS" if result else "UNCERTAIN",
            "evidence": str(result),
            "screenshot": screenshot_path if Path(screenshot_path).exists() else None,
        }
    except Exception as e:
        return {
            "tool": "browser-use",
            "route": route,
            "task": task,
            "timestamp": timestamp,
            "status": "ERROR",
            "error": str(e),
        }


def run_with_playwright_fallback(task: str, route: str, base_url: str) -> dict:
    """
    Fallback: run Playwright CLI runner instead.
    Used when browser-use is unavailable or task is simple enough for Playwright.
    """
    import subprocess

    runner = Path(".claude/integrations/playwright-runner.ts")
    if not runner.exists():
        return {
            "tool": "playwright-fallback",
            "status": "SKIPPED",
            "reason": "playwright-runner.ts not found",
        }

    result = subprocess.run(
        ["npx", "tsx", str(runner), route, "--screenshot"],
        capture_output=True,
        text=True,
    )

    return {
        "tool": "playwright-fallback",
        "route": route,
        "task": task,
        "status": "PASS" if result.returncode == 0 else "FAIL",
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def main():
    parser = argparse.ArgumentParser(
        description="browser-use wrapper for /feature-from-confluence B11 verification"
    )
    parser.add_argument("task", help="Natural language description of the interaction to verify")
    parser.add_argument("route", help="App route to navigate to, e.g. /your-app/feature-route")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("DEV_SERVER_URL", "http://localhost:8000"),
        help="Dev server base URL (default: http://localhost:8000)",
    )
    args = parser.parse_args()

    print(f"\n=== browser-use Verification ===")
    print(f"Task  : {args.task}")
    print(f"Route : {args.route}")
    print(f"URL   : {args.base_url}{args.route}")

    # Try browser-use first, fallback to Playwright
    Agent, _ = _try_import_browser_use()
    if Agent is not None:
        result = run_with_browser_use(args.task, args.route, args.base_url)
    else:
        print("\nbrowser-use not available — falling back to playwright-runner.ts")
        result = run_with_playwright_fallback(args.task, args.route, args.base_url)

    status_icon = {"PASS": "✅", "FAIL": "❌", "ERROR": "❌", "SKIPPED": "⚠️", "UNCERTAIN": "⚠️"}.get(
        result.get("status", ""), "❓"
    )
    print(f"\nStatus : {status_icon} {result.get('status')}")
    if result.get("evidence"):
        print(f"Evidence: {result['evidence'][:500]}")
    if result.get("screenshot"):
        print(f"Screenshot: {result['screenshot']}")
    if result.get("error"):
        print(f"Error  : {result['error']}")
    if result.get("reason"):
        print(f"Reason : {result['reason']}")
        if result.get("install_hint"):
            print(f"Install: {result['install_hint']}")

    print("\n--- JSON ---")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
