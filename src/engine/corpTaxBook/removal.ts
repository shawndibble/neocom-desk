/**
 * Removing a moon owner (issue #4520, spec #4504): a 24-hour pending removal
 * that starts counting when the mail goes out, who is mailed, and who may end
 * it early. Pure. Mirrored in `functions/src/corpTaxBookEngine.ts` (parity test).
 */

import { moonOwnerMailRecipients } from './ownerRateMail';
import type { Payee } from './payouts';

const HOUR_MS = 3_600_000;

/** How long a removal waits once its mail is sent. */
export const REMOVAL_WAIT_MS = 24 * HOUR_MS;

/** Code-only: the payee-force guard looks back this far from the start of a removal. */
const PAYEE_LOOKBACK_MS = 48 * HOUR_MS;

/** A started removal. The clock (`effectiveAt`) is set when the mail is sent, never before. */
export interface Removal {
  startedAt: number;
  startedBy: number;
  startedByName: string;
  /** When the notice went out (the mail queue's send time, or the officer's confirmation). */
  noticeAt?: number;
  /** `noticeAt` plus 24 hours; absent until the notice is out. */
  effectiveAt?: number;
}

export type RemovableStatus = 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';

export interface RemovalState {
  status: RemovableStatus;
  removal?: Removal;
}

/** A removal can start on an active moon owner only, and not twice. */
export function canStartRemoval(state: RemovalState): boolean {
  return state.status === 'active';
}

export function startRemoval(
  state: RemovalState,
  by: { characterId: number; name: string },
  now: number
): RemovalState {
  if (!canStartRemoval(state)) throw new Error('only an active moon owner can be removed');
  return {
    status: 'pending-removal',
    removal: { startedAt: now, startedBy: by.characterId, startedByName: by.name },
  };
}

/** The notice went out: the 24 hours run from here. Idempotent: the first notice wins. */
export function recordRemovalNotice(state: RemovalState, noticeAt: number): RemovalState {
  const { removal } = state;
  if (state.status !== 'pending-removal' || !removal || removal.effectiveAt !== undefined) {
    return state;
  }
  return {
    ...state,
    removal: { ...removal, noticeAt, effectiveAt: noticeAt + REMOVAL_WAIT_MS },
  };
}

/** Any Collector Accountant or higher (the caller checks the role); back to active. */
export function cancelRemoval(state: RemovalState): RemovalState {
  if (state.status !== 'pending-removal') throw new Error('no removal is pending');
  return { status: 'active' };
}

/** The wait is over. A removal whose notice never went out never takes effect on its own. */
export function isRemovalDue(state: RemovalState, now: number): boolean {
  const at = state.removal?.effectiveAt;
  return state.status === 'pending-removal' && at !== undefined && at <= now;
}

/**
 * Whom the one mail goes to: the moon owner's CEO and its payee through the shared
 * `moonOwnerMailRecipients` (#4515) first, since a copy to one of them starts the clock (#4617),
 * then the book's other officers. The officer who started it is not mailed; nobody twice.
 */
export function removalRecipients(input: {
  officerIds: readonly number[];
  startedBy: number;
  ceoId: number | null;
  payee?: Payee;
  /** The payee corporation's CEO, when the payee is a corporation. */
  payeeCeoId?: number | null;
}): number[] {
  const out = new Set<number>(moonOwnerMailRecipients(input));
  for (const id of input.officerIds) if (id !== input.startedBy) out.add(id);
  return [...out];
}

/**
 * May the payee end a removal at once? Not when the payee was set or changed
 * within 48 hours before the removal started, or at any time after it started.
 * Exactly one rule, deliberately silent in every player-facing surface.
 */
export function payeeMayForce(input: {
  payeeChangedAt: number | undefined;
  removalStartedAt: number;
}): boolean {
  const { payeeChangedAt, removalStartedAt } = input;
  if (payeeChangedAt === undefined) return true;
  return payeeChangedAt < removalStartedAt - PAYEE_LOOKBACK_MS;
}

/**
 * Who may use the payee's link: the payee when it is a player, the corporation's
 * CEO when it is a corporation.
 */
export function isPayeeActor(input: {
  payee: Payee | undefined;
  characterId: number;
  payeeCorporationCeoId: number | undefined;
}): boolean {
  const { payee, characterId } = input;
  if (!payee) return false;
  return payee.kind === 'character'
    ? payee.id === characterId
    : input.payeeCorporationCeoId === characterId;
}

/** A payee set or changed: the new payee and when. Re-saving the same payee changes nothing. */
export function withPayee<T extends { payee?: Payee }>(
  rec: T,
  payee: Payee,
  now: number
): T & { payeeChangedAt?: number } {
  const same = rec.payee?.kind === payee.kind && rec.payee.id === payee.id;
  const prior = (rec as { payeeChangedAt?: number }).payeeChangedAt;
  return {
    ...rec,
    payee,
    ...(same ? (prior !== undefined ? { payeeChangedAt: prior } : {}) : { payeeChangedAt: now }),
  };
}
