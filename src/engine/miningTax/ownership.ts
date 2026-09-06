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
  const own = covering.find((c) => c.id === assignmentId);
  return (
    computeOwnership(entryLines, covering).ownedLines.get(assignmentId) ??
    (own ? [...own.oreLines] : [])
  );
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
    const claimants = covering.filter((c) => c.oreLines.some((l) => l.typeId === line.typeId));
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
