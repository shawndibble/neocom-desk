import { lookupSolarSystem } from '@/sde/solarSystems';
import type {
  ShipLossEntrySnapshot,
  ShipLossSnapshot,
  ShipLostFire,
} from '@/engine/notificationDiffs';
import type { ShipLostNames } from '../domainCopy';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { currentThresholds } from './shared';

/* Ship lost ------------------------------------------------------------------ */

const isShipLossEntrySnapshot = shapeGuard<ShipLossEntrySnapshot>({
  killmailId: is.number,
  timeMs: is.number,
  shipTypeId: is.optional(is.number),
  systemId: is.optional(is.number),
  value: is.optional(is.number),
  thresholdIsk: is.number,
});

/**
 * A Character's losses from the same zKillboard read the Overview's Kills
 * widget makes (`fetchPilotKillmailHistory`), so the poll adds no request
 * beyond that read's own cache window. A failed read skips the poll (`null`)
 * rather than writing an empty baseline that would announce every loss as new.
 */
export const killsDomain = defineDomain<
  ShipLossEntrySnapshot,
  ShipLossSnapshot,
  ShipLostFire,
  ShipLostNames
>({
  source: SNAPSHOT_SOURCES.kills,
  stateKey: 'notifications.pollerState.kills',
  entriesKey: 'entries',
  isEntry: isShipLossEntrySnapshot,
  load: async (characterId) => {
    const { fetchPilotKillmailHistory } = await import('@/lib/zkillboard');
    const history = await fetchPilotKillmailHistory(characterId);
    if (!history.ok) return null;
    const { shipLostMinimumIsk } = await currentThresholds(characterId);
    return history.entries
      .filter((entry) => entry.side === 'loss')
      .map((entry) => {
        const shipTypeId = entry.detail?.victim.ship_type_id;
        const systemId = entry.detail?.systemId;
        return {
          killmailId: entry.killmailId,
          timeMs: Date.parse(entry.detail?.time ?? ''),
          ...(shipTypeId === undefined ? {} : { shipTypeId }),
          ...(systemId === null || systemId === undefined ? {} : { systemId }),
          ...(entry.value === null ? {} : { value: entry.value }),
          thresholdIsk: shipLostMinimumIsk,
        };
      });
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  names: async (fire) => {
    const { shipTypeId } = fire;
    const [typeNames, system] = await Promise.all([
      shipTypeId === undefined
        ? undefined
        : import('@/features/character/typeNames')
            .then((m) => m.loadTypeNames([shipTypeId]))
            .catch(() => undefined),
      fire.systemId === undefined ? null : lookupSolarSystem(fire.systemId).catch(() => null),
    ]);
    return {
      ship: shipTypeId === undefined ? undefined : typeNames?.get(shipTypeId),
      system: system?.name,
    };
  },
});
