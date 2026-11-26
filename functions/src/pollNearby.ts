import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import type { PublicListResult } from './esiNearby.js';
import type { PushMessage } from './eveNotificationPush.js';
import {
  DEFAULT_NEARBY_ROUTE_RULES,
  NEARBY_EVENT_IDS,
  computeDeviceNearby,
  jumpDistancesUnder,
  liveOccurrences,
  notYetPushed,
  recordPushed,
  type DeviceCharacterNearby,
  type IncursionListing,
  type NearbyEventId,
  type NearbyLists,
  type NearbyPushLog,
  type NearbyRouteRules,
  type RaidableSkyhook,
  type StoredNearby,
} from './nearbyAlerts.js';
import { buildNearbyPush } from './nearbyPush.js';
import { deviceCadence } from './pollerEfficiency.js';
import { suppressPush, type QuietHours } from './quietHours.js';

export const NO_ORIGIN_SYSTEM = 0;

export interface NearbyDevice {
  deviceId: string;
  fcmToken: string;
  characterIds: number[];
  serverEventsByCharacter: Record<string, string[]>;
  nearbyJumpsByCharacter: Record<string, Partial<Record<NearbyEventId, number>>>;
  routeRules?: NearbyRouteRules;
  quietHours?: QuietHours;
  updatedAtMs?: number | null;
  state: NearbyDeviceState;
}

export interface NearbyDeviceState {
  characters: Record<string, StoredNearby>;
  pushed: NearbyPushLog;
}

export interface NearbyStore {
  devicesFor(characterIds: number[]): Promise<NearbyDevice[]>;
  writeState(deviceId: string, state: NearbyDeviceState): Promise<void>;
  deleteDevice(deviceId: string): Promise<void>;
}

export interface NearbyDeps {
  store: NearbyStore;
  fetchIncursions: () => Promise<PublicListResult<IncursionListing>>;
  fetchRaidableSkyhooks: () => Promise<PublicListResult<RaidableSkyhook>>;
}

export interface NearbyPhaseResult {
  pushesSent: number;
  budgetStopped: boolean;
}

function wantedCharacters(
  device: NearbyDevice,
  locations: ReadonlyMap<number, number>
): DeviceCharacterNearby[] {
  return device.characterIds.flatMap((characterId) => {
    const originSystemId = locations.get(characterId);
    if (originSystemId === undefined) return [];
    const events = (device.serverEventsByCharacter[String(characterId)] ?? []).filter((id) =>
      (NEARBY_EVENT_IDS as readonly string[]).includes(id)
    );
    if (events.length === 0) return [];
    return [
      {
        characterId,
        originSystemId,
        events,
        nearbyJumps: device.nearbyJumpsByCharacter[String(characterId)] ?? {},
      },
    ];
  });
}

export async function runNearbyPhase(args: {
  deps: NearbyDeps;
  locations: ReadonlyMap<number, number>;
  send: (token: string, message: PushMessage) => Promise<void>;
  log: (message: string, data?: Record<string, unknown>) => void;
  nowMs: number;
}): Promise<NearbyPhaseResult> {
  const { deps, locations, nowMs, log } = args;
  const result: NearbyPhaseResult = { pushesSent: 0, budgetStopped: false };
  if (locations.size === 0) return result;

  const devices = (await deps.store.devicesFor([...locations.keys()]))
    .filter((device) => deviceCadence(device.updatedAtMs, nowMs) !== 'dormant')
    .map((device) => ({ device, characters: wantedCharacters(device, locations) }))
    .filter(({ characters }) => characters.length > 0);
  if (devices.length === 0) return result;

  const wants = (eventId: NearbyEventId) =>
    devices.some(({ characters }) => characters.some((c) => c.events.includes(eventId)));
  let aborted = false;
  const read = async <T>(
    wanted: boolean,
    fetchList: () => Promise<PublicListResult<T>>
  ): Promise<T[] | null> => {
    if (!wanted || result.budgetStopped) return null;
    const res = await fetchList();
    if (res.kind === 'ok') {
      if (res.budgetLow) result.budgetStopped = true;
      return res.value;
    }
    if (res.kind === 'backoff') {
      result.budgetStopped = true;
      aborted = true;
      log('ESI error budget hit during the nearby lists; stopping this run', {
        retryAfterMs: res.retryAfterMs,
      });
    } else {
      log('Nearby list read failed', { kind: res.kind });
    }
    return null;
  };
  const lists: NearbyLists = {
    incursions: await read(wants('incursionNearby'), deps.fetchIncursions),
    skyhooks: await read(wants('skyhookRaidableNearby'), deps.fetchRaidableSkyhooks),
  };
  if (aborted) return result;
  const live = liveOccurrences(lists, nowMs);

  const sweeps = new Map<string, ReadonlyMap<number, number>>();
  const distances = (rules: NearbyRouteRules) => (originSystemId: number) => {
    const key = `${originSystemId}|${rules.preference}|${rules.securityPenalty}|${rules.avoid.join(',')}`;
    let jumps = sweeps.get(key);
    if (jumps === undefined) {
      jumps = jumpDistancesUnder(originSystemId, rules);
      sweeps.set(key, jumps);
    }
    return jumps;
  };

  for (const { device, characters } of devices) {
    try {
      await pollDevice(device, characters);
    } catch (err) {
      log('Nearby alerts failed for a device', {
        deviceId: device.deviceId,
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  return result;

  async function pollDevice(device: NearbyDevice, characters: DeviceCharacterNearby[]) {
    const { state } = device;
    const computed = computeDeviceNearby({
      characters,
      prev: state.characters,
      lists,
      nowMs,
      distancesFrom: distances(device.routeRules ?? DEFAULT_NEARBY_ROUTE_RULES),
    });
    const polled = new Set(characters.map((c) => String(c.characterId)));
    const next = Object.fromEntries(Object.entries(computed.next).filter(([id]) => polled.has(id)));

    const fresh = suppressPush(nowMs, device.quietHours, undefined)
      ? []
      : computed.fires.filter((f) => notYetPushed(state.pushed, f.occurrenceKey));
    const pushed: string[] = [];
    for (const keyed of fresh) {
      try {
        await args.send(device.fcmToken, buildNearbyPush(keyed, nowMs));
        pushed.push(keyed.occurrenceKey);
        result.pushesSent++;
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String(err.code) : '';
        const text = err instanceof Error ? err.message : '';
        if (shouldDeleteDeviceToken(code, text)) {
          await deps.store.deleteDevice(device.deviceId);
          return;
        }
        log('Nearby push failed', { deviceId: device.deviceId, error: code || 'unknown' });
        return;
      }
    }
    const nextState: NearbyDeviceState = {
      characters: next,
      pushed: recordPushed(state.pushed, pushed, nowMs, live),
    };
    if (JSON.stringify(nextState) === JSON.stringify(state)) return;
    await deps.store.writeState(device.deviceId, nextState);
  }
}
