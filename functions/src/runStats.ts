export interface RunStats {
  add(name: string, amount?: number): void;
  set(name: string, value: number): void;
  get(name: string): number;
  snapshot(): Record<string, number>;
}

export function createRunStats(keys: readonly string[]): RunStats {
  const counts = new Map<string, number>(keys.map((key) => [key, 0]));
  return {
    add: (name, amount = 1) => void counts.set(name, (counts.get(name) ?? 0) + amount),
    set: (name, value) => void counts.set(name, value),
    get: (name) => counts.get(name) ?? 0,
    snapshot: () => Object.fromEntries(counts),
  };
}

export const ALERTS_POLL_STATS_KEYS = [
  'grantsListed',
  'grantsRefreshed',
  'grantsSkippedIdle',
  'grantsSkippedDeviceBackoff',
  'grantsSkippedRefresh',
  'grantsSkippedBudget',
  'grantsSkippedError',
  'tokenRotationWrites',
  'idleStateWrites',
  'devicesRead',
  'devicesSleeping',
  'devicesDormant',
  'locationReadsSkippedNoCandidates',
  'firestoreReads',
  'firestoreWrites',
  'ssoRefreshCalls',
  'esiNotificationsCalls',
  'esiMailCalls',
  'esiLocationCalls',
  'esiIncursionsCalls',
  'esiSkyhooksCalls',
  'fcmSends',
  'durationMs',
] as const;

export const SERVER_POLL_STATS_KEYS = [
  'devicesListed',
  'devicesPolled',
  'devicesSkippedSleeping',
  'devicesSkippedDormant',
  'dormantBaselineClears',
  'firestoreReads',
  'firestoreWrites',
  'fuzzworkCalls',
  'fcmSends',
  'durationMs',
] as const;
