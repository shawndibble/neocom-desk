/**
 * Single source of truth for every ESI endpoint NeoCom Desk calls: its route
 * *template* and the OAuth scope it needs (or an explicit "public").
 *
 * Three consumers, one declaration:
 *  - `src/esi/scopes.ts` derives `SCOPES` from here, so the login request can
 *    no longer drift from the endpoints the app actually calls.
 *  - a future cache purge on scope revoke needs endpoint → scope to know which
 *    `esiCache` rows a revoked scope invalidates (see `subject` below).
 *  - a future activity log needs endpoint → route *template*: logging the built
 *    URL would leak character ids, mail ids and query parameters.
 *
 * Pure static data. This module imports nothing at runtime — `endpoints.ts` is
 * referenced type-only — so it is safe to import from anywhere, including the
 * Playwright fixtures in `e2e/support`, without dragging in Dexie or fetch.
 * It must never grow auth state (docs/ARCHITECTURE.md §2) and must never be
 * imported by `src/engine` (CLAUDE.md).
 */
import type * as endpoints from './endpoints';

/**
 * Explicit marker for an endpoint that needs no scope, so "public" is a
 * declaration rather than a missing field. Public endpoints are exactly the
 * ones a character can never revoke, so the purge consumer skips them.
 */
export const PUBLIC = 'public';
export type PublicAccess = typeof PUBLIC;

/**
 * Shape check only — it catches a malformed scope string, not a misspelled
 * one. The spelling backstop is the literal list in `scopes.test.ts`, which
 * is deliberately hand-written: a test that derived its expectation from this
 * file would assert nothing.
 */
export type EsiScopeName = `esi-${string}.v${number}`;

export type ScopeRequirement = EsiScopeName | PublicAccess;

/**
 * Which `esiCache` partition an endpoint's responses belong to.
 *  - `'character'`: tied to the authenticated character; rows are keyed by
 *    that `characterId` and are what a scope revoke must purge.
 *  - `'global'`: character-independent public reference data (universe types,
 *    station and entity names, market-wide prices). When cached these share
 *    the `GLOBAL_CACHE_CHARACTER_ID` sentinel row (`src/esi/cache.ts`) and
 *    must survive a purge — dropping them is cache churn with no privacy
 *    benefit. Declared here rather than imported so this module stays free of
 *    the Dexie-importing `cache.ts`.
 */
export type EndpointSubject = 'character' | 'global';

export interface EsiEndpointSpec {
  /** ESI route with `{snake_case}` placeholders — never an interpolated URL. */
  readonly route: string;
  readonly scope: ScopeRequirement;
  readonly subject: EndpointSubject;
}

/**
 * Every exported wrapper in `endpoints.ts`, computed by the compiler rather
 * than hand-listed. `Record<EndpointName, EsiEndpointSpec>` below therefore
 * makes both a missing entry and a stale one a build error: adding a wrapper
 * without declaring its scope does not compile.
 */
type EndpointFn = (...args: never[]) => Promise<unknown>;
type EndpointName = {
  [K in keyof typeof endpoints]: (typeof endpoints)[K] extends EndpointFn ? K : never;
}[keyof typeof endpoints];

/**
 * Routes and scopes transcribed from the `// --- METHOD /route (scope) ---`
 * marker comments in `endpoints.ts`, which were verified against
 * https://esi.evetech.net/meta/openapi.json. `registry.test.ts` re-parses
 * those comments and asserts they still agree with this table.
 */
