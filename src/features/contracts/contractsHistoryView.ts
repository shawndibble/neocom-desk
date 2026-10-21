import type { CachedResult } from '@/esi/cache';
import type { CharacterAffiliation, Contract } from '@/esi/endpoints';
import type { ContactStandingIndex } from '@/features/character/contactStandings';
import type { NameCategory } from '@/features/character/names';
import { NO_AFFILIATIONS, NO_NAMES } from '@/lib/emptyCollections';
import type { AllContractsSnapshot } from './allContractsSnapshot';
import type { ContractsSnapshot } from './contractsSnapshot';
import type { CorpContractsSnapshot } from './corpContractsSnapshot';

/** What Contracts › History reads from: one Character, every Character, or the corporation. */
export type ContractsHistorySource = 'current' | 'all' | 'corporation';

const NO_STANDING_INDEX: ContactStandingIndex = new Map();
const NO_CATEGORIES: ReadonlyMap<number, NameCategory> = new Map();

/**
 * The one shape the History table renders, whichever source fed it: switching the
 * source changes only what is in here, never how the table looks.
 */
export interface ContractsHistoryView {
  source: ContractsHistorySource;
  contractsResult: CachedResult<Contract[]> | null;
  /** 401/403 (or a failed token refresh): Grant access fixes it. */
  needsReauth: boolean;
  truncated: boolean;
  /** Corporation source only: null when the corporation is unknown or unreadable. */
  corporationId: number | null;
  /** Characters the All source never read for lack of the contracts scope. */
  skipped: readonly { characterId: number; name: string }[];
  issuerNames: ReadonlyMap<number, string>;
  receiverCategories: ReadonlyMap<number, NameCategory>;
  issuerAffiliations: ReadonlyMap<number, CharacterAffiliation>;
  /** The party a row is read relative to: its own Character, or the corporation. */
  ownerOf: (contract: Contract) => number | null;
  /** That owner's own contact list. */
  standingIndexFor: (ownerId: number) => ContactStandingIndex;
  /** The owning Character's name, on the All source only. */
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

/** The corporation is "self" for its rows: a contract it took or was offered is not worth a column cell. */
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
