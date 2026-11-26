import {
  ESI_REGISTRY,
  isScopeRequired,
  permissionsForEndpoints,
  requiredScopesForEndpoints,
  type EsiEndpointId,
  type Scope,
  type ScopeGroup,
  type ScopeRequirement,
} from '@/esi/registry';

export const UNGATED = 'ungated';
export type Ungated = typeof UNGATED;

export interface GatedRoute {
  readonly endpoints: readonly EsiEndpointId[];
}

export type RouteRequirement = Ungated | GatedRoute;

const LP_STORE_REQUIREMENT: GatedRoute = {
  endpoints: ['getCharacterLoyaltyPoints'],
};

export const ROUTE_REQUIREMENTS = {
  '/characters': UNGATED,
  '/market': UNGATED,
  '/skills/plans': UNGATED,
  '/skills/plans/:planId': UNGATED,
  '/skills/compare': UNGATED,
  '/skills/certificates': UNGATED,
  '/skills': UNGATED,
  '/settings': UNGATED,
  '/settings/shortcuts': UNGATED,
  '/settings/faq': UNGATED,
  '/settings/help': UNGATED,
  '/help': UNGATED,
  '/alerts': UNGATED,

  '/overview': UNGATED,
  '/skills/trained': UNGATED,
  '/industry': UNGATED,
  '/ships': UNGATED,
  '/ships/fittings/compare': UNGATED,
  '/industry/plans/:planId': UNGATED,
  '/industry/groups/:groupId': UNGATED,
  '/wallet': UNGATED,
  '/employment-history': UNGATED,
  '/srp': UNGATED,

  '/corp': UNGATED,
  '/corp/members': UNGATED,
  '/corp/structures': UNGATED,
  '/corp/wallet': UNGATED,
  '/corp/assets': UNGATED,
  '/corp/moons': UNGATED,
  '/corp/srp': UNGATED,
  '/corp/vetting': UNGATED,
  '/vetting': UNGATED,
  '/corp/assets/*': UNGATED,

  '/assets': {
    endpoints: [
      'getCharacterAssets',
      'getUniverseStation',
      'getUniverseSystem',
      'postUniverseNames',
      'getUniverseType',
      'getUniverseGroup',
    ],
  },
  '/mail': {
    endpoints: ['getCharacterMailHeaders', 'getCharacterMail', 'postUniverseNames'],
  },
  '/calendar': UNGATED,
  '/communities': UNGATED,
  '/travel': UNGATED,
  '/pilot-lookup': UNGATED,
  '/contracts': UNGATED,
  '/bpc-contracts': UNGATED,
  '/clones': {
    endpoints: ['getCharacterClones'],
  },
  '/planetary-industry': UNGATED,
  '/wallet/lp-store': LP_STORE_REQUIREMENT,
  '/wallet/lp-store/:corporationId': LP_STORE_REQUIREMENT,
  '/wallet/loyalty': UNGATED,
  '/planetary-industry/advisor': UNGATED,
  '/wallet/loyalty/:corporationId': UNGATED,
  '/contacts': {
    endpoints: ['getCharacterContacts', 'getCharacterContactLabels', 'postUniverseNames'],
  },
  '/mining': {
    endpoints: ['getCharacterMining', 'getUniverseSystem', 'postUniverseNames'],
  },
} as const satisfies Record<string, RouteRequirement>;

export type AppRoutePath = keyof typeof ROUTE_REQUIREMENTS;

export type GatedRoutePath = {
  [K in AppRoutePath]: (typeof ROUTE_REQUIREMENTS)[K] extends Ungated ? never : K;
}[AppRoutePath];

export function isGatedRoute(path: AppRoutePath): path is GatedRoutePath {
  return ROUTE_REQUIREMENTS[path] !== UNGATED;
}

export function requiredScopesForRoute(path: AppRoutePath): readonly Scope[] {
  const requirement = ROUTE_REQUIREMENTS[path];
  if (requirement === UNGATED) return [];
  const declared: ScopeRequirement[] = requirement.endpoints.map(
    (endpoint) => ESI_REGISTRY[endpoint].scope
  );
  return [...new Set(declared)].filter(isScopeRequired);
}

export const TAB_ENDPOINTS: Readonly<Record<string, readonly EsiEndpointId[]>> = {
  '/market/orders': ['getCharacterOrders'],
  '/market/history': ['getCharacterWalletTransactions'],
  '/wallet/journal': ['getCharacterWalletJournal'],
  '/contracts/history': ['getCharacterContracts'],
  '/contacts/standings': ['getCharacterStandings'],
};

export function requiredScopesForNavPath(path: string): readonly Scope[] {
  const endpoints = TAB_ENDPOINTS[path];
  return endpoints
    ? requiredScopesForEndpoints(endpoints)
    : requiredScopesForRoute(path as AppRoutePath);
}

export function missingScopesForRoute(
  path: AppRoutePath,
  granted: readonly string[]
): readonly Scope[] {
  const held = new Set(granted);
  return requiredScopesForRoute(path).filter((scope) => !held.has(scope));
}

export function permissionsForRoute(path: AppRoutePath): readonly ScopeGroup[] {
  const requirement = ROUTE_REQUIREMENTS[path];
  if (requirement === UNGATED) return [];
  return permissionsForEndpoints(requirement.endpoints);
}
