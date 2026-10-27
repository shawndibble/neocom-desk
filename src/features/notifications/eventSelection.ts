/**
 * Pure per-character Notification Event toggle helpers.
 *
 * Every event is on by default for both channels (GLOSSARY.md round 20), so
 * absence from the map means enabled, not unset — mirroring
 * `assetSelection.ts`'s tri-state shape but keyed by event id with a
 * default-true map instead of a `Set`. `marketOrderFilled` and
 * `walletBalanceChanged` are the exception (GLOSSARY.md round 45): they
 * default to feed-on/browser-off, the same reasoning in reverse as
 * `eveTypeDefaultFor`'s default below — worth a row, not worth an
 * interruption.
 *
 * A toggle is now **per delivery channel**: an event can raise a browser
 * notification but stay out of the Overview feed, or the reverse. The two are
 * genuinely different appetites — a wallet tick worth a row on a dashboard is
 * not necessarily worth interrupting someone for.
 *
 * `EventChannelState` accepts a bare boolean as well as the per-channel
 * object, because that is exactly what preferences written before channels
 * existed contain. A stored `false` meant "not at all", so it reads as false
 * for both channels; absence still reads as true for both. Normalising on
 * read rather than migrating on write means a device that downgrades does not
 * lose its settings.
 */
import type { SelectionState } from '@/features/assets/assetSelection';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';

