import type { OreLine } from './types';

export interface SplitPlan {
  /** What the original keeps, per type — lines that would hit zero are dropped. */
  kept: OreLine[];
  /** What moves to the new Assignment — zero-quantity moves are dropped. */
  moved: OreLine[];
}

/**
 * The kept/moved halves of a quantity split (issue #523) — one shape shared
 * by the Split dialog's live preview and `splitAssignment`'s commit, so the
 * figures a pilot sees are exactly what gets stored. Throws on a move the
 * original cannot cover; clamping silently would let a typo move the wrong
 * amount of a real obligation.
 */
export function planSplit(original: readonly OreLine[], moves: readonly OreLine[]): SplitPlan {
  const moveByType = new Map<number, number>();
  for (const move of moves) {
    if (move.quantity <= 0) continue;
    const held = original.find((l) => l.typeId === move.typeId)?.quantity ?? 0;
    if (move.quantity > held) {
      throw new Error(`Cannot move ${move.quantity} of type ${move.typeId}: only ${held} held`);
    }
    moveByType.set(move.typeId, move.quantity);
  }
  const kept = original
    .map((line) => ({
      typeId: line.typeId,
      quantity: line.quantity - (moveByType.get(line.typeId) ?? 0),
    }))
    .filter((line) => line.quantity > 0);
  const moved = original
    .filter((line) => moveByType.has(line.typeId))
    .map((line) => ({ typeId: line.typeId, quantity: moveByType.get(line.typeId)! }));
  return { kept, moved };
}
