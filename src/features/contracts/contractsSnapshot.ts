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
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contractsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contractsTruncated: boolean;
  issuerNames: Map<number, string>;
  /** Entity kind of each receiver, so a corp that took a public contract links as a corp. */
  receiverCategories: Map<number, NameCategory>;
  /**
   * This character's own contact list, indexed once per snapshot. Empty
   * (never missing) when the contacts scope isn't granted — a stranger's tag
   * is simply absent, not an error the page needs to surface.
   */
  standingIndex: ContactStandingIndex;
  /** Each issuer's corp/alliance/faction, so an issuer with no personal contact entry can still match one the pilot holds on their corp. */
  issuerAffiliations: Map<number, CharacterAffiliation>;
}

/** One Character's contracts and the lookups that depend on who is viewing them. */
export interface ContractGroup {
  ownerId: number;
  contracts: readonly Contract[];
  /** Read this owner's contact list for standings. A Character without the scope must pass false. */
  withStandings: boolean;
}

export interface ContractLookups {
  issuerNames: Map<number, string>;
  receiverCategories: Map<number, NameCategory>;
  /** Each owner's own contact list, indexed. Empty (never missing) when not read. */
  standingIndexByOwner: Map<number, ContactStandingIndex>;
  issuerAffiliations: Map<number, CharacterAffiliation>;
}

/**
 * Names, receiver kinds, standings and affiliations for contracts grouped by the
 * Character each was read for: a receiver is "the other party" relative to its
 * own owner, and a standing is that owner's own contact entry.
 */
export async function resolveContractLookups(
  groups: readonly ContractGroup[],
  signal: RouteSnapshotSignal
): Promise<ContractLookups> {
  // Already superseded: skip the name/standing lookups, their results would be discarded.
  const live = signal.cancelled ? groups.map((g) => ({ ...g, contracts: [] })) : groups;
  const issuers = live.flatMap((g) => g.contracts.map(contractIssuer));
  // Receivers share the name map; their kind comes from the resolved category.
  const receiverIds = live.flatMap((g) =>
    g.contracts.flatMap((c) => contractReceiver(c, g.ownerId)?.id ?? [])
  );
  // Contacts and the names don't depend on the categories, so they run alongside.
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
  // Only characters have affiliations/standings.
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
