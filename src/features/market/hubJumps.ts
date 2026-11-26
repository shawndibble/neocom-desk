import { localJumpDistances } from '@/features/route/localRoute';

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
