import type { UrlParamCodec } from '@/lib/urlState';
import type { DisplayRow } from '@/features/miningTax/groupRows';

export type PayeeFilter = ReadonlySet<string> | 'all' | 'none';

export function payeeFilterParam(): UrlParamCodec<PayeeFilter> {
  return {
    parse: (raw) =>
      raw === null || raw === '' ? 'all' : raw === 'none' ? 'none' : new Set(raw.split(',')),
    serialize: (value) =>
      value === 'all' ? null : value === 'none' ? 'none' : [...value].sort().join(','),
  };
}

export function resolvePayeeFilter(
  payeeFilter: PayeeFilter,
  payeeIds: readonly string[]
): PayeeFilter {
  if (payeeFilter === 'all') return payeeFilter;
  if (payeeFilter === 'none') return payeeIds.length === 0 ? 'all' : payeeFilter;
  const known = new Set(payeeIds);
  const kept = new Set([...payeeFilter].filter((id) => known.has(id)));
  return kept.size === 0 || kept.size === known.size ? 'all' : kept;
}

export const canonicalPayeeId = (aliases: ReadonlyMap<string, string>, payeeId: string): string =>
  aliases.get(payeeId) ?? payeeId;

export function canonicalizePayeeFilter(
  payeeFilter: PayeeFilter,
  aliases: ReadonlyMap<string, string>
): PayeeFilter {
  if (payeeFilter === 'all' || payeeFilter === 'none') return payeeFilter;
  return new Set([...payeeFilter].map((id) => canonicalPayeeId(aliases, id)));
}

export function filterRowsByPayee(
  rows: DisplayRow[],
  resolved: PayeeFilter,
  aliases: ReadonlyMap<string, string> = new Map()
): DisplayRow[] {
  if (resolved === 'all') return rows;
  if (resolved === 'none') return [];
  return rows.filter((dr) => {
    const id = dr.assignment?.payeeId;
    return id !== undefined && resolved.has(canonicalPayeeId(aliases, id));
  });
}

export function togglePayeeFilter(
  resolved: PayeeFilter,
  universe: readonly string[],
  payeeId: string
): PayeeFilter {
  const next =
    resolved === 'all'
      ? new Set(universe)
      : resolved === 'none'
        ? new Set<string>()
        : new Set(resolved);
  if (next.has(payeeId)) next.delete(payeeId);
  else next.add(payeeId);
  return next.size === universe.length ? 'all' : next.size === 0 ? 'none' : next;
}
