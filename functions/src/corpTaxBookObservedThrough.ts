// Which Observed Rows the scheduled sync can leave out of its merge (#5048).
//
// ESI's observer ledger has one row per character, ore type, refinery and EVE/UTC
// day (`last_updated` is that day), and a row's quantity only grows during its own
// day. `mergeObservedRows` only ever writes a row whose quantity grew. So once a
// day has closed, a row for it that a run read and merged in full is final: every
// later run would read the same quantity and write nothing, after paying a
// `getAll` read for it. ESI returns about 30 days of rows, so almost all of them.
//
// `observedThrough[structureId]` on the book doc records when the scheduled run
// last read that refinery's ledger in full (not truncated) and merged every row
// of it. It is written only after all of that run's merges succeeded. A row is
// skipped when its day closed at least `SETTLED_GRACE_MS` before that read. The
// grace covers ESI's hour of cache and ledger rows posted late. A refinery with
// no entry (a new one, a first run, a truncated read) is merged in full, as before.

const DAY_MS = 24 * 3_600_000;

/** How long after a day closes its ledger rows are trusted to have stopped changing. */
export const SETTLED_GRACE_MS = DAY_MS;

/** Refinery id → epoch ms of the last read of its ledger that was merged in full. */
export type ObservedThrough = Record<string, number>;

export interface LedgerRead {
  structureId: number;
  fetchedAt: string;
  truncated: boolean;
}

/** The book doc's `observedThrough`, keeping only well-formed entries. */
export function readObservedThrough(value: unknown): ObservedThrough {
  if (typeof value !== 'object' || value === null) return {};
  const out: ObservedThrough = {};
  for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d+$/.test(id) && typeof at === 'number' && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

/** Whether a merged read already holds this row's final quantity. */
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

/** `through` after a run that merged every row of `reads`. Never moves an entry backwards. */
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
