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

/**
 * Named, opt-in scope groups: scopes a Character is asked for only when they
 * ask for the feature, rather than at sign-in with everyone else.
 *
 * `corp` exists because the corp section needs seven scopes that ~95% of users
 * can never use — CCP role-gates the endpoints server-side, so a line member
 * granting them gains nothing but a longer consent screen (CONTEXT.md round
 * 35). Adding a group here is a product decision, not a mechanical one: the
 * default is the base grant, and a scope leaves it only when most users would
 * be consenting to something they will never exercise.
 */
export const SCOPE_GROUPS = ['corp'] as const;
export type ScopeGroup = (typeof SCOPE_GROUPS)[number];

export interface EsiEndpointSpec {
  /** ESI route with `{snake_case}` placeholders — never an interpolated URL. */
  readonly route: string;
  readonly scope: ScopeRequirement;
  /**
   * The opt-in group this endpoint's scope belongs to. **Absent means the base
   * grant** — the set every Character is asked for at sign-in — so leaving it
   * off is the ordinary case and grouping is the deliberate one.
   *
   * Declared per endpoint rather than per scope, which is why
   * `scopes.test.ts` asserts the base and grouped sets never overlap: one
   * ungrouped endpoint declaring a grouped scope would quietly put it back on
   * everyone's consent screen.
   */
  readonly group?: ScopeGroup;
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
  getCharacterMailLabels: {
    route: '/characters/{character_id}/mail/labels',
    scope: 'esi-mail.read_mail.v1',
  },
  getCharacterNotifications: {
    route: '/characters/{character_id}/notifications',
    scope: 'esi-characters.read_notifications.v1',
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
  getCharacterContractItems: {
    route: '/characters/{character_id}/contracts/{contract_id}/items',
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
  getCharacterCorporationHistory: {
    route: '/characters/{character_id}/corporationhistory',
    scope: PUBLIC,
  },
  /**
   * The one corp-adjacent scope in the base grant. It is cheap, has no role
   * gate of its own, and every corp surface downstream needs it for *every*
   * character in order to know whether to render at all — so it is not
   * something to offer as an opt-in (CONTEXT.md round 35).
   */
  getCharacterRoles: {
    route: '/characters/{character_id}/roles',
    scope: 'esi-characters.read_corporation_roles.v1',
  },
  getCharacterClones: {
    route: '/characters/{character_id}/clones',
    scope: 'esi-clones.read_clones.v1',
  },
  getUniverseStructure: {
    route: '/universe/structures/{structure_id}',
    scope: 'esi-universe.read_structures.v1',
  },
  getCharacterPlanets: {
    route: '/characters/{character_id}/planets',
    scope: 'esi-planets.manage_planets.v1',
  },
  getCharacterPlanet: {
    route: '/characters/{character_id}/planets/{planet_id}',
    scope: 'esi-planets.manage_planets.v1',
  },
  getUniversePlanet: {
    route: '/universe/planets/{planet_id}',
    scope: PUBLIC,
  },
  getUniverseSchematic: {
    route: '/universe/schematics/{schematic_id}',
    scope: PUBLIC,
  },
  getCharacterContacts: {
    route: '/characters/{character_id}/contacts',
    scope: 'esi-characters.read_contacts.v1',
  },
  getCharacterLoyaltyPoints: {
    route: '/characters/{character_id}/loyalty/points',
    scope: 'esi-characters.read_loyalty.v1',
  },
  getCharacterLocation: {
    route: '/characters/{character_id}/location',
    scope: 'esi-location.read_location.v1',
  },
  getRoute: {
    route: '/route/{origin}/{destination}',
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
  getUniverseGroup: {
    route: '/universe/groups/{group_id}',
    scope: PUBLIC,
  },
  getUniverseStation: {
    route: '/universe/stations/{station_id}',
    scope: PUBLIC,
  },
  getUniverseSystem: {
    route: '/universe/systems/{system_id}',
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
  getMarketHistory: {
    route: '/markets/{region_id}/history',
    scope: PUBLIC,
  },
  getIndustrySystemCostIndices: {
    route: '/industry/systems',
    scope: PUBLIC,
  },

  // --- The `corp` group (issue #295) ---
  //
  // Every entry below is corp-owned data behind a server-side role gate, so
  // none of it reaches the base consent screen. `engine/corpRoles.ts` holds
  // which in-game role opens which of these; the scope is only half the gate.
  getCorporationStructures: {
    route: '/corporations/{corporation_id}/structures',
    scope: 'esi-corporations.read_structures.v1',
    group: 'corp',
  },
  getCorporationWallets: {
    route: '/corporations/{corporation_id}/wallets',
    scope: 'esi-wallet.read_corporation_wallets.v1',
    group: 'corp',
  },
  getCorporationWalletJournal: {
    route: '/corporations/{corporation_id}/wallets/{division}/journal',
    scope: 'esi-wallet.read_corporation_wallets.v1',
    group: 'corp',
  },
  /**
   * A scope of its own, deliberately: without it the wallet and hangar
   * divisions render as "Division 3" rather than the names the corp gave them
   * ("SRP"), which is most of what makes a corp wallet readable.
   */
  getCorporationDivisions: {
    route: '/corporations/{corporation_id}/divisions',
    scope: 'esi-corporations.read_divisions.v1',
    group: 'corp',
  },
  getCorporationMembers: {
    route: '/corporations/{corporation_id}/members',
    scope: 'esi-corporations.read_corporation_membership.v1',
    group: 'corp',
  },
  getCorporationMemberRoles: {
    route: '/corporations/{corporation_id}/roles',
    scope: 'esi-corporations.read_corporation_membership.v1',
    group: 'corp',
  },
  getCorporationMemberTracking: {
    route: '/corporations/{corporation_id}/membertracking',
    scope: 'esi-corporations.track_members.v1',
    group: 'corp',
  },
  /**
   * Singular `/corporation/` — CCP's own inconsistency in the live spec, not a
   * typo here. Every other corp route in this table is plural.
   */
  getCorporationMiningExtractions: {
    route: '/corporation/{corporation_id}/mining/extractions',
    scope: 'esi-industry.read_corporation_mining.v1',
    group: 'corp',
  },
  getCorporationIndustryJobs: {
    route: '/corporations/{corporation_id}/industry/jobs',
    scope: 'esi-industry.read_corporation_jobs.v1',
    group: 'corp',
  },
} as const satisfies Record<EndpointName, EsiEndpointSpec>;

export type EsiEndpointId = keyof typeof ESI_REGISTRY;

/** Union of the scopes the app actually needs, derived from the table above. */
export type Scope = Exclude<(typeof ESI_REGISTRY)[EsiEndpointId]['scope'], PublicAccess>;

/** Narrows a declared requirement to a real scope, dropping the PUBLIC marker. */
export function isScopeRequired(requirement: ScopeRequirement): requirement is Scope {
  return requirement !== PUBLIC;
}
