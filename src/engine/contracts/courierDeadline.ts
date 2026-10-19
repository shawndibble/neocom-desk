/**
 * An accepted courier's real deadline: delivery, not the offer's expiry.
 *
 * `date_expired` is the deadline to *accept*, which for every other contract is
 * also the deadline that matters. Accepting a courier replaces it — delivery is
 * owed within `days_to_complete` of `date_accepted`, usually sooner than the
 * offer window closes, so the expiry over-read the one clock whose miss forfeits
 * the collateral.
 *
 * `null` where that cannot be derived, and the caller keeps the expiry rather
 * than guess. `days_to_complete: 0` is no completion window at all, not a
 * zero-length one — read as a duration it would leave the row permanently overdue.
 *
 * Shared by the Calendar board and the Contracts History table so the two
 * surfaces cannot drift apart.
 */
import type { Contract } from '@/esi/endpoints';
import { parseInstant } from '@/engine/esiInstant';

const DAY_MS = 86_400_000;

export function courierDeliveryDeadlineMs(contract: Contract): number | null {
  if (contract.type !== 'courier' || contract.status !== 'in_progress') return null;
  const days = contract.days_to_complete;
  if (days === undefined || !Number.isFinite(days) || days <= 0) return null;
  const acceptedMs = parseInstant(contract.date_accepted);
  if (acceptedMs === null) return null;
  return acceptedMs + days * DAY_MS;
}
