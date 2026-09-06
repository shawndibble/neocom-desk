/**
 * What the ledger's checkbox selection can actually be done with (issue #539).
 * Pure, so the toolbar's three enable/disable decisions — and the combine
 * rules that protect an existing join from being fractured — are testable
 * without the route's ESI/Dexie-backed snapshot.
 */
import type { MiningTaxAssignmentRecord } from '@/db';
import { allMembers, type DisplayRow, type GroupMember } from './groupRows';

/** Why the current selection cannot be combined — each maps to a one-line reason in the toolbar. */
export type CombineBlocker =
  'too-few' | 'mixed-character' | 'mixed-system' | 'multiple-groups' | 'mixed-terms';

/** The Payee and rate a combined group settles on, or `null` when every member is still unassigned and the pilot must pick. */
export interface CombineTerms {
  payeeId: string;
  taxPct: number;
}

export type CombineEligibility =
  | {
      ok: true;
      /**
       * Exactly what to hand `joinAssignments` — one entry per selected row,
       * each represented by its own `row`/`assignment` pair. A group's
       * siblings are deliberately absent: they already carry the `groupId`,
       * so re-tagging them is a no-op write, and including them would make
       * the same group count twice.
       */
      rows: DisplayRow[];
      terms: CombineTerms | null;
    }
  | { ok: false; reason: CombineBlocker };

/**
 * The single Payee and rate a set of Assignments agrees on — the decision
 * doc's merge rule, in one place.
 *
 * `terms: null` means none of them is assigned yet, so the pilot picks;
 * `ok: false` means they disagree and must not be joined at all.
 *
 * Exported because `joinAssignments` deliberately re-checks nothing and trusts
 * its caller — and it has two callers. The selection toolbar's Combine reaches
 * it through `combineEligibility`; `JoinAssignDialog`'s own candidate picker
 * reaches it directly. Two independent copies of this rule is precisely how
 * the two paths drift apart.
 */
export function agreedTerms(
  assignments: readonly MiningTaxAssignmentRecord[]
): { ok: true; terms: CombineTerms | null } | { ok: false } {
  if (new Set(assignments.map((a) => `${a.payeeId ?? ''}:${a.taxPct}`)).size > 1) {
    return { ok: false };
  }
  const first = assignments[0];
  return {
    ok: true,
    terms: first?.payeeId === undefined ? null : { payeeId: first.payeeId, taxPct: first.taxPct },
  };
}

/**
 * Whether these rows can become one combined obligation, and on whose terms.
 *
 * Beyond the v1 same-character/same-system/same-terms merge rule this adds the
 * constraint that makes an N-way join safe: **at most one distinct `groupId`**.
 * `joinAssignments` adopts the first `groupId` it finds among the members it is
 * given, so a selection spanning two existing groups would re-tag one group's
 * selected member while its non-selected siblings kept the old id — two
 * half-groups, and no error to notice it by. One group plus ungrouped rows is
 * fine and means "add these to that group".
 *
 * Terms are checked across *every* member of every selected row, not just each
 * row's primary: a per-member edit (`GroupSummaryModal`) can leave a group's own
 * members disagreeing on Payee or rate, and combining more rows into it would
 * only compound that.
 */
export function combineEligibility(selected: readonly DisplayRow[]): CombineEligibility {
  if (selected.length < 2) return { ok: false, reason: 'too-few' };

  if (new Set(selected.map((dr) => dr.row.characterId)).size > 1) {
    return { ok: false, reason: 'mixed-character' };
  }
  if (new Set(selected.map((dr) => dr.row.entry.solarSystemId)).size > 1) {
    return { ok: false, reason: 'mixed-system' };
  }

  const groupIds = new Set(
    selected.map((dr) => dr.assignment?.groupId).filter((id): id is string => id !== undefined)
  );
  if (groupIds.size > 1) return { ok: false, reason: 'multiple-groups' };

  const agreed = agreedTerms(selected.flatMap((dr) => allMembers(dr)).map((m) => m.assignment));
  if (!agreed.ok) return { ok: false, reason: 'mixed-terms' };

  return { ok: true, rows: [...selected], terms: agreed.terms };
}

/**
 * The Assignments a settle-up over this selection would actually bill. A
 * selected joined row expands to every *actually*-outstanding member — a mixed
 * group's already-paid member must not be billed a second time just because the
 * group itself reads as Outstanding (worst-status-wins).
 */
export function settleUpMembers(selected: readonly DisplayRow[]): GroupMember[] {
  return selected
    .flatMap((dr) => allMembers(dr))
    .filter((m) => m.assignment.status === 'outstanding');
}

/**
 * The rows a bulk dismiss would dismiss — the still-unassigned ones only.
 * `dismissEntry` is defined over `row.unassignedOreLines`, so an assigned row
 * has nothing for it to act on; those stay in the selection and are simply not
 * counted by the Dismiss button.
 */
export function dismissableRows(selected: readonly DisplayRow[]): DisplayRow[] {
  return selected.filter((dr) => dr.assignment === null && dr.row.unassignedOreLines.length > 0);
}
