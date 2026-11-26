import type { CapacitorStatus } from '@/engine/fittings/types';

const DANGER_BELOW_SECONDS = 60;

export type CapacitorTone = 'success' | 'warning' | 'danger';

export function capacitorTone(capacitor: CapacitorStatus): CapacitorTone {
  if (capacitor.stable) return 'success';
  return Math.round(capacitor.depletesInSeconds) < DANGER_BELOW_SECONDS ? 'danger' : 'warning';
}
