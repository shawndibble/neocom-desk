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
