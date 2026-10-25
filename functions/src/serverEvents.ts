// Server-pushed Notification Events (issue #5121): the events a closed app can
// be told about with no EVE token on the server. Pure: no Firestore, fetch or
// FCM, so the parity test at the root (`src/functionsParity.test.ts`) can import
// it next to the client's own diffs and Occurrence Keys.
//
// What a device registers for (ADR 0027; decision
// 20261025-073433-server-pushed-events-community-triggers-polled-price-alerts):
// per Character, the ids of the events it enabled for the browser channel
// (`serverEvents`) and the inputs the server cannot read on its own
// (`serverInputs`: the Quickbar's price targets and hub station, the ship-lost
// minimum). The community events need no inputs: the backend writes them.

/** The events a Firestore trigger pushes the moment the backend writes them. */
export const COMMUNITY_EVENT_IDS = [
  'communityJoinRequest',
  'communityMemberJoined',
  'communityRequestPledged',
] as const;

/** The events the 15-minute dispatch tick polls for (public market and zKillboard data). */
export const POLLED_EVENT_IDS = ['priceAlertTriggered', 'shipLost'] as const;
export type PolledEventId = (typeof POLLED_EVENT_IDS)[number];

/** Bounds a hostile or buggy upload; the real list is a handful. */
export const MAX_SERVER_EVENTS = 50;
const MAX_SERVER_EVENT_ID_LENGTH = 64;
/** The Quickbar is short; this only bounds a bad upload. */
export const MAX_PRICE_ALERTS = 100;
const MAX_NAME_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A Character's `serverEvents`: sorted, de-duplicated ids. Ids this server
 * does not handle are kept (a newer client's list is stored whole and simply
 * not acted on). Absent (an older client) stays absent.
 */
export function parseServerEvents(raw: unknown, path: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(`${path}, if present, must be an array`);
  if (raw.length > MAX_SERVER_EVENTS) {
    throw new Error(`${path} has more than ${MAX_SERVER_EVENTS} entries`);
  }
  for (const id of raw) {
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_SERVER_EVENT_ID_LENGTH) {
      throw new Error(`${path} must contain only non-empty strings`);
    }
  }
  return [...new Set(raw as string[])].sort();
}

export interface PriceAlertInput {
  typeId: number;
  /** The Quickbar's own name for the item: the server has no SDE to name it. */
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
}

export interface ServerEventInputs {
  /** The hub station the Quickbar prices at. Required with `priceAlerts`. */
  priceStationId?: number;
  priceAlerts?: PriceAlertInput[];
  /** 0 or absent: every loss. */
  shipLostMinimumIsk?: number;
  /** The Character's N for `incursionNearby` (issue #5122): jumps from its location that count as near. */
  incursionNearbyJumps?: number;
  /** The Character's N for `skyhookRaidableNearby` (issue #5122). */
  skyhookRaidableNearbyJumps?: number;
}

/** The app's options top out at 20; anything sane fits. */
const MAX_NEARBY_JUMPS = 100;
const nearbyJumps = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_NEARBY_JUMPS;

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function parsePriceAlert(raw: unknown, path: string): PriceAlertInput {
  if (!isRecord(raw)) throw new Error(`${path} must be an object`);
  const { typeId, name, targetPrice, direction } = raw;
  if (!positiveInteger(typeId)) throw new Error(`${path}.typeId must be a positive integer`);
  if (typeof name !== 'string' || name.length > MAX_NAME_LENGTH) {
    throw new Error(`${path}.name must be a string of at most ${MAX_NAME_LENGTH} characters`);
  }
  if (typeof targetPrice !== 'number' || !Number.isFinite(targetPrice) || targetPrice < 0) {
    throw new Error(`${path}.targetPrice must be a non-negative number`);
  }
  if (direction !== 'above' && direction !== 'below') {
    throw new Error(`${path}.direction must be "above" or "below"`);
  }
  return { typeId, name, targetPrice, direction };
}

/** A Character's `serverInputs`. Unknown keys are ignored, so a newer client still registers. */
export function parseServerInputs(raw: unknown, path: string): ServerEventInputs | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error(`${path}, if present, must be an object`);
  const {
    priceStationId,
    priceAlerts,
    shipLostMinimumIsk,
    incursionNearbyJumps,
    skyhookRaidableNearbyJumps,
  } = raw;
  const inputs: ServerEventInputs = {};
  // Lenient, unlike the rest of the registration: the alerts are the user's own
  // Quickbar data (no cap, free-text names), and one odd item must not fail
  // every Character's registration and Projection. A bad alert is dropped, the
  // list is cut to the cap, and alerts without a station are not stored.
  if (Array.isArray(priceAlerts) && positiveInteger(priceStationId)) {
    const alerts = priceAlerts.flatMap((alert, i) => {
      try {
        return [parsePriceAlert(alert, `${path}.priceAlerts[${i}]`)];
      } catch {
        return [];
      }
    });
    inputs.priceStationId = priceStationId;
    inputs.priceAlerts = alerts.slice(0, MAX_PRICE_ALERTS);
  }
  if (shipLostMinimumIsk !== undefined) {
    if (
      typeof shipLostMinimumIsk !== 'number' ||
      !Number.isFinite(shipLostMinimumIsk) ||
      shipLostMinimumIsk < 0
    ) {
      throw new Error(`${path}.shipLostMinimumIsk must be a non-negative number`);
    }
    inputs.shipLostMinimumIsk = shipLostMinimumIsk;
  }
  // Lenient like the price alerts: a bad N only loses that nearby alert.
  if (nearbyJumps(incursionNearbyJumps)) inputs.incursionNearbyJumps = incursionNearbyJumps;
  if (nearbyJumps(skyhookRaidableNearbyJumps)) {
    inputs.skyhookRaidableNearbyJumps = skyhookRaidableNearbyJumps;
  }
  return inputs;
}

