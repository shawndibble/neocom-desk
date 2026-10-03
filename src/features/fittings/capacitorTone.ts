import type { CapacitorStatus } from '@/engine/fittings/types';

/** Under this long to empty, the capacitor reads as a danger rather than a warning. */
const DANGER_BELOW_SECONDS = 60;

export type CapacitorTone = 'success' | 'warning' | 'danger';

/** How the Capacitor section's headline is tinted: stable, lasts a minute or more, or less. */
export function capacitorTone(capacitor: CapacitorStatus): CapacitorTone {
  if (capacitor.stable) return 'success';
  // Whole seconds, as the headline shows them: "60s" never reads in red.
  return Math.round(capacitor.depletesInSeconds) < DANGER_BELOW_SECONDS ? 'danger' : 'warning';
}
