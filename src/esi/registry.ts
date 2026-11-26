import type * as endpoints from './endpoints';

export const PUBLIC = 'public';
export type PublicAccess = typeof PUBLIC;

export type EsiScopeName = `esi-${string}.v${number}` | `esi.${string}:${string}`;

export type ScopeRequirement = EsiScopeName | PublicAccess;

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
  'fittings',
  'currentShip',
  'mailSend',
  'mailOrganize',
  'calendarRespond',
  'fittingsWrite',
  'autopilot',
  'openWindow',
  'corp',
  'structureMarkets',
  'jumpFatigue',
  'corpProjects',
  'killmails',
  'mercenaryDens',
  'militaryCampaigns',
] as const;
export type ScopeGroup = (typeof SCOPE_GROUPS)[number];

export interface PermissionMeta {
  readonly labelKey: string;
  readonly captionKey: string;
  readonly defaultOn: boolean;
  readonly section?: 'write';
}

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
  fittings: {
    labelKey: 'permissions.fittings.label',
    captionKey: 'permissions.fittings.caption',
    defaultOn: true,
  },
  currentShip: {
    labelKey: 'permissions.currentShip.label',
    captionKey: 'permissions.currentShip.caption',
    defaultOn: true,
  },
  mailSend: {
    labelKey: 'permissions.mailSend.label',
    captionKey: 'permissions.mailSend.caption',
    defaultOn: false,
    section: 'write',
  },
  mailOrganize: {
    labelKey: 'permissions.mailOrganize.label',
    captionKey: 'permissions.mailOrganize.caption',
    defaultOn: false,
    section: 'write',
  },
  calendarRespond: {
    labelKey: 'permissions.calendarRespond.label',
    captionKey: 'permissions.calendarRespond.caption',
    defaultOn: false,
    section: 'write',
  },
  fittingsWrite: {
    labelKey: 'permissions.fittingsWrite.label',
    captionKey: 'permissions.fittingsWrite.caption',
    defaultOn: false,
    section: 'write',
  },
  autopilot: {
    labelKey: 'permissions.autopilot.label',
    captionKey: 'permissions.autopilot.caption',
    defaultOn: false,
    section: 'write',
  },
  openWindow: {
    labelKey: 'permissions.openWindow.label',
    captionKey: 'permissions.openWindow.caption',
    defaultOn: false,
    section: 'write',
  },
  corp: {
    labelKey: 'permissions.corp.label',
    captionKey: 'permissions.corp.caption',
    defaultOn: true,
  },
  structureMarkets: {
    labelKey: 'permissions.structureMarkets.label',
    captionKey: 'permissions.structureMarkets.caption',
    defaultOn: true,
  },
  jumpFatigue: {
    labelKey: 'permissions.jumpFatigue.label',
    captionKey: 'permissions.jumpFatigue.caption',
    defaultOn: true,
  },
  corpProjects: {
    labelKey: 'permissions.corpProjects.label',
    captionKey: 'permissions.corpProjects.caption',
    defaultOn: true,
  },
  killmails: {
    labelKey: 'permissions.killmails.label',
    captionKey: 'permissions.killmails.caption',
    defaultOn: true,
  },
  mercenaryDens: {
    labelKey: 'permissions.mercenaryDens.label',
    captionKey: 'permissions.mercenaryDens.caption',
    defaultOn: true,
  },
  militaryCampaigns: {
    labelKey: 'permissions.militaryCampaigns.label',
    captionKey: 'permissions.militaryCampaigns.caption',
    defaultOn: true,
  },
};

export interface EsiEndpointSpec {
  readonly route: string;
  readonly scope: ScopeRequirement;
  readonly group?: ScopeGroup;
}

