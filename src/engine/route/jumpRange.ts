/**
 * Jump Range: the "how far from me" filter Market Browser, Item Offers and BPC
 * Sourcing share. Pure — the distances come in from `localJumpDistances`
 * (`features/route/localRoute.ts`), so nothing here reads the stargate graph.
 *
 * Also owns the Current System rule, since it decides the origin every range
 * is measured from.
 */

export const JUMP_RANGES = ['any', 'system', '3', '5', '10'] as const;
export type JumpRange = (typeof JUMP_RANGES)[number];

export const DEFAULT_JUMP_RANGE: JumpRange = 'any';

export function isJumpRange(value: unknown): value is JumpRange {
  return typeof value === 'string' && (JUMP_RANGES as readonly string[]).includes(value);
}

function maxJumps(range: Exclude<JumpRange, 'any'>): number {
  return range === 'system' ? 0 : Number(range);
}

/**
 * The systems a range admits, or `null` for no restriction.
 *
 * A set rather than a per-row predicate so a caller building a view (an order
 * book's best price, a table's row cap) can filter before it summarises,
 * without holding the whole distance map.
 */
export function jumpRangeSystems(
  jumps: ReadonlyMap<number, number>,
  range: JumpRange
): ReadonlySet<number> | null {
  if (range === 'any') return null;
  const limit = maxJumps(range);
  const allowed = new Set<number>();
  for (const [systemId, count] of jumps) if (count <= limit) allowed.add(systemId);
  return allowed;
}

/**
 * Whether one row passes. A row this app cannot place (a player structure, an
 * unresolved location) fails any real range: "within 5 jumps" is a claim, and
 * an unknown distance cannot back it.
 */
export function withinJumpRange(
  systemId: number | null | undefined,
  allowed: ReadonlySet<number> | null
): boolean {
  if (allowed === null) return true;
  return systemId != null && allowed.has(systemId);
}

/** A system the pilot picked by hand, with the game location it replaced. */
export interface PickedSystem {
  systemId: number;
  /** What ESI reported when the pick was made; `null` if it reported nothing. */
  gameSystemId: number | null;
}

export interface CurrentSystem {
  systemId: number | null;
  source: 'game' | 'picked' | null;
}

/**
 * The origin every Jump Range measures from.
 *
 * ESI's location lags or is missing (no scope, docked in a structure it will
 * not name), so a pilot can pick a system. The pick holds only until the game
 * reports a *different* system than it did when the pick was made: once the
 * pilot has really moved, the fresh game location is better than a
 * hand-typed one they have probably forgotten.
 */
export function effectiveCurrentSystem(
  gameSystemId: number | null,
  picked: PickedSystem | null
): CurrentSystem {
  if (picked && (gameSystemId === null || gameSystemId === picked.gameSystemId)) {
    return { systemId: picked.systemId, source: 'picked' };
  }
  if (gameSystemId !== null) return { systemId: gameSystemId, source: 'game' };
  return { systemId: null, source: null };
}
