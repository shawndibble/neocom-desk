/**
 * Pure logic behind the moon owner page (#4512): what the plain statement says,
 * the rate line, who mined where, and which state the page is in. No fetch, no
 * React: it reads the server-written view (`feederViewClient.ts`).
 */
import { latestRateChange, rateNotice } from '@/engine/corpTaxBook/ownerRate';
import { refineryLabeler } from '@/engine/corpTaxBook/refinery';
import type {
  FeederViewDay,
  FeederViewPayout,
  FeederViewRefinery,
  FeederViewSummary,
} from './feederViewClient';

/** The page's state, in the order its banners and sections take over. */
export type OwnerPageState = 'ended' | 'settled-otherwise' | 'normal';

export function pageState(s: FeederViewSummary): OwnerPageState {
  if (s.status === 'left' || s.status === 'removed') return 'ended';
  return s.mode === 'settled-otherwise' ? 'settled-otherwise' : 'normal';
}

/** The ledger cannot be read: banner with Reconnect, over an active or disconnected owner. */
/** Who the moon owner is paid as: its payee, or the moon owner corporation itself when none is set. */
export function payeeIdOf(s: FeederViewSummary): number {
  return s.payee?.id ?? s.feederCorporationId;
}

export function isStale(s: FeederViewSummary): boolean {
  return s.staleSince !== null && pageState(s) !== 'ended';
}

/** After leaving, once nothing is owed, the section folds to one line. */
export function isSettledAfterLeaving(s: FeederViewSummary): boolean {
  return pageState(s) === 'ended' && s.balanceKind !== 'owed';
}

/** Dismissed by the officers: the after-leaving section is gone. */
export function isDismissed(s: FeederViewSummary): boolean {
  return s.dismissedAt !== null;
}

export type RateNote =
  | { kind: 'none' }
  | { kind: 'plain'; pct: number }
  /** The accounting corporation set the rate; they never asked, or asked for the same. */
  | { kind: 'set'; pct: number; since: string }
  /** The accounting corporation set a rate other than the one asked for. */
  | { kind: 'override'; agreedPct: number; since: string | null; askedPct: number }
  /** Asked for a rate, nothing agreed yet. */
  | { kind: 'asked'; askedPct: number };

/** The rate line: the agreed rate wins; a different request is shown beside it. */
export function rateNote(s: FeederViewSummary): RateNote {
  // No effective rate means nothing is owed: stale history must not read as a rate set.
  if (s.effectiveRatePct === null) return { kind: 'none' };
  // The rate-changed event drives the line; records with no event fall back to the plain fields.
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
  if (s.requestedRatePct !== null) return { kind: 'plain', pct: s.requestedRatePct };
  return s.effectiveRatePct === null
    ? { kind: 'none' }
    : { kind: 'plain', pct: s.effectiveRatePct };
}

/** What is still owed to the moon owner, in whole ISK, for the Leave dialog. */
export function owedOnLeaving(s: FeederViewSummary): number {
  return s.balanceKind === 'owed' ? Math.max(0, Math.floor(s.balanceIsk)) : 0;
}

/** Whether a request for `pct` is a real change worth sending. */
export function parseRequestedRate(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export interface MinedRow {
  key: string;
  characterId: number;
  structureId: number;
  volume: number;
  valueIsk: number;
}

/** Mined per character and refinery over the covered days, biggest value first. All of it, none capped. */
export function minedRows(days: readonly FeederViewDay[]): MinedRow[] {
  const byKey = new Map<string, MinedRow>();
  for (const day of days)
    for (const line of day.lines) {
      const key = `${line.characterId}:${line.structureId}`;
      const row = byKey.get(key) ?? {
        key,
        characterId: line.characterId,
        structureId: line.structureId,
        volume: 0,
        valueIsk: 0,
      };
      row.volume += line.volume;
      row.valueIsk += line.valueIsk;
      byKey.set(key, row);
    }
  return [...byKey.values()].sort((a, b) => b.valueIsk - a.valueIsk || a.key.localeCompare(b.key));
}

export function characterIdsOf(days: readonly FeederViewDay[]): number[] {
  return [...new Set(days.flatMap((d) => d.lines.map((l) => l.characterId)))];
}

/**
 * Each refinery cell on the moon owner's own page, through the label chain (#4640): the label
 * either side set, the system its rows recorded, then the moon owner's name plus the id. The
 * structure name is not readable here (the grant is ledger-only).
 */
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
    systemName: (id) => {
      const system = byId.get(id)?.solarSystemId;
      return system == null ? undefined : names.systemName?.(system);
    },
    ...(ownerName ? { ownerName: () => ownerName } : {}),
    fallback: (id) => `#${id}`,
  });
}

/** Newest payment first. */
export function payoutRows(payouts: readonly FeederViewPayout[]): FeederViewPayout[] {
  return [...payouts].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}
