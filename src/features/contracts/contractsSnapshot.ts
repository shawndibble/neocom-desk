import { loadContractsWithArchive } from '@/features/character/contracts';
import { contractIssuer, contractReceiver } from '@/features/character/contractCounterparty';
import { loadContacts } from '@/features/character/contacts';
import {
  buildContactStandingIndex,
  type ContactStandingIndex,
} from '@/features/character/contactStandings';
import { resolveAffiliations } from '@/features/character/affiliations';
import { resolveCategories, resolveNames, type NameCategory } from '@/features/character/names';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { CachedResult } from '@/esi/cache';
import type { CharacterAffiliation, Contract } from '@/esi/endpoints';

export interface ContractsSnapshot {
  contractsResult: CachedResult<Contract[]> | null;
  contractsNeedsReauth: boolean;
  contractsTruncated: boolean;
  issuerNames: Map<number, string>;
  receiverCategories: Map<number, NameCategory>;
  standingIndex: ContactStandingIndex;
  issuerAffiliations: Map<number, CharacterAffiliation>;
}

export interface ContractGroup {
  ownerId: number;
  contracts: readonly Contract[];
  withStandings: boolean;
}

export interface ContractLookups {
  issuerNames: Map<number, string>;
  receiverCategories: Map<number, NameCategory>;
  standingIndexByOwner: Map<number, ContactStandingIndex>;
  issuerAffiliations: Map<number, CharacterAffiliation>;
}

export async function resolveContractLookups(
  groups: readonly ContractGroup[],
  signal: RouteSnapshotSignal
): Promise<ContractLookups> {
  const live = signal.cancelled ? groups.map((g) => ({ ...g, contracts: [] })) : groups;
  const issuers = live.flatMap((g) => g.contracts.map(contractIssuer));
  const receiverIds = live.flatMap((g) =>
    g.contracts.flatMap((c) => contractReceiver(c, g.ownerId)?.id ?? [])
  );
  const contactsPromise = Promise.all(
    live.map(async (g) =>
      signal.cancelled || !g.withStandings ? null : await loadContacts(g.ownerId)
    )
  );
  const namesPromise = resolveNames([...issuers.map((i) => i.id), ...receiverIds]);
  const receiverCategories = await resolveCategories(receiverIds);
  const receivers = live.flatMap((g) =>
    g.contracts.flatMap((c) => contractReceiver(c, g.ownerId, receiverCategories) ?? [])
  );
  const [issuerNames, contactsStatuses, issuerAffiliations] = await Promise.all([
    namesPromise,
    contactsPromise,
    resolveAffiliations([
      ...issuers.filter((i) => i.kind === 'character').map((i) => i.id),
      ...receivers.filter((r) => r.kind === 'character').map((r) => r.id),
    ]),
  ]);
  const standingIndexByOwner = new Map<number, ContactStandingIndex>();
  live.forEach((g, i) =>
    standingIndexByOwner.set(
      g.ownerId,
      buildContactStandingIndex(contactsStatuses[i]?.cached?.data ?? [])
    )
  );
  return { issuerNames, receiverCategories, standingIndexByOwner, issuerAffiliations };
}

export async function loadContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<ContractsSnapshot> {
  const { cached: contractsResult, needsReauth: contractsNeedsReauth } =
    await loadContractsWithArchive(characterId);
  const contractsTruncated = contractsResult?.truncated ?? false;
  const { issuerNames, receiverCategories, standingIndexByOwner, issuerAffiliations } =
    await resolveContractLookups(
      [{ ownerId: characterId, contracts: contractsResult?.data ?? [], withStandings: true }],
      signal
    );
  return {
    contractsResult,
    contractsNeedsReauth,
    contractsTruncated,
    issuerNames,
    receiverCategories,
    standingIndex: standingIndexByOwner.get(characterId) ?? new Map(),
    issuerAffiliations,
  };
}
