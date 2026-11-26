import { clamp, sum } from '../math';
import type { OreLine } from './types';

export interface CoveringAssignment {
  id: string;
  oreLines: readonly OreLine[];
  collectsGrowth?: boolean;
  status?: string;
  releasedTypeIds?: readonly number[];
}

export interface Ownership {
  unassigned: OreLine[];
  ownedLines: Map<string, OreLine[]>;
  released: OreLine[];
}

function sortedByType(lines: readonly OreLine[]): OreLine[] {
  return [...lines].sort((a, b) => a.typeId - b.typeId);
}

export function linesOwnedBy(
  entryLines: readonly OreLine[],
  covering: readonly CoveringAssignment[],
  assignmentId: string
): OreLine[] {
  return computeOwnership(entryLines, covering).ownedLines.get(assignmentId) ?? [];
}

export function growthCollector<T extends CoveringAssignment>(
  covering: readonly T[]
): T | undefined {
  return covering.length === 1 ? covering[0] : covering.find((c) => c.collectsGrowth === true);
}

export function computeOwnership(
  entryLines: readonly OreLine[],
  covering: readonly CoveringAssignment[]
): Ownership {
  const ownedLines = new Map<string, OreLine[]>();
  if (covering.length === 0) {
    return { unassigned: sortedByType([...entryLines]), ownedLines, released: [] };
  }

  const collector = growthCollector(covering);

  const ownedByType = new Map<string, Map<number, number>>();
  for (const c of covering) {
    ownedByType.set(c.id, new Map(c.oreLines.map((line) => [line.typeId, line.quantity])));
  }

  const released = new Set(covering.flatMap((c) => c.releasedTypeIds ?? []));

  const unassigned: OreLine[] = [];
  const releasedOre: OreLine[] = [];
  for (const line of entryLines) {
    if (released.has(line.typeId)) {
      const held = covering.reduce(
        (sum, c) => sum + (ownedByType.get(c.id)?.get(line.typeId) ?? 0),
        0
      );
      if (line.quantity > held)
        releasedOre.push({ typeId: line.typeId, quantity: line.quantity - held });
      continue;
    }
    const claimants = covering.filter((c) => ownedByType.get(c.id)!.has(line.typeId));
    const covered = claimants.reduce(
      (sum, c) => sum + (ownedByType.get(c.id)?.get(line.typeId) ?? 0),
      0
    );
    const residual = line.quantity - covered;
    if (residual <= 0) continue;

    const grower = collector ?? (claimants.length === 1 ? claimants[0] : undefined);
    if (grower && grower.status !== 'paid') {
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
  return { unassigned: sortedByType(unassigned), ownedLines, released: sortedByType(releasedOre) };
}

export interface UnreportedClaim {
  typeId: number;
  claimed: number;
  reported: number;
}

export function unreportedClaims(
  entryLines: readonly OreLine[],
  covering: readonly CoveringAssignment[],
  assignmentId: string
): UnreportedClaim[] {
  const own = covering.find((c) => c.id === assignmentId);
  if (!own) return [];
  const out: UnreportedClaim[] = [];
  for (const line of sortedByType(own.oreLines)) {
    const entry = entryLines.find((l) => l.typeId === line.typeId)?.quantity ?? 0;
    const others = sum(
      covering
        .filter((c) => c.id !== assignmentId)
        .map((c) => c.oreLines.find((l) => l.typeId === line.typeId)?.quantity ?? 0)
    );
    const reported = clamp(entry - others, 0, line.quantity);
    if (reported < line.quantity)
      out.push({ typeId: line.typeId, claimed: line.quantity, reported });
  }
  return out;
}

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
