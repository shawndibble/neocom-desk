import type { OreLine, QuantityDiff } from './types';

export interface SplitPlan {
  kept: OreLine[];
  moved: OreLine[];
}

export function maxUnreportedClaim(held: number): number {
  return held;
}

export function planSplit(
  original: readonly OreLine[],
  moves: readonly OreLine[],
  unreported: readonly OreLine[] = []
): SplitPlan {
  const moveByType = new Map<number, number>();
  for (const move of moves) {
    if (move.quantity <= 0) continue;
    const held = original.find((l) => l.typeId === move.typeId)?.quantity ?? 0;
    if (move.quantity > held) {
      throw new Error(`Cannot move ${move.quantity} of type ${move.typeId}: only ${held} held`);
    }
    moveByType.set(move.typeId, move.quantity);
  }
  const extraByType = new Map<number, number>();
  for (const extra of unreported) {
    if (extra.quantity <= 0) continue;
    const held = original.find((l) => l.typeId === extra.typeId)?.quantity;
    if (held === undefined) {
      throw new Error(`Cannot claim more of type ${extra.typeId}: none held`);
    }
    if (extra.quantity > maxUnreportedClaim(held)) {
      throw new Error(`Cannot claim ${extra.quantity} more of type ${extra.typeId}: ${held} held`);
    }
    if (moveByType.has(extra.typeId)) {
      throw new Error(`Cannot both move and claim more of type ${extra.typeId}`);
    }
    extraByType.set(extra.typeId, extra.quantity);
  }
  const kept = original
    .map((line) => ({
      typeId: line.typeId,
      quantity:
        line.quantity - (moveByType.get(line.typeId) ?? 0) + (extraByType.get(line.typeId) ?? 0),
    }))
    .filter((line) => line.quantity > 0);
  const moved = original
    .filter((line) => moveByType.has(line.typeId))
    .map((line) => ({ typeId: line.typeId, quantity: moveByType.get(line.typeId)! }));
  return { kept, moved };
}

export function growthMoves(diffs: readonly QuantityDiff[], lines: readonly OreLine[]): OreLine[] {
  const moves: OreLine[] = [];
  for (const diff of diffs) {
    const held = lines.find((l) => l.typeId === diff.typeId)?.quantity ?? 0;
    const quantity = Math.min(diff.after - diff.before, held);
    if (quantity > 0) moves.push({ typeId: diff.typeId, quantity });
  }
  return moves;
}
