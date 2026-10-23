import { loadCurrentSystemId } from './currentSystem';
import { jumpsBetween, loadJumpBasis } from './jumpBasis';

/** Jumps from the Current System, under the Route Safety basis; empty when the origin is unknown. */
export async function jumpsFromCurrent(
  characterId: number,
  systemIds: readonly number[]
): Promise<Map<number, number>> {
  const jumps = new Map<number, number>();
  // Nothing to measure: skip the location read.
  if (systemIds.length === 0) return jumps;
  try {
    const origin = await loadCurrentSystemId(characterId);
    if (origin === null) return jumps;
    const basis = await loadJumpBasis();
    await Promise.all(
      systemIds.map(async (systemId) => {
        const result = await jumpsBetween(origin, systemId, basis);
        if (result.kind === 'known') jumps.set(systemId, result.jumps);
      })
    );
  } catch {
    // No distance column rather than a failed widget.
  }
  return jumps;
}
