/**
 * Pure per-character Notification Event toggle helpers.
 *
 * Every event is on by default for both channels (CONTEXT.md round 20), so
 * absence from the map means enabled, not unset — mirroring
 * `assetSelection.ts`'s tri-state shape but keyed by event id with a
 * default-true map instead of a `Set`. `marketOrderFilled` and
 * `walletBalanceChanged` are the exception (CONTEXT.md round 45): they
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
import type { SelectionState } from '@/features/character/assetSelection';
import type { NotificationEventId } from './events';

export const NOTIFICATION_CHANNELS = ['browser', 'feed'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Per-channel flags, or a legacy bare boolean meaning "both channels". */
export type EventChannelState = boolean | Partial<Record<NotificationChannel, boolean>>;

export type EventEnabledMap = Partial<Record<NotificationEventId, EventChannelState>>;

/**
 * Events that default to feed-on/browser-off instead of on-for-both
 * (CONTEXT.md round 45) — worth a row, not worth an interruption.
 */
const EVENTS_FEED_ONLY_BY_DEFAULT: ReadonlySet<NotificationEventId> = new Set([
  'marketOrderFilled',
  'walletBalanceChanged',
]);

function eventDefaultFor(eventId: NotificationEventId, channel: NotificationChannel): boolean {
  if (channel === 'browser' && EVENTS_FEED_ONLY_BY_DEFAULT.has(eventId)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Shared per-channel toggle-map behavior
//
// `toggleEventChannel`/`toggleAllEventsOnChannel`/`selectionStateForEvents`
// below and their `*EveType*` counterparts further down implement one shape
// twice: "given a way to read whether a key is enabled on a channel, flip
// one, flip a whole column, or summarize a column's checked state." The
// three generics here are that shape's one implementation, each taking the
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

/**
 * Column select-all's new flags, for `keys` only — the caller merges these
 * back into its own map, carrying every other key through unchanged
 * (including a legacy bare boolean elsewhere, on the event side). Cascades
 * over one channel only: checked or indeterminate both fill in to fully
 * enabled; only a fully-enabled column clears.
 */
function allToggledFlags<K extends string, M>(
  keys: readonly K[],
  map: M,
  channel: NotificationChannel,
  isEnabledFor: (map: M, key: K, channel: NotificationChannel) => boolean
): Record<K, ChannelFlags> {
  const allEnabled = keys.length > 0 && keys.every((k) => isEnabledFor(map, k, channel));
  const result = {} as Record<K, ChannelFlags>;
  for (const key of keys) {
    const flags: ChannelFlags = {};
    for (const c of NOTIFICATION_CHANNELS) flags[c] = isEnabledFor(map, key, c);
    flags[channel] = !allEnabled;
    result[key] = flags;
  }
  return result;
}

function selectionStateFor<K extends string, M>(
  keys: readonly K[],
  map: M,
  channel: NotificationChannel,
  isEnabledFor: (map: M, key: K, channel: NotificationChannel) => boolean
): SelectionState {
  if (keys.length === 0) return 'unchecked';
  const enabledCount = keys.filter((k) => isEnabledFor(map, k, channel)).length;
  if (enabledCount === 0) return 'unchecked';
  return enabledCount === keys.length ? 'checked' : 'indeterminate';
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

export function selectionStateForEvents(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap,
  channel: NotificationChannel
): SelectionState {
  return selectionStateFor(eventIds, map, channel, isEventEnabledFor);
}

/** Flips one event on one channel, preserving whatever the other channel said. */
export function toggleEventChannel(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): EventEnabledMap {
  return { ...map, [eventId]: toggledFlags(map, eventId, channel, isEventEnabledFor) };
}

export function toggleAllEventsOnChannel(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap,
  channel: NotificationChannel
): EventEnabledMap {
  return { ...map, ...allToggledFlags(eventIds, map, channel, isEventEnabledFor) };
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

/** Flips one type on one channel, preserving whatever the other channel said. */
export function toggleEveTypeChannel(
  map: EveTypeEnabledMap,
  type: string,
  channel: NotificationChannel
): EveTypeEnabledMap {
  return { ...map, [type]: toggledFlags(map, type, channel, isEveTypeEnabledFor) };
}

/** Family header select-all/none state (issue #352) — same shape as `selectionStateForEvents`. */
export function selectionStateForEveTypes(
  types: readonly string[],
  map: EveTypeEnabledMap,
  channel: NotificationChannel
): SelectionState {
  return selectionStateFor(types, map, channel, isEveTypeEnabledFor);
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
  return { ...map, ...allToggledFlags(types, map, channel, isEveTypeEnabledFor) };
}
