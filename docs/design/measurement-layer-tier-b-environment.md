# Measurement Layer v1 — Tier B verification environment (CORS + auth) (design)

> **Status: DESIGN ONLY — no code written. Targets kit v3.24.** Produced 2026-07-12 (session 2).
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

**The gap to confirm at implementation:** authoring's `.env.playwright` shows `PLAYWRIGHT_REFRESH_TOKEN`
and `PLAYWRIGHT_TOKEN_EXPIRES_AT` but **no access-token key was visible** in the key scan. If the access
token is absent/empty, `injectAuthTokens` injects nothing → API calls 401 → empty page. `version-check
--playwright` (`version-check.ts:54-79`) checks expiry (exit 3 = expired/expiring < 24h; `status:missing`
if no expiry). **Design requirement:** the Tier B fix must run this token preflight and **fail closed**
if the token is missing/stale — so a silent-empty (401) render can never be mistaken for a pass. CORS
and auth are handled as **one fix**: `--disable-web-security` + token-freshness preflight + §4 data
assertion, shipped together.

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

## 7. Open decisions for review (this is the STOP)

1. **CORS:** wire `--disable-web-security` for local Tier B (recommended) vs. invest in a
   whitelisted-origin / devServer-proxy path (more faithful, heavier, needs backend). Confirm whether
   the backend does server-side origin 403 (if so, the flag alone won't help).
2. **Auth:** add a fail-closed `version-check --playwright` preflight to Tier B + confirm the
   `.env.playwright` access-token key is populated (recommended).
3. **§4 data-reached assertion:** required part of the fix (recommended) — confirm the mechanism
   (data-bearing selector vs. network-response inspection).
4. **Z.2 wait strategy:** per-route data-ready selector w/ bounded `networkidle` fallback (recommended)
   vs. plain `networkidle`.
5. **Version:** v3.24, ship to both targets (recommended).

**No code written. Awaiting review before the v3.24 implementation session. Backup applies when
implementation starts. design-to-ui untouched. No sync.**
