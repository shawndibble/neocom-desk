import { isPlainRecord } from '@/engine/guards';
import { DAY_MS } from '@/lib/age';
import type { DayCharge } from './charges';
import { activeDismissalFor, type Dismissal } from './dismissals';

export interface OreDisputeLine {
  recordKey: string;
  typeId: number;
  quantity: number;
  payeeName: string;
}

export type DisputeKind = 'payee' | 'quantity' | 'rate' | 'notPaying';
export const DISPUTE_KINDS: readonly DisputeKind[] = ['payee', 'quantity', 'rate', 'notPaying'];

export interface OreDispute {
  id: string;
  kind?: DisputeKind;
  reason?: string;
  claimedPct?: number;
  minerId: string;
  date: string;
  lines: OreDisputeLine[];
  by: number;
  at: string;
  holdFrom?: string;
  note?: string;
  resolution?: DisputeResolution;
  history?: DisputeHistoryEntry[];
}

export interface DisputeHistoryEntry {
  kind: DisputeKind;
  reason?: string;
  resolution: DisputeResolution;
}

export type DisputeResolution =
  | { kind: 'rejected'; at: string; by: number; reason: string; nextStep?: string }
  | { kind: 'dismissed'; at: string; by: number; reason: string; amountIsk: number };

export function disputedTax(
  dispute: Pick<OreDispute, 'lines' | 'kind' | 'claimedPct'>,
  charges: readonly Pick<DayCharge, 'key' | 'oreLines' | 'unitPrices' | 'taxPct'>[]
): number | undefined {
  const disputed = new Map<string, number>();
  for (const l of dispute.lines) {
    const k = `${l.recordKey}|${l.typeId}`;
    disputed.set(k, (disputed.get(k) ?? 0) + l.quantity);
  }
  let tax = 0;
  for (const [k, quantity] of disputed) {
    const [recordKey, type] = k.split('|');
    const typeId = Number(type);
    const charge = charges.find((c) => c.key === recordKey);
    if (!charge) return undefined;
    const held = charge.oreLines.reduce((n, l) => (l.typeId === typeId ? n + l.quantity : n), 0);
    const price = charge.unitPrices[typeId];
    if (price === undefined && held > 0) return undefined;
    const pct =
      dispute.kind === 'rate' && dispute.claimedPct !== undefined
        ? Math.max(0, charge.taxPct - dispute.claimedPct)
        : charge.taxPct;
    tax += Math.min(quantity, held) * (price ?? 0) * (pct / 100);
  }
  return tax;
}

export const disputeKindOf = (d: Pick<OreDispute, 'kind'>): DisputeKind => d.kind ?? 'payee';

export const DISPUTE_HOLD_DAYS = 14;

export function disputeHold(
  dispute: Pick<OreDispute, 'at' | 'resolution' | 'holdFrom'>,
  now: string
): { until: string } | undefined {
  if (dispute.resolution) return undefined;
  const until = Date.parse(dispute.holdFrom ?? dispute.at) + DISPUTE_HOLD_DAYS * DAY_MS;
  return Date.parse(now) < until ? { until: new Date(until).toISOString() } : undefined;
}

export function isMinersDispute(
  dispute: Pick<OreDispute, 'minerId' | 'lines'>,
  minerId: string,
  characterIds: readonly number[]
): boolean {
  return (
    dispute.minerId === minerId ||
    dispute.lines.some((l) => characterIds.some((c) => l.recordKey.startsWith(`${c}:`)))
  );
}

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

export function readDisputes(raw: readonly unknown[]): OreDispute[] {
  const out: OreDispute[] = [];
  for (const d of raw) {
    if (!isPlainRecord(d)) continue;
    const { id, minerId, date, by, at, note, resolution, kind, reason, claimedPct, holdFrom } = d;
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
      ...(DISPUTE_KINDS.includes(kind as DisputeKind) && kind !== 'payee'
        ? { kind: kind as DisputeKind }
        : {}),
      ...(typeof reason === 'string' ? { reason } : {}),
      ...(typeof claimedPct === 'number' && Number.isFinite(claimedPct) ? { claimedPct } : {}),
      ...(typeof holdFrom === 'string' && Number.isFinite(Date.parse(holdFrom))
        ? { holdFrom }
        : {}),
      ...readResolution(resolution),
      ...readHistory(d.history),
    });
  }
  return out;
}

function readHistory(raw: unknown): { history?: DisputeHistoryEntry[] } {
  if (!Array.isArray(raw)) return {};
  const history = raw.flatMap((e): DisputeHistoryEntry[] => {
    if (!isPlainRecord(e)) return [];
    const { resolution } = readResolution(e.resolution);
    if (!resolution) return [];
    const kind = DISPUTE_KINDS.includes(e.kind as DisputeKind) ? (e.kind as DisputeKind) : 'payee';
    return [{ kind, ...(typeof e.reason === 'string' ? { reason: e.reason } : {}), resolution }];
  });
  return history.length > 0 ? { history } : {};
}

function readResolution(raw: unknown): { resolution?: DisputeResolution } {
  if (
    !isPlainRecord(raw) ||
    typeof raw.at !== 'string' ||
    typeof raw.by !== 'number' ||
    typeof raw.reason !== 'string'
  )
    return {};
  const { at, by, reason } = raw;
  if (raw.kind === 'rejected')
    return {
      resolution: {
        kind: 'rejected',
        at,
        by,
        reason,
        ...(typeof raw.nextStep === 'string' ? { nextStep: raw.nextStep } : {}),
      },
    };
  if (raw.kind === 'dismissed' && typeof raw.amountIsk === 'number')
    return { resolution: { kind: 'dismissed', at, by, reason, amountIsk: raw.amountIsk } };
  return {};
}
