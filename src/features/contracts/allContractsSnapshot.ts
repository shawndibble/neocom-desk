import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import type { CachedResult } from '@/esi/cache';
import type { Contract } from '@/esi/endpoints';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';
import { loadContractsWithArchive } from '@/features/character/contracts';
import type { ContactStandingIndex } from '@/features/character/contactStandings';
import type { NameCategory } from '@/features/character/names';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { CharacterAffiliation } from '@/esi/endpoints';
import { resolveContractLookups } from './contractsSnapshot';

const CONTRACTS_SCOPE = ESI_REGISTRY.getCharacterContracts.scope;
const CONTACTS_SCOPE = ESI_REGISTRY.getCharacterContacts.scope;

export interface CharacterContracts {
  characterId: number;
  characterName: string;
  contracts: readonly Contract[];
  needsReauth: boolean;
  truncated: boolean;
  fetchedAt: number;
  fromCache: boolean;
}

export interface MergedContracts {
  contracts: Contract[];
  ownerByContractId: Map<number, number>;
}

export function mergeCharacterContracts(entries: readonly CharacterContracts[]): MergedContracts {
  const ownerByContractId = new Map<number, number>();
  const byId = new Map<number, Contract>();
  const ours = new Set(entries.map((e) => e.characterId));
  for (const entry of entries) {
    for (const contract of entry.contracts) {
      if (!byId.has(contract.contract_id)) {
        byId.set(contract.contract_id, contract);
        ownerByContractId.set(
          contract.contract_id,
          ours.has(contract.issuer_id) ? contract.issuer_id : entry.characterId
        );
      }
    }
  }
  return { contracts: [...byId.values()], ownerByContractId };
}

export interface AllContractsSnapshot {
  contractsResult: CachedResult<Contract[]> | null;
  entries: CharacterContracts[];
  skipped: { characterId: number; name: string }[];
  needsReauth: boolean;
  truncated: boolean;
  ownerByContractId: Map<number, number>;
  characterNames: Map<number, string>;
  issuerNames: Map<number, string>;
  receiverCategories: Map<number, NameCategory>;
  standingIndexByOwner: Map<number, ContactStandingIndex>;
  issuerAffiliations: Map<number, CharacterAffiliation>;
}

export async function loadAllContractsSnapshot(
  _characterId: number,
  signal: RouteSnapshotSignal
): Promise<AllContractsSnapshot> {
  const { entries, skipped } = await fanOutAllCharacters<CharacterContracts>({
    scope: CONTRACTS_SCOPE,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadContractsWithArchive(characterId);
      return {
        characterId,
        characterName: name,
        contracts: cached?.data ?? [],
        needsReauth,
        truncated: cached?.truncated ?? false,
        fetchedAt: cached?.fetchedAt.getTime() ?? 0,
        fromCache: cached?.fromCache ?? false,
      };
    },
  });
  const { contracts, ownerByContractId } = mergeCharacterContracts(entries);
  const answered = entries.filter((e) => e.fetchedAt > 0);
  const contractsResult: CachedResult<Contract[]> | null =
    answered.length === 0
      ? null
      : {
          data: contracts,
          fetchedAt: new Date(Math.min(...answered.map((e) => e.fetchedAt))),
          fromCache: answered.some((e) => e.fromCache),
          truncated: entries.some((e) => e.truncated),
        };

  const tokens = await db.tokens.bulkGet(entries.map((e) => e.characterId));
  const hasContacts = new Set(
    entries
      .filter((_, i) => (tokens[i]?.scopes ?? []).includes(CONTACTS_SCOPE))
      .map((e) => e.characterId)
  );
  const lookups = await resolveContractLookups(
    entries.map((e) => ({
      ownerId: e.characterId,
      contracts: contracts.filter((c) => ownerByContractId.get(c.contract_id) === e.characterId),
      withStandings: hasContacts.has(e.characterId),
    })),
    signal
  );
  return {
    contractsResult,
    entries,
    skipped,
    needsReauth: entries.length > 0 && entries.every((e) => e.needsReauth && e.fetchedAt === 0),
    truncated: contractsResult?.truncated ?? false,
    ownerByContractId,
    characterNames: new Map(entries.map((e) => [e.characterId, e.characterName])),
    ...lookups,
  };
}
