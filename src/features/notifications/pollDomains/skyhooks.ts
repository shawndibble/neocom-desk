import { parseInstant } from '@/engine/esiInstant';
import type {
  SkyhookAlertEntry,
  SkyhookAlertSnapshot,
  SkyhookRaidableNearbyFire,
} from '@/engine/skyhooks/skyhookAlert';
import { planetInfo } from '@/features/overview/widgets/data/spaceLookups';
import { loadRaidableList } from '@/features/overview/widgets/data/sovRaidsLoader';
import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { localJumpDistances } from '@/features/route/localRoute';
import { lookupSolarSystem } from '@/sde/solarSystems';
import type { SkyhookNames } from '../domainCopy';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { currentThresholds } from './shared';

const isSkyhookAlertEntry = shapeGuard<SkyhookAlertEntry>({
  systemId: is.number,
  planetId: is.number,
  startMs: is.number,
  endMs: is.number,
  jumps: is.nullable(is.number),
  originSystemId: is.number,
  withinJumps: is.number,
});

/**
 * A raidable skyhook window within the pilot's N jumps (issue #4784, raider
 * half). One cached read of the public universe-wide list (the same cache row
 * the Overview's raids widget reads, so it costs one request per cache
 * window, never one per Character or skyhook), one of the location, and one
 * local pass over the stargate graph under Route Safety's jump basis. A
 * listing with no readable window is dropped: there is no window to be
 * "once per". An input it cannot read skips the poll (`null`) rather than
 * writing a baseline that would fire a burst on the next good poll.
 */
export const skyhookDomain = defineDomain<
  SkyhookAlertEntry,
  SkyhookAlertSnapshot,
  SkyhookRaidableNearbyFire,
  SkyhookNames
>({
  source: SNAPSHOT_SOURCES.skyhooks,
  stateKey: 'notifications.pollerState.skyhooks',
  entriesKey: 'entries',
  isEntry: isSkyhookAlertEntry,
  load: async (characterId) => {
    const originSystemId = await loadCurrentSystemId(characterId);
    if (originSystemId === null) return null;
    const list = await loadRaidableList().catch(() => null);
    if (list === null) return null;
    const windows = list.data.skyhooks.flatMap((hook) => {
      const startMs = parseInstant(hook.theft_vulnerability?.start);
      const endMs = parseInstant(hook.theft_vulnerability?.end);
      return startMs === null || endMs === null
        ? []
        : [{ systemId: hook.solar_system_id, planetId: hook.planet_id, startMs, endMs }];
    });
    if (windows.length === 0) return [];
    const { skyhookRaidableNearbyJumps: withinJumps } = await currentThresholds(characterId);
    const basis = await loadJumpBasis();
    const distances = await localJumpDistances(originSystemId, basis.rules, basis.network);
    if (distances.kind === 'unknown') return null;
    return windows.map((hook) => ({
      ...hook,
      jumps: distances.jumps.get(hook.systemId) ?? null,
      originSystemId,
      withinJumps,
    }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  names: async (fire) => {
    const [planets, system] = await Promise.all([
      planetInfo([fire.planetId]),
      lookupSolarSystem(fire.systemId).catch(() => null),
    ]);
    return { planet: planets.get(fire.planetId)?.name ?? undefined, system: system?.name };
  },
});
