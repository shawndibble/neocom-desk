import type { DeadlineSeverity } from '@/engine/character/severity';
import { MINUTE_MS, HOUR_MS } from '@/lib/age';

export interface BoardDeadline {
  at: number;
  note: string;
  severity: DeadlineSeverity;
  to?: string;
}

export type ChipTone = 'neutral' | 'warning' | 'danger';

export const CHIP_WARNING_MS = 3 * HOUR_MS;
export const CHIP_DANGER_MS = 30 * MINUTE_MS;

export function nextDeadline(
  candidates: readonly BoardDeadline[],
  now: number
): BoardDeadline | null {
  let best: BoardDeadline | null = null;
  for (const c of candidates) {
    if (c.at <= now) continue;
    if (!best || c.at < best.at) best = c;
  }
  return best;
}

export function chipTone(remainingMs: number): ChipTone {
  if (remainingMs < CHIP_DANGER_MS) return 'danger';
  if (remainingMs < CHIP_WARNING_MS) return 'warning';
  return 'neutral';
}
