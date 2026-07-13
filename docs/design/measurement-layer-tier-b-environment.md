# Measurement Layer v1 — Tier B verification environment (CORS + auth) (design)

> ⚠️ **VERIFICATION RESULT (2026-07-12, blocking — supersedes the CORS emphasis below).** A live
> read-only probe (Change Z.3, lesson L-2026-07-12-011) **DISPROVED the CORS hypothesis**: an OPTIONS
> preflight to `api.fpt-apps.com` with `Origin: http://localhost:1999` returned **200 with
> `access-control-allow-origin: http://localhost:1999`** — the backend explicitly whitelists the dev
> origin and does NO server-side 403. A plain GET returned **401**. `injectAuthTokens`
> (`playwright-runner.ts:297`) needs `PLAYWRIGHT_ACCESS_TOKEN`, which is **absent** from authoring's
> `.env.playwright` → Tier B ran UNAUTHENTICATED → 401 → cross-origin login redirect → mislabeled
> "PLAYWRIGHT-002 CORS". **The real blocker is a missing auth token, NOT CORS.** `--disable-web-security`
> (§1) addresses a non-existent block and is DEMOTED. **Revised direction: AUTH-FIRST** — populate a fresh
> `PLAYWRIGHT_ACCESS_TOKEN` (credential/env task), add the fail-closed token preflight (§2), keep §4
> (assert real data reached — would have caught the empty 401 pass). The decisive test is a Tier-B re-run
> WITH the token populated; only if a genuine CORS block then appears on some host is §1 revisited. §1
> below is retained for record but is no longer the primary fix.
>
> ⚠️ **RE-GROUND CORRECTION (2026-07-13, session 3 — supersedes the "absent token" claim above).**
> A fresh disk re-ground found `PLAYWRIGHT_ACCESS_TOKEN` is in fact **PRESENT** in authoring's
> `.env.playwright:14` (not absent); `checkPlaywrightToken()` reports **`expiring-soon` (~5h left)**
> (`PLAYWRIGHT_TOKEN_EXPIRES_AT=1783950800` = 2026-07-13T13:53:20Z; probed 08:34:52Z). The token was
> evidently added after the Z.3 probe. Two facts carried into the LOCKED plan: (a) the fail-closed
> preflight MUST gate on the exported `checkPlaywrightToken()` **status** — `missing`/`expired`/
> `expiring-soon` all THROW — NOT on the `version-check --playwright` **exit code**, which returns **0**
> for `expiring-soon` (warn-only, verified on disk 2026-07-13). (b) The "unauthenticated 401" root-cause
> for the 2026-07-12T14:07Z run is now uncertain (token `iat` 13:53Z predates it), but the fix (§2
> preflight + §4 data-reached assertion) stands regardless — a present-but-expiring token is precisely
> the silent-empty-401 risk §4 guards.
>
> **Status: LOCKED — implementing (2026-07-13, session 3). Targets kit v3.24.** Design produced 2026-07-12 (session 2).
> Fixes Z.1 (Tier-B CORS wiring blocker) + Z.2 (assertion instability), lessons L-2026-07-12-009/010.
> Context: with the Y.1 honest gate live, a real Tier B pre-check proved **no feature has ever passed
> Tier B honestly** — every `api.fpt-apps.com` route CORS-fails. This design answers BOTH layers (CORS
> AND auth) BEFORE either is touched, so we don't "fix CORS and discover 401 next." **The core risk
> is not the CORS error — it's trading a CORS-block for a silent empty-data PASS.**

All `file:line` citations are literal, read this session. Read-only; no code changed.

---

## 0. Grounding

- **Z.1**: `b11-runner.ts` `runPlaywrightForRoute` builds the `playwright-runner` cmd without
  `--disable-web-security`; `playwright-runner.ts:883-889` supports it (comment names `api.fpt-apps.com`),
  `:1221` reads it. → Tier B launches WITH web security → CORS-blocks every backend-calling route.
