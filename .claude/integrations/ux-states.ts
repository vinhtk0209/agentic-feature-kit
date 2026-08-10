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
export interface UxInteractionStep { action?: string; url?: string; }
export interface UxState {
  name?: string;
  screen?: string;
  route?: string;
  steps?: UxInteractionStep[];
  ac_assertions?: UxAcAssertion[];
}
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

/**
 * Return the outer routes that B11 should execute.  playwright-runner executes the entire v2
 * interaction script, so an outer execution is redundant only when the parsed script itself
 * explicitly navigates to every resolved route.  Anything missing or malformed retains the
 * ordinary per-route behavior: this is deliberately fail-closed against a silent coverage drop.
 */
export function resolveB11ExecutionRoutes(doc: UxStatesDoc | null | undefined): string[] {
  const routes = resolveRoutes(doc);
  if (routes.length < 2 || !hasCompleteExplicitRouteNavigation(doc, routes)) return routes;
  return [routes[0]];
}

/** Pure proof predicate for B11 route-collapse. Exported for direct attack tests. */
export function hasCompleteExplicitRouteNavigation(
  doc: UxStatesDoc | null | undefined,
  routes: readonly string[] = resolveRoutes(doc),
): boolean {
  if (!doc || routes.length === 0 || !Array.isArray(doc.states) || doc.states.length === 0) return false;
  if (doc.negative_states !== undefined && !Array.isArray(doc.negative_states)) return false;

  const navigatedPaths: string[] = [];
  const allStates = [...doc.states, ...(doc.negative_states ?? [])];
  for (const state of allStates) {
    if (!state || !Array.isArray(state.steps)) return false;
    for (const step of state.steps) {
      if (!step || typeof step.action !== 'string' || step.action.trim() === '') return false;
      if (step.action !== 'navigate') continue;
      if (typeof step.url !== 'string') return false;
      const navPath = pathnameOf(step.url);
      if (!navPath) return false;
      navigatedPaths.push(navPath);
    }
  }

  return routes.every((route) => {
    const routePath = pathnameOf(route);
    return routePath !== null && navigatedPaths.some((navPath) => matchesRoutePath(navPath, routePath));
  });
}

function pathnameOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : (trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
    const pathname = new URL(candidate, 'http://b11.invalid').pathname;
    return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  } catch {
    return null;
  }
}

/** A target route may sit under an app mount path in an explicit browser navigation URL. */
function matchesRoutePath(navigationPath: string, routePath: string): boolean {
  if (routePath === '/') return navigationPath === '/';
  return navigationPath === routePath || navigationPath.endsWith(routePath);
}
