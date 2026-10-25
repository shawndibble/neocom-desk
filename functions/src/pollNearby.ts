// The nearby-alerts phase of the Alerts poller (issue #5122, ADR 0028). After every
// grant's notifications have been read, the Characters whose grant can read the
// location have a Current System; this phase reads the two public lists once, works out
// per registered device which Incursions and raid windows came within its N jumps, and
// pushes each occurrence to a device once. Every dependency is injected, so it tests
// without Firestore or the network (alertGrantStore.ts wires the real ones). Nothing
// here sees a token: the location was read in the grant's own step.

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

/**
 * The origin handed to a Character whose location the run did not read because
 * no list has an entry (issue #5144). With nothing listed the origin is never
 * consulted: the Character still goes through the phase so its devices' stored
 * state is brought up to date (an ended Incursion forgotten), as before.
 */
export const NO_ORIGIN_SYSTEM = 0;

/** A registered device as the nearby phase reads it (`deviceRegistrations/{deviceId}`). */
export interface NearbyDevice {
  deviceId: string;
  fcmToken: string;
  characterIds: number[];
  /** Per Character (string id): the server-pushed event ids this device enabled for the browser channel. */
  serverEventsByCharacter: Record<string, string[]>;
  /** Per Character (string id): this device's N per nearby event. */
  nearbyJumpsByCharacter: Record<string, Partial<Record<NearbyEventId, number>>>;
  routeRules?: NearbyRouteRules;
  quietHours?: QuietHours;
  /** When the registration was last written; a dormant one (pollerEfficiency.ts) is not processed. */
  updatedAtMs?: number | null;
  /** What the last run stored for this device (`nearbyState` on the registration doc). */
  state: NearbyDeviceState;
}

/**
 * `nearbyState` on the device's registration doc, so it goes wherever the
 * registration goes (a dead token, a purge) and never outlives it.
 */
export interface NearbyDeviceState {
  characters: Record<string, StoredNearby>;
  pushed: NearbyPushLog;
}

export interface NearbyStore {
  /** Every registered device holding at least one of these Characters. */
  devicesFor(characterIds: number[]): Promise<NearbyDevice[]>;
  /** Writes `nearbyState` only; a registration deleted meanwhile stays deleted. */
  writeState(deviceId: string, state: NearbyDeviceState): Promise<void>;
  /** A dead FCM token: drop the registration and this state with it. */
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

/** The device's nearby choices for its located Characters; empty when it wants none. */
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
  /** Character id → Current System, for the Characters whose location was read this run. */
  locations: ReadonlyMap<number, number>;
  send: (token: string, message: PushMessage) => Promise<void>;
  /** Receives only messages and ids. */
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

  // Each list once per run, and only if some device wants its event. A failed read
  // leaves that event's state alone (the app skips its poll the same way); a spent
  // budget ends the phase before anything else is read or written.
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
  // A 420/429 ends the phase with nothing written: the next run diffs against the old baseline.
  if (aborted) return result;
  const live = liveOccurrences(lists, nowMs);

  // One sweep per origin and rule set for the whole run, however many devices share them.
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
    // Only the Characters checked this run keep state: one whose location was
    // not read (grant ended, location refused, off the device) loses the system
    // it was last counted from, and baselines again silently when it is back.
    const polled = new Set(characters.map((c) => String(c.characterId)));
    const next = Object.fromEntries(Object.entries(computed.next).filter(([id]) => polled.has(id)));

    // Quiet time: skipped, not queued, and not logged as pushed. The edge is
    // still consumed, as the EVE notification poller's high-water mark is.
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
        // Leave the state unwritten so the next run diffs against the old
        // baseline and tries again; anything already sent is in the log only
        // once written, so it may arrive twice, which the device dedupes on
        // Occurrence Key.
        log('Nearby push failed', { deviceId: device.deviceId, error: code || 'unknown' });
        return;
      }
    }
    const nextState: NearbyDeviceState = {
      characters: next,
      pushed: recordPushed(state.pushed, pushed, nowMs, live),
    };
    // Most runs change nothing: skip the write.
    if (JSON.stringify(nextState) === JSON.stringify(state)) return;
    await deps.store.writeState(device.deviceId, nextState);
  }
}
