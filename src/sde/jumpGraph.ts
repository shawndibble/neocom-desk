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
 * Like its siblings the file sits outside the install precache, so a first
 * offline visit has no graph at all. That is the `undefined` case below, and
 * it is deliberately distinct from "the graph loaded and these two systems do
 * not connect" — one is "we cannot say", the other is a fact about New Eden.
 */
import { loadSolarSystemJumps } from './loadMarketSde';
import type { JumpGraph } from '@/engine/route/jumpRoute';

let index: Promise<JumpGraph | null> | null = null;

function loadJumpGraphIndex(): Promise<JumpGraph | null> {
  index ??= loadSolarSystemJumps()
    .then((data): JumpGraph => {
      const graph = new Map<number, readonly number[]>();
      for (const [systemId, neighbours] of Object.entries(data)) {
        graph.set(Number(systemId), neighbours);
      }
      return graph;
    })
    .catch(() => {
      index = null; // allow a retry on the next call
      return null;
    });
  return index;
}

/**
 * The stargate graph, or `undefined` when the snapshot could not be read at
 * all (offline first visit, or a build that predates the file). Callers must
 * degrade on `undefined` rather than treat it as an empty graph — an empty
 * graph would answer "no route" for every pair in the game, which is a
 * confident wrong answer where the honest one is "unknown".
 */
export async function loadJumpGraph(): Promise<JumpGraph | undefined> {
  return (await loadJumpGraphIndex()) ?? undefined;
}

/** Test-only: drops the memoized index so tests can swap the snapshot between cases. */
export function clearJumpGraphIndex(): void {
  index = null;
}