export const ENDPOINT_REGISTRY = {
  getCharacterSkills: {
    route: '/characters/{character_id}/skills',
    scope: 'esi-skills.read_skills.v1',
    subject: 'character',
  },
  getCharacterSkillQueue: {
    route: '/characters/{character_id}/skillqueue',
    scope: 'esi-skills.read_skillqueue.v1',
    subject: 'character',
  },
  getCharacterAttributes: {
    route: '/characters/{character_id}/attributes',
    scope: 'esi-skills.read_skills.v1',
    subject: 'character',
  },
  getCharacterImplants: {
    route: '/characters/{character_id}/implants',
    scope: 'esi-clones.read_implants.v1',
    subject: 'character',
  },
  getCharacterBlueprints: {
    route: '/characters/{character_id}/blueprints',
    scope: 'esi-characters.read_blueprints.v1',
    subject: 'character',
  },
  getCharacterWallet: {
    route: '/characters/{character_id}/wallet',
    scope: 'esi-wallet.read_character_wallet.v1',
    subject: 'character',
  },
  getCharacterWalletJournal: {
    route: '/characters/{character_id}/wallet/journal',
    scope: 'esi-wallet.read_character_wallet.v1',
    subject: 'character',
  },
  getCharacterWalletTransactions: {
    route: '/characters/{character_id}/wallet/transactions',
    scope: 'esi-wallet.read_character_wallet.v1',
    subject: 'character',
  },
  getCharacterAssets: {
    route: '/characters/{character_id}/assets',
    scope: 'esi-assets.read_assets.v1',
    subject: 'character',
  },
  getCharacterMailHeaders: {
    route: '/characters/{character_id}/mail',
    scope: 'esi-mail.read_mail.v1',
    subject: 'character',
  },
  getCharacterMail: {
    route: '/characters/{character_id}/mail/{mail_id}',
    scope: 'esi-mail.read_mail.v1',
    subject: 'character',
  },
  getCharacterCalendar: {
    route: '/characters/{character_id}/calendar',
    scope: 'esi-calendar.read_calendar_events.v1',
    subject: 'character',
  },
  getCharacterCalendarEvent: {
    route: '/characters/{character_id}/calendar/{event_id}',
    scope: 'esi-calendar.read_calendar_events.v1',
    subject: 'character',
  },
  getCharacterContracts: {
    route: '/characters/{character_id}/contracts',
    scope: 'esi-contracts.read_character_contracts.v1',
    subject: 'character',
  },
  getCharacterOrders: {
    route: '/characters/{character_id}/orders',
    scope: 'esi-markets.read_character_orders.v1',
    subject: 'character',
  },
  getCharacterOrderHistory: {
    route: '/characters/{character_id}/orders/history',
    scope: 'esi-markets.read_character_orders.v1',
    subject: 'character',
  },
  getCharacterIndustryJobs: {
    route: '/characters/{character_id}/industry/jobs',
    scope: 'esi-industry.read_character_jobs.v1',
    subject: 'character',
  },

  // Public: no scope, and character-independent — these rows live under
  // GLOBAL_CACHE_CHARACTER_ID and a scope revoke must leave them alone.
  getCharacterPublicInfo: {
    route: '/characters/{character_id}',
    scope: PUBLIC,
    subject: 'global',
  },
  getCorporationPublicInfo: {
    route: '/corporations/{corporation_id}',
    scope: PUBLIC,
    subject: 'global',
  },
  getAlliancePublicInfo: {
    route: '/alliances/{alliance_id}',
    scope: PUBLIC,
    subject: 'global',
  },
  getUniverseType: {
    route: '/universe/types/{type_id}',
    scope: PUBLIC,
    subject: 'global',
  },
  getUniverseStation: {
    route: '/universe/stations/{station_id}',
    scope: PUBLIC,
    subject: 'global',
  },
  postUniverseNames: {
    route: '/universe/names',
    scope: PUBLIC,
    subject: 'global',
  },
} as const satisfies Record<EndpointName, EsiEndpointSpec>;

/**
 * ESI routes called straight through `esiFetch` with no wrapper in
 * `endpoints.ts` (`src/market/cost-index.ts`, `src/market/esiPrices.ts`).
 * Keyed by the calling function's name.
 *
 * This bucket gets no compile-time completeness check — that would require
 * routing both calls through `endpoints.ts` wrappers, a runtime change out of
 * scope here. They are listed anyway so a consumer that needs a route template
 * for *every* ESI call (the activity log) has no blind spot. Both are public,
 * so they contribute nothing to the derived scope list.
 */
export const DIRECT_CALL_REGISTRY = {
  fetchSystemCostIndices: {
    route: '/industry/systems',
    scope: PUBLIC,
    subject: 'global',
  },
  fetchAdjustedPrices: {
    route: '/markets/prices',
    scope: PUBLIC,
    subject: 'global',
  },
} as const satisfies Record<string, EsiEndpointSpec>;

/** Every ESI endpoint the app calls, wrapped or not. */
export const ESI_REGISTRY = {
  ...ENDPOINT_REGISTRY,
  ...DIRECT_CALL_REGISTRY,
} as const;

export type EsiEndpointId = keyof typeof ESI_REGISTRY;

/** Union of every route template — the only endpoint identifier safe to log. */
export type EsiRoute = (typeof ESI_REGISTRY)[EsiEndpointId]['route'];

/** Union of the scopes the app actually needs, derived from the table above. */
export type Scope = Exclude<(typeof ESI_REGISTRY)[EsiEndpointId]['scope'], PublicAccess>;

/** Narrows a declared requirement to a real scope, dropping the PUBLIC marker. */
export function isScopeRequired(requirement: ScopeRequirement): requirement is Scope {
  return requirement !== PUBLIC;
}
