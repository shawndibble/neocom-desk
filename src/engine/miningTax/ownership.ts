import type { OreLine } from './types';

/** The slice of one Mining Ledger Entry an Assignment already claims, plus whether it is the entry's growth collector. */
export interface CoveringAssignment {
  id: string;
  oreLines: readonly OreLine[];
  /** Only meaningful when 2+ Assignments cover the entry; a sole Assignment always collects. */
  collectsGrowth?: boolean;
}

export interface Ownership {
  /** Ore no Assignment owns — what the "Unassigned" residual row shows and what a fresh Assign form offers. */
  unassigned: OreLine[];
  /**
   * Per Assignment id, the entry lines it should be diffed and re-snapshotted
   * against: its own quantities, plus every later residual when it is the
   * collector. Never smaller than the Assignment's own snapshot.
   */
  ownedLines: Map<string, OreLine[]>;
}

function sortedByType(lines: readonly OreLine[]): OreLine[] {
  return [...lines].sort((a, b) => a.typeId - b.typeId);
}

/** The fresh entry lines one Assignment should be diffed and re-snapshotted against — its own snapshot when the ownership rule has nothing more for it. */
export function linesOwnedBy(
  entryLines: readonly OreLine[],
  covering: readonly CoveringAssignment[],
  assignmentId: string
): OreLine[] {
  // Every covering id is seeded into `ownedLines`, so a miss means the id
  // simply isn't among `covering`.
  return computeOwnership(entryLines, covering).ownedLines.get(assignmentId) ?? [];
}

/**
 * Who owns which units of one Mining Ledger Entry (issue #523, quantity
 * split). ESI aggregates a whole EVE/UTC day into one entry, so two
 * local-time sessions at two corps' moons in one system land in the same
 * entry and have to be split by quantity — and any ore ESI reports for that
 * day *later* has to go to exactly one side.
 *
 * - Per ore type, the residual is `entry quantity − Σ covering quantities`.
 * - The entry's **growth collector** is the sole Assignment when there is
 *   exactly one (a continuous single-Payee session must never spawn a second
 *   "Unassigned" row for a new ore type mid-day), or the one flagged
 *   `collectsGrowth` when there are several. A collector owns every residual
 *   — reconcile flips it to `needs-review`, nothing becomes unassigned, and
 *   no other Assignment ever grows.
 * - With several Assignments and no flag (a split made before the flag
 *   existed): a type claimed by exactly one Assignment grows into it; a type
 *   claimed by none, or by two or more, stays an unassigned residual until a
 *   collector is chosen.
 *
 * A snapshot is never shrunk: an entry reporting *less* than an Assignment
 * holds (ESI settling, or a pilot-corrected line) leaves that Assignment's
 * own lines as they are.
 */
export function computeOwnership(
  entryLines: readonly OreLine[],
  covering: readonly CoveringAssignment[]
): Ownership {
  const ownedLines = new Map<string, OreLine[]>();
  if (covering.length === 0) {
    return { unassigned: sortedByType([...entryLines]), ownedLines };
  }

  const collector =
    covering.length === 1 ? covering[0] : covering.find((c) => c.collectsGrowth === true);

  // Each Assignment starts by owning exactly its own snapshot.
  const ownedByType = new Map<string, Map<number, number>>();
  for (const c of covering) {
    ownedByType.set(c.id, new Map(c.oreLines.map((line) => [line.typeId, line.quantity])));
  }

  const unassigned: OreLine[] = [];
  for (const line of entryLines) {
    const claimants = covering.filter((c) => ownedByType.get(c.id)!.has(line.typeId));
    const covered = claimants.reduce(
      (sum, c) => sum + (ownedByType.get(c.id)?.get(line.typeId) ?? 0),
      0
    );
    const residual = line.quantity - covered;
    if (residual <= 0) continue;

    const grower = collector ?? (claimants.length === 1 ? claimants[0] : undefined);
    if (grower) {
      const mine = ownedByType.get(grower.id)!;
      mine.set(line.typeId, (mine.get(line.typeId) ?? 0) + residual);
    } else {
      unassigned.push({ typeId: line.typeId, quantity: residual });
    }
  }

  for (const [id, byType] of ownedByType) {
    ownedLines.set(
      id,
      sortedByType([...byType.entries()].map(([typeId, quantity]) => ({ typeId, quantity })))
    );
  }
  return { unassigned: sortedByType(unassigned), ownedLines };
}

/** The fields `findDuplicateAssignmentIds` reads off a stored Assignment — narrower than the Dexie record, so the engine stays Dexie-free. */
export interface DuplicateCandidate {
  id: string;
  oreLines: readonly OreLine[];
  payeeId?: string;
  taxPct: number;
  status: string;
}

function linesSignature(lines: readonly OreLine[]): string {
  return sortedByType(lines)
    .map((l) => `${l.typeId}:${l.quantity}`)
    .join('|');
}

/**
 * Ids of Assignments that look like the same obligation stored twice over one
 * Mining Ledger Entry. Two things must both hold, because each alone has an
 * innocent reading:
 *
 * - Identical Payee, tax % and ore lines — a split between two Payees, or two
 *   halves of one day, differ in at least one of them.
 * - The covering Assignments together claim more of some ore type than the
 *   entry holds — identical halves that add up to the entry are a split moved
 *   back, and a ledger that merely shrank under a lone record (ESI settling,
 *   `computeOwnership`'s "a snapshot is never shrunk") has no twin to flag.
 *
 * Dismissals never count: they hold no Payee and owe nothing. Every member of
 * a flagged set is returned, since nothing here can say which of two identical
 * records the pilot meant to keep.
 */
export function findDuplicateAssignmentIds(
  entryLines: readonly OreLine[],
  covering: readonly DuplicateCandidate[]
): string[] {
  const live = covering.filter((c) => c.status !== 'dismissed');
  const claimedByType = new Map<number, number>();
  for (const c of live) {
    for (const line of c.oreLines) {
      claimedByType.set(line.typeId, (claimedByType.get(line.typeId) ?? 0) + line.quantity);
    }
  }
  const entryByType = new Map(entryLines.map((l) => [l.typeId, l.quantity]));

  const sets = new Map<string, DuplicateCandidate[]>();
  for (const c of live) {
    const key = `${c.payeeId ?? ''}:${c.taxPct}:${linesSignature(c.oreLines)}`;
    const members = sets.get(key);
    if (members) members.push(c);
    else sets.set(key, [c]);
  }
  // Over-claim is judged on each identical set's own ore types, so a pile-up on
  // one type never taints an unrelated identical pair on another.
  return [...sets.values()]
    .filter(
      (members) =>
        members.length > 1 &&
        members[0].oreLines.some(
          (l) => (claimedByType.get(l.typeId) ?? 0) > (entryByType.get(l.typeId) ?? 0)
        )
    )
    .flatMap((members) => members.map((m) => m.id));
}
