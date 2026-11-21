/** What a moon owner's grant from before does not read: refinery names (#4654), each chunk's ore, or both. */
export type GrantLack = 'names' | 'ore' | 'both';

/** The lack a grant has, or null when it reads everything (or a read has not said yet). */
export function grantLack(summary: {
  refineryNamesGranted?: boolean;
  chunkOreGranted?: boolean;
}): GrantLack | null {
  const names = summary.refineryNamesGranted === false;
  const ore = summary.chunkOreGranted === false;
  return names && ore ? 'both' : names ? 'names' : ore ? 'ore' : null;
}
