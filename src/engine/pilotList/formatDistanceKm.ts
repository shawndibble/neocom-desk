import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';

/**
 * One distance rule for everything D-Scan prints, so the Fleet board and the
 * Read-out's evidence lines cannot drift (issue #3207): 0.1 AU and over reads
 * as one-decimal AU, anything nearer as grouped km.
 */
export const KM_PER_AU = 149_597_870.7;

export function formatDistanceKm(km: number): string {
  if (km >= KM_PER_AU / 10) return `${fixed1(km / KM_PER_AU)} AU`;
  return `${formatCount(km)} km`;
}
