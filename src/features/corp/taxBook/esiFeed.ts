import { conditionalPagedFetch } from '@/esi/cache';
import {
  getCorporationMiningObserver,
  getCorporationMiningObservers,
  type CorporationMiningObserver,
  type CorporationMiningObserverEntry,
} from '@/esi/endpoints';
import { parseEveNotificationPayload } from '@/engine/eveNotificationPayload';
import {
  donationsFromJournal,
  observedRowsFromLedger,
  MOON_NOTIFICATION_TYPES,
  type JournalDonation,
  type MoonNotification,
} from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { outgoingDonationsFromJournal, type OutgoingDonation } from '@/engine/corpTaxBook/payouts';
import { loadStructureSystemId } from '@/features/character/structures';
import { loadCharacterNotifications } from '@/features/character/notifications';
import { loadCorporationMiningExtractions } from '../boardData';
import { loadCorpPaginatedWithCacheStatus } from '../corpRead';
import { isCorpRoleGate } from '../corpAuthFailure';
import { loadCorporationWalletJournal } from '../wallet';

export interface ObserverFeed {
  rows: ObservedRow[];
  structureIds: number[];
  oldestEsiDate: Record<number, string | undefined>;
  truncated: boolean;
  systemIds: Record<number, number>;
}

export type FeedFailure = 'needs-reauth' | 'unavailable' | 'no-refineries';

export async function loadObserverFeed(
  characterId: number,
  corporationId: number
): Promise<ObserverFeed | FeedFailure> {
  const listing = conditionalPagedFetch((o) =>
    getCorporationMiningObservers(characterId, corporationId, o)
  );
  let refused = false;
  const list = await loadCorpPaginatedWithCacheStatus(
    characterId,
    corporationId,
    'miningObservers',
    () =>
      listing.fetchLive().catch((err: unknown) => {
        refused ||= isCorpRoleGate(err);
        throw err;
      }),
    { conditional: listing.conditional }
  );
  if (list.needsReauth) return 'needs-reauth';
  if (!list.cached) return refused ? 'no-refineries' : 'unavailable';
  const observers: CorporationMiningObserver[] = list.cached.data;
  if (observers.length === 0) return 'no-refineries';
  const feed: ObserverFeed = {
    rows: [],
    structureIds: observers.map((o) => o.observer_id),
    oldestEsiDate: {},
    truncated: list.cached.truncated,
    systemIds: {},
  };
  for (const observer of observers) {
    const { fetchLive, conditional } = conditionalPagedFetch((o) =>
      getCorporationMiningObserver(characterId, corporationId, observer.observer_id, o)
    );
    const ledger = await loadCorpPaginatedWithCacheStatus<CorporationMiningObserverEntry>(
      characterId,
      corporationId,
      `miningObserver:${observer.observer_id}`,
      fetchLive,
      { conditional }
    );
    if (ledger.needsReauth) return 'needs-reauth';
    if (!ledger.cached) return 'unavailable';
    const rows = observedRowsFromLedger(
      observer.observer_id,
      ledger.cached.data,
      ledger.cached.fetchedAt.toISOString(),
      corporationId
    );
    const systemId = await loadStructureSystemId(characterId, observer.observer_id).catch(
      () => null
    );
    if (systemId !== null) feed.systemIds[observer.observer_id] = systemId;
    feed.rows.push(...rows);
    feed.truncated ||= ledger.cached.truncated;
    feed.oldestEsiDate[observer.observer_id] = rows.map((r) => r.date).sort()[0];
  }
  return feed;
}

export async function loadEsiExtractions(characterId: number, corporationId: number) {
  const result = await loadCorporationMiningExtractions(characterId, corporationId);
  return result.cached?.data ?? null;
}

export async function loadDonations(
  characterId: number,
  corporationId: number,
  divisions: readonly number[],
  options: { whole?: boolean } = {}
): Promise<JournalDonation[] | null> {
  const found: JournalDonation[] = [];
  for (const division of divisions) {
    const journal = await loadCorporationWalletJournal(characterId, corporationId, division);
    if (journal.cached) {
      found.push(...donationsFromJournal(journal.cached.data, division, corporationId));
    } else if (options.whole) return null;
  }
  return found;
}

export async function loadOutgoingDonations(
  characterId: number,
  corporationId: number,
  divisions: readonly number[]
): Promise<OutgoingDonation[]> {
  const found: OutgoingDonation[] = [];
  for (const division of divisions) {
    const journal = await loadCorporationWalletJournal(characterId, corporationId, division);
    if (journal.cached) {
      found.push(...outgoingDonationsFromJournal(journal.cached.data, division, corporationId));
    }
  }
  return found;
}

const MOON_TYPES: ReadonlySet<string> = new Set(MOON_NOTIFICATION_TYPES);

export async function loadMoonNotifications(characterId: number): Promise<MoonNotification[]> {
  const result = await loadCharacterNotifications(characterId);
  return (result.cached?.data ?? [])
    .filter((n) => MOON_TYPES.has(n.type) && typeof n.text === 'string')
    .map((n) => ({
      type: n.type,
      timestamp: n.timestamp,
      payload: parseEveNotificationPayload(n.text!),
    }));
}
