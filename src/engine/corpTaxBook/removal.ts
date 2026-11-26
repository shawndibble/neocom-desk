import { moonOwnerMailRecipients } from './ownerRateMail';
import type { Payee } from './payouts';
import { HOUR_MS } from '@/lib/age';

export const REMOVAL_WAIT_MS = 24 * HOUR_MS;

const PAYEE_LOOKBACK_MS = 48 * HOUR_MS;

export interface Removal {
  startedAt: number;
  startedBy: number;
  startedByName: string;
  noticeAt?: number;
  effectiveAt?: number;
}

export type RemovableStatus = 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';

export interface RemovalState {
  status: RemovableStatus;
  removal?: Removal;
}

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

export function cancelRemoval(state: RemovalState): RemovalState {
  if (state.status !== 'pending-removal') throw new Error('no removal is pending');
  return { status: 'active' };
}

export function isRemovalDue(state: RemovalState, now: number): boolean {
  const at = state.removal?.effectiveAt;
  return state.status === 'pending-removal' && at !== undefined && at <= now;
}

export function removalRecipients(input: {
  officerIds: readonly number[];
  startedBy: number;
  ceoId: number | null;
  payee?: Payee;
  payeeCeoId?: number | null;
}): number[] {
  const out = new Set<number>(moonOwnerMailRecipients(input));
  for (const id of input.officerIds) if (id !== input.startedBy) out.add(id);
  return [...out];
}

export function payeeMayForce(input: {
  payeeChangedAt: number | undefined;
  removalStartedAt: number;
  payeeSetBy?: 'accounting' | 'moon-owner' | undefined;
}): boolean {
  const { payeeChangedAt, removalStartedAt } = input;
  if (input.payeeSetBy === 'accounting') return false;
  if (payeeChangedAt === undefined) return true;
  return payeeChangedAt < removalStartedAt - PAYEE_LOOKBACK_MS;
}

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
