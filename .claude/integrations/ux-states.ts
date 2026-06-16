/**
 * ux-states.ts — single source of truth for reading the workflow's ux-states.json.
 *
 * The B5 LOCKED schema is FLAT: states[] each carry their own `route` + `ac_assertions[]`.
 * A top-level `routes[]` is an optional convenience mirror. b11-runner.ts and the integration
 * test both import resolveRoutes() so route resolution can never silently diverge again (audit F1).
 *
 * Pure module — no IO, safe to import from tests.
 */

export interface UxAcAssertion { ac_id?: string; selector?: string; expected?: string; }
export interface UxState { name?: string; screen?: string; route?: string; ac_assertions?: UxAcAssertion[]; }
export interface UxStatesDoc {
  feature?: string;
  routes?: string[];
  states?: UxState[];
  negative_states?: UxState[];
  unit_tests?: Array<{ ac_id?: string; test_file?: string; grep?: string }>;
}

/** Parse ux-states.json text; returns null on malformed JSON (callers treat as "no routes"). */
export function parseUxStates(raw: string): UxStatesDoc | null {
  try { return JSON.parse(raw) as UxStatesDoc; } catch { return null; }
}

function clean(arr: Array<string | undefined>): string[] {
  return [...new Set(arr.filter((r): r is string => typeof r === 'string' && r.trim() !== ''))];
}

/**
 * Resolve the route list a B11 run should drive.
 * Priority: explicit top-level routes[] → else derive from each state's `route` (B5 flat schema).
 * Returns a de-duplicated list of non-empty routes; [] when none can be determined.
 *
 * Reverting this to "routes[]-only" reintroduces audit F1: a B5-authored flat file (states[].route,
 * no top-level routes[]) resolves to [] and Playwright is silently skipped.
 */
export function resolveRoutes(doc: UxStatesDoc | null | undefined): string[] {
  if (!doc) return [];
  if (Array.isArray(doc.routes) && doc.routes.length > 0) return clean(doc.routes);
  return clean((doc.states ?? []).map((s) => s?.route));
}
