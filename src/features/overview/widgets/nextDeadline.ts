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

/**
 * What the header drew for the Next deadline once every read was in, remembered so the next
 * load can hold the same room on a phone (where it is a line of its own) before the clocks
 * arrive: a button (`link`), a plain readout (`text`, no page owns the clock), or nothing.
 */
export type NextShape = 'none' | 'link' | 'text';

export function nextShape(next: Pick<BoardDeadline, 'to'> | null): NextShape {
  if (next === null) return 'none';
  return next.to === undefined ? 'text' : 'link';
}

/**
 * The phone height to hold open for a remembered shape: the `md` button's `h-9`, the
 * `text-sm` readout's one line, or nothing. Only what this device saw last time is held:
 * a guess on a first load that turns out wrong (no clock) drops the whole board by the
 * line it held, which is the very shift the slot is there to prevent.
 */
export function reservedNextHeight(remembered: string | null): 'h-9' | 'h-5' | null {
  if (remembered === 'link') return 'h-9';
  if (remembered === 'text') return 'h-5';
  return null;
}
