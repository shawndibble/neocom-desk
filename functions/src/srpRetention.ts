// SRP retention (ADR 0026): Paid and Rejected SRP Claims are deleted one
// year after they close. Pure timing only; the sweep is srpCleanup.ts.

/** One year, as 365 days. */
export const SRP_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export type SrpSweepDecision = 'delete' | 'keep';

/**
 * Deleted at exactly one year after the claim's latest close. Only Paid and Rejected
 * claims are ever deleted; Pending and Approved (including a Rejected claim re-filed back
 * to Pending) are kept however old. A closed claim with a missing or malformed `closedAt`
 * is kept, never guessed.
 */
export function decideSrpClaimSweep(
  claim: { state?: unknown; closedAt?: unknown },
  now: number
): SrpSweepDecision {
  if (claim.state !== 'paid' && claim.state !== 'rejected') return 'keep';
  const { closedAt } = claim;
  if (typeof closedAt !== 'number' || !Number.isFinite(closedAt) || closedAt <= 0) return 'keep';
  return now - closedAt >= SRP_RETENTION_MS ? 'delete' : 'keep';
}
