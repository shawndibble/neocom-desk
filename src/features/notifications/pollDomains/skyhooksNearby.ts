import { parseInstant } from '@/engine/esiInstant';
import type {
  SkyhookAlertEntry,
  SkyhookAlertSnapshot,
  SkyhookRaidableNearbyFire,
} from '@/engine/skyhooks/skyhookAlert';
import { planetInfo } from '@/features/overview/widgets/data/spaceLookups';
import { loadRaidableList } from '@/features/overview/widgets/data/sovRaidsLoader';
import { STALE_AFTER } from '@/esi/cache';
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

export const skyhookNearbyDomain = defineDomain<
  SkyhookAlertEntry,
  SkyhookAlertSnapshot,
  SkyhookRaidableNearbyFire,
  SkyhookNames
>({
  source: SNAPSHOT_SOURCES.skyhooksNearby,
  stateKey: 'notifications.pollerState.skyhooksNearby',
  entriesKey: 'entries',
  isEntry: isSkyhookAlertEntry,
  load: async (characterId) => {
    const originSystemId = await loadCurrentSystemId(characterId, STALE_AFTER.default);
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
