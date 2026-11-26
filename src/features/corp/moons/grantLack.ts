export type GrantLack = 'names' | 'ore' | 'both';

export function grantLack(summary: {
  refineryNamesGranted?: boolean;
  chunkOreGranted?: boolean;
}): GrantLack | null {
  const names = summary.refineryNamesGranted === false;
  const ore = summary.chunkOreGranted === false;
  return names && ore ? 'both' : names ? 'names' : ore ? 'ore' : null;
}
