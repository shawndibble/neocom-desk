/**
 * The header's Next deadline chip: which clock is soonest, and how loud the
 * chip is. The chip's tone is its own ladder (amber under 3 h, red under
 * 30 min), separate from the per-card `severityForRemaining`.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';

/** One clock a widget offers the header chip: when, what it is, how loud, and where it leads (absent when no page owns the clock). */
export interface BoardDeadline {
  at: number;
  note: string;
  severity: DeadlineSeverity;
  to?: string;
}

export type ChipTone = 'neutral' | 'warning' | 'danger';

export const CHIP_WARNING_MS = 3 * 3_600_000;
export const CHIP_DANGER_MS = 30 * 60_000;

/** The soonest candidate still ahead of `now`; null when none is. */
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
