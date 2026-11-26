export const SRP_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export type SrpSweepDecision = 'delete' | 'keep';

export function decideSrpClaimSweep(
  claim: { state?: unknown; closedAt?: unknown },
  now: number
): SrpSweepDecision {
  if (claim.state !== 'paid' && claim.state !== 'rejected') return 'keep';
  const { closedAt } = claim;
  if (typeof closedAt !== 'number' || !Number.isFinite(closedAt) || closedAt <= 0) return 'keep';
  return now - closedAt >= SRP_RETENTION_MS ? 'delete' : 'keep';
}

export function isSrpAuditForClaim(entry: Record<string, unknown>, killmailId: number): boolean {
  const { detail } = entry;
  return (
    typeof detail === 'object' &&
    detail !== null &&
    (detail as { killmailId?: unknown }).killmailId === killmailId
  );
}
