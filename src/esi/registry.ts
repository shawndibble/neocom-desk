/**
 * Single source of truth for every ESI endpoint Neocom Desk calls: the OAuth
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
 * Every named Scope Group (user-facing: **Permission**) a scope outside the
 * **Core Grant** can belong to. Eleven are default-on — granted at sign-in
 * along with the Core Grant, together forming the **Base Grant** — and two
 * (`corp`, `structureMarkets`) are opt-in: a Character is asked for them only
 * when they ask for the feature, never at sign-in with everyone else.
 *
 * `corp` exists because the corp section needs ten scopes that ~95% of users
 * can never use — CCP role-gates the endpoints server-side, so a line member
 * granting them gains nothing but a longer consent screen (CONTEXT.md round
 * 35). `structureMarkets` (issue #538) exists because most Characters never
 * list an order inside a player structure, so `esi-markets.structure_markets.v1`
 * would cost everyone a consent-screen line for a check almost nobody's
 * orders need. No settings surface requests that group yet — until one does,
 * it stays grantable in principle but ungranted in practice, which degrades
 * to the same "unavailable" row every ungranted Character already sees.
 *
 * See `docs/context/decisions/20260924-143410-customize-permissions-at-sign-in-core-grant-plus.md`
 * for why the split lands exactly here.
 */
export const SCOPE_GROUPS = [
  'wallet',
  'marketOrders',
  'contracts',
  'assets',
  'industry',
  'mining',
  'planets',
  'mail',
  'calendar',
  'notifications',
  'characterDetails',
  'corp',
  'structureMarkets',
] as const;
export type ScopeGroup = (typeof SCOPE_GROUPS)[number];

/** A Permission's i18n keys and whether it's part of the Base Grant. */
export interface PermissionMeta {
  /** i18n key for the user-facing checkbox label (`en.json`). */
  readonly labelKey: string;
  /** i18n key for the one-line "unlocks" caption under the label (`en.json`). */
  readonly captionKey: string;
  /** Whether this Permission is part of the Base Grant (on by default). */
  readonly defaultOn: boolean;
}

/**
 * Every Permission's metadata, readable from one place — the source the
 * Customize permissions dialog and re-login banners (#1520+) read from,
 * rather than each hand-listing labels and captions of their own.
 */
export const PERMISSIONS: Record<ScopeGroup, PermissionMeta> = {
  wallet: {
    labelKey: 'permissions.wallet.label',
    captionKey: 'permissions.wallet.caption',
    defaultOn: true,
  },
  marketOrders: {
    labelKey: 'permissions.marketOrders.label',
    captionKey: 'permissions.marketOrders.caption',
    defaultOn: true,
  },
  contracts: {
    labelKey: 'permissions.contracts.label',
    captionKey: 'permissions.contracts.caption',
    defaultOn: true,
  },
  assets: {
    labelKey: 'permissions.assets.label',
    captionKey: 'permissions.assets.caption',
    defaultOn: true,
  },
  industry: {
    labelKey: 'permissions.industry.label',
    captionKey: 'permissions.industry.caption',
    defaultOn: true,
  },
  mining: {
    labelKey: 'permissions.mining.label',
    captionKey: 'permissions.mining.caption',
    defaultOn: true,
  },
  planets: {
    labelKey: 'permissions.planets.label',
    captionKey: 'permissions.planets.caption',
    defaultOn: true,
  },
  mail: {
    labelKey: 'permissions.mail.label',
    captionKey: 'permissions.mail.caption',
    defaultOn: true,
  },
  calendar: {
    labelKey: 'permissions.calendar.label',
    captionKey: 'permissions.calendar.caption',
    defaultOn: true,
  },
  notifications: {
    labelKey: 'permissions.notifications.label',
    captionKey: 'permissions.notifications.caption',
    defaultOn: true,
  },
  characterDetails: {
    labelKey: 'permissions.characterDetails.label',
    captionKey: 'permissions.characterDetails.caption',
    defaultOn: true,
  },
  corp: {
    labelKey: 'permissions.corp.label',
    captionKey: 'permissions.corp.caption',
    defaultOn: false,
  },
  structureMarkets: {
    labelKey: 'permissions.structureMarkets.label',
    captionKey: 'permissions.structureMarkets.caption',
    defaultOn: false,
  },
};

