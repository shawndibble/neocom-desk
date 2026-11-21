/**
 * What the Miner page reads instead of the whole ledger (#5258, ADR 0032, decision
 * 20261120-235011). Pure: no fetch, DOM or Dexie.
 *
 * A Miner's Running account is built from its closed-through checkpoint and the days after it
 * (`MinerRunningAccount.build`), so the page reads the ledger rows from the checkpoint's oldest
 * day still owed, else the day after it. With no checkpoint every day from the book's start
 * counts: money pays the oldest day first, so a paid day left out would move money onto later
 * days. The rows go through `buildBookView` like any book's.
 */
import type { RunningAccountCheckpoint } from '../../../functions/src/corpTaxBookCheckpoint';
import { shiftUtcDate } from '@/engine/localDay';

/** First day whose ledger rows a Miner's page reads. */
export function accountWindowStart(
  checkpoint: Pick<RunningAccountCheckpoint, 'through' | 'owed'> | undefined,
  startDate: string
): string {
  if (!checkpoint) return startDate;
  const from = checkpoint.owed[0]?.date ?? shiftUtcDate(checkpoint.through, 1);
  return from > startDate ? from : startDate;
}
