import { latestRateChange, rateNotice } from '@/engine/corpTaxBook/ownerRate';
import { refineryLabeler } from '@/engine/corpTaxBook/refinery';
import type {
  FeederViewDay,
  FeederViewPayout,
  FeederViewRefinery,
  FeederViewSummary,
} from './feederViewClient';

export type OwnerPageState = 'ended' | 'settled-otherwise' | 'normal';

export function pageState(s: FeederViewSummary): OwnerPageState {
  if (s.status === 'left' || s.status === 'removed') return 'ended';
  return s.mode === 'settled-otherwise' ? 'settled-otherwise' : 'normal';
}

export function payeeIdOf(s: FeederViewSummary): number {
  return s.payee?.id ?? s.feederCorporationId;
}

export function isStale(s: FeederViewSummary): boolean {
  return s.staleSince !== null && pageState(s) !== 'ended';
}

export function isSettledAfterLeaving(s: FeederViewSummary): boolean {
  return pageState(s) === 'ended' && s.balanceKind !== 'owed';
}

export function isDismissed(s: FeederViewSummary): boolean {
  return s.dismissedAt !== null;
}

export type RateNote =
  | { kind: 'none' }
  | { kind: 'plain'; pct: number }
  | { kind: 'set'; pct: number; since: string }
  | { kind: 'override'; agreedPct: number; since: string | null; askedPct: number }
  | { kind: 'asked'; askedPct: number };

export function rateNote(s: FeederViewSummary): RateNote {
  if (s.effectiveRatePct === null)
    return s.requestedRatePct !== null
      ? { kind: 'asked', askedPct: s.requestedRatePct }
      : { kind: 'none' };
  const change = latestRateChange(s.rateHistory);
  if (change) {
    const notice = rateNotice(change);
    return notice.askedPct === undefined
      ? { kind: 'set', pct: notice.pct, since: notice.date }
      : { kind: 'override', agreedPct: notice.pct, since: notice.date, askedPct: notice.askedPct };
  }
  if (s.agreedRatePct !== null) {
    if (s.requestedRatePct !== null && s.requestedRatePct !== s.agreedRatePct) {
      const since =
        [...s.rateHistory].reverse().find((e) => e.kind === 'agreed')?.effectiveFrom ?? null;
      return {
        kind: 'override',
        agreedPct: s.agreedRatePct,
        since,
        askedPct: s.requestedRatePct,
      };
    }
    return { kind: 'plain', pct: s.agreedRatePct };
  }
  if (s.requestedRatePct !== null) return { kind: 'asked', askedPct: s.requestedRatePct };
  return s.effectiveRatePct === null
    ? { kind: 'none' }
    : { kind: 'plain', pct: s.effectiveRatePct };
}

export function owedOnLeaving(s: FeederViewSummary): number {
  return s.balanceKind === 'owed' ? Math.max(0, Math.floor(s.balanceIsk)) : 0;
}

export function parseRequestedRate(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export interface MinedRow {
  key: string;
  date: string;
  characterId: number;
  structureId: number;
  typeId: number | null;
  volume: number;
}

export function minedMonths(days: readonly FeederViewDay[]): string[] {
  return [...new Set(days.map((d) => d.date.slice(0, 7)))].sort().reverse();
}

export function minedDayRows(days: readonly FeederViewDay[], month: string | null): MinedRow[] {
  const byKey = new Map<string, MinedRow>();
  for (const day of days) {
    if (month !== null && !day.date.startsWith(month)) continue;
    for (const line of day.lines) {
      const typeId = line.typeId ?? null;
      const key = `${day.date}:${line.characterId}:${line.structureId}:${typeId ?? ''}`;
      const row = byKey.get(key) ?? {
        key,
        date: day.date,
        characterId: line.characterId,
        structureId: line.structureId,
        typeId,
        volume: 0,
      };
      row.volume += line.quantity ?? line.volume;
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.volume - a.volume || a.key.localeCompare(b.key)
  );
}

export function oreTypeIdsOf(days: readonly FeederViewDay[]): number[] {
  return [
    ...new Set(
      days.flatMap((d) => d.lines.flatMap((l) => (l.typeId === undefined ? [] : [l.typeId])))
    ),
  ];
}

export function characterIdsOf(days: readonly FeederViewDay[]): number[] {
  return [...new Set(days.flatMap((d) => d.lines.map((l) => l.characterId)))];
}

export function viewRefineryLabeler(
  refineries: readonly FeederViewRefinery[],
  names: { systemName?: (solarSystemId: number) => string | undefined; ownerName?: string }
): (structureId: number) => string {
  const byId = new Map(refineries.map((r) => [r.structureId, r]));
  const { ownerName } = names;
  return refineryLabeler({
    officerLabels: (id) => {
      const r = byId.get(id);
      return r?.label ? [{ label: r.label, setAt: r.labelSetAt ?? '' }] : undefined;
    },
    structureName: (id) => byId.get(id)?.structureName ?? undefined,
    systemName: (id) => {
      const system = byId.get(id)?.solarSystemId;
      return system == null ? undefined : names.systemName?.(system);
    },
    ...(ownerName ? { ownerName: () => ownerName } : {}),
    fallback: (id) => `#${id}`,
  });
}

export function payoutRows(payouts: readonly FeederViewPayout[]): FeederViewPayout[] {
  return [...payouts].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}
