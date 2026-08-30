/**
 * Per-route OAuth requirements, so the shell can gate a view *before* it
 * fetches anything. A route declares its *endpoints* and the scopes are
 * derived from `esi/registry.ts` — no scope string is hand-copied here, and an
 * endpoint that changes scope upstream updates this table for free.
 *
 * Not a general permission system: a gate replaces a whole page, so only
 * routes whose content collapses to nothing without one grant are gated.
 * Pure data; the React side is `ScopeGate.tsx`.
 */
import {
  ESI_REGISTRY,
  isScopeRequired,
  type EsiEndpointId,
  type Scope,
  type ScopeRequirement,
} from '@/esi/registry';

/** Explicit marker, so "ungated" is a declaration rather than an oversight. */
export const UNGATED = 'ungated';
export type Ungated = typeof UNGATED;

export interface GatedRoute {
  /** Every ESI endpoint the page's content depends on; public ones contribute no scope. */
  readonly endpoints: readonly EsiEndpointId[];
  /**
   * i18next namespace holding this route's `reauth*` keys. Named rather than
   * derived from the path, so the gate speaks the view's own language ("see
   * your mail", not a generic string).
   */
  readonly strings: string;
}

export type RouteRequirement = Ungated | GatedRoute;

/**
 * Every route rendered inside `Layout`. `App.tsx`'s element map is declared
 * `satisfies Record<AppRoutePath, ...>`, so adding a route there without an
 * entry here does not compile.
 */
export const ROUTE_REQUIREMENTS = {
  // Character-agnostic or locally-backed: nothing to gate.
  '/characters': UNGATED,
  // Market Browser is SDE + Fuzzwork only — no character endpoint.
  '/market': UNGATED,
  // Skill Plans are local, editable data; the ESI reads only decorate them.
  '/skills/plans': UNGATED,
  // Device-local display preferences only — no ESI endpoint to gate on.
  '/settings': UNGATED,

  // Multi-scope pages: a page gate would hide panels that still work (Overview
  // mixes skills, queue and wallet; Skills adds implants; Industry adds
  // blueprints and jobs). These need panel-level gating instead.
  '/overview': UNGATED,
  '/skills': UNGATED,
  '/industry': UNGATED,
  // Single-scope, but already renders `ReauthBanner` from its own
  // `needsReauth` result.
  '/wallet': UNGATED,

  // One scope each, so a missing grant leaves the page with literally nothing
  // to show.
  '/assets': {
    endpoints: ['getCharacterAssets', 'getUniverseStation', 'postUniverseNames', 'getUniverseType'],
    strings: 'assets',
  },
  '/mail': {
    endpoints: ['getCharacterMailHeaders', 'getCharacterMail', 'postUniverseNames'],
    strings: 'mail',
  },
  '/calendar': {
    endpoints: ['getCharacterCalendar', 'getCharacterCalendarEvent'],
    strings: 'calendar',
  },
  '/contracts': {
    endpoints: ['getCharacterContracts', 'postUniverseNames'],
    strings: 'contracts',
  },
  '/orders': {
    endpoints: [
      'getCharacterOrders',
      'getCharacterOrderHistory',
      'postUniverseNames',
      'getUniverseType',
    ],
    strings: 'orders',
  },
} as const satisfies Record<string, RouteRequirement>;

export type AppRoutePath = keyof typeof ROUTE_REQUIREMENTS;

export type GatedRoutePath = {
  [K in AppRoutePath]: (typeof ROUTE_REQUIREMENTS)[K] extends Ungated ? never : K;
}[AppRoutePath];

export function isGatedRoute(path: AppRoutePath): path is GatedRoutePath {
  return ROUTE_REQUIREMENTS[path] !== UNGATED;
}

/** i18next namespace carrying the gated route's re-auth strings. */
export function routeStringsNamespace(path: GatedRoutePath): string {
  return (ROUTE_REQUIREMENTS[path] as GatedRoute).strings;
}

/**
 * Distinct scopes a route's endpoints require, in declaration order. Public
 * endpoints drop out, so an ungated route and a public-only route both yield
 * `[]` — and `[]` never gates.
 */
export function requiredScopesForRoute(path: AppRoutePath): readonly Scope[] {
  const requirement = ROUTE_REQUIREMENTS[path];
  if (requirement === UNGATED) return [];
  // Widened to ScopeRequirement so `isScopeRequired` narrows: one route's
  // literal union is not a supertype of `Scope`, which `filter`'s type-guard
  // overload needs.
  const declared: ScopeRequirement[] = requirement.endpoints.map(
    (endpoint) => ESI_REGISTRY[endpoint].scope
  );
  return [...new Set(declared)].filter(isScopeRequired);
}

/**
 * Required scopes absent from `granted`. Plain strings, because a JWT's `scp`
 * claim carries whatever CCP put there. This scope-set comparison is the only
 * authority for gating — never a response code (see `ScopeGate.tsx`).
 */
export function missingScopesForRoute(
  path: AppRoutePath,
  granted: readonly string[]
): readonly Scope[] {
  const held = new Set(granted);
  return requiredScopesForRoute(path).filter((scope) => !held.has(scope));
}
