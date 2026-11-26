export function isArchivedPayee(
  archivedAt: number | undefined,
  owes: { amount: number } | null,
  assignments: readonly { updatedAt: number }[]
): boolean {
  if (archivedAt === undefined || owes !== null) return false;
  return assignments.every((a) => a.updatedAt <= archivedAt);
}
