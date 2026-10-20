/**
 * Which contract statuses are still live.
 *
 * Split out of `features/character/contracts.ts` so a pure caller can ask the
 * question without pulling the fetch-and-cache layer — and with it Dexie —
 * into its module graph. `calendarBoardSources.ts` is that caller: it declares
 * itself pure, and a value import from the loader module quietly made that
 * untrue.
 */
import type { Contract } from '@/esi/endpoints';

/** Open or being worked, as opposed to the character's mostly-historical contract list. */
const ACTIVE_STATUSES = new Set<Contract['status']>(['outstanding', 'in_progress']);

export function isActiveContractStatus(status: Contract['status']): boolean {
  return ACTIVE_STATUSES.has(status);
}

/**
 * ESI keeps an accepted courier `outstanding` — the accepted state shows only in
 * `acceptor_id` and `date_accepted` — so `in_progress` is never sent in practice.
 * Read it as `in_progress` here, once, so every surface that asks sees the real state.
 */
export function withAcceptedCourierInProgress(contract: Contract): Contract {
  if (
    contract.type === 'courier' &&
    contract.status === 'outstanding' &&
    contract.acceptor_id !== 0 &&
    contract.acceptor_id !== undefined &&
    contract.date_accepted !== undefined
  ) {
    return { ...contract, status: 'in_progress' };
  }
  return contract;
}

export type ContractStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

/**
 * The tint of a contract's status pill: done well, still live, failed, or
 * simply withdrawn. A cancelled or deleted contract is not a failure, so it
 * stays neutral rather than red.
 */
export function contractStatusTone(status: Contract['status']): ContractStatusTone {
  switch (status) {
    case 'finished':
    case 'finished_issuer':
    case 'finished_contractor':
      return 'success';
    case 'outstanding':
    case 'in_progress':
      return 'warning';
    case 'failed':
    case 'rejected':
    case 'reversed':
      return 'danger';
    case 'cancelled':
    case 'deleted':
      return 'neutral';
  }
}
