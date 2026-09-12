/**
 * The standalone poll loop for BPC Sourcing watches (issue #926): runs
 * alongside the Foreground Poller (`ForegroundNotificationPoller.tsx` calls
 * both), on its own cadence and its own state, rather than becoming a
 * registry entry in `pollDomains.ts`. Every one of that registry's domains
 * scopes to one Character's own ESI state; a saved search over the shared
 * Public Contract Offers snapshot has no Character to scope to, which is why
 * this stays a parallel, independent loop instead — see
 * `engine/contracts/bpcWatch.ts`'s module doc.
 *
 * Delivery is feed-only, deliberately: there is no browser-notification path
 * here (unlike `foregroundPoller.ts`'s `notify`), since a watch match has no
 * OAuth scope or Character it could be said to belong to for permission
 * purposes — the Notification Feed is the one channel that needs nothing but
 * the master + feed-channel switches, which this still honours so a pilot who
 * has turned notifications off entirely does not have feed rows pile up.
 */
import { recordFeedEntryAndSync } from '@/features/notifications/feedSync';
import type { NewNotificationFeedEntry } from '@/features/notifications/feed';
import {
  hydrateNotificationPreferences,
  isFeedChannelEnabled,
  useNotificationPreferences,
} from '@/features/notifications/preferences';
import { loadTypeNames } from '@/features/character/typeNames';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { diffBpcWatchMatches, type BpcWatchState } from '@/engine/contracts/bpcWatch';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { BpcSearchWatchRecord } from '@/db';
import { listWatches, saveWatchState, watchToFilter } from './watches';
import { loadPublicBpcContracts } from './syncedContracts';
import { formatIsk } from '@/lib/isk';
import i18n from '@/i18n';

export interface BpcWatchPollDependencies {
  masterEnabled: () => Promise<boolean>;
  feedChannelEnabled: () => Promise<boolean>;
  /** The Character the feed row is filed under — the app's active one, since a watch itself carries no Character. */
  activeCharacterId: () => number | null;
  listWatches: () => Promise<BpcSearchWatchRecord[]>;
  /** The shared snapshot's rows, or `null` when nothing is cached yet (never synced, or offline on a cold start). */
  loadRows: () => Promise<readonly BpcContractRow[] | null>;
  resolveTypeName: (typeId: number) => Promise<string>;
  saveWatchState: (id: string, state: BpcWatchState) => Promise<void>;
  recordFeedEntry: (entry: NewNotificationFeedEntry) => Promise<void>;
  now: () => number;
}

function watchState(watch: BpcSearchWatchRecord): BpcWatchState | undefined {
  // A watch just created (never polled) carries an empty baseline that is
  // indistinguishable, in shape, from "polled once and matched nothing" —
  // both must behave like `diffBpcWatchMatches`'s own `prev === undefined`
  // (fire nothing, just record a baseline), so a brand-new watch never floods
  // with every contract already on the market the moment the next poll runs.
  if (watch.seenContractIds.length === 0 && watch.minPriceSeen === null) return undefined;
  return { seenContractIds: watch.seenContractIds, minPriceSeen: watch.minPriceSeen };
}

/**
 * One poll across every saved watch. No ESI/Firestore call at all when no
 * watch exists or when neither delivery gate is open — the same AC5 shape
 * `runForegroundPollOnce` follows for its own domains.
 */
export async function runBpcWatchPoll(deps: BpcWatchPollDependencies): Promise<void> {
  if (!(await deps.masterEnabled())) return;
  if (!(await deps.feedChannelEnabled())) return;

  const watches = await deps.listWatches();
  if (watches.length === 0) return;

  const characterId = deps.activeCharacterId();
  if (characterId === null) return;

  const rows = await deps.loadRows();
  if (rows === null) return;

  for (const watch of watches) {
    const { fire, nextState } = diffBpcWatchMatches(watchToFilter(watch), watchState(watch), rows);
    await deps.saveWatchState(watch.id, nextState);
    if (!fire) continue;

    const itemName = await deps.resolveTypeName(fire.typeId);
    const now = deps.now();
    await deps.recordFeedEntry({
      id: `bpcSearchWatch:${watch.id}:${fire.contractId}`,
      characterId,
      eventId: 'bpcSearchWatchMatch',
      subjectId: fire.contractId,
      title: i18n.t('notifications.fired.bpcSearchWatchMatch.title'),
      body: i18n.t(
        fire.reason === 'new'
          ? 'notifications.fired.bpcSearchWatchMatch.bodyNew'
          : 'notifications.fired.bpcSearchWatchMatch.bodyCheaper',
        { watch: watch.name, item: itemName, price: formatIsk(fire.price, 2) }
      ),
      firedAt: now,
    });
  }
}

async function currentPreferences() {
  await hydrateNotificationPreferences();
  return useNotificationPreferences.getState().value;
}

/** Real dependencies, wired against Dexie/Firestore/the app's active-character store. */
export function liveDependencies(): BpcWatchPollDependencies {
  return {
    masterEnabled: async () => (await currentPreferences()).masterEnabled,
    feedChannelEnabled: async () => isFeedChannelEnabled(await currentPreferences()),
    activeCharacterId: () => useActiveCharacter.getState().activeCharacterId,
    listWatches,
    loadRows: async () => {
      const characterId = useActiveCharacter.getState().activeCharacterId;
      if (characterId === null) return null;
      const result = await loadPublicBpcContracts(characterId);
      return result?.data?.rows ?? null;
    },
    resolveTypeName: async (typeId) => (await loadTypeNames([typeId])).get(typeId) ?? `#${typeId}`,
    saveWatchState,
    recordFeedEntry: recordFeedEntryAndSync,
    now: () => Date.now(),
  };
}
