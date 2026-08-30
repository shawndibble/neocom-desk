/**
 * Single source of truth for every ESI endpoint NeoCom Desk calls: the OAuth
 * scope it needs (or an explicit "public").
 *
 * Two consumers, one declaration:
 *  - `src/esi/scopes.ts` derives `SCOPES` from here, so the login request can
 *    no longer drift from the endpoints the app actually calls.
 *  - `src/app/routeScopes.ts` derives each gated route's required scopes from
 *    here, so a route's scope gate can't drift from the endpoints it calls.
 *
 * Each entry also carries its ESI route *template*, but that field has no
 * runtime consumer today — it exists so `registry.test.ts` can pin it against
 * the `// --- METHOD /route (scope) ---` marker comments in `endpoints.ts`.
 * Two features that would consume it for real don't exist yet: a precise
 * per-scope cache purge (`cachePurge.ts` ships a blunt whole-character purge
 * instead, deliberately — see its docblock) and an activity log. Either would
 * also want back the character/global distinction this table used to carry
 * as a `subject` field, dropped for lack of a reader. See
 * `docs/plans/evelens-parity/README.md` before re-adding either.
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

export interface EsiEndpointSpec {
  /** ESI route with `{snake_case}` placeholders — never an interpolated URL. */
  readonly route: string;
  readonly scope: ScopeRequirement;
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
 *
 * Every wrapper in `endpoints.ts` — nothing else calls ESI directly today
 * (`src/market/cost-index.ts` and `src/market/esiPrices.ts` used to be listed
 * here too, as a `DIRECT_CALL_REGISTRY` bucket, but both are `PUBLIC` and had
 * no reader for their route or scope, so they were dropped; re-add them if a
 * consumer needs every ESI call covered, not just the wrapped ones).
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

  // Public: no scope required.
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
} as const satisfies Record<EndpointName, EsiEndpointSpec>;

export type EsiEndpointId = keyof typeof ESI_REGISTRY;

/** Union of the scopes the app actually needs, derived from the table above. */
export type Scope = Exclude<(typeof ESI_REGISTRY)[EsiEndpointId]['scope'], PublicAccess>;

/** Narrows a declared requirement to a real scope, dropping the PUBLIC marker. */
export function isScopeRequired(requirement: ScopeRequirement): requirement is Scope {
  return requirement !== PUBLIC;
}
