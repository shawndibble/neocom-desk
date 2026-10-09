/**
 * One distance rule for everything D-Scan prints, so the Fleet board and the
 * Read-out's evidence lines cannot drift (issue #3207): 0.1 AU and over reads
 * as one-decimal AU, anything nearer as grouped km.
 */
export const KM_PER_AU = 149_597_870.7;

export function formatDistanceKm(km: number): string {
  if (km >= KM_PER_AU / 10) return `${(km / KM_PER_AU).toFixed(1)} AU`;
  return `${Math.round(km).toLocaleString()} km`;
}
