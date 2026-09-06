import type { OreLine } from './types';

export type MiningTaxRowStatus =
  'unassigned' | 'outstanding' | 'paid' | 'needs-review' | 'dismissed';

/**
 * A status's i18n key segment (`miningTax.status.<key>`), not the status
 * string itself: `'needs-review'` cannot be a JSON key path segment, and a
 * `.replace('-', '')` string-munge at each call site would silently mis-key
 * the moment a second hyphenated status is added. Plain data (no i18next
 * import — this file stays engine-pure) shared by the route and
 * `RowDetailModal.tsx` so both build the same translation key.
 */
export const STATUS_LABEL_KEY: Record<MiningTaxRowStatus, string> = {
  unassigned: 'unassigned',
  'needs-review': 'needsReview',
  outstanding: 'outstanding',
  paid: 'paid',
  dismissed: 'dismissed',
};

/**
 * The entry's ore lines nothing covers yet. A *sole* Assignment (the common,
 * single-Payee case) owns the whole entry — including ore types that show up
 * after it was made, so a continuous mining session doesn't spawn a new
 * "Unassigned" row every time a different moon-goo type turns up that day —
 * so this returns `[]` outright whenever exactly one Assignment covers the
 * entry, regardless of which lines it names.
 *
 * Only when an entry is genuinely *split* across two or more Assignments
 * (the two-corps-one-system-one-day case) does this fall back to a
 * presence-based residual per typeId: a split assigns a *whole* ore line to
 * a Payee, never a partial quantity of one, so a typeId any covering
 * Assignment already names is fully spoken for — and a brand-new type has no
 * obvious owner among several, so it stays a residual needing an explicit
 * choice.
 */
export function unassignedOreLines(
  entryLines: readonly OreLine[],
  coveringOreLines: readonly (readonly OreLine[])[]
): OreLine[] {
  if (coveringOreLines.length === 1) return [];
  const coveredTypeIds = new Set<number>();
  for (const lines of coveringOreLines) {
    for (const line of lines) coveredTypeIds.add(line.typeId);
  }
  return entryLines.filter((line) => !coveredTypeIds.has(line.typeId));
}

/**
 * The subset of `freshLines` whose typeId `assignedLines` claims — for a
 * *split* entry (`siblingAssignmentCount` > 1), the only fresh lines an
 * Assignment may safely re-snapshot to, since a brand-new type has no clear
 * owner among several Assignments and must not be silently claimed by one of
 * them.
 */
function linesClaimedBy(
  assignedLines: readonly OreLine[],
  freshLines: readonly OreLine[]
): OreLine[] {
  return freshLines.filter((line) =>
    assignedLines.some((covered) => covered.typeId === line.typeId)
  );
}

/**
 * The fresh entry lines one Assignment should be diffed and re-snapshotted
 * against. Mirrors `unassignedOreLines`'s sole-vs-split rule: a *sole*
 * Assignment owns the whole entry, so growth in *any* line — including a
 * brand-new ore type that shows up mid-session — folds into it as a
 * `needs-review` flip rather than spawning a separate, separately-assignable
 * "Unassigned" row for the same day and system. A *split* entry keeps the
 * narrower `linesClaimedBy` behavior, since a brand-new type has no obvious
 * owner among several Payees.
 *
 * Shared by `reconcile.ts` (diffing against a fresh ledger read) and
 * `assignments.ts`'s `resolveNeedsReview` (re-snapshotting to it).
 */
export function linesOwnedByAssignment(
  assignedLines: readonly OreLine[],
  freshEntryLines: readonly OreLine[],
  siblingAssignmentCount: number
): OreLine[] {
  if (siblingAssignmentCount <= 1) return [...freshEntryLines];
  return linesClaimedBy(assignedLines, freshEntryLines);
}
