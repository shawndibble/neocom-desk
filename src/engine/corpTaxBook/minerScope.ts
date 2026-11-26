import type { RunningAccountCheckpoint } from '../../../functions/src/corpTaxBookCheckpoint';
import { shiftUtcDate } from '@/engine/localDay';

export function accountWindowStart(
  checkpoint: Pick<RunningAccountCheckpoint, 'through' | 'owed'> | undefined,
  startDate: string
): string {
  if (!checkpoint) return startDate;
  const from = checkpoint.owed[0]?.date ?? shiftUtcDate(checkpoint.through, 1);
  return from > startDate ? from : startDate;
}
