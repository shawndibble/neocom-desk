/**
 * `public/data/market/jumps.json` read as a stargate adjacency map (issue
 * #942) — the `npcStations.ts`/`solarSystems.ts` pattern applied to the jump
 * graph.
 *
 * Indexed once per session for the same reason those two are: a table
 * resolving a distance per row would otherwise re-walk a plain object for
 * every lookup, and the whole point of shipping this file is that a distance
 * costs no request *and* no meaningful work.
 *
 * Like its siblings the file sits outside the install precache, so an
 * unreadable snapshot is an ordinary outcome on a first offline visit rather
 * than an error worth throwing over.
 */
import { loadSolarSystemJumps } from './loadMarketSde';
import type { JumpGraph } from '@/engine/route/jumpRoute';

let index: Promise<JumpGraph | undefined> | null = null;

/**
 * The stargate graph, or `undefined` when the snapshot could not be read.
 *
 * Callers must degrade on `undefined` rather than treat it as an empty graph:
 * an empty graph answers "no route" for every pair in the game, which is a
 * confident wrong answer where the honest one is "we cannot say".
 *
 * Two-valued, unlike `lookupSolarSystem`'s three — there is no "loaded, and
 * this id is absent" to report, because the whole graph is the answer.
 */
export function loadJumpGraph(): Promise<JumpGraph | undefined> {
  index ??= loadSolarSystemJumps()
    .then((data): JumpGraph => {
      const graph = new Map<number, readonly number[]>();
      for (const [systemId, neighbours] of Object.entries(data)) {
        // Shape-checked rather than trusted: the pathfinder iterates these
        // arrays, so one non-array value from a truncated snapshot would
        // throw mid-search, past where `undefined` can still be answered.
        if (Array.isArray(neighbours)) graph.set(Number(systemId), neighbours);
      }
      return graph;
    })
    .catch(() => {
      index = null; // allow a retry on the next call
      return undefined;
    });
  return index;
}

/** Test-only: drops the memoized index so tests can swap the snapshot between cases. */
export function clearJumpGraphIndex(): void {
  index = null;
}
