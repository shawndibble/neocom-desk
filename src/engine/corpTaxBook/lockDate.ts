/**
 * The lock date as the client applies it (decision 20261120-235011, "a lock date"): nothing dated
 * before `lockDateFor(today)` is added, changed or removed, so its controls are not offered. The
 * server refuses such an edit too (reason `locked`).
 */
import { lockDateFor } from '../../../functions/src/corpTaxBookCheckpoint';

/** Whether something dated `dateOrInstant` (`YYYY-MM-DD` or an ISO instant) is read-only on `today`. */
export function isLocked(dateOrInstant: string, today: string): boolean {
  return dateOrInstant.slice(0, 10) < lockDateFor(today.slice(0, 10));
}
