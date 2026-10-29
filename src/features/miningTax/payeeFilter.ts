import type { UrlParamCodec } from '@/lib/urlState';
import type { DisplayRow } from '@/features/miningTax/groupRows';

/**
 * The Payee filter: some Payees, `'all'`, or `'none'` (Select none: the Open
 * list shows nothing). Unlike the shared `MultiSelectFilter`, nothing ticked
 * is its own state here, not "all".
 */
export type PayeeFilter = ReadonlySet<string> | 'all' | 'none';

/**
 * `payeeFilter` as a URL query param: a comma-separated set of Payee ids,
 * absent means "all", `none` means no Payee (a Payee id is a UUID, never
 * the word "none").
 */
export function payeeFilterParam(): UrlParamCodec<PayeeFilter> {
  return {
    parse: (raw) =>
      raw === null || raw === '' ? 'all' : raw === 'none' ? 'none' : new Set(raw.split(',')),
    serialize: (value) =>
      value === 'all' ? null : value === 'none' ? 'none' : [...value].sort().join(','),
  };
}

/**
 * `payeeFilter` is URL-held, so a stale or hand-edited link can name Payee
 * ids nobody tracked has — the codec can't validate that itself (it has no
 * access to the Payees), so unknown ids are dropped here instead, the same
 * "unknown value falls back to the default" rule the codecs otherwise apply
 * themselves. Emptying out entirely (every id unknown) reads as no filter.
 */
export function resolvePayeeFilter(
  payeeFilter: PayeeFilter,
  payeeIds: readonly string[]
): PayeeFilter {
  if (payeeFilter === 'all') return payeeFilter;
  // No Payees left means no dropdown to leave "none" with.
  if (payeeFilter === 'none') return payeeIds.length === 0 ? 'all' : payeeFilter;
  const known = new Set(payeeIds);
  const kept = new Set([...payeeFilter].filter((id) => known.has(id)));
  return kept.size === 0 || kept.size === known.size ? 'all' : kept;
}

/**
 * Filtering "by Payee" only makes sense for rows that already have one —
 * an unassigned or dismissed row has no Payee to match, so it drops out as
 * soon as a specific Payee is selected.
 */
export function filterRowsByPayee(rows: DisplayRow[], resolved: PayeeFilter): DisplayRow[] {
  if (resolved === 'all') return rows;
  if (resolved === 'none') return [];
  return rows.filter(
    (dr) => dr.assignment?.payeeId !== undefined && resolved.has(dr.assignment.payeeId)
  );
}

/**
 * Not the shared `toggleFilterMember`: unticking the last Payee lands in
 * "none" here, not back on "all" (Select none, #5413).
 */
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

/** Whether the filter is narrowed to exactly this one Payee. */
export function isSolePayeeFilter(resolved: PayeeFilter, payeeId: string): boolean {
  return resolved !== 'all' && resolved !== 'none' && resolved.size === 1 && resolved.has(payeeId);
}
