// In-memory counters for one scheduled run (issue #5144). They are logged once at
// the end of the run and never written to Firestore, so measuring a job costs
// nothing. Field names are the contract the owner queries in Cloud Logging:
// every key is declared up front, so a field that stayed at zero is still in
// the log line instead of missing from it. Counts only — no ids, no content.

export interface RunStats {
  add(name: string, amount?: number): void;
  set(name: string, value: number): void;
  get(name: string): number;
  /** A copy of every counter, in declaration order. */
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

/** `pollEveNotifications finished` — the Alerts poller's counters. */
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

/** `Server event poll finished` — the dispatch tick's server-event counters. */
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
