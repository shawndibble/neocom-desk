/**
 * Pure per-character Notification Event toggle helpers.
 *
 * Every event is on by default (CONTEXT.md round 20), so absence from the map
 * means enabled, not unset — mirroring `assetSelection.ts`'s tri-state shape
 * but keyed by event id with a default-true map instead of a `Set`.
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
import type { SelectionState } from '@/features/character/assetSelection';
import type { NotificationEventId } from './events';

export const NOTIFICATION_CHANNELS = ['browser', 'feed'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Per-channel flags, or a legacy bare boolean meaning "both channels". */
export type EventChannelState = boolean | Partial<Record<NotificationChannel, boolean>>;

export type EventEnabledMap = Partial<Record<NotificationEventId, EventChannelState>>;

export function isEventEnabledFor(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): boolean {
  const state = map[eventId];
  if (state === undefined) return true;
  if (typeof state === 'boolean') return state;
  return state[channel] ?? true;
}

export function selectionStateForEvents(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap,
  channel: NotificationChannel
): SelectionState {
  if (eventIds.length === 0) return 'unchecked';
  const enabledCount = eventIds.filter((id) => isEventEnabledFor(map, id, channel)).length;
  if (enabledCount === 0) return 'unchecked';
  return enabledCount === eventIds.length ? 'checked' : 'indeterminate';
}

/** Flips one event on one channel, preserving whatever the other channel said. */
export function toggleEventChannel(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): EventEnabledMap {
  const next: Partial<Record<NotificationChannel, boolean>> = {};
  for (const c of NOTIFICATION_CHANNELS) next[c] = isEventEnabledFor(map, eventId, c);
  next[channel] = !next[channel];
  return { ...map, [eventId]: next };
}

/**
 * Column select-all: cascades over one channel only — checked or
 * indeterminate both fill in to fully enabled; only a fully-enabled column
 * clears. The other channel's flags are carried through untouched.
 */
export function toggleAllEventsOnChannel(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap,
  channel: NotificationChannel
): EventEnabledMap {
  const allEnabled =
    eventIds.length > 0 && eventIds.every((id) => isEventEnabledFor(map, id, channel));
  const next: EventEnabledMap = { ...map };
  for (const id of eventIds) {
    const flags: Partial<Record<NotificationChannel, boolean>> = {};
    for (const c of NOTIFICATION_CHANNELS) flags[c] = isEventEnabledFor(map, id, c);
    flags[channel] = !allEnabled;
    next[id] = flags;
  }
  return next;
}

/**
 * A presentation grouping over the Notification Allow-List (CONTEXT.md round
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
 * The closed Notification Allow-List (CONTEXT.md round 44): a `type` outside
 * it is dropped at the poller (`foregroundPoller.ts`) before it reaches
 * either delivery channel or any name-resolution work, rather than opted out
 * from a much larger catalog after the fact (round 34's model — the live ESI
 * catalog turned out to hold 254 types, not the ~100 that assumed). This is
 * tranches one and two: the 26 types that already have hand-written bodies in
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
  { type: 'MoonminingExtractionFinished', family: 'moonMining' },
  { type: 'MoonminingAutomaticFracture', family: 'moonMining' },
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

export type EveTypeChannelState = Partial<Record<NotificationChannel, boolean>>;
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

/** Flips one type on one channel, preserving whatever the other channel said. */
export function toggleEveTypeChannel(
  map: EveTypeEnabledMap,
  type: string,
  channel: NotificationChannel
): EveTypeEnabledMap {
  const next: EveTypeChannelState = {};
  for (const c of NOTIFICATION_CHANNELS) next[c] = isEveTypeEnabledFor(map, type, c);
  next[channel] = !next[channel];
  return { ...map, [type]: next };
}

/** Family header select-all/none state (issue #352) — same shape as `selectionStateForEvents`. */
export function selectionStateForEveTypes(
  types: readonly string[],
  map: EveTypeEnabledMap,
  channel: NotificationChannel
): SelectionState {
  if (types.length === 0) return 'unchecked';
  const enabledCount = types.filter((type) => isEveTypeEnabledFor(map, type, channel)).length;
  if (enabledCount === 0) return 'unchecked';
  return enabledCount === types.length ? 'checked' : 'indeterminate';
}

/**
 * Family header select-all/none toggle (issue #352) — same cascade semantics
 * as `toggleAllEventsOnChannel`: fills a partial column to fully enabled;
 * only a fully-enabled column clears. The other channel is carried through.
 */
export function toggleAllEveTypesOnChannel(
  types: readonly string[],
  map: EveTypeEnabledMap,
  channel: NotificationChannel
): EveTypeEnabledMap {
  const allEnabled =
    types.length > 0 && types.every((type) => isEveTypeEnabledFor(map, type, channel));
  const next: EveTypeEnabledMap = { ...map };
  for (const type of types) {
    const flags: EveTypeChannelState = {};
    for (const c of NOTIFICATION_CHANNELS) flags[c] = isEveTypeEnabledFor(map, type, c);
    flags[channel] = !allEnabled;
    next[type] = flags;
  }
  return next;
}
