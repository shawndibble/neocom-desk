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
import { entryKey, type OreLine } from './types';

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
  /**
   * Set when any half collected this entry's later ore *and* something else
   * still covers the entry. A fused record left alone on its entry always
   * collects, so the flag is cleared rather than stored meaninglessly
   * (`ownership.ts`, and `MiningTaxAssignmentRecord.collectsGrowth`).
   */
  collectsGrowth: boolean;
  /** The joined group the fused record belongs to — whichever half carried one, or absent when neither did. */
  groupId?: string;
}

/** The Payee and rate that decide whether two records are the same obligation. */
function termsKey(a: CoalescableAssignment): string {
  return `${a.payeeId ?? ''}:${a.taxPct}`;
}

function sameLines(a: readonly OreLine[], b: readonly OreLine[]): boolean {
  if (a.length !== b.length) return false;
  const quantities = new Map(b.map((l) => [l.typeId, l.quantity]));
  return a.every((l) => quantities.get(l.typeId) === l.quantity);
}

/** True when the members together hold more of some ore type than the entry does. */
function claimsMoreThan(
  members: readonly CoalescableAssignment[],
  entryLines: readonly OreLine[]
): boolean {
  const claimed = new Map<number, number>();
  for (const m of members) {
    for (const l of m.oreLines) claimed.set(l.typeId, (claimed.get(l.typeId) ?? 0) + l.quantity);
  }
  return entryLines.some((l) => (claimed.get(l.typeId) ?? 0) > l.quantity);
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
 * - Compatible `groupId`s: equal, or one of them absent. A loose half joining
 *   a grouped one is exactly the state "edit the Payee back" produces, and
 *   refusing it would leave the pilot staring at one day listed twice on one
 *   Payee with no way back. Two *rival* groups over one entry do refuse — and
 *   so does a loose half sitting beside them, since which group it belongs to
 *   is not knowable and guessing moves ore between obligations.
 * - `outstanding`, with no recorded payment. A fused record cannot be half
 *   paid, and `paymentLinks.ts`/`madePayments.ts` reference the ids a fuse
 *   would delete. `needs-review` is left alone too: its `reviewDiff` is a
 *   before/after over one record's own snapshot.
 *
 * The surviving record is the lowest id in the set, so a repeated run over
 * unchanged data picks the same one however Dexie ordered the read.
 *
 * Given `entryLinesByKey` (the fresh ledger's ore per entry), records whose
 * ore lines are all identical are told apart: halves that add up to the entry
 * are summed as above, but records that together claim *more* than the entry
 * holds are one obligation stored twice, so the extras are dropped and the
 * kept record's figures stand — summing them doubled the bill. With the entry
 * absent from the map nothing can say which it is, so such a bucket is left
 * alone rather than guessed at.
 */
export function planEntryMerges(
  assignments: readonly CoalescableAssignment[],
  entryLinesByKey?: ReadonlyMap<string, readonly OreLine[]>
): EntryMerge[] {
  // Every Assignment on an entry, whatever its status — a fused record is the
  // entry's sole coverer only if nothing else, fusable or not, covers it too.
  const coverageByEntry = new Map<string, number>();
  for (const a of assignments) {
    const key = entryKey(a.characterId, a.date, a.solarSystemId);
    coverageByEntry.set(key, (coverageByEntry.get(key) ?? 0) + 1);
  }

  const fusable = assignments.filter((a) => a.status === 'outstanding' && !a.hasPayment);
  const buckets = bucket(
    fusable,
    (a) => `${entryKey(a.characterId, a.date, a.solarSystemId)}:${termsKey(a)}`
  );

  const merges: EntryMerge[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const groupIds = new Set(members.map((m) => m.groupId).filter((id) => id !== undefined));
    if (groupIds.size > 1) continue;
    const identical = members.every((m) => sameLines(m.oreLines, members[0].oreLines));
    const entryLines = entryLinesByKey?.get(
      entryKey(members[0].characterId, members[0].date, members[0].solarSystemId)
    );
    if (entryLinesByKey && identical && !entryLines) continue;
    const duplicate = identical && entryLines !== undefined && claimsMoreThan(members, entryLines);
    // A duplicate keeps the joined record when there is one — the corp's bill
    // is the group's — otherwise the lowest id, as ever.
    const ordered = [...members].sort(byId);
    const keeper = duplicate
      ? (ordered.find((m) => m.groupId !== undefined) ?? ordered[0])
      : ordered[0];
    const keep = keeper;
    const absorbed = ordered.filter((m) => m !== keeper);
    const entry = entryKey(keep.characterId, keep.date, keep.solarSystemId);
    const soleAfterMerge = (coverageByEntry.get(entry) ?? 0) - absorbed.length === 1;
    const quantityByType = new Map<number, number>();
    for (const member of members) {
      for (const line of member.oreLines) {
        quantityByType.set(line.typeId, (quantityByType.get(line.typeId) ?? 0) + line.quantity);
      }
    }
    merges.push({
      keepId: keep.id,
      absorbedIds: absorbed.map((a) => a.id),
      oreLines: duplicate
        ? [...keep.oreLines].sort((a, b) => a.typeId - b.typeId)
        : [...quantityByType.entries()]
            .map(([typeId, quantity]) => ({ typeId, quantity }))
            .sort((a, b) => a.typeId - b.typeId),
      estimatedValue: duplicate
        ? keep.estimatedValue
        : members.reduce((sum, m) => sum + m.estimatedValue, 0),
      taxOwed: duplicate ? keep.taxOwed : members.reduce((sum, m) => sum + m.taxOwed, 0),
      collectsGrowth: !soleAfterMerge && members.some((m) => m.collectsGrowth === true),
      ...(groupIds.size === 1 ? { groupId: [...groupIds][0] } : {}),
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
