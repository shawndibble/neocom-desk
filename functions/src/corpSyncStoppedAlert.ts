import { isPlainRecord } from './guards.js';
import { DAY_MS } from './timeConstants.js';
import type { CorpTaxBookSyncStoppedFire, SyncStoppedAlertReason } from './serverEvents.js';
import type { StopReason } from './corpTaxBookScheduledSync.js';

export const SYNC_STOPPED_EDITOR_DAYS = 30;
export const SYNC_STOPPED_NOTIFY_MAX = 25;
export const SYNC_STOPPED_NOTIFY_BUDGET_MS = 5000;

const EDITOR_RECENT_MS = SYNC_STOPPED_EDITOR_DAYS * DAY_MS;

export function isAlertedStop(reason: StopReason): reason is SyncStoppedAlertReason {
  return reason !== 'book-off';
}

const holderGone = (reason: SyncStoppedAlertReason): boolean =>
  reason === 'role-lost' || reason === 'left-corp';

export function syncStoppedRecipients(
  officers: readonly unknown[],
  holderCharacterId: number,
  reason: SyncStoppedAlertReason,
  now: number
): number[] {
  const editors = officers
    .flatMap((raw) => {
      if (!isPlainRecord(raw) || raw.canEdit !== true) return [];
      const { characterId, checkedAt } = raw;
      if (typeof characterId !== 'number' || !Number.isSafeInteger(characterId)) return [];
      if (typeof checkedAt !== 'number' || now - checkedAt >= EDITOR_RECENT_MS) return [];
      return [{ characterId, checkedAt }];
    })
    .sort((a, b) => b.checkedAt - a.checkedAt || a.characterId - b.characterId)
    .map((entry) => entry.characterId);
  const told = holderGone(reason)
    ? editors.filter((id) => id !== holderCharacterId)
    : [holderCharacterId, ...editors];
  return [...new Set(told)].slice(0, SYNC_STOPPED_NOTIFY_MAX);
}

export function syncStoppedFires(
  recipients: readonly number[],
  stop: {
    corporationId: number;
    reason: SyncStoppedAlertReason;
    characterName: string;
    stoppedAt: number;
  }
): CorpTaxBookSyncStoppedFire[] {
  return recipients.map((characterId) => ({
    eventId: 'corpTaxBookSyncStopped',
    characterId,
    corporationId: stop.corporationId,
    reason: stop.reason,
    characterName: stop.characterName,
    stoppedAt: stop.stoppedAt,
  }));
}
