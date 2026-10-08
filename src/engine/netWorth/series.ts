/**
 * Net worth chart maths (issue #2935): layers, per-Character day series, and
 * the totals the chart and table share. Pure — snapshots and the journal's
 * daily balances come in, display-ready numbers go out.
 */
import { findMissingDays, utcDay, type NetWorthSnapshotRow } from './snapshot';

export const LAYER_IDS = ['isk', 'assets', 'escrow', 'sellOrders'] as const;
export type LayerId = (typeof LAYER_IDS)[number];
export type LayerValues = Record<LayerId, number>;

export function layerValues(row: NetWorthSnapshotRow): LayerValues {
  return {
    isk: row.wallet,
    assets: row.assetValue,
    escrow: row.escrow,
    sellOrders: row.sellStock ?? 0,
  };
}

export function netWorthOf(values: LayerValues, shown: readonly LayerId[]): number {
  return shown.reduce((sum, id) => sum + values[id], 0);
}

/**
 * Toggle `id` in a hidden list (the persisted shape, so a new Character or
 * layer shows by default). Hiding the last visible one is refused.
 */
export function toggleHidden<T>(hidden: readonly T[], id: T, all: readonly T[]): readonly T[] {
  if (hidden.includes(id)) return hidden.filter((h) => h !== id);
  const stillVisible = all.filter((a) => a !== id && !hidden.includes(a));
  return stillVisible.length === 0 ? hidden : [...hidden, id];
}

export type PointKind = 'wallet-only' | 'snapshot' | 'gap';

export interface SeriesPoint {
  day: string;
  /** Wallet balance that day; `null` only before anything is known. */
  isk: number | null;
  /** `null` outside a snapshot day: layers are never interpolated. */
  layers: LayerValues | null;
  kind: PointKind;
}

export interface CharacterSeries {
  points: SeriesPoint[];
  firstSnapshotDay: string | null;
  /** Days between the first and last snapshot with no snapshot. */
  gapDays: string[];
}

const DAY_MS = 86_400_000;

/**
 * One Character's day-by-day series. ISK is the journal's last balance of each
 * day (the backfill) and continues through gaps and pre-snapshot days; the
 * other layers exist only on snapshot days.
 */
export function buildCharacterSeries(input: {
  walletByDay: ReadonlyMap<string, number>;
  snapshots: readonly NetWorthSnapshotRow[];
}): CharacterSeries {
  const snapByDay = new Map(input.snapshots.map((r) => [r.day, r]));
  const days = [...new Set([...input.walletByDay.keys(), ...snapByDay.keys()])].sort();
  if (days.length === 0) return { points: [], firstSnapshotDay: null, gapDays: [] };
  const snapDays = [...snapByDay.keys()].sort();
  const firstSnapshotDay = snapDays[0] ?? null;
  const points: SeriesPoint[] = [];
  let lastIsk: number | null = null;
  const end = Date.parse(days[days.length - 1]!);
  for (let t = Date.parse(days[0]!); t <= end; t += DAY_MS) {
    const day = utcDay(t);
    const snap = snapByDay.get(day);
    const journal = input.walletByDay.get(day);
    if (snap) lastIsk = snap.wallet;
    else if (journal !== undefined) lastIsk = journal;
    let kind: PointKind = 'gap';
    if (snap) kind = 'snapshot';
    else if (firstSnapshotDay === null || day < firstSnapshotDay) kind = 'wallet-only';
    points.push({ day, isk: lastIsk, layers: snap ? layerValues(snap) : null, kind });
  }
  return { points, firstSnapshotDay, gapDays: findMissingDays(snapDays) };
}

/** Characters that hold every needed permission count toward totals; the rest are named in the scope readout. */
export function partitionByCoverage(
  ids: readonly number[],
  covered: ReadonlySet<number>
): { included: number[]; missing: number[] } {
  return {
    included: ids.filter((id) => covered.has(id)),
    missing: ids.filter((id) => !covered.has(id)),
  };
}

export function totalsFor(
  latest: ReadonlyMap<number, LayerValues>,
  opts: { included: readonly number[]; hidden: readonly number[]; shown: readonly LayerId[] }
): { total: number; perLayer: LayerValues } {
  const perLayer: LayerValues = { isk: 0, assets: 0, escrow: 0, sellOrders: 0 };
  for (const id of opts.included) {
    if (opts.hidden.includes(id)) continue;
    const values = latest.get(id);
    if (!values) continue;
    for (const layer of LAYER_IDS) perLayer[layer] += values[layer];
  }
  return { total: netWorthOf(perLayer, opts.shown), perLayer };
}

/** Last balance of each UTC day from journal entries (`date`, `balance`) — the ISK backfill. */
export function dailyWalletFromJournal(
  entries: readonly { date: string; balance?: number }[]
): Map<string, number> {
  const sorted = entries
    .filter((e): e is { date: string; balance: number } => typeof e.balance === 'number')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const byDay = new Map<string, number>();
  for (const e of sorted) byDay.set(utcDay(Date.parse(e.date)), e.balance);
  return byDay;
}