- No feature has an honest `b11_b='pass'` on disk (`.b11-result.json`: `skip`/`fail`/`fail`); both
  "clean runs" (US-AD-093 Attendance, US-AD-094 AssessmentGrading) were false-proven pre-Y.1.

---

## 1. Layer 1 — CORS: does `--disable-web-security` faithfully mirror production?

### How production reaches the backend (grounded)
- `tempp/isu-elearner-authoring/.env:16` `API_BASE_URL = 'https://api.fpt-apps.com/isu-elearner'` — a
  **direct absolute cross-origin URL**. Other targets too (`LMS_BASE_URL`, `STUDIO_BASE_URL='https://
  cms.fpt-apps.com'`, `.env:15/40`).
- **No devServer proxy**: `webpack.dev.config.js` exists but no `proxy`/`devServer.proxy` block found;
  there is no `module.config.js`/`env.config.js`. So the browser calls `api.fpt-apps.com` **directly**,
  cross-origin, in both dev and prod.
- **Therefore prod is cross-origin and RELIES ON THE BACKEND'S CORS HEADERS** allowing the prod MFE
  origin (`cms.fpt-apps.com` / `mfe.lms.fpt-apps.com`). It is NOT same-origin and NOT proxied.

### Does disabling web security mislead?
The test runs from `localhost:1999` — an origin the backend almost certainly does **not** whitelist, so
the browser CORS-blocks reading the response (the server still *sends* it — CORS is a browser policy).
`--disable-web-security` makes the browser stop enforcing the origin check, letting the test read the
same response prod reads from its whitelisted origin.

**Verdict: reasonably faithful, with one hard condition.** `--disable-web-security` removes only the
browser's *origin enforcement* — an artifact of the localhost test origin. It does not change the
request, the auth, the backend response, or any application logic, so it does **not** manufacture a
false pass *of app logic*. The prod path (cross-origin + backend CORS header) and the test path
(cross-origin + enforcement disabled) exercise the identical API interaction; only the gate that would
never fire in prod (for the whitelisted origin) is bypassed in test (for the non-whitelisted origin).

**The condition (this is the important part):** disabling web security must NOT silently convert a
CORS-block into an empty-data pass. If the backend does **server-side** origin rejection (403) or the
token is stale (401), the page shell may still render while the data calls fail — and a naive assertion
that only checks the shell would PASS. That would be a new false-proof, one layer over. So the fix is
incomplete without §4 (assert real data was reached). The observed failure was a *browser CORS* error
(not 403/401), which indicates the server did respond → `--disable-web-security` should work; but the
design must not assume it — it must assert it.

**Honest alternative considered + rejected for now:** serve the test from a backend-whitelisted origin,
or add a devServer proxy so the browser calls same-origin `localhost:1999/api → api.fpt-apps.com`. Both
are more faithful (zero enforcement divergence) but neither exists today, the proxy would need backend
buy-in, and it changes the app's dev config. `--disable-web-security` + a data-reached assertion (§4)
is the pragmatic honest choice; revisit a proxy if server-side origin checks surface.

---

## 2. Layer 2 — Auth / storageState: is the session carried, or is a 401 waiting?

