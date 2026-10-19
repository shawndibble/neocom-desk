/**
 * The scheduled server sync's public status (ADR 0025), as the book's
 * `meta/scheduledSync` document stores it. The server writes it; officers read
 * it. It carries no token, only who holds the schedule, whether it runs, why it
 * stopped, and what the last run did.
 */

/** Why the schedule for a corporation stopped; each has its own health-strip wording. */
export const SCHEDULED_STOP_REASONS = [
  /** The holder no longer holds an editing role (CEO, Director or Accountant). */
  'role-lost',
  /** The holder left the corporation. */
  'left-corp',
  /** SSO no longer honours the refresh token (revoked or expired). */
  'token-revoked',
  /** ESI refused the holder's token (the ledger is no longer readable with it). */
  'esi-refused',
  /** The corporation's book was turned off. */
  'book-off',
  /** The saved grant could not be decrypted, so it could never run again. */
  'grant-unreadable',
] as const;

export type ScheduledStopReason = (typeof SCHEDULED_STOP_REASONS)[number];

export interface ScheduledSyncRun {
  /** Epoch ms. */
  at: number;
  outcome: 'synced' | 'skipped';
  /** Why a run was skipped (`esi-unavailable`, `esi-budget`). */
  reason?: string;
  observedRows?: number;
  extractions?: number;
  donationsAdded?: number;
  settled?: number;
  /** Sources the holder could not read that run. */
  missing?: ('extractions' | 'donations')[];
}

export interface ScheduledSyncStatus {
  status: 'active' | 'stopped';
  characterId: number;
  characterName: string;
  /** Epoch ms the holder gave the grant. */
  enabledAt: number;
  stoppedAt?: number;
  stoppedReason?: ScheduledStopReason;
  lastRun?: ScheduledSyncRun;
}

/** Reads `meta/scheduledSync`, dropping anything malformed; null when the schedule was never on or was revoked. */
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
  };
}
