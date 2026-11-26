import type { DeadlineSeverity } from '@/engine/character/severity';
import { colonyAttention, EXPIRING_SOON_WINDOW_MS } from './colonyStatus';
import type { ColonyStatus } from './types';
import { MINUTE_MS } from '@/lib/age';

export const BATCH_WINDOW_MS = 90 * MINUTE_MS;

export type ColonyBatchKind = 'expired' | 'running' | 'idle';

export interface ColonyBatch<T> {
  kind: ColonyBatchKind;
  expiryMs: number | null;
  severity: DeadlineSeverity;
  colonies: T[];
}

function severityForRunning(
  status: ColonyStatus,
  nowMs: number,
  expiringSoonWindowMs: number
): DeadlineSeverity {
  switch (colonyAttention(status, nowMs, expiringSoonWindowMs)) {
    case 'idle':
      return 'critical';
    case 'expiring-soon':
      return 'warning';
    case 'decayed':
      return 'watch';
    case 'healthy':
      return 'clear';
  }
}

export function groupColoniesIntoBatches<T>(
  colonies: readonly T[],
  statusOf: (colony: T) => ColonyStatus,
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): ColonyBatch<T>[] {
  const expired: { colony: T; stoppedMs: number }[] = [];
  const noExtractor: T[] = [];
  const running: { colony: T; expiryMs: number }[] = [];

  for (const colony of colonies) {
    const status = statusOf(colony);
    if (status.idle) {
      expired.push({ colony, stoppedMs: status.soonestExpiryMs ?? nowMs });
    } else if (status.soonestExpiryMs === null) {
      noExtractor.push(colony);
    } else {
      running.push({ colony, expiryMs: status.soonestExpiryMs });
    }
  }

  const batches: ColonyBatch<T>[] = [];

  if (expired.length > 0) {
    batches.push({
      kind: 'expired',
      expiryMs: Math.min(...expired.map((entry) => entry.stoppedMs)),
      severity: 'critical',
      colonies: expired.map((entry) => entry.colony),
    });
  }

  running.sort((a, b) => a.expiryMs - b.expiryMs);
  let open: typeof running = [];
  const closeRun = () => {
    if (open.length === 0) return;
    const expiryMs = open[0].expiryMs;
    batches.push({
      kind: 'running',
      expiryMs,
      severity: severityForRunning(statusOf(open[0].colony), nowMs, expiringSoonWindowMs),
      colonies: open.map((entry) => entry.colony),
    });
    open = [];
  };
  for (const entry of running) {
    if (open.length > 0 && entry.expiryMs - open[open.length - 1].expiryMs > BATCH_WINDOW_MS) {
      closeRun();
    }
    open.push(entry);
  }
  closeRun();

  if (noExtractor.length > 0) {
    batches.push({ kind: 'idle', expiryMs: null, severity: 'clear', colonies: noExtractor });
  }

  return batches;
}
