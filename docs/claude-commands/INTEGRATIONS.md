# INTEGRATIONS.md — Workflow toolchain architecture map

> Canonical wiring reference for the `.claude/integrations/` toolchain behind `/feature-from-confluence`.
> **Per-file one-liners live in `.claude/SETUP.md`** (this file points there, doesn't duplicate them).
> **Test counts are NOT hardcoded here** — `package.json` `test:kit` is the source of truth (run `npm run test:kit`).
> Reflects the working tree after the cross-edition machinery removal (no `parity-check*`, no B12.7).

---

## 1. The model — source of truth vs projections

```
              ┌─────────────────────────────────────────────┐
  WRITE       │  docs/specs/<Feature>/context-summary.md      │   ← SOURCE OF TRUTH
 (memory.ts)  │  (Raw JSON block)                             │     (persisted resume state)
              └───────────────┬─────────────────────────────┘
                              │ projected by (regenerated, never authoritative)
              ┌───────────────┴───────────────┐
              ▼                                ▼
   docs/specs/INDEX.md              docs/specs/<Feature>/feature-digest.md
   (feature-index.ts)               (feature-digest.ts, only if finalConfirmed)
   — flat multi-feature table       — compact recall for a done feature
   — `--check` guards drift         — never a gate input; safe to delete
```

**Rule (see TOKEN-OPTIMIZATION.md / Phase-7 principle): never optimize deterministic state.**
`context-summary.md` is authoritative; `INDEX.md` and `feature-digest.md` are deterministic
projections — regenerable, `--check`-able, and **never** read as gate inputs.

## 2. Runtime sequence — what runs when

**SESSION BOOTSTRAP (before B0):**
| Step | Script | Role | Fatal? |
|---|---|---|---|
| Token gate | `telemetry.ts verify` | verify token before any work; exit 1 halts, infra failure is fail-open | **yes on exit 1** |
| 0 / 0.B | (prompt) | read CLAUDE.md → PROJECT_CTX; resolve stack/pkg-manager | — |
| 0.C | `improve-trigger.ts --bootstrap` | ≤1 soft-constraint amendment advisory | no (best-effort) |
| 0.D | `learned-config.ts --json` | strengthen-only knobs | no (best-effort) |
| 0.E | `regression-corpus.ts` (+ budget) | replay golden corpus + size ratchet | **yes — halts** |
| 1 | `memory.ts load` | resume active feature via `.current-feature` | — |
| 2 | `feedback-analyzer.ts --summary` | past-run pattern lens | no |

**B-step hooks:**
| Step | Script(s) |
|---|---|
| B10 | `lint-feature.ts --code-only` |
| B11 | `b11-runner.ts` (types+eslint+Playwright) · `lint-feature.ts --gate` · `contract-probe.ts` |
| B12 (end) | `telemetry.ts feature <FeatureName>` — best-effort, never blocks |
| B12.5 | `b12-logger.ts` + `friction-meter.ts` |
| ★7 failure | `telemetry.ts error step_failure <step> <msg>` — best-effort |
| any save | `memory.ts save` → regenerates `INDEX.md` (+ `feature-digest.md` on finalConfirmed) |

## 3. Enforcement / wiring map

| Guard | Where it runs | Fatal? |
|---|---|---|
| static analysis (`b11_a`) | `b11-runner` exit code | **yes** |
| AC coverage HR33–36 | `lint-feature` → `b11-runner` | **yes** |
| learned UX-state rules | `lint-feature` coverage gate | yes when on |
| L-05 literal chart value: 0 | `lint-feature checkLiteralChartValueZero` (always) | yes (error) |
| L-03 modal close selector type | `lint-feature checkModalCloseSelector` (spec-coupled) | no (warn) |
| L-02/W.2b i18n case drift | `lint-feature checkI18nCaseDrift` (spec-coupled) | no (warn) |
| contract drift | `contract-probe` (B11, auto) | no — advisory |
| L-09 fallback_masking | `contract-probe detectFallbackMasking` (B11, per endpoint) | yes (error level) |
| L-09 suspect_value | `contract-probe detectSuspectValues` (B11, per endpoint) | no (warn) |
| L-08 cascade detection | `playwright-runner analyzeCascade` (B11 v2 states loop) | no (report only) |
| golden corpus | `regression-corpus` (Step 0.E) | **yes — halts pre-B0** |
| prompt-size ratchet | `prompt-budget --gate` (corpus / CI) | **yes** |
| INDEX drift | `feature-index --check` (CI / `test:kit`) | **yes (CI)** |
| version-stamp drift | `version-check` (CI / `test:kit`) | **yes (CI)** |
| ownership boundary | `check-ownership` (B0.5 Check 3) | blocks on mismatch |

## 4. Dependency graph (import edges — travels as one bundle)

```
memory ──────────► feature-index (regenerateIndex, parseContextJson)
memory ──────────► feature-digest
feature-digest ──► feature-index (parseContextJson)
lint-feature ────► ux-states, learned-config
eval-feature ────► lint-feature
regression-corpus► lint-feature, feedback-analyzer, prompt-budget
improve-trigger ─► feedback-analyzer, learned-config
b12-logger ──────► feedback-analyzer, friction-meter
kpi-report ──────► feedback-analyzer (type)
b11-runner ──────► ux-states
version-check ───► (none — standalone)
```
External npm: `playwright` (playwright-runner), `typescript` (contract-probe). Runner: `tsx`.
**No script extracts alone** — copy `.claude/integrations/` whole.

## 5. Artifact ownership / data-flow

| File | Written by | Read by | Authoritative? |
|---|---|---|---|
| `docs/specs/<F>/context-summary.md` | `memory.ts` | `memory`, `feature-index`, `feature-digest` | **yes (resume truth)** |
| `docs/specs/.current-feature` | `memory.ts` | `memory.ts` | yes (active pointer) |
| `docs/specs/INDEX.md` | `feature-index.ts` (via memory save) | humans / resume | no (projection) |
| `docs/specs/<F>/feature-digest.md` | `feature-digest.ts` (finalConfirmed) | humans / recall | no (projection) |
| `docs/specs/.feedback-history.md` | `b12-logger.ts` | `feedback-analyzer`, `kpi-report` | yes (run log) |
| `.claude/prompt-evolution.md` | B12.6 / humans | `lesson-registry` | yes (release ledger) |
| `recovery.log` (per feature) | various steps | humans / `friction-meter` | yes (audit log) |
| `.claude/integrations/prompt-budget.json` | humans (deliberate) | `prompt-budget`, `regression-corpus` | yes (ratchet config) |

## 6. Per-integration index

Roles + CLI + `(vN)` are in **`.claude/SETUP.md` → "Files in this kit"** (single source — not duplicated here).
Scripts: `memory` · `feature-index` · `feature-digest` · `prompt-budget` · `version-check` · `learned-config`
· `improve-trigger` · `lesson-registry` · `friction-meter` · `kpi-report` · `feedback-analyzer` · `contract-probe`
· `check-ownership` · `lint-feature` · `eval-feature` · `ux-states` · `b11-runner` · `b12-logger`
· `regression-corpus` · `playwright-runner` + `corpus/`.

**Untested surface (no co-located `.test.ts`) — audit residual:** `b11-runner`, `b12-logger`, `feedback-analyzer`,
`kpi-report`, `version-check`. (`memory` + `regression-corpus` were covered in the action pass.)

`playwright-runner` now has a co-located `playwright-runner.test.ts` covering `analyzeCascade` (L-08 pure cascade logic); the browser-driven path remains untested at unit level.

**Removed (cross-edition cleanup):** `parity-check.ts`, `parity-check-semantic.ts`, B12.7 step.

## 10. L-series checks — lesson-derived machine gates

### lint-feature.ts additions (v3.18)

| Rule | Function | Mode | Level | Trigger |
|------|----------|------|-------|---------|
| `L05` | `checkLiteralChartValueZero` | always (code-only OK) | error | `value: 0` literal inside a `.map(` context (±15 lines) |
| `L03` | `checkModalCloseSelector` | spec-coupled (needs ux-states) | warn | footer-button selector (`button:has-text('Cancel')`) in ux-states steps AND TSX modal has no Footer/ActionRow |
| `W2` (drift) | `checkI18nCaseDrift` | spec-coupled (needs ux-states + messages.ts) | warn | `text:` assertion value cannot be traced to any `defaultMessage` after exact/trim/toUpperCase/toLowerCase transforms |

### contract-probe.ts additions (v3.18 — L-09)

Two new drift classes in `ContractFinding.kind`:

| Kind | Level | What it detects |
|------|-------|-----------------|
| `fallback_masking` | error | API text reads a type-modeled field with `??` fallback, AND that field is absent from the contract response — the fallback silently renders a default, hiding the gap |
| `suspect_value` | warn | Two string fields at the same object level share the same non-empty value (e.g. `text === id`), suggesting wrong-field data from the backend |

New exports: `extractNullishFields(apiText)`, `detectFallbackMasking(...)`, `detectSuspectValues(...)`.

### playwright-runner.ts additions (v3.18 — L-08)

**Cascade detection**: the v2 states + negative_states loop now tracks the first step-action failure as `rootFailure`. All subsequent states are marked `cascade-blocked` (not executed) with evidence pointing to the root. A `PLAYWRIGHT-CASCADE` check is appended: `Root failure ("<state>") → N cascade-blocked state(s)`.

New export: `analyzeCascade(stateResults)` — pure function, tested in `playwright-runner.test.ts`.

## 9. Telemetry — token-based usage control

`telemetry.ts` adds a lightweight usage-control and observability layer on top of the kit. Every invocation is gated; feature completions and step failures are logged for aggregate analysis.

### What it collects

| Event | Table | Fields |
|-------|-------|--------|
| Token verification | (RPC side-effect) | `kit_version`, timestamp |
| Feature built | `usage_logs` | `token_id`, `event_type=feature_built`, `feature_name`, `kit_version` |
| Step failure | `error_reports` | `token_id`, `error_type`, `phase`, `message`, `kit_version` |

No PII is collected. `feature_name` is the spec title as typed by the user. `token_id` is a server-side opaque UUID — the raw token value is never stored.

### Security model

- **Anon key is public by design.** The `SUPABASE_ANON_KEY` embedded in `telemetry.ts` can only call `verify_kit_token` and insert into log tables. Row-Level Security prevents it from reading any token data or other users' rows.
- **Token stays on the client.** `KIT_TOKEN` is read from `process.env`; it is never echoed or logged. Set it in `.env` (gitignored) — see `.env.example`.

### Failure modes

| Scenario | Exit | Blocks? |
|----------|------|---------|
| Token valid | 0 | — |
| Token missing / invalid / expired / quota | 1 | **yes — workflow halts** |
| Network down / Supabase unreachable | 0 | no — fail-open with `⚠️` warning |
| `feature` / `error` commands (best-effort) | 0 always | never |

Infra failures on `verify` exit 0 intentionally — a network outage must not block legitimate users. Only a token-level rejection (invalid, revoked, expired, quota) exits 1 and halts.

## 7. Test inventory

**Do not hardcode counts here** (HARDENING §13 drifted because it did). Source of truth = `package.json`:
```
npm run test:kit     # runs every *.test.ts suite + version:check + index --check + budget --gate
```
Suites are the `test:*` scripts in `package.json`; the chain is `test:kit`.

## 8. Health checks — what catches what

| Command | Catches | Misses |
|---|---|---|
| `npm test` → `posttest` → `test:kit` | unit regressions + INDEX/version/budget drift | full-app types/lint, runtime behavior |
| `.github/workflows/workflow-kit-ci.yml` | the above, on PR | full-app `types`/`lint`/`test` (pre-existing debt — intentionally not gated yet) |
| `npm run types` / `npm run lint` | full-app TS/lint | not in `test:kit` (carry pre-existing app debt) |
