// The polled half of server-pushed events (issue #5121): price alerts and ship
// losses, read from public data on the 15-minute dispatch tick. Every
// dependency is injected (devices, zKillboard, Fuzzwork, FCM), so it tests
// without Firestore or the network; serverEventStore.ts and index.ts wire the
// real ones. The diffs and keys are serverEvents.ts's, which mirror the
// Foreground Poller's.
//
// Readings are per device and Character (the registration doc's
// `serverEventBaselines`), like the device's own choices: each device is told
// once per crossing or loss, against its own targets and minimum. Sources are
// read once per run however many devices share them: one zKillboard list per
// Character, one Fuzzwork call per hub station.

import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import { suppressPush, type QuietHours } from './quietHours.js';
import {
  buildServerEventPush,
  diffPriceAlerts,
  diffShipLosses,
  trimBaseline,
  type PriceAlertSnapshotEntry,
  type ServerEventBaseline,
  type ServerEventFire,
  type ServerEventInputs,
  type ShipLossEntry,
} from './serverEvents.js';

/**
 * zKillboard reads per run, spaced by `LOSS_READ_SPACING_MS` and bounded by
 * `LOSS_READ_BUDGET_MS` of wall time: the tick has a 9-minute timeout, pushes
 * and readings are written only after the reads, so a run must stop reading
 * well before it, and zKillboard asks API users to go gently. A Character past
 * either bound waits for a later run (the order rotates, below).
 */
export const MAX_LOSS_READS_PER_RUN = 300;
export const LOSS_READ_SPACING_MS = 1_000;
export const LOSS_READ_BUDGET_MS = 300_000;

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
  characters: PolledCharacter[];
}

export type LossRead =
  | { kind: 'ok'; losses: ShipLossEntry[] }
  /** Rate limited: no more reads this run. */
  | { kind: 'backoff' }
  | { kind: 'error' };

export interface ServerPollDeps {
  /** Devices with at least one polled event enabled. */
  listDevices(): Promise<PolledDevice[]>;
  fetchLosses(characterId: number): Promise<LossRead>;
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
  /** Spacing between zKillboard reads; injectable so tests don't wait. */
  pause?(ms: number): Promise<void>;
}

export interface ServerPollSummary {
  devices: number;
  lossReads: number;
  priceReads: number;
  pushesSent: number;
  /** True when zKillboard asked to back off, or the per-run cap was reached. */
  lossReadsStopped: boolean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Character ids in a run-dependent rotation: when more Characters want reading
 * than the cap allows, a different slice goes first each run, so nobody is
 * starved by sitting at the end of a sorted list.
 */
function rotated(ids: readonly number[], nowMs: number): number[] {
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length === 0) return sorted;
  const offset = Math.floor(nowMs / (15 * 60_000)) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

async function readLosses(
  deps: ServerPollDeps,
  characterIds: readonly number[],
  summary: ServerPollSummary
): Promise<Map<number, ShipLossEntry[]>> {
  const losses = new Map<number, ShipLossEntry[]>();
  const pause = deps.pause ?? wait;
  const startedAt = deps.now();
  for (const characterId of rotated(characterIds, startedAt)) {
    if (
      summary.lossReads >= MAX_LOSS_READS_PER_RUN ||
      deps.now() - startedAt >= LOSS_READ_BUDGET_MS
    ) {
      summary.lossReadsStopped = true;
      break;
    }
    if (summary.lossReads > 0) await pause(LOSS_READ_SPACING_MS);
    summary.lossReads++;
    const read = await deps.fetchLosses(characterId).catch((): LossRead => ({ kind: 'error' }));
    if (read.kind === 'ok') losses.set(characterId, read.losses);
    else if (read.kind === 'backoff') {
      summary.lossReadsStopped = true;
      deps.log('zKillboard asked to back off; stopping loss reads this run');
      break;
    }
  }
  return losses;
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
  const summary: ServerPollSummary = {
    devices: 0,
    lossReads: 0,
    priceReads: 0,
    pushesSent: 0,
    lossReadsStopped: false,
  };
  const devices = await deps.listDevices();
  summary.devices = devices.length;

  const lossCharacters = new Set<number>();
  const typesByStation = new Map<number, Set<number>>();
  for (const device of devices) {
    for (const character of device.characters) {
      if (character.events.includes('shipLost')) lossCharacters.add(character.characterId);
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

  const [losses, prices] = await Promise.all([
    readLosses(deps, [...lossCharacters], summary),
    readPrices(deps, typesByStation, summary),
  ]);

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

      if (events.includes('shipLost')) {
        const list = losses.get(characterId);
        if (list) {
          fires.push(
            ...diffShipLosses(
              characterId,
              previous.shipLossIds,
              list,
              inputs.shipLostMinimumIsk ?? 0
            )
          );
          next.shipLossIds = list.map((entry) => entry.killmailId);
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
  return summary;
}
