import type { Priority, PriorityTicket } from '@/lib/concurrency';

export type EsiLane = PriorityTicket;

let ambient: EsiLane | undefined;

export type GetActiveCharacterId = () => number | null;

let getActiveCharacterId: GetActiveCharacterId | null = null;

export function configureActiveCharacter(get: GetActiveCharacterId | null): void {
  getActiveCharacterId = get;
}

export function viewPriority(characterId: number | undefined): Priority {
  return characterId !== undefined &&
    getActiveCharacterId !== null &&
    characterId === getActiveCharacterId()
    ? 'high'
    : 'normal';
}

export function gateLane(
  lane: EsiLane | undefined,
  characterId: number | undefined
): EsiLane | undefined {
  if (lane !== undefined) return lane;
  return viewPriority(characterId) === 'high' ? { priority: 'high' } : undefined;
}

export function currentEsiLane(): EsiLane | undefined {
  return ambient;
}

export function withEsiLane<T>(lane: EsiLane | undefined, fn: () => T): T {
  const outer = ambient;
  ambient = lane;
  try {
    return fn();
  } finally {
    ambient = outer;
  }
}

export function inBackgroundLane<T>(fn: () => T): T {
  return withEsiLane({ priority: 'low' }, fn);
}

export function laneForLoad(): EsiLane | undefined {
  return ambient?.priority === 'low' ? { priority: 'low' } : undefined;
}
