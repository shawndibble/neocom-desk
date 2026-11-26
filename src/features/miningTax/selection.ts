import type { MiningTaxAssignmentRecord } from '@/db';
import { allMembers, type DisplayRow, type GroupMember } from './groupRows';

export type CombineBlocker =
  'too-few' | 'mixed-character' | 'mixed-system' | 'multiple-groups' | 'mixed-terms';

export interface CombineTerms {
  payeeId: string;
  taxPct: number;
}

export type CombineEligibility =
  | {
      ok: true;
      rows: DisplayRow[];
      terms: CombineTerms | null;
    }
  | { ok: false; reason: CombineBlocker };

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

export function settleUpMembers(selected: readonly DisplayRow[]): GroupMember[] {
  return selected
    .flatMap((dr) => allMembers(dr))
    .filter((m) => m.assignment.status === 'outstanding');
}

export function dismissableRows(selected: readonly DisplayRow[]): DisplayRow[] {
  return selected.filter((dr) => dr.assignment === null && dr.row.unassignedOreLines.length > 0);
}
