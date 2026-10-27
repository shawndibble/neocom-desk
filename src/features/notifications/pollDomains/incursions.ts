import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { localJumpDistances } from '@/features/route/localRoute';
import { loadConstellationNames, loadIncursions } from '@/features/travel/incursionsData';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { INCURSION_STATES } from '@/engine/incursions/incursionRows';
import type {
  IncursionAlertEntry,
  IncursionAlertSnapshot,
  IncursionNearbyFire,
} from '@/engine/incursions/incursionAlert';
import type { IncursionNames } from '../domainCopy';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { currentThresholds } from './shared';

/* Incursions: within N jumps ------------------------------------------------- */

const isIncursionAlertEntry = shapeGuard<IncursionAlertEntry>({
  constellationId: is.number,
  stagingSystemId: is.number,
  state: is.oneOf(INCURSION_STATES),
  jumps: is.nullable(is.number),
  originSystemId: is.number,
  withinJumps: is.number,
});

/**
 * An Incursion coming within the pilot's N jumps (issue #3542). One cached
 * read of the public feed and of the location, and one local pass over the
 * stargate graph under Route Safety's jump basis — never a route call per
 * Incursion. Every Incursion in the feed is kept, near or not, each with the
 * origin and N it was counted under, so the diff can tell a changed frame
 * from an Incursion coming into range. An input it cannot read skips the
 * poll (`null`) rather than writing a baseline that would make the next good
 * poll look like a burst of new arrivals.
 */
export const incursionDomain = defineDomain<
  IncursionAlertEntry,
  IncursionAlertSnapshot,
  IncursionNearbyFire,
  IncursionNames
>({
  source: SNAPSHOT_SOURCES.incursions,
  stateKey: 'notifications.pollerState.incursions',
  entriesKey: 'entries',
  isEntry: isIncursionAlertEntry,
  load: async (characterId) => {
    const originSystemId = await loadCurrentSystemId(characterId);
    if (originSystemId === null) return null;
    const feed = await loadIncursions();
    if (feed === null) return null;
    if (feed.entries.length === 0) return [];
    const { incursionNearbyJumps: withinJumps } = await currentThresholds(characterId);
    const basis = await loadJumpBasis();
    const distances = await localJumpDistances(originSystemId, basis.rules, basis.network);
    if (distances.kind === 'unknown') return null;
    // Counted exactly as Route Safety's Incursions panel counts them
    // (`buildIncursionRows`): a state ESI adds later is dropped, not stored.
    return feed.entries
      .filter((entry) => (INCURSION_STATES as readonly unknown[]).includes(entry.state))
      .map((entry) => ({
        constellationId: entry.constellation_id,
        stagingSystemId: entry.staging_solar_system_id,
        state: entry.state,
        jumps: distances.jumps.get(entry.staging_solar_system_id) ?? null,
        originSystemId,
        withinJumps,
      }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  names: async (fire) => {
    const [constellations, system] = await Promise.all([
      loadConstellationNames([fire.constellationId]),
      lookupSolarSystem(fire.stagingSystemId).catch(() => null),
    ]);
    return {
      constellation: constellations.get(fire.constellationId),
      system: system?.name,
    };
  },
});
