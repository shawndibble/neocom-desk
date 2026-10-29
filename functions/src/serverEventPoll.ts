// The polled half of server-pushed events (issue #5121): price alerts, read from
// public data on the 15-minute dispatch tick. Every dependency is injected
// (devices, Fuzzwork, FCM), so it tests without Firestore or the network;
// serverEventStore.ts and index.ts wire the real ones. The diffs and keys are
// serverEvents.ts's, which mirror the Foreground Poller's. Ship losses are not
// polled here: the open app reads zKillboard itself (decision
// 20261029-000802-ship-losses-are-no-longer-server-pushed).
//
// Readings are per device and Character (the registration doc's
// `serverEventBaselines`), like the device's own choices: each device is told
// once per crossing, against its own targets. Sources are read once per run
// however many devices share them: one Fuzzwork call per hub station.

import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import { deviceCadence } from './pollerEfficiency.js';
import { suppressPush, type QuietHours } from './quietHours.js';
import { SERVER_POLL_STATS_KEYS, createRunStats, type RunStats } from './runStats.js';
import {
  buildServerEventPush,
  diffPriceAlerts,
  trimBaseline,
  type PriceAlertSnapshotEntry,
  type ServerEventBaseline,
  type ServerEventFire,
  type ServerEventInputs,
} from './serverEvents.js';

export interface PolledCharacter {
  characterId: number;
  /** The server-pushed events this device enabled for the Character. */
  events: readonly string[];
  inputs: ServerEventInputs;
  baseline: ServerEventBaseline;
}

export interface PolledDevice {
  deviceId: string;
  fcmToken: string;
  quietHours?: QuietHours;
  /** When the registration was last written (the open app re-registers hourly); absent on old docs. */
  updatedAtMs?: number | null;
  characters: PolledCharacter[];
}

export interface ServerPollDeps {
  /** Devices with at least one polled event enabled. */
  listDevices(): Promise<PolledDevice[]>;
  /** Lowest sell per type at the station (null: no sell order), or null when the read failed. */
  fetchPrices(
    stationId: number,
    typeIds: readonly number[]
  ): Promise<Map<number, number | null> | null>;
  send(token: string, data: Record<string, string>): Promise<void>;
  /** Replaces the device's readings; a device deleted meanwhile is not an error. */
  saveBaselines(deviceId: string, baselines: Record<string, ServerEventBaseline>): Promise<void>;
  /**
   * Deletes the registration only if it still holds `fcmToken`: the device may
   * have re-registered a fresh token while this run was reading.
   */
  deleteDevice(deviceId: string, fcmToken: string): Promise<void>;
  /** Receives only ids and counts, never a token. */
  log(message: string, data?: Record<string, unknown>): void;
  now(): number;
  /** The run's counters (issue #5144); the store wrappers share it. Absent: counted privately. */
  stats?: RunStats;
}

export interface ServerPollSummary {
  /** Devices polled this run (those whose turn it is; see pollerEfficiency.ts). */
  devices: number;
  priceReads: number;
  pushesSent: number;
}

async function readPrices(
  deps: ServerPollDeps,
  typesByStation: ReadonlyMap<number, ReadonlySet<number>>,
  summary: ServerPollSummary
): Promise<Map<number, Map<number, number | null>>> {
  const prices = new Map<number, Map<number, number | null>>();
  for (const [stationId, typeIds] of typesByStation) {
    summary.priceReads++;
    const read = await deps.fetchPrices(stationId, [...typeIds]).catch(() => null);
    if (read) prices.set(stationId, read);
    else deps.log('Price read failed for a hub station', { stationId });
  }
  return prices;
}

type SendOutcome = 'sent' | 'held' | 'dead' | 'failed';

async function sendFire(
  deps: ServerPollDeps,
  device: PolledDevice,
  fire: ServerEventFire,
  nowMs: number
): Promise<SendOutcome> {
  // Quiet time: skipped, not queued; the reading still advances.
  if (suppressPush(nowMs, device.quietHours, undefined, fire.eventId)) return 'held';
  try {
    await deps.send(device.fcmToken, buildServerEventPush(fire, nowMs));
    return 'sent';
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String(err.code) : '';
    const message = err instanceof Error ? err.message : '';
    if (shouldDeleteDeviceToken(code, message)) return 'dead';
    deps.log('Server event push failed', { deviceId: device.deviceId, error: code || 'unknown' });
    return 'failed';
  }
}

