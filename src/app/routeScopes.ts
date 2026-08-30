/**
 * What each in-app route needs from the character's OAuth grant, declared
 * once so the shell can gate a view *before* it fetches anything.
 *
 * Defect D3: `ReauthBanner` was wired into 3 of 9 ESI-backed views, so the
 * other six rendered as merely empty when a scope was missing. Wiring the
 * banner into six more views would duplicate the same branch nine times and
 * would still only discover the problem after a failed fetch — spinner, empty
 * table, then an explanation. The grant is knowable up front: `TokenRecord`
 * persists the character's `scopes`, and `src/esi/registry.ts` maps every
 * endpoint to the scope it needs. So a route declares the *endpoints* it
 * calls and the required scopes are derived; no scope string is hand-copied
 * here, and an endpoint that changes scope upstream updates this table for
 * free.
 *
 * Deliberately **not** a general permission system: gating replaces a whole
 * page, so only routes whose content collapses to nothing without one grant
 * are gated. Everything else declares `UNGATED` with its reason —
 * `/overview`, `/skills` and `/industry` each render panels backed by
 * different scopes, and hiding the page because one of them is missing would
 * hide working content. Those need panel-level treatment, not a page gate.
 *
 * Pure data + pure functions: no React, no Dexie, no fetch. The React side is
 * `ScopeGate.tsx`.
 */
import {
  ESI_REGISTRY,
  isScopeRequired,
  type EsiEndpointId,
  type Scope,
  type ScopeRequirement,
} from '@/esi/registry';

/**
 * Explicit marker for a route the scope gate must leave alone, so "ungated"
 * is a declaration rather than an empty list that might be an oversight.
 * Mirrors the `PUBLIC` marker in `esi/registry.ts`.
 */
export const UNGATED = 'ungated';
export type Ungated = typeof UNGATED;

export interface GatedRoute {
  /**
   * Every ESI endpoint the page's content depends on. Public ones may be
   * listed too — they contribute no scope, and listing them keeps this an
   * honest record of what the page calls.
   */
  readonly endpoints: readonly EsiEndpointId[];
  /**
   * i18next namespace holding this route's `reauthTitle`/`reauthHint`/
   * `reauthAction` keys. Named rather than derived from the path so the gate
   * speaks the view's own language ("see your mail", not a generic string).
   */
  readonly strings: string;
}

export type RouteRequirement = Ungated | GatedRoute;

/**
 * Every route rendered inside `Layout`. `App.tsx` builds its route table by
 * mapping over an element map declared `satisfies Record<AppRoutePath, ...>`,
 * so adding a route there without an entry here does not compile — the same
 * trick `esi/registry.ts` uses to keep endpoints and scopes in step.
 */
export const ROUTE_REQUIREMENTS = {
  // Character-agnostic or locally-backed: nothing to gate.
  '/characters': UNGATED,
  // Market Browser is SDE + Fuzzwork only — it calls no character endpoint.
  '/market': UNGATED,
  // Skill Plans are local, editable data; the ESI reads only decorate them.
  '/skills/plans': UNGATED,

  // Multi-scope pages: a page gate would hide panels that still work.
  // Overview mixes skills, skill queue and wallet; Skills mixes skills,
  // skillqueue and implants; Industry mixes blueprints, skills and jobs.
  // Follow-up: panel-level gating inside those views.
  '/overview': UNGATED,
  '/skills': UNGATED,
  '/industry': UNGATED,
  // Single-scope, but already renders `ReauthBanner` from its own
  // `needsReauth` result (defence in depth) — left as-is per D3 scope.
  '/wallet': UNGATED,

  // The six D3 views, minus Overview: one scope each, so a missing grant
  // means the page has literally nothing to show.
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
 * endpoints drop out via `isScopeRequired`, so an ungated route and a route
 * that only reads public data both yield `[]` — and `[]` never gates.
 */
export function requiredScopesForRoute(path: AppRoutePath): readonly Scope[] {
  const requirement = ROUTE_REQUIREMENTS[path];
  if (requirement === UNGATED) return [];
  // Widened to ScopeRequirement so `isScopeRequired` narrows: a literal union
  // of one route's scopes is not a supertype of `Scope`, which is what the
  // type-guard overload of `filter` needs.
  const declared: ScopeRequirement[] = requirement.endpoints.map(
    (endpoint) => ESI_REGISTRY[endpoint].scope
  );
  return [...new Set(declared)].filter(isScopeRequired);
}

/**
 * Required scopes absent from `granted`. Takes plain strings because a JWT's
 * `scp` claim carries whatever CCP put there, exactly as
 * `esi/scopes.revokedScopes` does.
 *
 * This scope-set comparison is the *only* authority for gating. A runtime 403
 * is not: ESI answers 403 for a structure a character simply isn't on the ACL
 * of, even with the right scope, so a gate driven by response codes could pin
 * a re-auth prompt on forever for a case re-authing cannot fix.
 */
export function missingScopesForRoute(
  path: AppRoutePath,
  granted: readonly string[]
): readonly Scope[] {
  const held = new Set(granted);
  return requiredScopesForRoute(path).filter((scope) => !held.has(scope));
}
