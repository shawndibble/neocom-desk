// `corpTaxBookSyncStopped` (issue #6208, ADR 0027): who is told that the scheduled sync stopped a
// book's Automatic sync, and the fire each of them gets. Pure: corpSyncGrant.ts reads the
// officer docs and pushes, after the stop has committed.

import { isPlainRecord } from './guards.js';
import { DAY_MS } from './vettingTypes.js';
import type { CorpTaxBookSyncStoppedFire, SyncStoppedAlertReason } from './serverEvents.js';
import type { StopReason } from './corpTaxBookScheduledSync.js';

/** An editor's officer check must be this recent to be told (the book's own 30-day reach). */
export const SYNC_STOPPED_EDITOR_DAYS = 30;
/** Bounds one stop's pushes; a corporation has a handful of editors. */
export const SYNC_STOPPED_NOTIFY_MAX = 25;
/** How long the scheduled run waits for one stop's pushes before moving on to the next book. */
export const SYNC_STOPPED_NOTIFY_BUDGET_MS = 5000;

const EDITOR_RECENT_MS = SYNC_STOPPED_EDITOR_DAYS * DAY_MS;

/**
 * Whether a stop is told at all. `book-off` is not: an editor turned the book off on purpose, and
 * there is nothing left for anyone to turn back on.
 */
export function isAlertedStop(reason: StopReason): reason is SyncStoppedAlertReason {
  return reason !== 'book-off';
}

/** The holder can no longer act on the book: they are not told, whatever their officer doc says. */
const holderGone = (reason: SyncStoppedAlertReason): boolean =>
  reason === 'role-lost' || reason === 'left-corp';

/**
 * The Characters to tell: each officer doc (`corps/{corp}/officers/{uid}`, `OfficerAccess`) that
 * may edit the book and was checked in the last `SYNC_STOPPED_EDITOR_DAYS`, the most recently
 * checked first, plus the holder unless they lost the role or left the corporation. Once each, at
 * most `SYNC_STOPPED_NOTIFY_MAX`.
 */
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

/** One fire per recipient, keyed by the stop's own `stoppedAt` (the stored status's). */
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
