import {
  CORP_CAPABILITIES,
  hasAnyCorpCapability,
  NO_CORP_CAPABILITIES,
  type CorpCapabilities,
  type CorpCapability,
} from '@/engine/corpRoles';
import type { Scope } from '@/esi/registry';

export const CORP_SCOPES_FOR_CAPABILITY: Readonly<Record<CorpCapability, readonly Scope[]>> = {
  canReadWallet: ['esi-wallet.read_corporation_wallets.v1', 'esi-corporations.read_divisions.v1'],
  canReadStructures: ['esi-corporations.read_structures.v1'],
  canReadMoonExtractions: ['esi-industry.read_corporation_mining.v1'],
  canReadMiningLedger: ['esi-industry.read_corporation_mining.v1'],
  canReadMembers: [
    'esi-corporations.track_members.v1',
    'esi-corporations.read_corporation_membership.v1',
  ],
  canReadIndustry: ['esi-industry.read_corporation_jobs.v1'],
  canReadAssets: ['esi-assets.read_corporation_assets.v1', 'esi-corporations.read_divisions.v1'],
  canReadBlueprints: ['esi-corporations.read_blueprints.v1'],
  canReadStarbases: ['esi-corporations.read_starbases.v1'],
  canReadCustomsOffices: ['esi-planets.read_customs_offices.v1'],
  canReadRoleAudit: [
    'esi-corporations.read_corporation_membership.v1',
    'esi-corporations.read_titles.v1',
  ],
  canReadContracts: ['esi-contracts.read_corporation_contracts.v1'],
  canReadOrders: ['esi-markets.read_corporation_orders.v1'],
  canReadDivisions: ['esi-corporations.read_divisions.v1'],
  canReadSkyhooks: ['esi-structures.read_corporation.v1'],
  canManageSrp: ['esi-characters.read_corporation_roles.v1'],
  canConfigureSrp: ['esi-characters.read_corporation_roles.v1'],
  canVet: ['esi-characters.read_corporation_roles.v1'],
  canConfigureVetting: ['esi-characters.read_corporation_roles.v1'],
  canViewTaxBook: ['esi-characters.read_corporation_roles.v1'],
};

const ADDITIVE_CORP_CAPABILITIES: ReadonlySet<CorpCapability> = new Set([
  'canReadMiningLedger',
  'canReadStarbases',
  'canReadCustomsOffices',
  'canReadRoleAudit',
  'canReadContracts',
  'canReadOrders',
  'canReadDivisions',
  'canReadSkyhooks',
  'canManageSrp',
  'canConfigureSrp',
  'canVet',
  'canConfigureVetting',
  'canViewTaxBook',
]);

function requiredCorpScopes(capabilities: CorpCapabilities): readonly Scope[] {
  const required = new Set<Scope>();
  for (const capability of CORP_CAPABILITIES) {
    if (!capabilities[capability]) continue;
    for (const scope of CORP_SCOPES_FOR_CAPABILITY[capability]) required.add(scope);
  }
  return [...required];
}

export function missingCorpScopes(
  capabilities: CorpCapabilities,
  granted: readonly string[]
): readonly Scope[] {
  const held = new Set(granted);
  return requiredCorpScopes(capabilities).filter((scope) => !held.has(scope));
}

export interface CorpGrantCoverage {
  missingScopes: readonly Scope[];
  blocking: boolean;
  capabilities: CorpCapabilities;
}

export function corpGrantCoverage(
  capabilities: CorpCapabilities,
  granted: readonly string[]
): CorpGrantCoverage {
  const held = new Set(granted);
  const covered = { ...NO_CORP_CAPABILITIES };
  let blocking = false;
  for (const capability of CORP_CAPABILITIES) {
    if (!capabilities[capability]) continue;
    const complete = CORP_SCOPES_FOR_CAPABILITY[capability].every((scope) => held.has(scope));
    const additive = ADDITIVE_CORP_CAPABILITIES.has(capability);
    if (!complete && !additive) blocking = true;
    covered[capability] = complete || !additive;
  }
  if (hasAnyCorpCapability(capabilities) && !hasAnyCorpCapability(covered)) blocking = true;
  return {
    missingScopes: missingCorpScopes(capabilities, granted),
    blocking,
    capabilities: covered,
  };
}
