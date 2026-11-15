/**
 * Disputes (#6206): a Miner flags a Conflict day to the Corp Tax Book, "I gave this ore to
 * {payee}". One record per Miner and day (`corps/{id}/disputes/{minerId_date}`), written by the
 * `disputeCorpTaxBookConflictCallable` action. Officers answer it in Needs you: dismiss the day
 * (the existing record dismissal) or reject it with a note. The Payee is the name the Miner
 * sent; officers never see a Miner's own Payee list.
 */
import { isPlainRecord } from '@/engine/guards';
import { activeDismissalFor, type Dismissal } from './dismissals';

export interface OreDisputeLine {
  /** `character:refinery:date`, the same key a record dismissal targets. */
  recordKey: string;
  typeId: number;
  quantity: number;
  payeeName: string;
}

export interface OreDispute {
  id: string;
  minerId: string;
  /** The UTC day disputed. */
  date: string;
  lines: OreDisputeLine[];
  /** The character that first flagged it. */
  by: number;
  /** ISO instant it was first flagged. */
  at: string;
  note?: string;
  resolution?: { kind: 'rejected'; at: string; by: number; reason: string };
}

/** The disputes Needs you still lists: unanswered, with a line no active dismissal covers. Oldest day first. */
export function disputesToShow(
  disputes: readonly OreDispute[],
  dismissals: readonly Dismissal[]
): OreDispute[] {
  return disputes
    .filter(
      (d) =>
        !d.resolution &&
        d.lines.some(
          (l) =>
            !activeDismissalFor({ key: l.recordKey, minerId: d.minerId, date: d.date }, dismissals)
        )
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.minerId.localeCompare(b.minerId));
}

function readLine(raw: unknown): OreDisputeLine | null {
  if (!isPlainRecord(raw)) return null;
  const { recordKey, typeId, quantity, payeeName } = raw;
  return typeof recordKey === 'string' &&
    typeof typeId === 'number' &&
    typeof quantity === 'number' &&
    typeof payeeName === 'string'
    ? { recordKey, typeId, quantity, payeeName }
    : null;
}

/** Stored dispute docs, the malformed ones dropped. */
export function readDisputes(raw: readonly unknown[]): OreDispute[] {
  const out: OreDispute[] = [];
  for (const d of raw) {
    if (!isPlainRecord(d)) continue;
    const { id, minerId, date, by, at, note, resolution } = d;
    const lines = Array.isArray(d.lines) ? d.lines.map(readLine) : [];
    if (
      typeof id !== 'string' ||
      typeof minerId !== 'string' ||
      typeof date !== 'string' ||
      typeof by !== 'number' ||
      typeof at !== 'string' ||
      lines.length === 0 ||
      lines.some((l) => l === null)
    )
      continue;
    out.push({
      id,
      minerId,
      date,
      lines: lines as OreDisputeLine[],
      by,
      at,
      ...(typeof note === 'string' ? { note } : {}),
      ...(isPlainRecord(resolution) &&
      resolution.kind === 'rejected' &&
      typeof resolution.at === 'string' &&
      typeof resolution.by === 'number' &&
      typeof resolution.reason === 'string'
        ? {
            resolution: {
              kind: 'rejected' as const,
              at: resolution.at,
              by: resolution.by,
              reason: resolution.reason,
            },
          }
        : {}),
    });
  }
  return out;
}