export interface EsiEndpointSpec {
  /** ESI route with `{snake_case}` placeholders — never an interpolated URL. */
  readonly route: string;
  readonly scope: ScopeRequirement;
  /**
   * The Permission (Scope Group) this endpoint's scope belongs to. **Absent
   * means the Core Grant** — the handful of scopes every Character is asked
   * for at sign-in and which belong to no Permission (skills, skill queue,
   * structure lookup and search) — so leaving it off is the rare case,
   * reserved for those.
   *
   * Every other endpoint declares one of the 13 `SCOPE_GROUPS`: the eleven
   * default-on ones together with the Core Grant make up the **Base Grant**
   * (`SCOPES` in `scopes.ts`), and `corp`/`structureMarkets` stay opt-in.
   *
   * Declared per endpoint rather than per scope, which is why
   * `scopes.test.ts` asserts a scope repeated across endpoints always
   * resolves to the same group: one endpoint declaring a scope inconsistently
   * would quietly split it across two Permissions (or into and out of the
   * Core Grant).
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
    group: 'characterDetails',
  },
  getCharacterBlueprints: {
    route: '/characters/{character_id}/blueprints',
    scope: 'esi-characters.read_blueprints.v1',
    group: 'industry',
  },
  getCharacterWallet: {
    route: '/characters/{character_id}/wallet',
    scope: 'esi-wallet.read_character_wallet.v1',
    group: 'wallet',
  },
  getCharacterWalletJournal: {
    route: '/characters/{character_id}/wallet/journal',
    scope: 'esi-wallet.read_character_wallet.v1',
    group: 'wallet',
  },
  getCharacterWalletTransactions: {
    route: '/characters/{character_id}/wallet/transactions',
    scope: 'esi-wallet.read_character_wallet.v1',
    group: 'wallet',
  },
  getCharacterAssets: {
    route: '/characters/{character_id}/assets',
    scope: 'esi-assets.read_assets.v1',
    group: 'assets',
  },
  getCharacterMailHeaders: {
    route: '/characters/{character_id}/mail',
    scope: 'esi-mail.read_mail.v1',
    group: 'mail',
  },
  getCharacterMail: {
    route: '/characters/{character_id}/mail/{mail_id}',
    scope: 'esi-mail.read_mail.v1',
    group: 'mail',
  },
  getCharacterMailLabels: {
    route: '/characters/{character_id}/mail/labels',
    scope: 'esi-mail.read_mail.v1',
    group: 'mail',
  },
  getCharacterMailingLists: {
    route: '/characters/{character_id}/mail/lists',
    scope: 'esi-mail.read_mail.v1',
    group: 'mail',
  },
  putCharacterMail: {
    route: '/characters/{character_id}/mail/{mail_id}/',
    scope: 'esi-mail.organize_mail.v1',
    group: 'mail',
  },

  // Base grant, deliberately (mail-reply-and-forward decision): every
  // Character can send mail, unlike the gated `corp` scopes below.
  postCharacterMail: {
    route: '/characters/{character_id}/mail/',
    scope: 'esi-mail.send_mail.v1',
    group: 'mail',
  },
  getCharacterNotifications: {
    route: '/characters/{character_id}/notifications',
    scope: 'esi-characters.read_notifications.v1',
    group: 'notifications',
  },
  getCharacterCalendar: {
    route: '/characters/{character_id}/calendar',
    scope: 'esi-calendar.read_calendar_events.v1',
    group: 'calendar',
  },
  getCharacterCalendarEvent: {
    route: '/characters/{character_id}/calendar/{event_id}',
    scope: 'esi-calendar.read_calendar_events.v1',
    group: 'calendar',
  },
  putCharacterCalendarResponse: {
    route: '/characters/{character_id}/calendar/{event_id}/',
    scope: 'esi-calendar.respond_calendar_events.v1',
    group: 'calendar',
  },
  getCharacterContracts: {
    route: '/characters/{character_id}/contracts',
    scope: 'esi-contracts.read_character_contracts.v1',
    group: 'contracts',
  },
  getCharacterContractItems: {
    route: '/characters/{character_id}/contracts/{contract_id}/items',
    scope: 'esi-contracts.read_character_contracts.v1',
    group: 'contracts',
  },
  getPublicContractItems: {
    route: '/contracts/public/items/{contract_id}',
    scope: PUBLIC,
  },
  getCharacterOrders: {
    route: '/characters/{character_id}/orders',
    scope: 'esi-markets.read_character_orders.v1',
    group: 'marketOrders',
  },
  getCharacterOrderHistory: {
    route: '/characters/{character_id}/orders/history',
    scope: 'esi-markets.read_character_orders.v1',
    group: 'marketOrders',
  },
  getCharacterIndustryJobs: {
    route: '/characters/{character_id}/industry/jobs',
    scope: 'esi-industry.read_character_jobs.v1',
    group: 'industry',
  },
  /**
   * Base grant, like every other single-route D3 view (mail, calendar,
   * contracts, clones, contacts, loyalty) — declaring its own group is what
   * lets `permissionsForRoute` derive the right Permission for `ScopeGate`'s
   * re-login banner (issue #1520), rather than the banner over-asking for
   * every Permission. The `corp` group's own grant flow (`CorpGrantPrompt`)
   * exists because a corp role is discoverable and this isn't — nothing here
   * can tell a renter needs this scope before they visit the page and ask
   * for it themselves.
   */
  getCharacterMining: {
    route: '/characters/{character_id}/mining/',
    scope: 'esi-industry.read_character_mining.v1',
    group: 'mining',
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
   * In the `corp` group, not the Base Grant: reading this needs its own scope
   * regardless of the other nine, so a Character cannot know their corp role
   * until they opt in. That costs the "you just made Director, grant now"
   * proactive nudge (`CorpGrantPrompt`) for anyone who never granted the group
   * before — `useCorpAccess` answers `not-granted` instead, and Settings'
   * Corp access row is the only way in. A Character who already held this
   * scope from the old Base Grant keeps it (`app/loginFlow.ts` unions with
   * the stored grant), so nothing changes for them.
   */
  getCharacterRoles: {
    route: '/characters/{character_id}/roles',
    scope: 'esi-characters.read_corporation_roles.v1',
    group: 'corp',
  },
  getCharacterClones: {
    route: '/characters/{character_id}/clones',
    scope: 'esi-clones.read_clones.v1',
    group: 'characterDetails',
  },
  getUniverseStructure: {
    route: '/universe/structures/{structure_id}',
    scope: 'esi-universe.read_structures.v1',
  },
  getCharacterPlanets: {
    route: '/characters/{character_id}/planets',
    scope: 'esi-planets.manage_planets.v1',
    group: 'planets',
  },
  getCharacterPlanet: {
    route: '/characters/{character_id}/planets/{planet_id}',
    scope: 'esi-planets.manage_planets.v1',
    group: 'planets',
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
    group: 'characterDetails',
  },
  getCharacterLoyaltyPoints: {
    route: '/characters/{character_id}/loyalty/points',
    scope: 'esi-characters.read_loyalty.v1',
    group: 'characterDetails',
  },
  getCharacterStandings: {
    route: '/characters/{character_id}/standings/',
    scope: 'esi-characters.read_standings.v1',
    group: 'characterDetails',
  },
  getLoyaltyStoreOffers: {
    route: '/loyalty/stores/{corporation_id}/offers/',
    scope: PUBLIC,
  },
  getCharacterLocation: {
    route: '/characters/{character_id}/location',
    scope: 'esi-location.read_location.v1',
    group: 'characterDetails',
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
  getUniverseRegion: {
    route: '/universe/regions/{region_id}',
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
  postCharactersAffiliation: {
    route: '/characters/affiliation',
    scope: PUBLIC,
  },
  postUniverseIds: {
    route: '/universe/ids',
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

  // Opt-in (issue #538): the region order book above never includes a player
  // structure's own orders, so this is the only way to check one. ACL-gated
  // per structure, same as `getUniverseStructure` — a 403 is a normal "not on
  // this structure's ACL" outcome, never a reauth trigger.
  getStructureMarketOrders: {
    route: '/markets/structures/{structure_id}',
    scope: 'esi-markets.structure_markets.v1',
    group: 'structureMarkets',
  },
  getIndustrySystemCostIndices: {
    route: '/industry/systems',
    scope: PUBLIC,
  },

  // Base grant, deliberately: the Build Plan's build-location search is a plain
  // feature of a route every Character can open, and it pairs with
  // `getUniverseStructure`'s `esi-universe.read_structures.v1`, which is
  // already asked for at sign-in. `/industry` stays UNGATED in `routeScopes.ts`
  // — a Character who signed in before this scope existed keeps the whole route
  // and is offered the re-auth by the picker itself.
  getCharacterSearch: {
    route: '/characters/{character_id}/search',
    scope: 'esi-search.search_structures.v1',
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
   * No new scope, and therefore no re-grant: ESI secures the corp wallet's
   * transactions with the same `read_corporation_wallets` scope as the two
   * entries above, already in the `corp` group and already claimed by
   * `canReadWallet` (issue #570).
   */
  getCorporationWalletTransactions: {
    route: '/corporations/{corporation_id}/wallets/{division}/transactions',
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
  /**
   * The corp assets list #295 meant to register and did not (issue #327). Its
   * scope is the corp twin of the Base Grant's `esi-assets.read_assets.v1` and
   * still belongs in the group: a line member can no more read their corp's
   * hangars than its wallet.
   */
  getCorporationAssets: {
    route: '/corporations/{corporation_id}/assets',
    scope: 'esi-assets.read_corporation_assets.v1',
    group: 'corp',
  },
  /**
   * The corp twin of `getCharacterBlueprints` (issue #839) — the
   * corporation's own BPOs/BPCs, Director-only per `x-required-roles`
   * (`engine/corpRoles.ts`'s `canReadBlueprints`).
   */
  getCorporationBlueprints: {
    route: '/corporations/{corporation_id}/blueprints',
    scope: 'esi-corporations.read_blueprints.v1',
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

/**
 * Distinct Permissions the given endpoints belong to, in declaration order.
 * An endpoint declaring no `group` (Core Grant) contributes nothing — a
 * banner or gate whose endpoints are all Core Grant has no Permission to ask
 * for, which is exactly the re-login banner's "no identifiable Permission"
 * case (issue #1520): it should ask for the Core Grant plus the Character's
 * stored grant, never the whole Base Grant.
 */
export function permissionsForEndpoints(ids: readonly EsiEndpointId[]): readonly ScopeGroup[] {
  return [
    ...new Set(
      ids
        .map((id) => (ESI_REGISTRY[id] as EsiEndpointSpec).group)
        .filter((group): group is ScopeGroup => group !== undefined)
    ),
  ];
}
