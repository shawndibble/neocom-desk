import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';

export const KM_PER_AU = 149_597_870.7;

export function formatDistanceKm(km: number): string {
  if (km >= KM_PER_AU / 10) return `${fixed1(km / KM_PER_AU)} AU`;
  return `${formatCount(km)} km`;
}