type EndpointFn = (...args: never[]) => Promise<unknown>;
type EndpointName = {
  [K in keyof typeof endpoints]: (typeof endpoints)[K] extends EndpointFn ? K : never;
}[keyof typeof endpoints];

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
  postCharacterAssetNames: {
    route: '/characters/{character_id}/assets/names',
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
    group: 'mailOrganize',
  },

  postCharacterMail: {
    route: '/characters/{character_id}/mail/',
    scope: 'esi-mail.send_mail.v1',
    group: 'mailSend',
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
    group: 'calendarRespond',
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
  getCorporationOrders: {
    route: '/corporations/{corporation_id}/orders',
    scope: 'esi-markets.read_corporation_orders.v1',
    group: 'corp',
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
  getCharacterMining: {
    route: '/characters/{character_id}/mining/',
    scope: 'esi-industry.read_character_mining.v1',
    group: 'mining',
  },

  getCharacterFittings: {
    route: '/characters/{character_id}/fittings',
    scope: 'esi-fittings.read_fittings.v1',
    group: 'fittings',
  },
  postCharacterFitting: {
    route: '/characters/{character_id}/fittings/',
    scope: 'esi-fittings.write_fittings.v1',
    group: 'fittingsWrite',
  },
  deleteCharacterFitting: {
    route: '/characters/{character_id}/fittings/{fitting_id}/',
    scope: 'esi-fittings.write_fittings.v1',
    group: 'fittingsWrite',
  },

  getCharacterPublicInfo: {
    route: '/characters/{character_id}',
    scope: PUBLIC,
  },
  getCorporationPublicInfo: {
    route: '/corporations/{corporation_id}',
    scope: PUBLIC,
  },
  getCorporationAllianceHistory: {
    route: '/corporations/{corporation_id}/alliancehistory',
    scope: PUBLIC,
  },
  getCharacterCorporationHistory: {
    route: '/characters/{character_id}/corporationhistory',
    scope: PUBLIC,
  },
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
  getCharacterFatigue: {
    route: '/characters/{character_id}/fatigue',
    scope: 'esi-characters.read_fatigue.v1',
    group: 'jumpFatigue',
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
  getCharacterMercenaryDens: {
    route: '/characters/{character_id}/structures/mercenary-dens',
    scope: 'esi-structures.read_character.v1',
    group: 'mercenaryDens',
  },
  getCharacterMercenaryDen: {
    route: '/characters/{character_id}/structures/mercenary-dens/{mercenary_den_id}',
    scope: 'esi-structures.read_character.v1',
    group: 'mercenaryDens',
  },
  getCharacterMercenaryOperations: {
    route: '/characters/{character_id}/mercenary-tactical-operations',
    scope: 'esi-activities.read_character.v1',
    group: 'mercenaryDens',
  },
  getCharacterMercenaryOperation: {
    route: '/characters/{character_id}/mercenary-tactical-operations/{operation_id}',
    scope: 'esi-activities.read_character.v1',
    group: 'mercenaryDens',
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
  getCharacterContactLabels: {
    route: '/characters/{character_id}/contacts/labels',
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
  getCharacterShip: {
    route: '/characters/{character_id}/ship',
    scope: 'esi-location.read_ship_type.v1',
    group: 'currentShip',
  },
  postRoute: {
    route: '/route/{origin_system_id}/{destination_system_id}',
    scope: PUBLIC,
  },
  postAutopilotWaypoint: {
    route: '/ui/autopilot/waypoint',
    scope: 'esi-ui.write_waypoint.v1',
    group: 'autopilot',
  },
  postOpenWindowInformation: {
    route: '/ui/openwindow/information',
    scope: 'esi-ui.open_window.v1',
    group: 'openWindow',
  },
  postOpenWindowMarketDetails: {
    route: '/ui/openwindow/marketdetails',
    scope: 'esi-ui.open_window.v1',
    group: 'openWindow',
  },
  postOpenWindowContract: {
    route: '/ui/openwindow/contract',
    scope: 'esi-ui.open_window.v1',
    group: 'openWindow',
  },
  postOpenWindowNewMail: {
    route: '/ui/openwindow/newmail',
    scope: 'esi-ui.open_window.v1',
    group: 'openWindow',
  },
  getAlliancePublicInfo: {
    route: '/alliances/{alliance_id}',
    scope: PUBLIC,
  },
  getAllianceCorporations: {
    route: '/alliances/{alliance_id}/corporations',
    scope: PUBLIC,
  },
  getWarIds: {
    route: '/wars',
    scope: PUBLIC,
  },
  getWar: {
    route: '/wars/{war_id}',
    scope: PUBLIC,
  },
  getKillmail: {
    route: '/killmails/{killmail_id}/{killmail_hash}',
    scope: PUBLIC,
  },
  getCharacterKillmailsRecent: {
    route: '/characters/{character_id}/killmails/recent',
    scope: 'esi-killmails.read_killmails.v1',
    group: 'killmails',
  },
  getUniverseType: {
    route: '/universe/types/{type_id}',
    scope: PUBLIC,
  },
  getDogmaDynamicItem: {
    route: '/dogma/dynamic/items/{type_id}/{item_id}',
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
  getUniverseMoon: {
    route: '/universe/moons/{moon_id}',
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
  getUniverseFactions: {
    route: '/universe/factions',
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
  getMarketTypes: {
    route: '/markets/{region_id}/types',
    scope: PUBLIC,
  },

  getStructureMarketOrders: {
    route: '/markets/structures/{structure_id}',
    scope: 'esi-markets.structure_markets.v1',
    group: 'structureMarkets',
  },
  getIndustrySystemCostIndices: {
    route: '/industry/systems',
    scope: PUBLIC,
  },
  getIndustryFacilities: {
    route: '/industry/facilities',
    scope: PUBLIC,
  },
  getIncursions: {
    route: '/incursions',
    scope: PUBLIC,
  },
  getRaidableSkyhooks: {
    route: '/skyhooks/raidable',
    scope: PUBLIC,
  },
  getUniverseSystemKills: {
    route: '/universe/system_kills',
    scope: PUBLIC,
  },
  getUniverseSystemJumps: {
    route: '/universe/system_jumps',
    scope: PUBLIC,
  },
  getUniverseStargate: {
    route: '/universe/stargates/{stargate_id}',
    scope: PUBLIC,
  },

  getCharacterSearch: {
    route: '/characters/{character_id}/search',
    scope: 'esi-search.search_structures.v1',
  },

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
  getCorporationWalletTransactions: {
    route: '/corporations/{corporation_id}/wallets/{division}/transactions',
    scope: 'esi-wallet.read_corporation_wallets.v1',
    group: 'corp',
  },
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
  getCorporationMiningExtractions: {
    route: '/corporation/{corporation_id}/mining/extractions',
    scope: 'esi-industry.read_corporation_mining.v1',
    group: 'corp',
  },
  getCorporationMiningObservers: {
    route: '/corporation/{corporation_id}/mining/observers',
    scope: 'esi-industry.read_corporation_mining.v1',
    group: 'corp',
  },
  getCorporationMiningObserver: {
    route: '/corporation/{corporation_id}/mining/observers/{observer_id}',
    scope: 'esi-industry.read_corporation_mining.v1',
    group: 'corp',
  },
  getCorporationIndustryJobs: {
    route: '/corporations/{corporation_id}/industry/jobs',
    scope: 'esi-industry.read_corporation_jobs.v1',
    group: 'corp',
  },
  getCorporationAssets: {
    route: '/corporations/{corporation_id}/assets',
    scope: 'esi-assets.read_corporation_assets.v1',
    group: 'corp',
  },
  postCorporationAssetNames: {
    route: '/corporations/{corporation_id}/assets/names',
    scope: 'esi-assets.read_corporation_assets.v1',
    group: 'corp',
  },
  getCorporationBlueprints: {
    route: '/corporations/{corporation_id}/blueprints',
    scope: 'esi-corporations.read_blueprints.v1',
    group: 'corp',
  },
  getCorporationStarbases: {
    route: '/corporations/{corporation_id}/starbases',
    scope: 'esi-corporations.read_starbases.v1',
    group: 'corp',
  },
  getCorporationStarbase: {
    route: '/corporations/{corporation_id}/starbases/{starbase_id}',
    scope: 'esi-corporations.read_starbases.v1',
    group: 'corp',
  },
  getCorporationContracts: {
    route: '/corporations/{corporation_id}/contracts',
    scope: 'esi-contracts.read_corporation_contracts.v1',
    group: 'corp',
  },
  getCorporationContractItems: {
    route: '/corporations/{corporation_id}/contracts/{contract_id}/items',
    scope: 'esi-contracts.read_corporation_contracts.v1',
    group: 'corp',
  },
  getCorporationCustomsOffices: {
    route: '/corporations/{corporation_id}/customs_offices',
    scope: 'esi-planets.read_customs_offices.v1',
    group: 'corp',
  },
  getCorporationRoleHistory: {
    route: '/corporations/{corporation_id}/roles/history',
    scope: 'esi-corporations.read_corporation_membership.v1',
    group: 'corp',
  },
  getCorporationTitles: {
    route: '/corporations/{corporation_id}/titles',
    scope: 'esi-corporations.read_titles.v1',
    group: 'corp',
  },
  getCorporationMemberTitles: {
    route: '/corporations/{corporation_id}/members/titles',
    scope: 'esi-corporations.read_titles.v1',
    group: 'corp',
  },
  getCorporationSkyhooks: {
    route: '/corporations/{corporation_id}/structures/skyhooks',
    scope: 'esi-structures.read_corporation.v1',
    group: 'corp',
  },
  getCorporationSkyhook: {
    route: '/corporations/{corporation_id}/structures/skyhooks/{skyhook_id}',
    scope: 'esi-structures.read_corporation.v1',
    group: 'corp',
  },
  getCorporationSovereigntyHubs: {
    route: '/corporations/{corporation_id}/structures/sovereignty-hubs',
    scope: 'esi-structures.read_corporation.v1',
    group: 'corp',
  },
  getCorporationSovereigntyHub: {
    route: '/corporations/{corporation_id}/structures/sovereignty-hubs/{sovereignty_hub_id}',
    scope: 'esi-structures.read_corporation.v1',
    group: 'corp',
  },
  getCorporationProjects: {
    route: '/corporations/{corporation_id}/projects',
    scope: 'esi-corporations.read_projects.v1',
    group: 'corpProjects',
  },
  getCorporationProject: {
    route: '/corporations/{corporation_id}/projects/{project_id}',
    scope: 'esi-corporations.read_projects.v1',
    group: 'corpProjects',
  },
  getCorporationProjectContribution: {
    route: '/corporations/{corporation_id}/projects/{project_id}/contribution/{character_id}',
    scope: 'esi-corporations.read_projects.v1',
    group: 'corpProjects',
  },
  getSovereigntySystems: {
    route: '/sovereignty/systems',
    scope: PUBLIC,
  },
  getMilitaryCampaigns: {
    route: '/military-campaigns',
    scope: PUBLIC,
  },
  getMilitaryCampaignObjectives: {
    route: '/military-campaigns/{campaign_id}/objectives',
    scope: PUBLIC,
  },
  getCharacterMilitaryCampaignObjectives: {
    route: '/characters/{character_id}/military-campaigns/objectives',
    scope: 'esi.activity.char:read',
    group: 'militaryCampaigns',
  },
} as const satisfies Record<EndpointName, EsiEndpointSpec>;

export type EsiEndpointId = keyof typeof ESI_REGISTRY;

export type Scope = Exclude<(typeof ESI_REGISTRY)[EsiEndpointId]['scope'], PublicAccess>;

export function isScopeRequired(requirement: ScopeRequirement): requirement is Scope {
  return requirement !== PUBLIC;
}

export const SEND_MAIL_ENDPOINTS = [
  'postCharacterMail',
] as const satisfies readonly EsiEndpointId[];

export function permissionsForEndpoints(ids: readonly EsiEndpointId[]): readonly ScopeGroup[] {
  return [
    ...new Set(
      ids
        .map((id) => (ESI_REGISTRY[id] as EsiEndpointSpec).group)
        .filter((group): group is ScopeGroup => group !== undefined)
    ),
  ];
}

export function requiredScopesForEndpoints(ids: readonly EsiEndpointId[]): readonly Scope[] {
  return [...new Set(ids.map((id) => (ESI_REGISTRY[id] as EsiEndpointSpec).scope))].filter(
    isScopeRequired
  );
}

export const WRITE_GROUPS: readonly ScopeGroup[] = SCOPE_GROUPS.filter(
  (group) => PERMISSIONS[group].section === 'write'
);
