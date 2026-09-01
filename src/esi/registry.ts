/**
 * Single source of truth for every ESI endpoint NeoCom Desk calls: the OAuth
 * scope it needs, or an explicit "public".
 *
 * Three consumers derive from it rather than restate it — `esi/scopes.ts` for
 * the login request, `app/routeScopes.ts` for each gated route,
 * `esi/endpointRoutes.ts` for the runtime route-template lookup — so none can
 * drift from the endpoints the app actually calls.
 *
 * Pure static data, importing nothing at runtime (`endpoints.ts` is referenced
 * type-only), so `e2e/support` fixtures can import it without dragging in
 * Dexie or fetch. Must never grow auth state (docs/ARCHITECTURE.md §2) and
 * must never be imported by `src/engine` (CLAUDE.md).
 */
import type * as endpoints from './endpoints';

/**
 * Explicit marker, so "no scope" is a declaration rather than a missing field.
 * Public endpoints are the ones a character can never revoke, so the purge
 * skips them.
 */
export const PUBLIC = 'public';
export type PublicAccess = typeof PUBLIC;

/**
 * Shape check only — catches a malformed scope string, not a misspelled one.
 * The spelling backstop is the hand-written literal list in `scopes.test.ts`.
 */
export type EsiScopeName = `esi-${string}.v${number}`;

export type ScopeRequirement = EsiScopeName | PublicAccess;

export interface EsiEndpointSpec {
  /** ESI route with `{snake_case}` placeholders — never an interpolated URL. */
  readonly route: string;
  readonly scope: ScopeRequirement;
}

/**
 * Every exported wrapper in `endpoints.ts`, computed by the compiler rather
 * than hand-listed, so the `Record<EndpointName, ...>` below makes both a
 * missing entry and a stale one a build error.
 */
type EndpointFn = (...args: never[]) => Promise<unknown>;
type EndpointName = {
  [K in keyof typeof endpoints]: (typeof endpoints)[K] extends EndpointFn ? K : never;
}[keyof typeof endpoints];

/**
 * Transcribed from the `// --- METHOD /route (scope) ---` markers in
 * `endpoints.ts`, verified against https://esi.evetech.net/meta/openapi.json;
 * `registry.test.ts` re-parses those markers and asserts they still agree.
 * Covers every wrapper — nothing else calls ESI directly today.
 */
export const ESI_REGISTRY = {
  getCharacterSkills: {
    route: '/characters/{character_id}/skills',
    scope: 'esi-skills.read_skills.v1',
  },
  getCharacterSkillQueue: {
    route: '/characters/{character_id}/skillqueue',
    scope: 'esi-skills.read_skillqueue.v1',
  },
  getCharacterAttributes: {
    route: '/characters/{character_id}/attributes',
    scope: 'esi-skills.read_skills.v1',
  },
  getCharacterImplants: {
    route: '/characters/{character_id}/implants',
    scope: 'esi-clones.read_implants.v1',
  },
  getCharacterBlueprints: {
    route: '/characters/{character_id}/blueprints',
    scope: 'esi-characters.read_blueprints.v1',
  },
  getCharacterWallet: {
    route: '/characters/{character_id}/wallet',
    scope: 'esi-wallet.read_character_wallet.v1',
  },
  getCharacterWalletJournal: {
    route: '/characters/{character_id}/wallet/journal',
    scope: 'esi-wallet.read_character_wallet.v1',
  },
  getCharacterWalletTransactions: {
    route: '/characters/{character_id}/wallet/transactions',
    scope: 'esi-wallet.read_character_wallet.v1',
  },
  getCharacterAssets: {
    route: '/characters/{character_id}/assets',
    scope: 'esi-assets.read_assets.v1',
  },
  getCharacterMailHeaders: {
    route: '/characters/{character_id}/mail',
    scope: 'esi-mail.read_mail.v1',
  },
  getCharacterMail: {
    route: '/characters/{character_id}/mail/{mail_id}',
    scope: 'esi-mail.read_mail.v1',
  },
  getCharacterCalendar: {
    route: '/characters/{character_id}/calendar',
    scope: 'esi-calendar.read_calendar_events.v1',
  },
  getCharacterCalendarEvent: {
    route: '/characters/{character_id}/calendar/{event_id}',
    scope: 'esi-calendar.read_calendar_events.v1',
  },
  getCharacterContracts: {
    route: '/characters/{character_id}/contracts',
    scope: 'esi-contracts.read_character_contracts.v1',
  },
  getCharacterOrders: {
    route: '/characters/{character_id}/orders',
    scope: 'esi-markets.read_character_orders.v1',
  },
  getCharacterOrderHistory: {
    route: '/characters/{character_id}/orders/history',
    scope: 'esi-markets.read_character_orders.v1',
  },
  getCharacterIndustryJobs: {
    route: '/characters/{character_id}/industry/jobs',
    scope: 'esi-industry.read_character_jobs.v1',
  },

  getCharacterPublicInfo: {
    route: '/characters/{character_id}',
    scope: PUBLIC,
  },
  getCorporationPublicInfo: {
    route: '/corporations/{corporation_id}',
    scope: PUBLIC,
  },
  getAlliancePublicInfo: {
    route: '/alliances/{alliance_id}',
    scope: PUBLIC,
  },
  getUniverseType: {
    route: '/universe/types/{type_id}',
    scope: PUBLIC,
  },
  getUniverseStation: {
    route: '/universe/stations/{station_id}',
    scope: PUBLIC,
  },
  postUniverseNames: {
    route: '/universe/names',
    scope: PUBLIC,
  },
  getMarketsPrices: {
    route: '/markets/prices',
    scope: PUBLIC,
  },
  getMarketOrders: {
    route: '/markets/{region_id}/orders',
    scope: PUBLIC,
  },
  getIndustrySystemCostIndices: {
    route: '/industry/systems',
    scope: PUBLIC,
  },
} as const satisfies Record<EndpointName, EsiEndpointSpec>;

export type EsiEndpointId = keyof typeof ESI_REGISTRY;

/** Union of the scopes the app actually needs, derived from the table above. */
export type Scope = Exclude<(typeof ESI_REGISTRY)[EsiEndpointId]['scope'], PublicAccess>;

/** Narrows a declared requirement to a real scope, dropping the PUBLIC marker. */
export function isScopeRequired(requirement: ScopeRequirement): requirement is Scope {
  return requirement !== PUBLIC;
}
