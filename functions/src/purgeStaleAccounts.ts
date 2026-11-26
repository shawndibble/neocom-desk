export const ACCOUNT_INACTIVITY_DAYS = 90;

export const ACCOUNT_INACTIVITY_MS = ACCOUNT_INACTIVITY_DAYS * 24 * 3_600_000;

export const STALE_ACCOUNT_BATCH_SIZE = 500;

export const STALE_ACCOUNT_READ_PAGE_SIZE = 500;

export const STALE_ACCOUNT_MAX_PASSES = 40;

export const LAST_SYNCED_FIELD = 'lastSyncedAt';

export function staleAccountCutoff(nowMs: number): number {
  return nowMs - ACCOUNT_INACTIVITY_MS;
}

export const FULL_SCAN_UTC_DAY = 0;

export function isFullScanDay(nowMs: number): boolean {
  return new Date(nowMs).getUTCDay() === FULL_SCAN_UTC_DAY;
}

export function isAccountStale(lastSyncedMs: number, nowMs: number): boolean {
  return lastSyncedMs < staleAccountCutoff(nowMs);
}

export function lastSyncedAtOf(data: Record<string, unknown> | undefined): number | undefined {
  const value = data?.[LAST_SYNCED_FIELD];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export type AccountAction = 'seed' | 'purge' | 'keep';

export function decideAccountAction(
  lastSyncedMs: number | undefined,
  nowMs: number
): AccountAction {
  if (lastSyncedMs === undefined) return 'seed';
  return isAccountStale(lastSyncedMs, nowMs) ? 'purge' : 'keep';
}
