---
description: Plan a new feature end-to-end following CLAUDE.md conventions
---

Arguments: **$ARGUMENTS**

> **When to use:** the lightweight, interactive scaffold for a new feature **without a Confluence/PDF spec**. For spec-driven, gated, production work use `/feature-from-confluence` (full B0–B12 quality gates, verification, self-improvement). This command is the quick path; it intentionally does **not** run those gates.

Parse `$ARGUMENTS` as follows:
- Everything before ` | spec:` is the **feature description**
- Everything after ` | spec:` (if present) is a **path to a spec file** (markdown converted from PDF, Figma export, etc.)

Example:
```
/new-feature Notification center | spec: docs/specs/notification.md
```

Follow these steps in order without asking for approval between steps.

## Step 1 — Orient
Read these files to ground yourself in project conventions:
- `CLAUDE.md`
- `src/generic/` (glob *.tsx *.ts — identify reusable components: SharedList, Pagination, FilterPopover, etc.)
- `src/generic/pagination/Pagination.tsx`
- **If a spec file path was provided**: read that file in full. Extract: data entities, API endpoints, UI states, filter/sort fields, user interactions, edge cases. Use this as the primary source of truth — skip or shorten Step 2 questions that the spec already answers.

## Step 2 — Ask clarifying questions (ask all at once, one message)
Group your questions into these 6 areas:
1. **Scope**: Which route/tab/panel does this feature live in? New tab or new section in an existing one?
2. **Data shape**: What entities does the API return? Any pagination (page-based or infinite scroll)?
3. **Interactions**: What mutations exist (create/update/delete/approve)? Any polling needed?
4. **Filters/Search**: Any filter panel? API-side or client-side? Which fields?
5. **Mock**: Should USE_MOCK start as `true`? Any edge cases to mock (empty state, error)?
6. **i18n**: Any new strings? Should they go in a new `messages.ts` or an existing one?

Wait for user answers before continuing.

## Step 3 — Create implementation plan
Based on answers, write a numbered plan:
```
1. [file] [what] → verify: [check]
2. ...
```
Cover: types.ts → api.ts (USE_MOCK=true) → apiHooks.ts → UI components → messages.ts → SCSS → route wiring.

State assumptions explicitly. Flag any tradeoffs (e.g. client-side vs API filter).

**Wait for user confirmation (yes / confirm) before continuing to Step 4.**

## Step 4 — Generate API contract
Create `docs/components/<feature-name>/<FeatureName>.http`, one `###` block per endpoint, following the canonical format in [`.claude/templates/http-contract.template.md`](../templates/http-contract.template.md).

## Step 5 — Scaffold USE_MOCK infrastructure
Create `data/types.ts`, `data/api.ts` (USE_MOCK=true, delay(), mock arrays, all API functions), `data/apiHooks.ts` (useQuery/useMutation wrappers).

Remind the user: set `USE_MOCK = false` and run `/drop-mock <path>` when the real API is ready.

## Navigation conventions (L-06)
Apply these when the feature includes drill-down detail pages or tabbed parent pages:

- **Back buttons on drill-down pages**: always use `generatePath(ROUTE, params) + '?tab=<tabId>'`; never `navigate(-1)`. Browser history depends on entry path and will not land on the spec-required tab.
- **Tabbed pages with `?tab=` URL param**: initialize tab state as `useState(validTabs.includes(searchParams.get('tab')) ? searchParams.get('tab') : defaultTab)` — not a hardcoded `useState('defaultTab')`. This makes tab state URL-shareable and resilient to programmatic back-navigation.
