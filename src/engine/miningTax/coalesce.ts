/**
 * Putting a joined group back into a consistent shape (issue #523 follow-up).
 *
 * Two stored states the ledger can reach that nothing used to correct:
 *
 * - A **split day that came back together.** `splitAssignment` divides one
 *   Mining Ledger Entry between two Payees; editing the moved half's Payee
 *   back to the original's leaves two Assignments over one entry on identical
 *   terms. That is one obligation stored as two — the pilot sees the same day
 *   listed twice inside a group and cannot get it back to one line.
 * - A **group whose members no longer agree.** `updateAssignment` edits a
 *   single member's Payee/tax %, and a `groupId` survives that edit, so a
 *   group could go on rendering as one row (under whichever Payee happened to
 *   be first) while its members billed two different ones.
 *
 * Both are decided here, purely, so the load-time repair (`features/miningTax/
 * coalesce.ts`) is testable without Dexie — and so the merge arithmetic is the
 * inverse of `split.ts`'s `planSplit` rather than a second, drifting copy.
 */
import type { OreLine } from './types';

/** The fields the two repairs read off a stored Assignment — deliberately narrower than the Dexie record. */
export interface CoalescableAssignment {
  id: string;
  characterId: number;
  date: string;
  solarSystemId: number;
  /** Absent on a dismissal, which never merges anyway. */
  payeeId?: string;
  taxPct: number;
  status: string;
  groupId?: string;
  oreLines: readonly OreLine[];
  estimatedValue: number;
  taxOwed: number;
  collectsGrowth?: boolean;
  /** True when a Settle-up payment is recorded against this record — `paymentLinks.ts` keys off it, so it is never fused away. */
  hasPayment: boolean;
}

/** One set of same-entry Assignments to fuse into the single record `keepId` names. */
export interface EntryMerge {
  keepId: string;
  /** The records folded into `keepId` — the caller deletes these. */
  absorbedIds: string[];
  /** Every half's quantities summed per ore type, sorted by `typeId`. */
  oreLines: OreLine[];
  /**
   * The halves' snapshots added up, never re-priced: each was a real invoice
   * moment, and re-pricing would restate a bill the Payee was already quoted.
   */
  estimatedValue: number;
  taxOwed: number;
  /** Set when any half collected this entry's later ore, so the fused record keeps collecting it. */
  collectsGrowth: boolean;
}

/** The Payee and rate that decide whether two records are the same obligation. */
function termsKey(a: CoalescableAssignment): string {
  return `${a.payeeId ?? ''}:${a.taxPct}`;
}

function byId(a: CoalescableAssignment, b: CoalescableAssignment): number {
  return a.id.localeCompare(b.id);
}

function bucket<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const list = out.get(key(item));
    if (list) list.push(item);
    else out.set(key(item), [item]);
  }
  return out;
}

/**
 * Which Assignments are two halves of one obligation and should be stored as
 * one (the user-visible ask: "items on the same day recombine").
 *
 * Fused only when every one of these holds, because each is a way two records
 * over one entry can mean genuinely different things:
 *
 * - Same character, EVE/UTC date and solar system — i.e. the same Mining
 *   Ledger Entry. Ownership is defined per entry (`ownership.ts`).
 * - Same Payee and tax % — a split to a *second* Payee is the whole point of
 *   `splitAssignment` and must survive.
 * - Same `groupId` (both ungrouped counts as the same) — fusing across two
 *   joined groups would silently move ore between them.
 * - `outstanding`, with no recorded payment. A fused record cannot be half
 *   paid, and `paymentLinks.ts`/`madePayments.ts` reference the ids a fuse
 *   would delete. `needs-review` is left alone too: its `reviewDiff` is a
 *   before/after over one record's own snapshot.
 *
 * The surviving record is the lowest id in the set, so a repeated run over
 * unchanged data picks the same one however Dexie ordered the read.
 */
export function planEntryMerges(assignments: readonly CoalescableAssignment[]): EntryMerge[] {
  const fusable = assignments.filter((a) => a.status === 'outstanding' && !a.hasPayment);
  const buckets = bucket(
    fusable,
    (a) => `${a.characterId}:${a.date}:${a.solarSystemId}:${a.groupId ?? ''}:${termsKey(a)}`
  );

  const merges: EntryMerge[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const [keep, ...absorbed] = [...members].sort(byId);
    const quantityByType = new Map<number, number>();
    for (const member of members) {
      for (const line of member.oreLines) {
        quantityByType.set(line.typeId, (quantityByType.get(line.typeId) ?? 0) + line.quantity);
      }
    }
    merges.push({
      keepId: keep.id,
      absorbedIds: absorbed.map((a) => a.id),
      oreLines: [...quantityByType.entries()]
        .map(([typeId, quantity]) => ({ typeId, quantity }))
        .sort((a, b) => a.typeId - b.typeId),
      estimatedValue: members.reduce((sum, m) => sum + m.estimatedValue, 0),
      taxOwed: members.reduce((sum, m) => sum + m.taxOwed, 0),
      collectsGrowth: members.some((m) => m.collectsGrowth === true),
    });
  }
  return merges;
}

/**
 * Which Assignments must lose their `groupId` — the ids of members that no
 * longer belong to the group they carry.
 *
 * A joined group is one obligation billed to one Payee at one rate (the
 * decision doc's merge rule), and the ledger renders it as a single row under
 * a single Payee name. So a member edited onto different terms is not a
 * member any more; it has to fall out and stand as its own row, which is what
 * a pilot moving part of a haul to a second Payee is asking for.
 *
 * The group's real terms are its **earliest-dated** member's (lowest id
 * breaks a tie) — the entry the join was anchored on, and a choice that does
 * not change when a later member is edited. A group left with fewer than two
 * agreeing members is dissolved outright rather than left as a group of one.
 */
export function planGroupEjections(assignments: readonly CoalescableAssignment[]): string[] {
  const grouped = assignments.filter((a) => a.groupId !== undefined);
  const ejected: string[] = [];

  for (const members of bucket(grouped, (a) => a.groupId!).values()) {
    const anchor = [...members].sort((a, b) => a.date.localeCompare(b.date) || byId(a, b))[0];
    const disagreeing = members.filter((m) => termsKey(m) !== termsKey(anchor));
    const survivors = members.length - disagreeing.length;
    ejected.push(...(survivors < 2 ? members : disagreeing).map((m) => m.id));
  }
  return ejected.sort((a, b) => a.localeCompare(b));
}
