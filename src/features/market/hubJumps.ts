import { localJumpDistances } from '@/features/route/localRoute';

/**
 * Plain stargate jumps from a hub's system to every other (issue #5653): what
 * decides which buy orders' ranges reach the hub. Held for the session, as the
 * gate graph never changes under it; a failed read is not held, so the next ask retries.
 */
const cache = new Map<number, Promise<ReadonlyMap<number, number> | undefined>>();

export function loadHubJumps(systemId: number): Promise<ReadonlyMap<number, number> | undefined> {
  let pending = cache.get(systemId);
  if (!pending) {
    pending = localJumpDistances(systemId).then(
      (result) => (result.kind === 'known' ? result.jumps : undefined),
      () => undefined
    );
    cache.set(systemId, pending);
    void pending.then((jumps) => {
      if (jumps === undefined) cache.delete(systemId);
    });
  }
  return pending;
}
