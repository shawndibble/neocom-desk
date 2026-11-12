/**
 * The fire of `vettingShared`: a pilot shared a vetting report with the corp this Character
 * reviews for. The backend builds it when it writes the report and pushes it (ADR 0027;
 * `functions/src/serverEvents.ts` mirrors this shape); nothing on the device polls for it.
 * It names no pilot: the Notification Feed row it becomes is synced, so the reviewer reads who
 * shared the report on the report itself.
 */
export interface VettingSharedFire {
  eventId: 'vettingShared';
  /** The reviewer the push is for. */
  characterId: number;
  corporationId: number;
  reviewId: string;
  kind: 'application' | 'promotion';
}

/**
 * The Foreground Poller's snapshot for vetting: always empty, because the open app does not read
 * the queue in the background (each read is a signed-in callable). The event arrives by push.
 */
export interface VettingAlertSnapshot {
  entries: never[];
  nowMs: number;
}

/** Never fires: `vettingShared` is the server's to raise. */
export function diffVettingShared(): VettingSharedFire[] {
  return [];
}

/** The report a fire is about, as a router path. */
export function vettingSharedPath(fire: Pick<VettingSharedFire, 'reviewId'>): string {
  return `/corp/vetting/open/${encodeURIComponent(fire.reviewId)}`;
}
