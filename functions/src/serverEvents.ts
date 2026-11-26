import { isPlainRecord } from './guards.js';
import type { SCHEDULED_STOP_REASONS } from './corpTaxBookSyncEngine.js';

export const COMMUNITY_EVENT_IDS = [
  'communityJoinRequest',
  'communityMemberJoined',
  'communityRequestPledged',
] as const;

export const VETTING_EVENT_IDS = ['vettingShared'] as const;

export const CORP_TAX_BOOK_EVENT_IDS = ['corpTaxBookSyncStopped'] as const;

export const POLLED_EVENT_IDS = ['priceAlertTriggered'] as const;
export type PolledEventId = (typeof POLLED_EVENT_IDS)[number];

export const MAX_SERVER_EVENTS = 50;
const MAX_SERVER_EVENT_ID_LENGTH = 64;
export const MAX_PRICE_ALERTS = 100;
const MAX_NAME_LENGTH = 200;

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
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
}

export interface ServerEventInputs {
  priceStationId?: number;
  priceAlerts?: PriceAlertInput[];
  incursionNearbyJumps?: number;
  skyhookRaidableNearbyJumps?: number;
}

const MAX_NEARBY_JUMPS = 100;
const nearbyJumps = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_NEARBY_JUMPS;

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function parsePriceAlert(raw: unknown, path: string): PriceAlertInput {
  if (!isPlainRecord(raw)) throw new Error(`${path} must be an object`);
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

export function parseServerInputs(raw: unknown, path: string): ServerEventInputs | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw)) throw new Error(`${path}, if present, must be an object`);
  const { priceStationId, priceAlerts, incursionNearbyJumps, skyhookRaidableNearbyJumps } = raw;
  const inputs: ServerEventInputs = {};
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
  if (nearbyJumps(incursionNearbyJumps)) inputs.incursionNearbyJumps = incursionNearbyJumps;
  if (nearbyJumps(skyhookRaidableNearbyJumps)) {
    inputs.skyhookRaidableNearbyJumps = skyhookRaidableNearbyJumps;
  }
  return inputs;
}

export function polledEventsOf(
  serverEventsByCharacter: Record<string, readonly string[]>
): string[] {
  const all = new Set(Object.values(serverEventsByCharacter).flat());
  return POLLED_EVENT_IDS.filter((id) => all.has(id));
}

export interface ServerEventBaseline {
  priceAlerts?: PriceAlertSnapshotEntry[];
}

export function trimBaseline(raw: unknown, events: readonly string[]): ServerEventBaseline {
  if (!isPlainRecord(raw)) return {};
  const baseline: ServerEventBaseline = {};
  if (events.includes('priceAlertTriggered') && Array.isArray(raw.priceAlerts)) {
    baseline.priceAlerts = raw.priceAlerts as PriceAlertSnapshotEntry[];
  }
  return baseline;
}

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

export interface VettingSharedFire {
  eventId: 'vettingShared';
  characterId: number;
  corporationId: number;
  reviewId: string;
  kind: 'application' | 'promotion';
}

export type SyncStoppedAlertReason = Exclude<(typeof SCHEDULED_STOP_REASONS)[number], 'book-off'>;

export interface CorpTaxBookSyncStoppedFire {
  eventId: 'corpTaxBookSyncStopped';
  characterId: number;
  corporationId: number;
  reason: SyncStoppedAlertReason;
  characterName: string;
  stoppedAt: number;
}

export type ServerEventFire =
  | CommunityJoinRequestFire
  | CommunityMemberJoinedFire
  | CommunityRequestPledgedFire
  | PriceAlertTriggeredFire
  | VettingSharedFire
  | CorpTaxBookSyncStoppedFire;

export interface PriceAlertSnapshotEntry extends PriceAlertInput {
  price: number | null;
}

function priceAlertCrossed(entry: PriceAlertSnapshotEntry): boolean {
  if (entry.price === null) return false;
  return entry.direction === 'above'
    ? entry.price >= entry.targetPrice
    : entry.price <= entry.targetPrice;
}

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
    case 'vettingShared':
      return [fire.characterId, fire.eventId, fire.corporationId, fire.reviewId].join(':');
    case 'corpTaxBookSyncStopped':
      return [fire.characterId, fire.eventId, fire.corporationId, fire.stoppedAt].join(':');
  }
}

const iskFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
    case 'vettingShared':
      return {
        title: 'New vetting report',
        body:
          fire.kind === 'promotion'
            ? 'A member shared the review they were asked for.'
            : 'A pilot shared a report for review.',
      };
    case 'corpTaxBookSyncStopped':
      return { title: 'Automatic sync stopped', body: syncStoppedFloorBody(fire) };
  }
}

function syncStoppedFloorBody(fire: CorpTaxBookSyncStoppedFire): string {
  const name = fire.characterName || 'The holder';
  switch (fire.reason) {
    case 'role-lost':
      return `${name} no longer has the Accountant, Director or CEO role. Turn it on again to keep the Corp Tax Book current.`;
    case 'left-corp':
      return `${name} left the corporation. Turn it on again to keep the Corp Tax Book current.`;
    case 'token-revoked':
      return `${name}'s EVE authorization was revoked or expired. Turn it on again to keep the Corp Tax Book current.`;
    case 'esi-refused':
      return `EVE no longer lets ${name}'s authorization read the mining ledger. Turn it on again to keep the Corp Tax Book current.`;
    case 'grant-unreadable':
      return `The saved grant can't be read. Turn it on again to keep the Corp Tax Book current.`;
  }
}

export function buildServerEventPush(fire: ServerEventFire, nowMs: number): Record<string, string> {
  const { title, body } = floorCopy(fire);
  return {
    characterId: String(fire.characterId),
    eventId: fire.eventId,
    occurrenceKey: serverEventOccurrenceKey(fire),
    title: title.trim() === '' ? 'Neocom Desk' : title,
    body,
    fireAt: String(nowMs),
    fire: JSON.stringify(fire),
  };
}