export async function pollServerEvents(deps: ServerPollDeps): Promise<ServerPollSummary> {
  const startedAt = deps.now();
  const stats = deps.stats ?? createRunStats(SERVER_POLL_STATS_KEYS);
  const summary: ServerPollSummary = {
    devices: 0,
    priceReads: 0,
    pushesSent: 0,
  };
  const listed = await deps.listDevices();
  stats.set('devicesListed', listed.length);
  // Back-off for registrations the app has stopped refreshing (pollerEfficiency.ts).
  const devices: PolledDevice[] = [];
  for (const device of listed) {
    const cadence = deviceCadence(device.updatedAtMs, startedAt);
    if (cadence === 'due') devices.push(device);
    else if (cadence === 'sleeping') stats.add('devicesSkippedSleeping');
    else {
      stats.add('devicesSkippedDormant');
      // Once: forget its readings, so the app registering it again seeds them
      // silently instead of announcing every loss and crossing since.
      if (device.characters.some((c) => Object.keys(c.baseline).length > 0)) {
        await deps.saveBaselines(device.deviceId, {});
        stats.add('dormantBaselineClears');
      }
    }
  }
  summary.devices = devices.length;
  stats.set('devicesPolled', devices.length);

  const typesByStation = new Map<number, Set<number>>();
  for (const device of devices) {
    for (const character of device.characters) {
      const { priceStationId, priceAlerts } = character.inputs;
      if (
        character.events.includes('priceAlertTriggered') &&
        priceStationId !== undefined &&
        priceAlerts !== undefined
      ) {
        const types = typesByStation.get(priceStationId) ?? new Set<number>();
        for (const alert of priceAlerts) types.add(alert.typeId);
        typesByStation.set(priceStationId, types);
      }
    }
  }

  const prices = await readPrices(deps, typesByStation, summary);

  const nowMs = deps.now();
  for (const device of devices) {
    const baselines: Record<string, ServerEventBaseline> = {};
    let dead = false;
    for (const character of device.characters) {
      const { characterId, events, inputs } = character;
      const previous = trimBaseline(character.baseline, events);
      const next: ServerEventBaseline = { ...previous };
      const fires: ServerEventFire[] = [];

      if (events.includes('priceAlertTriggered')) {
        const stationPrices =
          inputs.priceStationId === undefined ? undefined : prices.get(inputs.priceStationId);
        const alerts = inputs.priceAlerts ?? [];
        // No alerts reads as an empty reading, so a target added later fires on
        // its first crossing (the client's "no counterpart in prev" rule).
        if (alerts.length === 0 || stationPrices) {
          const reading: PriceAlertSnapshotEntry[] = alerts.map((alert) => ({
            ...alert,
            price: stationPrices?.get(alert.typeId) ?? null,
          }));
          fires.push(...diffPriceAlerts(characterId, previous.priceAlerts, reading));
          next.priceAlerts = reading;
        }
      }

      let failed = false;
      for (const fire of fires) {
        const outcome = await sendFire(deps, device, fire, nowMs);
        if (outcome === 'sent') summary.pushesSent++;
        else if (outcome === 'failed') failed = true;
        else if (outcome === 'dead') {
          dead = true;
          break;
        }
      }
      if (dead) break;
      // A transient failure keeps the last reading so the next run retries; a
      // device that did get the push gets it again, deduped on the Occurrence Key.
      baselines[String(characterId)] = failed ? previous : next;
    }

    if (dead) {
      await deps.deleteDevice(device.deviceId, device.fcmToken);
      continue;
    }
    const unchanged = device.characters.every(
      (c) =>
        JSON.stringify(trimBaseline(c.baseline, c.events)) ===
        JSON.stringify(baselines[String(c.characterId)])
    );
    if (!unchanged) await deps.saveBaselines(device.deviceId, baselines);
  }
  stats.set('fuzzworkCalls', summary.priceReads);
  stats.set('durationMs', deps.now() - startedAt);
  return summary;
}