**Auth IS wired.** `playwright-runner.ts:292-307` `injectAuthTokens` sets `localStorage.access_token`
(+ refresh/expiry) from env, and `:894-896` calls it **before any page script runs** ("prevents
redirect to logout"); `.env.playwright` is loaded at `:95-96`. So a fresh Playwright context **does**
carry the logged-in session → **fixing CORS should NOT surface a 401** — CONDITIONAL on a fresh, present
access token.

**The gap — RE-GROUNDED 2026-07-13 (corrects the original claim):** authoring's `.env.playwright:14`
in fact **contains** `PLAYWRIGHT_ACCESS_TOKEN` (alongside `PLAYWRIGHT_REFRESH_TOKEN` and
`PLAYWRIGHT_TOKEN_EXPIRES_AT`); it is **present but `expiring-soon` (~5h left)**, not absent. Were it
absent/empty, `injectAuthTokens` would inject nothing → API calls 401 → empty page. Token status comes
from the exported `checkPlaywrightToken()` (`version-check.ts:67`, status `ok`/`expiring-soon`/`expired`/
`missing`). ⚠️ **The `version-check --playwright` CLI exit code is NOT a reliable gate**: verified on
disk 2026-07-13 it exits **0** for `expiring-soon` (warn-only) — only `expired`/`missing` exit 3. So the
preflight must gate on the **status value**, treating `missing`/`expired`/`expiring-soon` as fail-closed.
**Design requirement:** the Tier B fix runs this token preflight and **fails closed** on any non-`ok`
status — so a silent-empty (401) render can never be mistaken for a pass. Per §7 (LOCKED), CORS is
demoted; the fix is **token-status preflight + §4 data-reached assertion + §3 bounded data-ready wait**,
shipped together — `--disable-web-security` is NOT wired.

---

## 3. Z.2 — assertion instability: does fixing CORS stabilize it? + domcontentloaded vs networkidle

- **Expectation:** yes. The 5/9↔3/9 variance is data-dependent elements rendering partially because the
  API is CORS-blocked and navigation waits only for `domcontentloaded` (`playwright-runner.ts:912`).
  With the API reachable (§1+§2), the data arrives and the fixed-timeout `waitForSelector` (`:716-717`,
  10s) assertions stop flaking.
- **Residual risk (address in the fix):** `domcontentloaded` fires before XHR/fetch data lands. For
  **data-dependent routes**, wait for the data, not just the DOM. Options: (a) `waitUntil:'networkidle'`
  — simplest, but can hang on long-poll/websocket/analytics beacons; (b) an explicit per-route
  "data-ready" selector (e.g. the chart/table's loaded state) — most robust, no hang risk; (c)
  `networkidle` with a bounded timeout fallback. **Recommend (b)** where ux-states can name a data-ready
  selector, falling back to a bounded `networkidle`. Decide in the design review.

---

## 4. The load-bearing addition: Tier B must assert the backend was actually REACHED

The whole session's lesson applied to this fix: do not let the environment fix create a new silent
pass. With web security disabled, a stale token or a server-side 403 yields a rendered shell with empty
data — which a shell-only assertion PASSES. Tier B must positively confirm real data:
- assert ≥1 data-bearing element rendered with real content (not an empty/skeleton state), AND/OR
- inspect network responses for the feature's key API call returning 2xx with a non-empty body.
Without this, `--disable-web-security` risks converting Z.1 (honest CORS fail) into a false pass —
exactly the class of bug Y.1 just closed. This assertion is part of the Z.1 fix, not optional.

---

## 5. Re-check candidate — BulkEnrollment (trust nothing until a real exit 0)

BulkEnrollment (learning, self-reported `9/9 · 35/35`, 2026-06-24) is the only full-pass claim, but it
is **unverified under the honest gate**, in a **different app** (its own `.env`/API base, own dev
server), with **no persisted `.b11-result.json`**. The design must treat it as unproven: it needs its
own dev server running, its own `.env.playwright` fresh token, and a **real `b11-runner` exit 0** under
the honest gate before it counts. Its API target may or may not be `api.fpt-apps.com` — confirm at the
time. No checklist ✅ substitutes for the exit code.

---

## 6. Versioning + target reach

Implementation bumps kit → **v3.24** (b11-runner passes `--disable-web-security` + token preflight +
data-reached assertion; playwright-runner data-ready wait). `b11-runner.ts` + `playwright-runner.ts` +
the command file must reach BOTH targets byte-identical (sha256), same as v3.23. Then a real Tier B run
on a genuinely-data-passing feature can finally produce the first honest `verified=true` (v3.24) row.

---

## 7. Decisions — LOCKED 2026-07-13 (implementation proceeds on these; do not re-open)

1. **CORS: DEMOTED.** Do NOT wire `--disable-web-security` — the Z.3 live probe disproved the block
   (`api.fpt-apps.com` returns `access-control-allow-origin: http://localhost:1999`). If — and only
   if — a genuine server-side 403 appears on some host during the token re-run, STOP and report; do
   not add the flag speculatively.
2. **AUTH: ADD a fail-closed token preflight to Tier B.** Before Playwright launches, gate on the
   exported `checkPlaywrightToken()` **status** (`version-check.ts:67`), NOT the CLI exit code (which
   returns 0 for `expiring-soon`, verified 2026-07-13). `missing` / `expired` / `expiring-soon` →
   THROW → b11-runner exit ≠ 0 → B11 STOP. A silent-empty 401 render must NEVER reach an assertion.
3. **§4 DATA-REACHED ASSERTION: REQUIRED, not optional.** Tier B must positively confirm the backend
   was reached — inspect network responses for the feature's key API call returning **2xx with a
   NON-EMPTY body** (preferred over selector-only, which can't catch an empty-body 200). Without this,
   a stale token yields a rendered shell + empty data that a shell-only assertion would PASS — the
   exact false-proof class Y.1 closed.
4. **Z.2 WAIT:** per-route data-ready selector (from ux-states where nameable) with a **BOUNDED**
   `networkidle` fallback. NOT plain `networkidle` (hang risk on long-poll/websocket/analytics beacons).
5. **VERSION:** bump kit v3.23 → v3.24; ship `b11-runner.ts` + `playwright-runner.ts` + command file
   to BOTH targets byte-identical (sha256). The command file carries `PROMPT_VERSION` — if authoring's
   command file is not re-synced to v3.24, Y.2 recurs and the next capture row mis-stamps 3.23.0.

**Implementation lands via canaries (one at a time, tests green between, STOP + report between,
commit only on explicit go). Backup applies at start (done: `backup/2026-07-13`). design-to-ui
untouched. No `npm run sync` — targets reached by the byte-identical copy in Canary 3.**

## §8 — Canary-2 follow-up: §4 feature-scoped + re-assessed after interaction (closes AA.2 + AA.3)

> **Status: DESIGN — LOCKED for implementation.** Closes the two Block-5 blockers logged
> 2026-07-13 as L-2026-07-13-002 (AA.2) and L-2026-07-13-003 (AA.3, 6F / most-severe).
> Design-doc-first per standing rule. No code lands until this §8 is approved.
> All `file:line` are ANCHORS — re-grep current disk before every edit; v3.24 HEAD line
> numbers WILL have drifted.

### 8.0 Why v3.24 §4 cannot yet produce an honest `verified=true`

v3.24 §4 (`PLAYWRIGHT-DATA`) asserts "≥1 response matching `apiUrlPattern` (default
`api.fpt-apps.com|/api/`) with 2xx + non-empty body", assessed once, right after the
initial-load waits. Two independent defects make this both miss real data and accept wrong data:

- **AA.2 (miss real data / false-FAIL):** the feature's data fetch fires during the
  interaction steps (e.g. ProgressReports loads only after the "Progress & reports" tab is
  clicked). §4 reads `apiObservations` before those steps run → `tierB-no-data-reached` even
  with a fresh token + real API. Anchor: assessment point is BEFORE the v2 interaction states
  in `runFeatureVerification`.
- **AA.3 (accept wrong data / false-PASS — the severe one):** `apiUrlPattern` matches ANY
  backend response. At `/class-management/edit/1` the class-edit page fires its OWN
  `api.fpt-apps.com` calls on load; if any is 2xx-non-empty, §4 PASSES `data-reached` while the
  feature's data never loaded → a `verified=true` attesting the WRONG feature's data. Same
  false-proof class as Y.1, one layer over.

Both must be fixed together: AA.3 alone (feature-scoped but still assessed too early) still
false-FAILs a tab-gated feature; AA.2 alone (re-assessed late but still any-endpoint) still
false-PASSes on a sibling's data. The combination is what proves *the feature's own* data
reached.

---

### 8.1 AA.3 — feature-endpoint scope (decision: `.http` primary, api.ts cross-check, **fail-closed on divergence**)

§4 replaces the broad `apiUrlPattern` with a **feature endpoint set** `E_feat`, derived once
per capture, before Playwright launches.

**Source of `E_feat`:**

1. **Primary — the feature's contract `.http`** (`docs/components/<feature>/*.http`, the same
   file `contract-probe` reads). Deterministic, already on disk, generated from the feature's
   own data layer. Parse each request line to a path template, strip host + query, and reduce
   to a **path-prefix matcher** per endpoint (e.g. `/api/admin/v1/classes/{id}/progress-reports`
   → match on `/classes/`…`/progress-reports`, id-segment wildcarded).
2. **Cross-check — api.ts data-layer URLs** (grep the feature's `data/api.ts` for the
   `${API_BASE_URL}/…` / URL-helper call sites — reuse the extraction already proven in
   `baseline-http-gen`, do NOT hand-roll a second parser).

**Reconciliation rule (LOAD-BEARING, fail-closed):**

- Let `H` = endpoint set from `.http`, `A` = endpoint set from api.ts.
- **`H === A`** (as path-prefix sets) → `E_feat = H`. Proceed.
- **`H ⊃ A` or `H ⊂ A` or `H ≠ A`** → **STOP**, do not run §4 against a guessed union or
  intersection. Emit a distinct reason `tierB-endpoint-source-divergence` with both sets printed.
  Rationale: divergence means `.http` is **stale relative to the code** (feature changed
  endpoints after `.http` was generated) — scoping §4 to either set risks matching a dead
  endpoint (false-fail) or missing the real one. The correct action is regenerate `.http`
  (`baseline-http-gen`) so the two agree, then re-capture. Never silently pick a source.
- **`E_feat` empty** (feature has no `.http` AND no api.ts URLs — a truly routeless/static
  feature) → §4 is **not applicable**; this path is `--no-data-gate` territory (static opt-out,
  §4 already supports it) and must be reached via the explicit opt-out flag, never by an empty
  match set silently passing. An empty `E_feat` reached WITHOUT `--no-data-gate` → STOP
  `tierB-no-feature-endpoints` (fail-closed: a data-gated feature with zero derivable endpoints
  is a config error, not a pass).

**Attack-tests this must satisfy (all deterministic, no browser):**
- Sibling data only (class-edit endpoint 2xx-non-empty, feature endpoint never seen) → **FAIL**
  `tierB-no-data-reached` (the AA.3 core: sibling data must NOT pass).
- Feature endpoint 2xx-non-empty + sibling data present → **PASS** (feature data is what counts).
- `.http` lists `/progress-reports`, api.ts calls `/progress-report` (drift) → **STOP**
  `tierB-endpoint-source-divergence` (never silently reconcile).
- `E_feat` empty + `--no-data-gate` → skip (opt-out). `E_feat` empty + gate on → **STOP**.

---

### 8.2 AA.2 — re-assess after the feature's data-ready point (decision: named selector if present, else after interaction steps)

The `page.on('response')` listener already accumulates for the whole page life (v3.24, unchanged
— do NOT touch the listener). Only the **assessment POINT** moves.

**New assessment timing (`resolveDataAssessPoint`, pure, testable):**

1. **Named data-ready selector present** (per-route, from `ux-states.json` — the same
   `--data-ready-selector` lever Z.2 already introduced) → assess §4 **immediately after that
   selector resolves** (bounded by the existing Z.2 30s cap). This is the tightest, most
   deterministic point: the selector is the feature's own "data has rendered" signal.
2. **No named selector** → assess §4 **once, after ALL interaction steps complete** (end of
   `runFeatureVerification`, after the last v2 interaction state), still before the route's
   pass/fail is finalized. Fallback for features whose ux-states has no data-ready anchor.

**Fail-closed at the assessment point (both branches):**
- Zero observations of any `E_feat` endpoint by the assessment point (login redirect, tab never
  reached, selector timed out) → **FAIL** `tierB-no-data-reached`. Never "no observations =
  benign".
- Selector branch: if the named selector itself times out (Z.2 cap hit) → **FAIL**
  `tierB-data-ready-timeout` — distinct from `no-data-reached` so the operator can tell "selector
  wrong" from "backend never returned".

**Interaction with AA.3:** §4 at the (late) assessment point evaluates `E_feat` observations
only. So the sequence that must hold end-to-end: interaction steps drive the tab open → feature
endpoint fires → response accumulates → assessment point reached (selector or end-of-steps) → §4
checks `E_feat ∩ observations` for 2xx-non-empty. A sibling endpoint that fired at initial load
is in `apiObservations` but NOT in `E_feat`, so it cannot satisfy the gate. That is the AA.2+AA.3
join that makes the row honest.

---

### 8.3 What does NOT change (scope fence)

- `page.on('response')` registration + accumulation (v3.24) — untouched.
- `isNonEmptyBody` array-aware logic (Canary 2) — untouched; still the emptiness test applied to
  `E_feat` responses.
- Z.2 bounded networkidle fallback + 30s cap — untouched; reused for the selector wait.
- `--no-data-gate` static opt-out — untouched; now the ONLY sanctioned path for an empty
  `E_feat`.
- b11-runner exit gating, token preflight (C1), version stamps — untouched by §8.
- CORS / `--disable-web-security` — stays DEMOTED per §7 decision 1. Not wired.

---

### 8.4 Canary split (one change at a time, tests green + STOP between)

- **Canary 2a — AA.3 endpoint scope (pure, no browser).** Add `deriveFeatureEndpoints(feature)`
  (`.http` parse + api.ts cross-check + fail-closed reconciliation) and rewire `assessDataReached`
  to take `E_feat` instead of the broad pattern. Full attack-test suite from §8.1. `E_feat` empty
  handling. No timing change yet — assessment still at old point (so this canary's browser
  behavior is unchanged except scope). Tests: the 4 §8.1 attack-tests + divergence + empty cases.
- **Canary 2b — AA.2 assessment timing (pure `resolveDataAssessPoint` + wiring).** Move the
  assessment point per §8.2. Tests: selector-present → assess-at-selector; no-selector →
  assess-after-steps; zero-obs-at-point → FAIL; selector-timeout → distinct reason.
- **Canary 2c — version bump v3.24 → v3.25** (5 stamps: cmd copyright / PROMPT_VERSION /
  progress-banner + README + package.json), `version:check` green, `prompt-budget --gate` exit 0,
  dual-target byte-identical copy to AUTHORING (sha256), lessons AA.2/AA.3 flipped from
  `test_status="pending"` → `enforced_by` the new tests + `test_status="passing"`.

**Gate between each:** `test:playwright-runner` all green (existing 20 + new), `tsc` clean on
edited files, real `.env.playwright` sha256 unchanged, no stray temp dirs. STOP + report + await
approval between 2a → 2b → 2c. No commit until you say so. No `npm run sync`.

---

### 8.5 After §8 lands — the Block-5 unblock sequence (unchanged, now actually reachable)

1. You populate a fresh `PLAYWRIGHT_ACCESS_TOKEN` into AUTHORING's `.env.playwright` (credential
   task you own — I never generate/inject it).
2. `/drop-mock` ProgressReports (`USE_MOCK=false`) — AA.1, so real endpoints fire.
3. B11 capture on US-AD-095-ProgressReports → §8-corrected §4 observes the feature's own
   `/progress-reports` (etc.) 2xx-non-empty AFTER the tab opens → first honest `verified=true`
   (stamped v3.25) → sync unblocks.

§8 removes the tooling reasons a legitimate run would fail/false-pass. AA.1 (mock) is a runtime
toggle you flip at step 2, not a code fix — it stays a pre-capture checklist item.