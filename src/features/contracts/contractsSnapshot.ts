import { loadContracts } from '@/features/character/contracts';
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

export async function loadContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<ContractsSnapshot> {
  const { cached: contractsResult, needsReauth: contractsNeedsReauth } =
    await loadContracts(characterId);
  const contractsTruncated = contractsResult?.truncated ?? false;
  // Already superseded: skip the name/standing lookups, their results would be discarded.
  const contracts = signal.cancelled ? [] : (contractsResult?.data ?? []);
  const issuers = contracts.map(contractIssuer);
  // Receivers share the name map; their kind comes from the resolved category.
  const receiverIds = contracts.flatMap((c) => contractReceiver(c, characterId)?.id ?? []);
  // Contacts and the names don't depend on the categories, so they run alongside.
  const contactsPromise = signal.cancelled ? Promise.resolve(null) : loadContacts(characterId);
  const namesPromise = resolveNames([...issuers.map((i) => i.id), ...receiverIds]);
  const receiverCategories = await resolveCategories(receiverIds);
  const receivers = contracts.flatMap(
    (c) => contractReceiver(c, characterId, receiverCategories) ?? []
  );
  // Only characters have affiliations/standings.
  const [issuerNames, contactsStatus, issuerAffiliations] = await Promise.all([
    namesPromise,
    contactsPromise,
    resolveAffiliations([
      ...issuers.filter((i) => i.kind === 'character').map((i) => i.id),
      ...receivers.filter((r) => r.kind === 'character').map((r) => r.id),
    ]),
  ]);
  const standingIndex = buildContactStandingIndex(contactsStatus?.cached?.data ?? []);
  return {
    contractsResult,
    contractsNeedsReauth,
    contractsTruncated,
    issuerNames,
    receiverCategories,
    standingIndex,
    issuerAffiliations,
  };
}
