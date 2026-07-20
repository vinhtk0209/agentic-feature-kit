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
- **Canary 2c — cleanup + bookkeeping, NO version bump (stays v3.24)** (all 5 stamps remain v3.24: cmd copyright / PROMPT_VERSION /
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
   (stamped v3.24) → sync unblocks.

§8 removes the tooling reasons a legitimate run would fail/false-pass. AA.1 (mock) is a runtime
toggle you flip at step 2, not a code fix — it stays a pre-capture checklist item.

---

## §9 — `WARN_THRESHOLD_MS`: the fresh-token-unsatisfiable `expiring-soon` boundary (AA.4)

> **Status: LOCKED 2026-07-16 — threshold = 6 h, shipped as v3.25.** Root cause observed live
> 2026-07-16 during the Block-5 STEP-1 preflight (two consecutive `npm run workflow:login`
> rotations). Design-doc-first per standing rule; the human locked 6 h after review. Code change
> (threshold + test) and the v3.25 stamp/doc bump land as TWO separate commits per canary rule.
> All `file:line` are ANCHORS — re-grep current disk before any edit.

### 9.0 Root cause — the threshold is physically unsatisfiable by a fresh token

The auth backend mints Playwright access tokens with a **native TTL shorter than the 24 h guard
threshold**. Observed directly, back-to-back after a clean `workflow:login`:

- Rotation A (STEP 1, first attempt): `msRemaining = 85 181 553 ms` = **23.66 h** → `status=expiring-soon`.
- The guard threshold: `WARN_THRESHOLD_MS = 24 * 60 * 60 * 1000` = **86 400 000 ms (24 h)**.

Because `TTL_native (~23.66 h) < WARN_THRESHOLD_MS (24 h)`, a **just-minted** token is already on the
`expiring-soon` side of the boundary the instant it is issued. There is no wall-clock moment at
which the current guard would report `ok` for this backend — the fail-closed preflight
(`assertPlaywrightTokenFresh`, `b11-runner.ts:153`) is therefore **structurally unpassable**, not
merely "refresh and retry". This is distinct from the STEP-1 first halt (a genuinely stale ~71 h
token): here the token is fresh and the *threshold* is the defect.

### 9.1 What is (and is NOT) changing

- **Definition — the only change site:** `version-check.ts:65`
  `const WARN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 h` → `6 * 60 * 60 * 1000; // 6h` (LOCKED).
  One definition, one usage (`version-check.ts:83`); no duplicate threshold constant exists anywhere
  in the kit (grep-confirmed 2026-07-16).
- **The comparison operator does NOT change.** `version-check.ts:83` stays strict `<`
  (`msRemaining < WARN_THRESHOLD_MS ? 'expiring-soon' : 'ok'`). Only the constant it compares against
  moves. Boundary semantics unchanged: exactly-threshold = `ok`, strictly-under = `expiring-soon`.
- **Verdict order does NOT change.** `checkPlaywrightToken` keeps `missing → expired → expiring-soon
  → ok` precedence (`version-check.ts:81-85`); `assertPlaywrightTokenFresh` keeps its throw order
  `missing → expired → expiring` (`b11-runner.ts:141-158`). Only the numeric boundary between
  `expiring-soon` and `ok` moves.
- **Both consumers inherit the new value unchanged:** the fail-closed B11 preflight
  (`b11-runner.ts:153`, THROWS) and the warn-only `--playwright` CLI (`version-check.ts:125`,
  exit 0). No consumer-side edit.

### 9.2 The invariant the new threshold MUST still preserve

`WARN_THRESHOLD_MS` exists to **fail closed on any token that could lapse MID-RUN** — the exact
class the whole §4 rewrite protects (a token that 401s partway renders an empty-shell that a
shell-only assertion false-passes). The token is validated **once**, at preflight
(`b11-runner.ts:487`), and then **reused across every route** without re-check. So the token must
remain valid for the entire authenticated run that follows the preflight.

**Worst-case B11 run duration (grounded, not assumed):**

- Per-route Playwright ceiling: `playwrightTimeoutMs = 600_000` ms = **10 min/route**
  (`b11-runner.ts:469`), enforced by the process-tree kill in `runPlaywrightSpawn`.
- Routes run **sequentially** (`b11-runner.ts:488-490`), so wall-clock ≈ `routes.length × 10 min`.
- Plus one-shot static/coverage/contract overhead earlier in `main()` (bounded by the 2-min `run`
  default, `b11-runner.ts:164`) — but those run BEFORE the preflight-gated token is used, so they do
  not extend the post-preflight authenticated window.
- **Worst-case authenticated window ≈ `routes.length × 10 min`.** For a realistic feature (a
  handful of routes) this is well under an hour.

**The locked threshold satisfies the two-sided bound:**

```
  worst_case_run + safety_margin   ≤   6 h   <   TTL_native (~23.66 h observed)
  └─────────── ~1 h ─────────────┘                └──── upper bound ────┘
```

- **Lower bound** — 6 h exceeds the ~1 h worst-case authenticated window plus margin, so the guard
  still catches a genuine mid-run lapse (its purpose is preserved).
- **Upper bound** — 6 h sits well below the backend's native TTL so a **freshly-minted** token reads
  `ok` with ~17 h of headroom (the whole point of AA.4), leaving slack beneath the TTL floor even if
  TTL_native varies run-to-run below the single 23.66 h sample.

**Locked at 6 h 2026-07-16** — a policy call trading mid-run-lapse protection (higher) against
fresh-token-passability under a sub-24 h TTL (lower). If a future backend change pushes TTL_native
below ~7 h, revisit (6 h would lose its headroom).

### 9.3 Byte-identity + sync consequence

`version-check.ts` must stay **byte-identical kit ↔ AUTHORING** (both `8201194c…` as of 2026-07-16)
so the guard the capture runs against equals the guard in the kit. ⚠️ The **LEARNING** target copy
already diverges (`251c9500…`) independently of this change — flag for a future sync reconcile; it
is not the AUTHORING capture path and this §9 does not touch it. The 6 h value reaches targets only
through the normal `kit → sync → target` path — **which is itself still fail-closed** until the
first honest `verified=true` exists. So this fix and the Block-5 capture are mutually gating: the
capture needs the lowered threshold to reach `ok`, and the lowered threshold reaches AUTHORING via a
sync that the capture unblocks. Bootstrap actually used 2026-07-16: after the kit threshold change,
`version-check.ts` was copied kit → AUTHORING directly (byte-identical, sha256
`47887f00…`), so the AUTHORING capture reads the 6 h guard without a sync. That copy is git-ignored
in AUTHORING (`.gitignore:43 .claude/integrations/`), so it never becomes a target-tracked change —
consistent with kit-as-sole-source.

### 9.4 Version stamp — LOCKED v3.25

This is a guard **behavior change** (a token state that previously THREW now passes), not a pure
Tier-B internal fix, so it takes its own bump **v3.24 → v3.25** rather than folding into v3.24. All
5 stamps moved (cmd copyright / PROMPT_VERSION / progress-banner / README / package.json);
`version:check` green at v3.25. Lesson `L-2026-07-16-001` (AA.4) recorded in `prompt-evolution.md`.
The stamp + `prompt-evolution.md` + this doc land as a SEPARATE commit from the threshold+test code.

### 9.5 Test obligation — DONE (`b11-runner.test.ts`)

The boundary tests were re-pinned around 6 h: the `noThrow` boundary case moved `24×H → 6×H`
("boundary-6h"); the `5×H` `expiring` case held (still `<6h` → throws); and a NEW regression case
asserts a `TTL_native`-sized fresh token (`23.5×H`) now yields `ok` (it THREW under 24 h — proven
RED before the constant change, GREEN after). Suite: **23 passed, 0 failed**. `live_validated=false`
until the first honest B11 capture passes the preflight with a real fresh (<24 h) token.

---

## §10 — Checklist gate semantics: HR35/HR36 resolution + AC-level declared-defer (LOCKED 2026-07-20)

> **Status: LOCKED 2026-07-20.** Decisions D1–D6, the attack-test suite (§10.5, T1–T8) and the
> canary split (§10.8, C1→C2→C3→C4) are all closed; do not re-open without an explicit operator
> unlock. **No code has been written for §10** — this lock authorizes the canaries, it does not
> record them as done. All anchors re-verified against working tree `2dfe4b4` (clean) on 2026-07-20;
> where a probe-era claim drifted, the drift is called out inline rather than silently restated.

### 10.0 — Problem statement: why HR35 is structurally unsatisfiable today

HR35 (`checkVerifiedRatio`, `lint-feature.ts:280-289`) computes `total = cl.totalUi + cl.totalAct`
(`:282`) and fails the gate below `min`. Four independent defects make a passing ratio unreachable by
honest capture.

**(a) Writer/reader cell mismatch.** `updateChecklistRows` (`playwright-runner.ts:589-611`) builds
`statusIcon = v.passed ? '✅ Pass' : '❌ Fail'` (`:593`) and writes it into the **Status** cell —
`cells[3]` on the ≥5-cell branch (`:599-602`), `cells[2]` on the 4-cell branch (`:603-606`) — while
the **evidence** cell receives `v.evidence`, free-form text that carries no ✅. The HR35 fallback
reader `finalCellVerified` (`lint-feature.ts:151-160`) counts a ✅ **only** in the final cell:
`last = cells[cells.length - 2] || cells[cells.length - 1]` (`:156`), i.e. the evidence cell of a
well-formed row. The writer and the reader therefore address **different cells**: capture flips do
not move the count.

Measured on the live target checklist
(`tempp/isu-elearner-authoring/docs/specs/US-AD-095-ProgressReports/checklist.md`) on 2026-07-20 by
replaying `finalCellVerified` verbatim: **ACT = 1, UI = 0 → 1/38 = 3%**. The single hit is
`ACT-AC11` (`checklist.md:89`), whose evidence cell contains a literal embedded newline, splitting
the row across two physical lines so that the *first* physical line terminates at the Status cell —
making the Status cell coincidentally the "final cell" for that line. Every well-formed sibling row
(e.g. `ACT-AC8`/`AC9`/`AC10`, which all read `✅ Pass` in Status) is **not** counted. ACT-AC11's 1/38
is an accident of a 2-line row split, **not** design.

**(a2) — NEW, not in the probe: the ≥5-cell branch is column-misaligned for the UI table.** The UI
table header is `| # | Component | Screen | Check | Status |` (`checklist.md:29`) — 5 columns with
Status **last**. `updateChecklistRows` takes its `cells.length >= 5` branch (`:599-602`), which is
written for the ACT layout `id|desc|tool|status|evidence` and assigns `cells[3] = statusIcon`,
`cells[4] = v.evidence`. Applied to a UI row that means the status icon **overwrites the Check
description** and the evidence text **overwrites the Status cell**. This is latent, not yet observed:
all 16 UI rows still read `⬜` (`0/21` per Summary `:139`), so no UI verdict has ever been written.
It becomes live the moment UI verdicts start flowing, and it is destructive (it erases spec text).
The same drift exists inside the ACT table: written rows have drifted to `id|desc|status|evidence`
while the header (`checklist.md:68`) and the untouched `enforced-by:BE` rows (`:91-97`) still follow
`id|desc|screen|status`. **Consequence for §10.3: "the Status cell" is not at a fixed index**, so the
writer fix must resolve the column by header, not by cell count.

**(b) Summary path lacks BE exclusion.** `countSection` (`playwright-runner.ts:629-645`) counts every
data row in a section — `pass: dataRows.filter((l) => l.includes('✅'))` (`:641`) — with **no**
`enforced-by: BE` filter, so BE rows stay in `total`. `icon()` (`:659-664`) returns `'✅'` only when
`s.pass === s.total` (`:662`), else `'⚠️'`/`'❌'`. Any section holding a `⚠️` BE row can therefore
never render `✅`. The HR35 reader only accepts the Summary as authoritative when it can match
`✅ X/Y` (`lint-feature.ts:141`); `verifiedSource` falls back to `'row-scan'` whenever no such pair
exists (`:149`). Live confirmation: Summary reads `❌ 0/21 verified` and `❌ 12/30 verified`
(`checklist.md:139-140`) — no `✅` pair → `summaryPair` returns `null` for both → HR35 falls back to
row-scan permanently, straight into defect (a).

**(c) HR36: ACT-BR2/BR6 uncovered (91%).** `checkAcCoverage` (`lint-feature.ts:267-277`) flags
`uncovered = cl.actIds.filter((id) => !tested.has(id))` (`:270`). `ACT-BR2`
(`computeAttendanceRate`, `checklist.md:103`) and `ACT-BR6` (`groupSubmissionsByDay`, `:107`) are the
two uncovered rows: 20/22 = 91%. Both computations are **BE-owned**; FE mapping fidelity for the same
data path is already co-verified by the BR1/BR3 tests.

**(d) AC-1/AC-2 structural exclusivity.** AC-1 requires data-**PRESENT** and AC-2 requires
data-**ABSENT** on the same class/route. No single-route capture can satisfy both. Empirically
confirmed 2026-07-19: retargeting a second route (class-1001) dragged in a pre-existing
out-of-feature preview/certificate bug plus a double-capture, making the gates strictly worse — the
attempt was reverted.

### 10.1 — D1 LOCKED: HR36 resolution = `enforced-by:BE` on ACT-BR2/BR6

Mark `ACT-BR2` (`checklist.md:103`) and `ACT-BR6` (`:107`) with `<!-- enforced-by: BE -->`, following
the existing precedent of `ACT-AC12`/`AC13`/`AC17`/`AC18` (`:91-97`). This is a **target-only
checklist edit** — a spec artifact, not kit code.

Effect per the verified path: `grab` skips any line matching `/<!--\s*enforced-by:\s*BE/i`
(`lint-feature.ts:125`) before collecting ids, so `actIds` drops **22 → 20**; `checkAcCoverage`
(`:270`) then finds `uncovered = []` → coverage **100%** (`:273`). Measured baseline 2026-07-20:
unique BE-excluded ACT ids = 22, UI ids = 16.

**This does NOT resolve HR35.** It shrinks the ACT denominator by 2 but leaves the writer/reader
mismatch (a) fully intact; the numerator stays at 1.

### 10.2 — D2 LOCKED: unified `enforced-by:BE` exclusion across all three paths

**Invariant: a row marked `enforced-by:BE` is invisible to all three computations.**

| # | Path | Anchor | State |
|---|------|--------|-------|
| 1 | HR36 coverage set | `checkAcCoverage` `lint-feature.ts:267-277`, fed by `grab :125` | already excludes ✔ |
| 2 | HR35 row-scan denominator | `grab` `lint-feature.ts:125` | already excludes ✔ |
| 3 | HR35 Summary path | `countSection` `playwright-runner.ts:629-645` | **MISSING ✘ → must be added ✔** |

Path 3 is the gap: adding the BE filter to `countSection` lets a section reach full-green, which lets
`icon()` (`:659-664`) emit `✅`, which lets `summaryPair` (`lint-feature.ts:138-146`) match — moving
`verifiedSource` off `'row-scan'` and onto the authoritative Summary path (`:149`). For symmetry note
that `brRows` already applies the same filter (`lint-feature.ts:174`); `finalCellVerified`
(`:151-160`) does **not** — a fourth asymmetry that D2 should close in the same canary.

Kit-first: implement in the kit, byte-copy to target after implementation. No target-side `.claude/`
edits (workspace reverse-sync rule).

### 10.3 — D3 LOCKED: writer/reader alignment = fix the WRITER, not the reader

`updateChecklistRows` (`playwright-runner.ts:589-611`) additionally stamps
`✅ <capture-run-ref>` into the **evidence (final)** cell when a `RowVerdict` passes. Status-cell
behavior is unchanged. Per finding (a2), the target cell must be resolved **from the table header**,
not from `cells.length` — the current cell-count heuristic is already wrong for the UI table.

**Fail-closed — header resolution (symmetric in force with §10.4's admission rule).** The writer
resolves **both** the Status column and the evidence column from the section's **header row**. If the
header row is **absent**, or does not match a **recognized layout**, the writer performs **NO write
for that row** and the run **STOPS** with the distinct verdict
**`tierB-checklist-unrecognized-layout`**. Heuristic fallback to `cells.length` is **PROHIBITED** —
it is the exact mechanism that produces the destructive misalignment in (a2), so degrading to it on
an unrecognized header would reinstate the defect this decision exists to remove. A STOP here is also
not a silent skip: the run must fail loudly rather than leave the row untouched and continue.

> **Asymmetry being closed.** §10.4 carried its fail-closed sentence from the start ("Anchorless
> **or** predicate-less → **STOP**"); §10.3 did not, and the omission was load-bearing — a
> header-based rule with no stated behavior on unrecognized headers legitimately permits a
> cell-count fallback, i.e. permits (a2). Both decisions now state their STOP condition explicitly.

**Rejected alternative:** widening the reader to also count the Status cell. Status is equally
hand-editable, and evidence-cell semantics ("proof reference") are the honest home for capture
provenance. Widening the reader would make a hand-typed `✅ Pass` sufficient to move the gate.

**Residual risk — recorded, deliberately NOT fixed now:** the reader still counts a *bare* ✅ without
requiring a provenance token (`finalCellVerified :157` tests only `/✅|✔/`). A human can still type ✅
into an evidence cell and move the gate. Future hardening: require the run-ref token, not just the
glyph.

### 10.4 — D4 LOCKED: AC-level declared-defer (extends §17.7 from endpoint level to checklist-row level)

§17.7 already implements this shape for contract endpoints: `extractDefer` parses
`# DEFER: <reason>` (`contract-probe.ts:327-332`), and `deriveFeatureEndpoints` admits a defer **only**
when the reason matches `ANCHOR = /§\s?\d+(\.\d+)*/` (`playwright-runner.ts:997-1003`), computing
`undeclaredMissing = H.filter((p) => !Aset.has(p) && !declaredDeferSet.has(p))` (`:1008`) and throwing
otherwise (`:1010-1018`). Anchorless defers fail closed — `contract-probe.defer.test.ts:128` (T6,
PERMANENT). §10.4 lifts that mechanism to checklist rows.

Admission rules — a row-level defer MUST carry **both**:
1. a **§-anchor** pointing at the design decision that authorizes it; and
2. a **machine-checkable predicate** describing the environment condition that would invalidate it.

Anchorless **or** predicate-less → **STOP** (fail-closed, mirroring §17.7 T6).

**Re-evaluated on EVERY run.** If the environment satisfies the predicate, the defer
**AUTO-INVALIDATES** and the AC must genuinely pass — no grandfathering (roadmap amendment A5,
`ROADMAP-AUTONOMOUS-SDLC.md:589`, forward-note `:661`).

A validly deferred row is excluded from **both** the HR35 denominator and the HR36 coverage set.

**AC-2 concrete predicate (structural):** *"a second capturable route exists for a class with 0
published assessments AND that route captures cleanly without out-of-feature blockers."* When the
preview/certificate bug is fixed or a clean 0-assessment route appears, the defer dies automatically
and the per-unique-route mechanism becomes the real resolution path — `resolveRoutes`
(`ux-states.ts:38-42`) already returns a de-duplicated route list, and `b11-runner.ts:488` drives one
capture per unique route.

**Rejected: controlled fixture.** Any mock variant inside the same browser session is a leakage
vector into §4 data-reached — precisely the false-verified class this kit exists to block.

### 10.5 — Attack tests — LOCKED (specs T1–T8; T8 = documented-RED)

PERMANENT suite; obligations for the code canaries, **not yet written**. The spec below is locked —
a canary may not ship without its mapped tests (§10.8).

| ID | Attack | Expected |
|----|--------|----------|
| T1 | **defer-rot** — predicate satisfied but row still deferred | STOP |
| T2 | **anchorless defer** | STOP |
| T3 | **predicate-less defer** | STOP |
| T4 | **defer-inflation** — mass-deferring to shrink the denominator | Mitigation: every defer requires a §-anchor to a *locked* design decision; nightly battery (roadmap `o2-continuous-assurance`, `ROADMAP-AUTONOMOUS-SDLC.md:355`) re-evaluates all standing predicates |
| T5 | **cell-alignment regression** — writer's evidence-cell stamp is counted by `finalCellVerified` | GREEN (and RED before the §10.3 change) |
| T6 | **BE-exclusion symmetry** — a BE row is invisible to `countSection`, `grab`, and `checkAcCoverage` alike | GREEN |
| T7 | **unrecognized/absent header** — a checklist section whose header row is missing or matches no known layout | STOP with `tierB-checklist-unrecognized-layout`; **zero bytes written** to the checklist (assert file content byte-identical before/after); NOT a silent skip (no "row left untouched, run continues") |
| T8 | **bare-✅ reader gap** — a checklist row carrying a bare `✅` in the evidence cell, with **no** header-resolved status column and no provenance run-ref, is accepted by `finalCellVerified` (`lint-feature.ts:151-160`, glyph-only test `/✅\|✔/` at `:157`) | **GREEN today by design — documented-RED.** Asserts the gap **exists**. This is a KNOWN gap, intentionally **NOT** fixed in C1–C4 (§10.3 "Residual risk"). Anchor: §10.5-T8. |

**T8 mechanism — LOCKED: assert-the-gap (assertion inversion), not a runner directive.**

Runner detection 2026-07-20: the suite is **`node:test`** (`import { test } from 'node:test'` +
`node:assert/strict`), executed as `npx tsx <file>.test.ts` (`package.json` `test:kit`, `:78`).
`grep -rn "it\.fails\|test\.fails\|\.fails("` over `.claude/integrations/*.test.ts` → **0 hits,
exit 1**; vitest is not a dependency (`tsx ^4.19.0` only). vitest's `it.fails()` is therefore
**unavailable**.

T8 is written as a **normal passing assertion that the gap is still open** — e.g.
`assert.equal(readerAcceptsBareCheck(row), true)`. Properties, which are the whole point of the
test: it runs **green in CI while the gap exists**, and it turns **RED the moment the gap is
unexpectedly closed** — forcing a deliberate re-lock of §10.5 rather than silent drift. That is
exactly `it.fails()` semantics, reconstructed on a runner that lacks the directive.

`{ skip: … }` was **REJECTED** as the fallback: a skipped test never executes, so it can never
alarm — it would document the gap while discarding the property T8 exists to provide. `node:test`'s
`{ todo: true }` is likewise unsuitable (todo results do not fail the build in either direction).
**Do not "simplify" T8 into a skip or a todo.**

Note the directional coupling: C2 (§10.3) fixes the **writer**, deliberately not the reader, so T8
must stay green across C1–C4. A T8 failure during the canaries means a canary closed the reader gap
as an unintended side effect — investigate before proceeding, do not just update T8.

### 10.6 — Expected arithmetic (EXPECTATION, not a commitment)

Verifiable **only** by a real capture. Do not treat these numbers as achieved.

| Step | Denominator | Source |
|------|-------------|--------|
| today (measured 2026-07-20) | **38** (ACT 22 + UI 16) | `lint-feature.ts:282` |
| after §10.1 (BR2/BR6 → BE) | **36** | `grab :125` |
| after §10.4 (AC-2 defer) | **35** | §10.4 exclusion |

Threshold ≥60% ⇒ **≥21/35**. Today's honest numerator is **1** (§10.0a) — the entire gap is the
writer/reader mismatch, which is why §10.3 is the load-bearing change and §10.1/§10.4 are only
denominator hygiene.

Residual risks: bare-✅ reader (§10.3); latent UI-table column corruption (§10.0 a2) — must be fixed
*with* §10.3, not after, since §10.3 is what starts writing UI rows; AC-1 remains external (backend
data; operator note already drafted).

### 10.7 — Scope fence

- **NO** changes to §4 data-reached logic.
- **NO** mock leakage into capture.
- **NO** changes to the sync guard (`countVerifiedRuns`, `scripts/sync-to-targets.ts:568-572` —
  `verified=is.true` query at `:572`). Sync stays fail-closed; §10 does not unblock it.
- **AC-1 untouched.**

### 10.8 — Canary split — LOCKED 2026-07-20

**Order LOCKED: C1 → C2 → C3 → C4.** One change per canary, tests RED before GREEN, explicit
paths only (no `-A` staging), each canary independently revertible.

| Canary | Change | Tests | Rationale |
|--------|--------|-------|-----------|
| **C1** | §10.2 — BE exclusion in `countSection` (+ `finalCellVerified` symmetry) | T6 | Smallest, purely subtractive, no writer behavior change. Unblocks the Summary path so later canaries are observable. |
| **C2** | §10.3 — writer stamps evidence cell + **header-resolved** column addressing (fixes a2) + fail-closed `tierB-checklist-unrecognized-layout` | T5, **T7** | The load-bearing fix. Depends on C1 only for observability, not correctness. a2 rides here because C2 is what starts writing UI rows; T7 pins that an unrecognized header STOPs instead of degrading to the cell-count heuristic. |
| **C3** | §10.4 — AC-level defer: marker, §-anchor + predicate admission, denominator/coverage exclusion | T1, T2, T3, T4 | Largest new mechanism; lands last so the gate arithmetic is already honest when defers enter. |
| **C4** | §10.1 — target-only checklist edit (BR2/BR6 → `enforced-by:BE`) | — (covered by T6 in C1) | Spec artifact, not kit code. Last, after the kit reads it correctly — doing it first would move numbers for reasons the tests do not yet pin. |

Ordering rationale: C1 → C2 is reader-then-writer so each canary's effect on the ratio is
attributable; C3 lands after the ratio is honest so a defer can never be the thing that first makes
the gate pass; C4 is deliberately last so no checklist number moves before a test pins why.

**C4 ordering — CLOSED, LOCKED LAST.** C4 (§10.1, `enforced-by:BE` on ACT-BR2/BR6) is ordered
**LAST** and this order is **LOCKED**. Rationale: C4 lifts HR36 → 100% while HR35 is still ~3%,
producing a **partial-green false-signal** (green before green is real). HR35 is the load-bearing
defect (writer/reader mismatch, §10.0a — numerator stuck at 1); it must be resolved by C1–C3 first.
Advancing C4 for an early HR36 100% is the exact false-signal this gate exists to prevent —
**rejected.**

**Test → canary mapping (LOCKED — do not re-derive).** A canary ships only when every test mapped
to it is present and in the stated state.

| Test | Canary | Required state at that canary |
|------|--------|-------------------------------|
| T6 — BE-exclusion symmetry | **C1** | RED before, GREEN after |
| T5 — cell-alignment regression | **C2** | RED before, GREEN after |
| T7 — unrecognized/absent header | **C2** | STOP verdict `tierB-checklist-unrecognized-layout`, zero bytes written |
| T1 — defer-rot | **C3** | STOP |
| T2 — anchorless defer | **C3** | STOP |
| T3 — predicate-less defer | **C3** | STOP |
| T4 — defer-inflation | **C3** | Mitigation asserted (§-anchor to a *locked* decision required) |
| — (no new test) | **C4** | Covered by T6, already GREEN from C1 |
| T8 — bare-✅ reader gap | **all of C1–C4** | GREEN throughout (documented-RED; a flip to RED means a canary closed the reader gap unintentionally — investigate, do not update T8) |