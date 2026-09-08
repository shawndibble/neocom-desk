/**
 * A multi-select filter that collapses to `'all'` at both ends: every member
 * selected, or none, both read as "don't filter." Originally
 * `MoonMiningTax.tsx`'s local `toggleFilterMember` (characters, then Payees);
 * shared here once a third caller (the cross-character Wallet/Industry
 * pickers) made a second copy the wrong move.
 */
export type MultiSelectFilter<T> = ReadonlySet<T> | 'all';

/**
 * Flips one member. With a single member the only possible toggle otherwise
 * left an empty set, an empty table, and "0 selected" — collapsing both
 * extremes to `'all'` is what avoids that.
 */
export function toggleFilterMember<T>(
  previous: MultiSelectFilter<T>,
  member: T,
  universe: readonly T[]
): MultiSelectFilter<T> {
  const next = previous === 'all' ? new Set(universe) : new Set(previous);
  if (next.has(member)) next.delete(member);
  else next.add(member);
  return next.size === universe.length || next.size === 0 ? 'all' : next;
}
