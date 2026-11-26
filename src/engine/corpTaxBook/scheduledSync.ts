export const SCHEDULED_STOP_REASONS = [
  'role-lost',
  'left-corp',
  'token-revoked',
  'esi-refused',
  'book-off',
  'grant-unreadable',
] as const;

export type ScheduledStopReason = (typeof SCHEDULED_STOP_REASONS)[number];

export interface ScheduledSyncRun {
  at: number;
  outcome: 'synced' | 'skipped';
  reason?: string;
  observedRows?: number;
  extractions?: number;
  donationsAdded?: number;
  settled?: number;
  missing?: ('extractions' | 'donations' | 'ore')[];
}

export interface ScheduledSyncStatus {
  status: 'active' | 'stopped';
  characterId: number;
  characterName: string;
  enabledAt: number;
  stoppedAt?: number;
  stoppedReason?: ScheduledStopReason;
  lastRun?: ScheduledSyncRun;
  refineryIds?: number[];
}

export function scheduledSyncFrom(
  d: Record<string, unknown> | undefined
): ScheduledSyncStatus | null {
  if (!d) return null;
  if (d.status !== 'active' && d.status !== 'stopped') return null;
  if (typeof d.characterId !== 'number' || typeof d.characterName !== 'string') return null;
  const reason = (SCHEDULED_STOP_REASONS as readonly unknown[]).includes(d.stoppedReason)
    ? (d.stoppedReason as ScheduledStopReason)
    : undefined;
  const run = d.lastRun as Partial<ScheduledSyncRun> | undefined;
  const refineryIds =
    d.systemIds && typeof d.systemIds === 'object'
      ? Object.keys(d.systemIds)
          .map(Number)
          .filter((id) => Number.isSafeInteger(id) && id > 0)
          .sort((a, b) => a - b)
      : [];
  return {
    status: d.status,
    characterId: d.characterId,
    characterName: d.characterName,
    enabledAt: typeof d.enabledAt === 'number' ? d.enabledAt : 0,
    ...(typeof d.stoppedAt === 'number' ? { stoppedAt: d.stoppedAt } : {}),
    ...(reason ? { stoppedReason: reason } : {}),
    ...(run && typeof run.at === 'number' && (run.outcome === 'synced' || run.outcome === 'skipped')
      ? { lastRun: run as ScheduledSyncRun }
      : {}),
    ...(refineryIds.length > 0 ? { refineryIds } : {}),
  };
}