/**
 * The polled events any Character on a device enabled: stored on the
 * registration doc so the tick finds the devices it has work for with one
 * `array-contains-any` query instead of reading every device.
 */
export function polledEventsOf(
  serverEventsByCharacter: Record<string, readonly string[]>
): string[] {
  const all = new Set(Object.values(serverEventsByCharacter).flat());
  return POLLED_EVENT_IDS.filter((id) => all.has(id));
}

/** One Character's last readings on one device, stored on its registration doc. */
export interface ServerEventBaseline {
  /** The price-alert snapshot `diffPriceAlerts` compares the next reading with. */
  priceAlerts?: PriceAlertSnapshotEntry[];
  /** Loss killmail ids last read from zKillboard. */
  shipLossIds?: number[];
}

/**
 * A stored baseline, keeping only the parts for events still enabled: an event
 * switched off and on again seeds afresh rather than announcing everything that
 * happened while it was off.
 */
export function trimBaseline(raw: unknown, events: readonly string[]): ServerEventBaseline {
  if (!isRecord(raw)) return {};
  const baseline: ServerEventBaseline = {};
  if (events.includes('priceAlertTriggered') && Array.isArray(raw.priceAlerts)) {
    baseline.priceAlerts = raw.priceAlerts as PriceAlertSnapshotEntry[];
  }
  if (events.includes('shipLost') && Array.isArray(raw.shipLossIds)) {
    baseline.shipLossIds = (raw.shipLossIds as unknown[]).filter(
      (id): id is number => typeof id === 'number'
    );
  }
  return baseline;
}

/* Fires: the same shapes the client's diffs emit (src/engine/notificationDiffs, ----- */
/* src/engine/communities/communityAlert.ts), which the service worker renders.      */

interface CommunityFireFields {
  characterId: number;
  communityId: string;
  communityName: string;
  uid: string;
  characterName: string;
  at: number;
}

export interface CommunityJoinRequestFire extends CommunityFireFields {
  eventId: 'communityJoinRequest';
}

export interface CommunityMemberJoinedFire extends CommunityFireFields {
  eventId: 'communityMemberJoined';
}

export interface CommunityRequestPledgedFire extends CommunityFireFields {
  eventId: 'communityRequestPledged';
  requestId: string;
  requestLabel: string;
  count: number;
}

export interface PriceAlertTriggeredFire {
  eventId: 'priceAlertTriggered';
  characterId: number;
  typeId: number;
  name: string;
  price: number;
  targetPrice: number;
  direction: 'above' | 'below';
}

export interface ShipLostFire {
  eventId: 'shipLost';
  characterId: number;
  killmailId: number;
  timeMs: number;
  shipTypeId?: number;
  systemId?: number;
  value?: number;
}

export type ServerEventFire =
  | CommunityJoinRequestFire
  | CommunityMemberJoinedFire
  | CommunityRequestPledgedFire
  | PriceAlertTriggeredFire
  | ShipLostFire;

/* Price alerts: mirrors `diffPriceAlertTriggered` (src/engine/notificationDiffs/market.ts) */

export interface PriceAlertSnapshotEntry extends PriceAlertInput {
  /** Null when the hub has no sell order for it: never fires, never guessed. */
  price: number | null;
}

function priceAlertCrossed(entry: PriceAlertSnapshotEntry): boolean {
  if (entry.price === null) return false;
  return entry.direction === 'above'
    ? entry.price >= entry.targetPrice
    : entry.price <= entry.targetPrice;
}

/**
 * Fires per alert newly at or past its target: an edge on `(typeId,
 * targetPrice, direction)`, so a price that stays crossed fires once and an
 * edited target re-arms. No baseline fires nothing.
 */
