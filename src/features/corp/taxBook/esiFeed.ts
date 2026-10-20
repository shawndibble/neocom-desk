/**
 * The ESI reads an officer's visit feeds into the Corp Tax Book (D9). Each goes
 * through the existing corp loaders, so the cache, the corp-scoped keys and the
 * 403-is-a-role-gate rule apply unchanged; this module only adds the observer
 * ledger and the moon notifications, and shapes everything for the sync.
 */
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
import { loadStructureSystemId } from '@/features/character/structures';
import { loadCharacterNotifications } from '@/features/character/notifications';
import { loadCorporationMiningExtractions } from '../boardData';
import { loadCorpPaginatedWithCacheStatus } from '../corpRead';
import { isCorpRoleGate } from '../corpAuthFailure';
import { loadCorporationWalletJournal } from '../wallet';

export interface ObserverFeed {
  rows: ObservedRow[];
  /** Every refinery that keeps a ledger, whether or not it had rows. */
  structureIds: number[];
  /** The oldest day ESI returned per refinery — proof of how far back it reaches. */
  oldestEsiDate: Record<number, string | undefined>;
  /** A page was missing, so the rows may not be the whole ledger. */
  truncated: boolean;
  /** The solar system of each refinery whose structure this Character could resolve (#4181). */
  systemIds: Record<number, number>;
}

/**
 * Why a feed could not be read: sign in again, ESI did not answer, or the
 * corporation has no refinery this Character can read (an empty list, or the
 * role gate's 403 on it) — an answer, not an outage.
 */
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
  // One refinery at a time: each is its own paginated read in the corp-industry rate group.
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
    // A refinery that did not answer is a missing read, not an empty ledger: abandon the visit.
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

/** The corporation's current moon extractions (Station_Manager). Null when ESI did not answer. */
export async function loadEsiExtractions(characterId: number, corporationId: number) {
  const result = await loadCorporationMiningExtractions(characterId, corporationId);
  return result.cached?.data ?? null;
}

/** Donations into the given wallet divisions. A division that does not answer is skipped, not fatal. */
export async function loadDonations(
  characterId: number,
  corporationId: number,
  divisions: readonly number[]
): Promise<JournalDonation[]> {
  const found: JournalDonation[] = [];
  for (const division of divisions) {
    const journal = await loadCorporationWalletJournal(characterId, corporationId, division);
    if (journal.cached) {
      found.push(...donationsFromJournal(journal.cached.data, division, corporationId));
    }
  }
  return found;
}

const MOON_TYPES: ReadonlySet<string> = new Set(MOON_NOTIFICATION_TYPES);

/** This Character's moon drill notifications. Empty when the notifications scope is not granted. */
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
