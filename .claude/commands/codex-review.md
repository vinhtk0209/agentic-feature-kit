---
description: Thorough code review of the current branch against CLAUDE.md conventions
---

Review all staged/modified files on the current branch against your project's CLAUDE.md standards.

> **Scope:** a *repo-convention* review. The 10 categories below are placeholders — replace them with your project's actual rules (read from your `CLAUDE.md` conventions section). For general correctness/bug hunting use the built-in `/code-review`; this command **complements** it, it doesn't replace it.

## Step 1 — Identify changed files
Run: `git diff --name-only main...HEAD`
Filter to source files (`.ts`, `.tsx`, `.js`, `.jsx`, `.scss`) only.

## Step 2 — Run static checks
```bash
npm run types
npm run lint
```
Capture all errors. Do not fix yet — report them in Step 3.

## Step 3 — Review each changed file
For each file, check all 10 categories. Output a checklist per file:

**File: `<path>`**
| # | Category | Status | Note |
|---|----------|--------|------|
| 1 | Data fetching: mutations invalidate correctly (e.g. `onSettled`, not `onSuccess`) | ✅/❌/⚠️ | |
| 2 | Shared components reused — no reinvention of existing UI building blocks | ✅/❌/⚠️ | |
| 3 | UX states: loading → error → empty → success all handled | ✅/❌/⚠️ | |
| 4 | TypeScript: no `any`, explicit interfaces on exported functions/hooks/components | ✅/❌/⚠️ | |
| 5 | Functions ≤ 50 lines, single responsibility | ✅/❌/⚠️ | |
| 6 | i18n: all user-visible strings go through the project's i18n system | ✅/❌/⚠️ | |
| 7 | Feature-flag / mock hygiene: dev-only flags not left enabled in production code | ✅/❌/⚠️ | |
| 8 | API conventions: response transforms and request body serialization match project patterns | ✅/❌/⚠️ | |
| 9 | Import boundaries: no deep cross-feature imports; project alias used consistently | ✅/❌/⚠️ | |
| 10 | CI: type check + lint pass cleanly | ✅/❌/⚠️ | |

> **Customize:** replace each row's description with your project's actual convention. Copy the relevant rules from your `CLAUDE.md`.

## Step 4 — Summary
- Total ✅ / ❌ / ⚠️ counts
- List of blocking issues (❌) with file + line reference
- List of warnings (⚠️) to consider
- Suggested fixes for each ❌ (one sentence each)
