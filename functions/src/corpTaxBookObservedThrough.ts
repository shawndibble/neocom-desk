import { DAY_MS } from './timeConstants.js';

export const SETTLED_GRACE_MS = 3 * DAY_MS;

export type ObservedThrough = Record<string, number>;

export interface LedgerRead {
  structureId: number;
  fetchedAt: string;
  truncated: boolean;
}

export function readObservedThrough(value: unknown): ObservedThrough {
  if (typeof value !== 'object' || value === null) return {};
  const out: ObservedThrough = {};
  for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d+$/.test(id) && typeof at === 'number' && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

export function isSettledRow(
  row: { structureId: number; date: string },
  through: ObservedThrough
): boolean {
  const readAt = through[String(row.structureId)];
  if (readAt === undefined) return false;
  const dayStart = Date.parse(`${row.date}T00:00:00Z`);
  if (!Number.isFinite(dayStart)) return false;
  return dayStart + DAY_MS + SETTLED_GRACE_MS <= readAt;
}

export function advanceObservedThrough(
  through: ObservedThrough,
  reads: readonly LedgerRead[]
): ObservedThrough {
  const next = { ...through };
  for (const read of reads) {
    if (read.truncated) continue;
    const at = Date.parse(read.fetchedAt);
    if (!Number.isFinite(at)) continue;
    const id = String(read.structureId);
    next[id] = Math.max(next[id] ?? at, at);
  }
  return next;
}
