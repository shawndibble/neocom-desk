import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import type {
  WalletJournalEntrySnapshot,
  WalletNotificationFire,
  WalletSnapshot,
} from '@/engine/notificationDiffs';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { currentThresholds } from './shared';

const isWalletJournalEntrySnapshot = shapeGuard<WalletJournalEntrySnapshot>({
  id: is.number,
  amount: is.nullable(is.number),
  thresholdIsk: is.number,
  dateMs: is.finite,
  refType: is.optional(is.string),
  contextId: is.optional(is.number),
  contextIdType: is.optional(is.string),
});

export const walletDomain = defineDomain<
  WalletJournalEntrySnapshot,
  WalletSnapshot,
  WalletNotificationFire
>({
  source: SNAPSHOT_SOURCES.wallet,
  stateKey: 'notifications.pollerState.wallet',
  slow: true,
  entriesKey: 'entries',
  isEntry: isWalletJournalEntrySnapshot,
  load: async (characterId) => {
    const result = await loadWalletJournalWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    if (result.cached.truncated) return null;
    const thresholds = await currentThresholds(characterId);
    return result.cached.data.map((entry) => {
      const dateMs = Date.parse(entry.date);
      return {
        id: entry.id,
        amount: entry.amount ?? null,
        thresholdIsk: thresholds.walletBalanceChangedThresholdIsk,
        dateMs: Number.isFinite(dateMs) ? dateMs : Date.now(),
        ...(entry.ref_type ? { refType: entry.ref_type } : {}),
        ...(entry.context_id !== undefined ? { contextId: entry.context_id } : {}),
        ...(entry.context_id_type ? { contextIdType: entry.context_id_type } : {}),
      };
    });
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});
