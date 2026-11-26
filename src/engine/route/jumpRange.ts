export const JUMP_RANGES = ['any', 'system', '3', '5', '10', '15', '20'] as const;
export type JumpRange = (typeof JUMP_RANGES)[number];

export const DEFAULT_JUMP_RANGE: JumpRange = 'any';

function maxJumps(range: Exclude<JumpRange, 'any'>): number {
  return range === 'system' ? 0 : Number(range);
}

export function jumpRangeLimit(range: JumpRange): number | null {
  return range === 'any' ? null : maxJumps(range);
}

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

export function withinJumpRange(
  systemId: number | null | undefined,
  allowed: ReadonlySet<number> | null
): boolean {
  if (allowed === null) return true;
  return systemId != null && allowed.has(systemId);
}

export interface PickedSystem {
  systemId: number;
  gameSystemId: number | null;
}

export interface CurrentSystem {
  systemId: number | null;
  source: 'game' | 'picked' | null;
}

export function effectiveCurrentSystem(
  gameSystemId: number | null,
  picked: PickedSystem | null
): CurrentSystem {
  if (
    picked &&
    (gameSystemId === null || picked.gameSystemId === null || gameSystemId === picked.gameSystemId)
  ) {
    return { systemId: picked.systemId, source: 'picked' };
  }
  if (gameSystemId !== null) return { systemId: gameSystemId, source: 'game' };
  return { systemId: null, source: null };
}

export function adoptGameBaseline(
  picked: PickedSystem | null,
  gameSystemId: number | null
): PickedSystem | null {
  if (picked === null || picked.gameSystemId !== null || gameSystemId === null) return null;
  return { ...picked, gameSystemId };
}
