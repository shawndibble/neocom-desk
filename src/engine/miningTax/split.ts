import type { OreLine, QuantityDiff } from './types';

export interface SplitPlan {
  /** What the original keeps, per type — lines that would hit zero are dropped. */
  kept: OreLine[];
  /** What moves to the new Assignment — zero-quantity moves are dropped. */
  moved: OreLine[];
}

/**
 * The most ore a split may claim past what ESI holds of one type: as much again (a keep of at
 * most double). ESI trails the client by up to an hour, so a real claim is a session's last
 * stretch, not a second day — a bigger figure almost always counts ore mined after 00:00 UTC,
 * which ESI files on the next day's entry and would bill twice. See decision 20261115-205445.
 */
export function maxUnreportedClaim(held: number): number {
  return held;
}

/**
 * The kept/moved halves of a quantity split (issue #523) — one shape shared
 * by the Split dialog's live preview and `splitAssignment`'s commit, so the
 * figures a pilot sees are exactly what gets stored. Throws on a move the
 * original cannot cover; clamping silently would let a typo move the wrong
 * amount of a real obligation.
 *
 * `unreported` is ore the pilot knows the original's Payee is owed but ESI
 * has not reported yet (issue #6180: the client's figure runs ahead of the
 * ledger). It is added to the kept side, so that side claims more than the
 * entry holds; `computeOwnership` then routes later ore to the kept side's
 * claim first, and only the excess to the growth collector. A type can take
 * a move or an unreported claim, never both — keeping more than held and
 * moving some of it away contradict each other — and a claim stays within
 * `maxUnreportedClaim`.
 */
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

/**
 * The ore a needs-review Assignment grew by — what the pilot usually wants to
 * hand to another Payee — as split moves: per diffed type, `after − before`,
 * capped at what `lines` (the fresh totals the split runs against) holds.
 */
export function growthMoves(diffs: readonly QuantityDiff[], lines: readonly OreLine[]): OreLine[] {
  const moves: OreLine[] = [];
  for (const diff of diffs) {
    const held = lines.find((l) => l.typeId === diff.typeId)?.quantity ?? 0;
    const quantity = Math.min(diff.after - diff.before, held);
    if (quantity > 0) moves.push({ typeId: diff.typeId, quantity });
  }
  return moves;
}
