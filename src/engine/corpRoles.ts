export interface CorpCapabilities {
  canReadWallet: boolean;
  canReadStructures: boolean;
  canReadMoonExtractions: boolean;
  canReadMiningLedger: boolean;
  canReadMembers: boolean;
  canReadIndustry: boolean;
  canReadAssets: boolean;
  canReadBlueprints: boolean;
  canReadStarbases: boolean;
  canReadCustomsOffices: boolean;
  canReadRoleAudit: boolean;
  canReadContracts: boolean;
  canReadOrders: boolean;
  canReadDivisions: boolean;
  canReadSkyhooks: boolean;
  canManageSrp: boolean;
  canConfigureSrp: boolean;
  canVet: boolean;
  canConfigureVetting: boolean;
  canViewTaxBook: boolean;
}

export type CorpCapability = keyof CorpCapabilities;

export const CORP_CAPABILITIES: readonly CorpCapability[] = [
  'canReadWallet',
  'canReadStructures',
  'canReadMoonExtractions',
  'canReadMiningLedger',
  'canReadMembers',
  'canReadIndustry',
  'canReadAssets',
  'canReadBlueprints',
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
];

export const NO_CORP_CAPABILITIES: CorpCapabilities = {
  canReadWallet: false,
  canReadStructures: false,
  canReadMoonExtractions: false,
  canReadMiningLedger: false,
  canReadMembers: false,
  canReadIndustry: false,
  canReadAssets: false,
  canReadBlueprints: false,
  canReadStarbases: false,
  canReadCustomsOffices: false,
  canReadRoleAudit: false,
  canReadContracts: false,
  canReadOrders: false,
  canReadDivisions: false,
  canReadSkyhooks: false,
  canManageSrp: false,
  canConfigureSrp: false,
  canVet: false,
  canConfigureVetting: false,
  canViewTaxBook: false,
};

const ROLES_FOR_CAPABILITY: Readonly<Record<CorpCapability, readonly string[]>> = {
  canReadWallet: ['Accountant', 'Junior_Accountant'],
  canReadStructures: ['Station_Manager'],
  canReadMoonExtractions: ['Station_Manager'],
  canReadMiningLedger: ['Accountant'],
  canReadMembers: [],
  canReadIndustry: ['Factory_Manager'],
  canReadAssets: [],
  canReadBlueprints: [],
  canReadStarbases: [],
  canReadCustomsOffices: [],
  canReadRoleAudit: [],
  canReadContracts: [],
  canReadOrders: ['Accountant', 'Trader'],
  canReadDivisions: [],
  canReadSkyhooks: ['Station_Manager'],
  canManageSrp: ['Accountant'],
  canConfigureSrp: [],
  canVet: ['Personnel_Manager'],
  canConfigureVetting: [],
  canViewTaxBook: ['Accountant', 'Junior_Accountant'],
};

const OPEN_TO_MEMBERS: ReadonlySet<CorpCapability> = new Set(['canReadContracts']);

const DIRECTOR = 'Director';

export function corpCapabilities(roles: readonly string[]): CorpCapabilities {
  const held = new Set(roles);
  const isDirector = held.has(DIRECTOR);

  const capabilities = { ...NO_CORP_CAPABILITIES };
  for (const capability of CORP_CAPABILITIES) {
    capabilities[capability] =
      isDirector ||
      OPEN_TO_MEMBERS.has(capability) ||
      ROLES_FOR_CAPABILITY[capability].some((role) => held.has(role));
  }
  return capabilities;
}

export function canViewCorpTaxBook(roles: readonly string[]): boolean {
  return roles.some((r) => r === DIRECTOR || r === 'Accountant' || r === 'Junior_Accountant');
}

export function hasAnyCorpCapability(capabilities: CorpCapabilities): boolean {
  return CORP_CAPABILITIES.some(
    (capability) => capabilities[capability] && !OPEN_TO_MEMBERS.has(capability)
  );
}
