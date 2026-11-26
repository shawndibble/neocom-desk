import type { CachedResult } from '@/esi/cache';
import type { CharacterAffiliation, Contract } from '@/esi/endpoints';
import type { ContactStandingIndex } from '@/features/character/contactStandings';
import type { NameCategory } from '@/features/character/names';
import { NO_AFFILIATIONS, NO_NAMES } from '@/lib/emptyCollections';
import type { AllContractsSnapshot } from './allContractsSnapshot';
import type { ContractsSnapshot } from './contractsSnapshot';
import type { CorpContractsSnapshot } from './corpContractsSnapshot';

export type ContractsHistorySource = 'current' | 'all' | 'corporation';

const NO_STANDING_INDEX: ContactStandingIndex = new Map();
const NO_CATEGORIES: ReadonlyMap<number, NameCategory> = new Map();

export interface ContractsHistoryView {
  source: ContractsHistorySource;
  contractsResult: CachedResult<Contract[]> | null;
  needsReauth: boolean;
  truncated: boolean;
  corporationId: number | null;
  skipped: readonly { characterId: number; name: string }[];
  issuerNames: ReadonlyMap<number, string>;
  receiverCategories: ReadonlyMap<number, NameCategory>;
  issuerAffiliations: ReadonlyMap<number, CharacterAffiliation>;
  ownerOf: (contract: Contract) => number | null;
  standingIndexFor: (ownerId: number) => ContactStandingIndex;
  characterNameOf: ((contract: Contract) => string) | null;
}

export function currentContractsView(
  snapshot: ContractsSnapshot | null,
  characterId: number | null
): ContractsHistoryView {
  return {
    source: 'current',
    contractsResult: snapshot?.contractsResult ?? null,
    needsReauth: snapshot?.contractsNeedsReauth ?? false,
    truncated: snapshot?.contractsTruncated ?? false,
    corporationId: null,
    skipped: [],
    issuerNames: snapshot?.issuerNames ?? NO_NAMES,
    receiverCategories: snapshot?.receiverCategories ?? NO_CATEGORIES,
    issuerAffiliations: snapshot?.issuerAffiliations ?? NO_AFFILIATIONS,
    ownerOf: () => characterId,
    standingIndexFor: () => snapshot?.standingIndex ?? NO_STANDING_INDEX,
    characterNameOf: null,
  };
}

export function allContractsView(snapshot: AllContractsSnapshot | null): ContractsHistoryView {
  return {
    source: 'all',
    contractsResult: snapshot?.contractsResult ?? null,
    needsReauth: snapshot?.needsReauth ?? false,
    truncated: snapshot?.truncated ?? false,
    corporationId: null,
    skipped: snapshot?.skipped ?? [],
    issuerNames: snapshot?.issuerNames ?? NO_NAMES,
    receiverCategories: snapshot?.receiverCategories ?? NO_CATEGORIES,
    issuerAffiliations: snapshot?.issuerAffiliations ?? NO_AFFILIATIONS,
    ownerOf: (contract) => snapshot?.ownerByContractId.get(contract.contract_id) ?? null,
    standingIndexFor: (ownerId) => snapshot?.standingIndexByOwner.get(ownerId) ?? NO_STANDING_INDEX,
    characterNameOf: (contract) => {
      const owner = snapshot?.ownerByContractId.get(contract.contract_id);
      return (owner !== undefined && snapshot?.characterNames.get(owner)) || '';
    },
  };
}

export function corpContractsView(snapshot: CorpContractsSnapshot | null): ContractsHistoryView {
  const corporationId = snapshot?.corporationId ?? null;
  return {
    source: 'corporation',
    contractsResult: snapshot?.contractsResult ?? null,
    needsReauth: snapshot?.needsReauth ?? false,
    truncated: snapshot?.truncated ?? false,
    corporationId,
    skipped: [],
    issuerNames: snapshot?.names ?? NO_NAMES,
    receiverCategories: snapshot?.receiverCategories ?? NO_CATEGORIES,
    issuerAffiliations: NO_AFFILIATIONS,
    ownerOf: () => corporationId,
    standingIndexFor: () => NO_STANDING_INDEX,
    characterNameOf: null,
  };
}