export function diffPriceAlerts(
  characterId: number,
  prev: readonly PriceAlertSnapshotEntry[] | undefined,
  next: readonly PriceAlertSnapshotEntry[]
): PriceAlertTriggeredFire[] {
  if (!prev) return [];
  const prevByType = new Map(prev.map((entry) => [entry.typeId, entry]));
  const fires: PriceAlertTriggeredFire[] = [];
  for (const entry of next) {
    if (entry.price === null || !priceAlertCrossed(entry)) continue;
    const before = prevByType.get(entry.typeId);
    const sameTarget =
      before !== undefined &&
      before.targetPrice === entry.targetPrice &&
      before.direction === entry.direction;
    if (sameTarget && priceAlertCrossed(before)) continue;
    fires.push({
      eventId: 'priceAlertTriggered',
      characterId,
      typeId: entry.typeId,
      name: entry.name,
      price: entry.price,
      targetPrice: entry.targetPrice,
      direction: entry.direction,
    });
  }
  return fires;
}

/* Ship lost: mirrors `diffShipLost` (src/engine/notificationDiffs/kills.ts) ----------- */

export interface ShipLossEntry {
  killmailId: number;
  timeMs: number;
  shipTypeId?: number;
  systemId?: number;
  value?: number;
}

/**
 * Fires per loss id the baseline lacks, oldest first. No baseline seeds
 * silently. With a minimum set, a loss under it, or with no stated value, is
 * dropped for good (the next baseline holds it).
 */
export function diffShipLosses(
  characterId: number,
  seenIds: readonly number[] | undefined,
  losses: readonly ShipLossEntry[],
  minimumIsk: number
): ShipLostFire[] {
  if (!seenIds) return [];
  const seen = new Set(seenIds);
  return losses
    .filter((entry) => !seen.has(entry.killmailId))
    .filter((entry) => minimumIsk <= 0 || (entry.value ?? -1) >= minimumIsk)
    .sort((a, b) => a.killmailId - b.killmailId)
    .map((entry) => ({ eventId: 'shipLost' as const, characterId, ...entry }));
}

/* Occurrence Key and date: mirror src/engine/occurrenceKey.ts ------------------------- */

/** The Foreground Poller's Occurrence Key for the same fire; the parity test pins them. */
export function serverEventOccurrenceKey(fire: ServerEventFire): string {
  switch (fire.eventId) {
    case 'communityJoinRequest':
    case 'communityMemberJoined':
      return [fire.characterId, fire.eventId, fire.communityId, fire.uid, fire.at].join(':');
    case 'communityRequestPledged':
      return [
        fire.characterId,
        fire.eventId,
        fire.communityId,
        fire.requestId,
        fire.uid,
        fire.at,
      ].join(':');
    case 'priceAlertTriggered':
      return [fire.characterId, fire.eventId, fire.typeId, fire.targetPrice, fire.direction].join(
        ':'
      );
    case 'shipLost':
      return [fire.characterId, fire.eventId, fire.killmailId].join(':');
  }
}

/** The feed row's date, as `occurrenceFiredAt` dates it: a loss by its killmail, the rest by now. */
export function serverEventFiredAt(fire: ServerEventFire, nowMs: number): number {
  return fire.eventId === 'shipLost' && Number.isFinite(fire.timeMs)
    ? Math.min(fire.timeMs, nowMs)
    : nowMs;
}

/* Push payload --------------------------------------------------------------------- */

const iskFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Plain English for the floor: the service worker renders the fire with the
 * app's own copy (`src/features/notifications/serverEventCopy.ts`) and shows
 * this only if that fails. The server has no i18n catalog (ADR 0010).
 */
function floorCopy(fire: ServerEventFire): { title: string; body: string } {
  switch (fire.eventId) {
    case 'communityJoinRequest':
      return {
        title: `Join request for ${fire.communityName}`,
        body: `${fire.characterName} asked to join ${fire.communityName}.`,
      };
    case 'communityMemberJoined':
      return {
        title: `New member in ${fire.communityName}`,
        body: `${fire.characterName} joined ${fire.communityName}.`,
      };
    case 'communityRequestPledged':
      return {
        title: `New Pledge in ${fire.communityName}`,
        body: `${fire.characterName || 'A Member'} Pledged on your Request for ${fire.requestLabel}.`,
      };
    case 'priceAlertTriggered':
      return {
        title: 'Price alert',
        body: `${fire.name} reached ${iskFormat.format(fire.price)} ISK (target ${iskFormat.format(fire.targetPrice)} ISK).`,
      };
    case 'shipLost':
      return { title: 'Ship lost', body: 'Lost a ship' };
  }
}

/**
 * The FCM data payload `pushHandler.ts` parses: the usual fields plus `fire`,
 * the raw fire as JSON, which the worker renders and keys the feed row by.
 */
export function buildServerEventPush(fire: ServerEventFire, nowMs: number): Record<string, string> {
  const { title, body } = floorCopy(fire);
  return {
    characterId: String(fire.characterId),
    eventId: fire.eventId,
    occurrenceKey: serverEventOccurrenceKey(fire),
    title: title.trim() === '' ? 'Neocom Desk' : title,
    body,
    fireAt: String(serverEventFiredAt(fire, nowMs)),
    fire: JSON.stringify(fire),
  };
}