export const NOTIFICATION_CHANNELS = ['browser', 'feed'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Per-channel flags, or a legacy bare boolean meaning "both channels". */
export type EventChannelState = boolean | Partial<Record<NotificationChannel, boolean>>;

export type EventEnabledMap = Partial<Record<NotificationEventId, EventChannelState>>;

/**
 * Events that default to feed-on/browser-off instead of on-for-both
 * (GLOSSARY.md round 45) — worth a row, not worth an interruption. Declared per
 * event in the catalog (`events.ts`'s `defaultChannels`, where the reasoning
 * for each lives), read here.
 */
const EVENTS_FEED_ONLY_BY_DEFAULT: ReadonlySet<NotificationEventId> = new Set(
  NOTIFICATION_EVENTS.filter((event) => event.defaultChannels === 'feedOnly').map(
    (event) => event.id
  )
);

function eventDefaultFor(eventId: NotificationEventId, channel: NotificationChannel): boolean {
  if (channel === 'browser' && EVENTS_FEED_ONLY_BY_DEFAULT.has(eventId)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Shared per-channel toggle-map behavior
//
// `toggleEventChannel` below and its `*EveType*` counterpart further down
// implement one shape twice: "given a way to read whether a key is enabled on a channel, flip
// one." The generic here is that shape's one implementation, taking the
// caller's own `isEnabledFor` as its reader rather than a map directly — so
// they never need to know `EventEnabledMap`'s legacy bare-boolean case
// (`EventChannelState`) exists at all, and produce only object-shaped
// `ChannelFlags`, which both `EventChannelState` and `EveTypeChannelState`
// accept without a cast. `isEventEnabledFor`/`isEveTypeEnabledFor` stay
// separate, tiny functions: reading a stored value is the one part that
// genuinely differs between the two (the event side alone must still accept
// a bare boolean), and forcing it into the shared shape would mean the
// eveType side newly "handling" a case its own data can never contain.
// ---------------------------------------------------------------------------

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

/** Flips one event on one channel, preserving whatever the other channel said. */
export function toggleEventChannel(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): EventEnabledMap {
  return { ...map, [eventId]: toggledFlags(map, eventId, channel, isEventEnabledFor) };
}

/** One event's channel flags with `channel` forced to `value`, the other channel carried through unchanged. */
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

/**
 * Broadcast cascade for one event's channel across every known Character
 * (issue #738): any state where at
 * least one Character disagrees, or all are off, turns every Character on;
 * only full agreement-on turns them all off. Returns one merged `EventEnabledMap` per Character,
 * ready to spread into `perCharacter`.
 */
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

/**
 * A presentation grouping over the Notification Allow-List (GLOSSARY.md round
 * 44) — carries no defaults, gates no delivery. Exists so Settings can be
 * enumerated up front and bulk-toggled by coherent set (issue #352).
 */
export const NOTIFICATION_FAMILIES = [
  'structures',
  'war',
  'corpGovernance',
  'bills',
  'moonMining',
  'pi',
] as const;
export type NotificationFamily = (typeof NOTIFICATION_FAMILIES)[number];

/**
 * The closed Notification Allow-List (GLOSSARY.md round 44): a `type` outside
 * it is dropped at the poller (`foregroundPoller.ts`) before it reaches
 * either delivery channel or any name-resolution work, rather than opted out
 * from a much larger catalog after the fact (round 34's model — the live ESI
 * catalog turned out to hold 254 types, not the ~100 that assumed). This is
 * tranches one and two plus the moon drill's full cycle (issue #4058): the 29
 * types that already have hand-written bodies in
 * `notifications.fired.eveNotification.types` (`src/i18n/locales/en.json`).
 *
 * A type's Family lives beside it here (issue #352, AC5), not in a separate
 * table, so adding a type is one change, not two.
 */
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

/** The allow-listed types belonging to one Family, in allow-list order. */
export function eveTypesByFamily(family: NotificationFamily): readonly string[] {
  return EVE_ALLOWED_TYPE_ENTRIES.filter((e) => e.family === family).map((e) => e.type);
}

/** Whether `type` is on the closed allow-list — the poller's drop gate. */
export function isEveTypeAllowed(type: string): boolean {
  return EVE_ALLOWED_TYPES_SET.has(type);
}

/**
 * Per-`type` opt-out underneath the single `eveNotification` event (issue
 * #274) — keyed by ESI's raw open-ended type string, not `NotificationEventId`.
 *
 * Default is **feed-on / browser-off**, the opposite of every other event's
 * default-on-both above: these are still numerous relative to other events
 * and mostly informational, so a type has to be opted *up* to a browser
 * notification rather than opted down from one.
 * `EVE_TYPES_BROWSER_ON_BY_DEFAULT` below is the exception list — losing a
 * structure, an attack on a customs office, or a corp getting kicked from
 * its alliance is worth interrupting someone for, so those default
 * browser-on too. Because these defaults differ from `isEventEnabledFor`'s,
 * they must be expressed here explicitly per channel rather than reused from
 * the "absence means enabled" idiom.
 */
export const EVE_TYPE_DEFAULT: Readonly<Record<NotificationChannel, boolean>> = {
  browser: false,
  feed: true,
};

// Must stay a subset of `EVE_ALLOWED_TYPES` — a type not on the allow-list
// never reaches this lookup (`foregroundPoller.ts` drops it first), but a
// stale entry here left behind by a future tranche change would be silent.
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

/**
 * The types, out of `knownTypes`, this device has enabled for the browser
 * channel (issue #3755, ADR 0020) — what `registerDevice` uploads so the
 * server's Alerts push honours the same per-type opt-outs. Sorted and
 * de-duplicated so the upload (and its fingerprint) is order-stable.
 */
export function enabledEveTypesForBrowser(
  map: EveTypeEnabledMap,
  knownTypes: readonly string[]
): string[] {
  return [...new Set(knownTypes)]
    .filter((type) => isEveTypeEnabledFor(map, type, 'browser'))
    .sort();
}

/** Seen types the closed allow-list does not already cover, sorted and de-duplicated. */
export function extraEveTypes(seenTypes: readonly string[]): string[] {
  return [...new Set(seenTypes.filter((type) => !isEveTypeAllowed(type)))].sort();
}

/** Flips one type on one channel, preserving whatever the other channel said. */
export function toggleEveTypeChannel(
  map: EveTypeEnabledMap,
  type: string,
  channel: NotificationChannel
): EveTypeEnabledMap {
  return { ...map, [type]: toggledFlags(map, type, channel, isEveTypeEnabledFor) };
}

/**
 * Cross-character, cross-type select-all/mixed state for a Family's own
 * family select-all header (issue #745) — the
 * scoped to whatever `types` the caller passes (a single Family's types here).
 */
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

/** One type's channel flags with `channel` forced to `value`, the other channel carried through unchanged. */
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

/**
 * Broadcast cascade for one EVE Notification type's channel across every
 * known Character (issue #745) — the eve-type counterpart of
 * `broadcastEventChannelFlags`, same cascade rule (any disagreement or
 * all-off turns everyone on; only full agreement-on turns everyone off).
 */
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

/**
 * Broadcast cascade for a whole set of EVE Notification types' channel across
 * every known Character at once (issue #745) — used for a Family's own select-all in the
 * the EVE family headers.
 */
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
