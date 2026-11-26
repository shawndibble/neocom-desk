import type { SelectionState } from '@/features/assets/assetSelection';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';

export const NOTIFICATION_CHANNELS = ['browser', 'feed'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type EventChannelState = boolean | Partial<Record<NotificationChannel, boolean>>;

export type EventEnabledMap = Partial<Record<NotificationEventId, EventChannelState>>;

const EVENTS_FEED_ONLY_BY_DEFAULT: ReadonlySet<NotificationEventId> = new Set(
  NOTIFICATION_EVENTS.filter((event) => event.defaultChannels === 'feedOnly').map(
    (event) => event.id
  )
);

function eventDefaultFor(eventId: NotificationEventId, channel: NotificationChannel): boolean {
  if (channel === 'browser' && EVENTS_FEED_ONLY_BY_DEFAULT.has(eventId)) return false;
  return true;
}

type ChannelFlags = Partial<Record<NotificationChannel, boolean>>;

function toggledFlags<K extends string, M>(
  map: M,
  key: K,
  channel: NotificationChannel,
  isEnabledFor: (map: M, key: K, channel: NotificationChannel) => boolean
): ChannelFlags {
  const next: ChannelFlags = {};
  for (const c of NOTIFICATION_CHANNELS) next[c] = isEnabledFor(map, key, c);
  next[channel] = !next[channel];
  return next;
}

export function isEventEnabledFor(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): boolean {
  const state = map[eventId];
  if (state === undefined) return eventDefaultFor(eventId, channel);
  if (typeof state === 'boolean') return state;
  return state[channel] ?? eventDefaultFor(eventId, channel);
}

export function toggleEventChannel(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): EventEnabledMap {
  return { ...map, [eventId]: toggledFlags(map, eventId, channel, isEventEnabledFor) };
}

function eventFlagsWithChannelSet(
  prefs: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel,
  value: boolean
): ChannelFlags {
  const flags: ChannelFlags = {};
  for (const c of NOTIFICATION_CHANNELS) flags[c] = isEventEnabledFor(prefs, eventId, c);
  flags[channel] = value;
  return flags;
}

export function broadcastEventChannelFlags(
  characterIds: readonly number[],
  eventId: NotificationEventId,
  perCharacterMap: Readonly<Record<number, EventEnabledMap>>,
  channel: NotificationChannel
): Record<number, EventEnabledMap> {
  const allEnabled =
    characterIds.length > 0 &&
    characterIds.every((id) => isEventEnabledFor(perCharacterMap[id] ?? {}, eventId, channel));
  const nextEnabled = !allEnabled;
  const result: Record<number, EventEnabledMap> = {};
  for (const characterId of characterIds) {
    const prefs = perCharacterMap[characterId] ?? {};
    result[characterId] = {
      ...prefs,
      [eventId]: eventFlagsWithChannelSet(prefs, eventId, channel, nextEnabled),
    };
  }
  return result;
}

export const NOTIFICATION_FAMILIES = [
  'structures',
  'war',
  'corpGovernance',
  'bills',
  'moonMining',
  'pi',
] as const;
export type NotificationFamily = (typeof NOTIFICATION_FAMILIES)[number];

const EVE_ALLOWED_TYPE_ENTRIES: readonly { type: string; family: NotificationFamily }[] = [
  { type: 'StructureUnderAttack', family: 'structures' },
  { type: 'StructureLostShields', family: 'structures' },
  { type: 'StructureLostArmor', family: 'structures' },
  { type: 'StructureFuelAlert', family: 'structures' },
  { type: 'StructureWentLowPower', family: 'structures' },
  { type: 'StructureWentHighPower', family: 'structures' },
  { type: 'StructureServicesOffline', family: 'structures' },
  { type: 'StructureImpendingAbandonmentAssetsAtRisk', family: 'structures' },
  { type: 'StructureDestroyed', family: 'structures' },
  { type: 'StructuresJobsPaused', family: 'structures' },
  { type: 'StructuresJobsCancelled', family: 'structures' },
  { type: 'StructureLowReagentsAlert', family: 'structures' },
  { type: 'StructureNoReagentsAlert', family: 'structures' },
  { type: 'MoonminingExtractionStarted', family: 'moonMining' },
  { type: 'MoonminingExtractionFinished', family: 'moonMining' },
  { type: 'MoonminingLaserFired', family: 'moonMining' },
  { type: 'MoonminingAutomaticFracture', family: 'moonMining' },
  { type: 'MoonminingExtractionCancelled', family: 'moonMining' },
  { type: 'CorpAllBillMsg', family: 'bills' },
  { type: 'BillOutOfMoneyMsg', family: 'bills' },
  { type: 'CorpOfficeExpirationMsg', family: 'bills' },
  { type: 'InfrastructureHubBillAboutToExpire', family: 'bills' },
  { type: 'WarDeclared', family: 'war' },
  { type: 'AllWarDeclaredMsg', family: 'war' },
  { type: 'CorpBecameWarEligible', family: 'war' },
  { type: 'CorpAppNewMsg', family: 'corpGovernance' },
  { type: 'CorpKicked', family: 'corpGovernance' },
  { type: 'OrbitalAttacked', family: 'pi' },
  { type: 'OrbitalReinforced', family: 'pi' },
];

export const EVE_ALLOWED_TYPES: readonly string[] = EVE_ALLOWED_TYPE_ENTRIES.map((e) => e.type);

const EVE_ALLOWED_TYPES_SET: ReadonlySet<string> = new Set(EVE_ALLOWED_TYPES);

export function eveTypesByFamily(family: NotificationFamily): readonly string[] {
  return EVE_ALLOWED_TYPE_ENTRIES.filter((e) => e.family === family).map((e) => e.type);
}

export function isEveTypeAllowed(type: string): boolean {
  return EVE_ALLOWED_TYPES_SET.has(type);
}

export const EVE_TYPE_DEFAULT: Readonly<Record<NotificationChannel, boolean>> = {
  browser: false,
  feed: true,
};

const EVE_TYPES_BROWSER_ON_BY_DEFAULT: ReadonlySet<string> = new Set([
  'StructureUnderAttack',
  'StructureLostShields',
  'StructureLostArmor',
  'StructureDestroyed',
  'OrbitalAttacked',
  'OrbitalReinforced',
  'CorpKicked',
]);

function eveTypeDefaultFor(type: string, channel: NotificationChannel): boolean {
  if (channel === 'browser' && EVE_TYPES_BROWSER_ON_BY_DEFAULT.has(type)) return true;
  return EVE_TYPE_DEFAULT[channel];
}

export type EveTypeChannelState = ChannelFlags;
export type EveTypeEnabledMap = Record<string, EveTypeChannelState>;

export function isEveTypeEnabledFor(
  map: EveTypeEnabledMap,
  type: string,
  channel: NotificationChannel
): boolean {
  const state = map[type];
  if (state === undefined) return eveTypeDefaultFor(type, channel);
  return state[channel] ?? eveTypeDefaultFor(type, channel);
}

export function enabledEveTypesForBrowser(
  map: EveTypeEnabledMap,
  knownTypes: readonly string[]
): string[] {
  return [...new Set(knownTypes)]
    .filter((type) => isEveTypeEnabledFor(map, type, 'browser'))
    .sort();
}

export function extraEveTypes(seenTypes: readonly string[]): string[] {
  return [...new Set(seenTypes.filter((type) => !isEveTypeAllowed(type)))].sort();
}

export function toggleEveTypeChannel(
  map: EveTypeEnabledMap,
  type: string,
  channel: NotificationChannel
): EveTypeEnabledMap {
  return { ...map, [type]: toggledFlags(map, type, channel, isEveTypeEnabledFor) };
}

export function selectionStateForAllCharactersEveTypes(
  characterIds: readonly number[],
  types: readonly string[],
  perCharacterMap: Readonly<Record<number, EveTypeEnabledMap>>,
  channel: NotificationChannel
): SelectionState {
  if (characterIds.length === 0 || types.length === 0) return 'unchecked';
  const total = characterIds.length * types.length;
  let enabledCount = 0;
  for (const characterId of characterIds) {
    const map = perCharacterMap[characterId] ?? {};
    for (const type of types) {
      if (isEveTypeEnabledFor(map, type, channel)) enabledCount += 1;
    }
  }
  if (enabledCount === 0) return 'unchecked';
  return enabledCount === total ? 'checked' : 'indeterminate';
}

function eveTypeFlagsWithChannelSet(
  prefs: EveTypeEnabledMap,
  type: string,
  channel: NotificationChannel,
  value: boolean
): ChannelFlags {
  const flags: ChannelFlags = {};
  for (const c of NOTIFICATION_CHANNELS) flags[c] = isEveTypeEnabledFor(prefs, type, c);
  flags[channel] = value;
  return flags;
}

export function broadcastEveTypeChannelFlags(
  characterIds: readonly number[],
  type: string,
  perCharacterMap: Readonly<Record<number, EveTypeEnabledMap>>,
  channel: NotificationChannel
): Record<number, EveTypeEnabledMap> {
  const allEnabled =
    characterIds.length > 0 &&
    characterIds.every((id) => isEveTypeEnabledFor(perCharacterMap[id] ?? {}, type, channel));
  const nextEnabled = !allEnabled;
  const result: Record<number, EveTypeEnabledMap> = {};
  for (const characterId of characterIds) {
    const prefs = perCharacterMap[characterId] ?? {};
    result[characterId] = {
      ...prefs,
      [type]: eveTypeFlagsWithChannelSet(prefs, type, channel, nextEnabled),
    };
  }
  return result;
}

export function broadcastAllEveTypesChannelFlags(
  characterIds: readonly number[],
  types: readonly string[],
  perCharacterMap: Readonly<Record<number, EveTypeEnabledMap>>,
  channel: NotificationChannel
): Record<number, EveTypeEnabledMap> {
  const allEnabled =
    characterIds.length > 0 &&
    types.length > 0 &&
    characterIds.every((id) => {
      const prefs = perCharacterMap[id] ?? {};
      return types.every((type) => isEveTypeEnabledFor(prefs, type, channel));
    });
  const nextEnabled = !allEnabled;
  const result: Record<number, EveTypeEnabledMap> = {};
  for (const characterId of characterIds) {
    const prefs = perCharacterMap[characterId] ?? {};
    const nextPrefs: EveTypeEnabledMap = { ...prefs };
    for (const type of types) {
      nextPrefs[type] = eveTypeFlagsWithChannelSet(prefs, type, channel, nextEnabled);
    }
    result[characterId] = nextPrefs;
  }
  return result;
}
