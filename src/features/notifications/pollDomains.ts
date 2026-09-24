/**
 * The polled-domain registry (issue #273): one entry per data domain the
 * Foreground Poller fetches — what it loads, how that becomes a snapshot, and
 * where the last snapshot is kept. `foregroundPoller.ts` is one generic loop
 * over `POLL_DOMAINS`.
 *
 * A domain is a *fetch*, not an event: several Notification Events can read
 * one snapshot (calendar's two, contracts' three). What each event does with
 * it — its diff, copy, projectability and thresholds — is declared once, on
 * its Event Entry (`eventEntries.ts`, issue #1285). A domain names its
 * snapshot through a `SnapshotSource` handle, and its event list, diffs and
 * live renderer are derived from the entries naming the same handle. So a
 * new event over an existing fetch is an entry there and nothing here; a new
 * fetch is a domain here plus its entries.
 *
 * What stays per-domain is what needs the fetch's own context: the `names`
 * lookups its copy needs, the Scheduled Push `projection` runner (which
 * resolves names and current thresholds, then renders each row through its
 * event's entry), and planetary's `disproven` retraction. `defineDomain` is
 * where each domain's types are erased to `unknown`, so the entry literal is
 * fully type-checked while the loop that drives all of them needs no
 * per-domain branch.
 */
import {
  loadCharacterSkillQueueWithStatus,
  loadCharacterSkillsWithStatus,
} from '@/features/skills/data';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { extractorProgramsFromPins } from '@/features/pi/adapters';
import { loadMailHeaders } from '@/features/character/mail';
import { loadCharacterNotifications } from '@/features/character/notifications';
import { loadStructureName } from '@/features/character/structures';
import { loadCalendarEvents as loadCharacterCalendarEvents } from '@/features/character/calendar';
import { loadContracts as loadCharacterContracts } from '@/features/character/contracts';
import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import { classifyStationUndercut } from '@/engine/market/stationUndercutState';
import {
  loadCorporationId,
  loadCorporationStructures,
  MASTER_WALLET_DIVISION,
} from '@/features/corp/boardData';
import { toBoardStructures } from '@/features/corp/boardSources';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import { loadCorporationMemberIds } from '@/features/corp/members';
import { loadCorporationWallets, loadCorporationWalletJournal } from '@/features/corp/wallet';
import { loadCharacterRoles, corpWideRoles } from '@/features/corp/roles';
import { corpCapabilities, type CorpCapability } from '@/engine/corpRoles';
import { db, type QuickbarItem } from '@/db';
import { getHubPrices, getStationPrices, type HubAggregate } from '@/market/prices';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import type {
  SkillQueueEntry,
  IndustryJob,
  MailHeader,
  CalendarEventSummary,
  Contract,
  MarketOrder,
  MarketOrderHistory,
  CharacterNotification,
  CorporationIndustryJob,
} from '@/esi/endpoints';
import {
  disprovenExtractorOccurrences,
  type NotificationFire,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
  type SpExtractionEntrySnapshot,
  type SpExtractionSnapshot,
  type SpExtractionFire,
  type IndustryJobSnapshot,
  type IndustryJobEntrySnapshot,
  type IndustryJobNotificationFire,
  type ColonyExtractorSnapshot,
  type ColonySnapshotEntry,
  type PlanetarySnapshot,
  type PlanetaryNotificationFire,
  type ExtractorExpiringFire,
  type MailHeaderSnapshot,
  type MailSnapshot,
  type MailNotificationFire,
  CALENDAR_EVENT_RESPONSES,
  type CalendarEventEntrySnapshot,
  type CalendarSnapshot,
  type NewCalendarEventFire,
  type CalendarEventStartingFire,
  type ContractEntrySnapshot,
  type ContractSnapshot,
  type ContractStatus,
  type ContractNotificationFire,
  type WalletJournalEntrySnapshot,
  type WalletSnapshot,
  type WalletNotificationFire,
  type MarketOrderEntrySnapshot,
  type MarketOrderSnapshot,
  type MarketOrderNotificationFire,
  buildOrderUndercutEntry,
  type OrderUndercutEntrySnapshot,
  type OrderUndercutSnapshot,
  type MarketOrderUndercutFire,
  type EveNotificationEntrySnapshot,
  type EveNotificationSnapshot,
  type EveNotificationFire,
  type StructureFuelEntrySnapshot,
  type StructureFuelSnapshot,
  type StructureFuelLowFire,
  type CorpIndustryJobEntrySnapshot,
  type CorpIndustryJobSnapshot,
  type CorpIndustryJobNotificationFire,
  type CorpRosterMemberSnapshot,
  type CorpRosterSnapshot,
  type CorpMemberJoinedFire,
  type CorpMemberLeftFire,
  type CorpWalletJournalEntrySnapshot,
  type CorpWalletDivisionSnapshot,
  type CorpWalletSnapshot,
  type CorpWalletThresholdFire,
  type PriceAlertEntrySnapshot,
  type PriceAlertSnapshot,
  type PriceAlertTriggeredFire,
} from '@/engine/notificationDiffs';
import {
  projectSkillQueue,
  projectIndustryJobs,
  projectColonies,
  projectCalendar,
  projectStructureFuel,
  projectEveNotificationReinforcementExit,
  reinforcementExitStructureIds,
  type ProjectionRow,
} from '@/engine/projection';
import { loadUniverseType } from '@/features/skills/data';
import { loadPlanetName } from '@/features/pi/names';
import { resolveNames } from '@/features/character/names';
import { loadTypeNames } from '@/features/character/typeNames';
import type { NotificationCopy } from '@/engine/notificationWording';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import { timeZoneFor, useTimeFormat } from '@/lib/timeFormat';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from './events';
import { resolveEveNotificationNames } from './eveNotificationNames';
import {
  industryItemTypeId,
  type NoNames,
  type SkillNames,
  type ItemNames,
  type PlanetNames,
  type CalendarNames,
  type MemberNames,
} from './domainCopy';
import {
  NOTIFICATION_EVENT_ENTRIES,
  SNAPSHOT_SOURCES,
  eventEntry,
  type AnyNotificationFire,
  type SnapshotSource,
} from './eventEntries';
import type { EveNotificationNames } from './eveNotificationText';
import {
  useNotificationPreferences,
  hydrateNotificationPreferences,
  characterEventThresholds,
  characterEveTypePrefs,
} from './preferences';
import { isEveTypeAllowed, isEveTypeEnabledFor } from './eventSelection';
import { createPollerStateStore, isSnapshotWith, type PollerState } from './pollerState';
import type { LocalSettingStore } from '@/lib/useLocalSetting';

/**
 * Resolves a batch of type/planet ids to display names for a Projection row
 * (issue #355) — the impure boundary the pure `engine/projection.ts` module
 * deliberately stays on the far side of. Ids that fail to resolve are simply
 * absent from the map; each `project*` caller already falls back to `#id`.
 */
async function resolveProjectionNames(
  ids: readonly number[],
  loadName: (id: number) => Promise<string | null>
): Promise<ReadonlyMap<number, string>> {
  const uniqueIds = [...new Set(ids)];
  const names = new Map<number, string>();
  await mapWithConcurrencyLimit(uniqueIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    const name = await loadName(id);
    if (name !== null) names.set(id, name);
  });
  return names;
}

async function universeTypeName(typeId: number): Promise<string | null> {
  const result = await loadUniverseType(typeId);
  return result?.data.name ?? null;
}

/** `universeTypeName` as a copy lookup: absent rather than null when unresolved. */
async function typeNameOrAbsent(typeId: number): Promise<string | undefined> {
  return (await universeTypeName(typeId)) ?? undefined;
}

/**
 * When a newly-added calendar event starts, in the pilot's chosen clock
 * (`lib/timeFormat.ts` — local, or EVE/UTC).
 *
 * Read through the store's `getState` rather than the `useTimeZone` hook: this
 * runs in the poll loop, not in a component. The preference is hydrated by the
 * time any poll runs (`ForegroundNotificationPoller` mounts inside the app),
 * and its default is the same 'local' every other surface used before the
 * preference existed, so a cold read is never wrong in a way a pilot notices.
 *
 * `undefined` when the snapshot carries no usable instant — the copy drops
 * the clause rather than printing "Invalid Date".
 */
function calendarStartLabel(startMs: number): string | undefined {
  if (!Number.isFinite(startMs)) return undefined;
  return formatCalendarTimestamp(new Date(startMs), timeZoneFor(useTimeFormat.getState().value));
}

export type { AnyNotificationFire } from './eventEntries';

/** One registry entry, as written. Fully typed; `defineDomain` erases it. */
interface PollDomainSpec<TRaw, TSnapshot, TFire extends AnyNotificationFire, TNames> {
  /**
   * The snapshot this domain produces. Its id is the domain's id, and every
   * Event Entry naming it (`eventEntries.ts`) is one of this domain's events:
   * its diff runs against this snapshot and its copy renders this domain's
   * fires with the names `names` looks up.
   */
  readonly source: SnapshotSource<TSnapshot, TNames>;
  /** Dexie `settings` key holding this domain's last snapshot per character. */
  readonly stateKey: string;
  /** Name of the snapshot's array field — `entries` for all but planetary. */
  readonly entriesKey: string;
  /** Guard for one element of that array, so a stale stored shape is discarded. */
  readonly isEntry: (raw: unknown) => boolean;
  /** Fetches this domain for one character, or null to skip it this poll. */
  readonly load: (characterId: number) => Promise<TRaw[] | null>;
  /**
   * Turns what `load` returned into the snapshot the engine diffs compare.
   * `prevSnapshot` — the character's persisted baseline from *before* this
   * poll, the same value passed to `diff` as `prev` — is offered so a domain
   * whose own snapshot needs to carry state forward across a poll that
   * observed nothing new can do so (issue #1423's `marketOrderUndercutDomain`:
   * an `armed` anti-flap latch that must survive an `unknown` poll in
   * between). Every other domain ignores the third parameter; it costs them
   * nothing since it's optional.
   */
  readonly toSnapshot: (raw: readonly TRaw[], nowMs: number, prevSnapshot?: TSnapshot) => TSnapshot;
  /**
   * The inverse of the entries' diffs: occurrences this poll can prove never
   * happened, so an alert already delivered for one can be retracted from the
   * Notification Feed. Only the planetary domain has any — see
   * `engine/notificationDiffs.disprovenExtractorOccurrences` — because only
   * there does a routine in-game action falsify a Scheduled Push that has
   * already fired, under a *different* Occurrence Key than the corrected
   * state will later produce, so nothing else revisits the row.
   *
   * The poller runs this without the per-event filter it applies to the
   * diffs: the row being retracted may have been written by Web Push or
   * another device, for either of this domain's two events, so one enabled
   * event's fetch retracts both. It does still ride on the domain being
   * fetched at all — see the call site for why that bound is right rather
   * than a gap.
   */
  readonly disproven?: (
    characterId: number,
    prev: TSnapshot | undefined,
    next: TSnapshot
  ) => TFire[];
  /**
   * Turns this poll's snapshot into Scheduled Push Projection rows (issue
   * #355, ADR 0010), rendering each through its event's entry's
   * `projection.push`. Present exactly when one of this domain's entries
   * declares a projection (`pollDomains.test.ts` holds that). Resolves
   * whatever display names the row text needs (Dexie-cached), which
   * `engine/projection.ts` deliberately cannot do itself.
   */
  readonly projection?: (
    characterId: number,
    characterName: string,
    snapshot: TSnapshot,
    nowMs: number
  ) => Promise<ProjectionRow[]>;
  /**
   * The display names the entries' `copy.poll` needs, looked up per fire.
   * Best-effort: a name it cannot resolve is left absent and the copy falls
   * back to `#id`. Omitted by a domain whose copy names nothing it has to
   * look up.
   */
  readonly names?: (fire: TFire) => Promise<TNames>;
}

/**
 * A registry entry as the poll loop sees it: the same entry with its snapshot
 * and row types erased, which is what lets one loop drive every domain.
 */
export interface PollDomain {
  readonly id: string;
  /** This domain's events, in catalog order — derived from the Event Entries naming its source. */
  readonly eventIds: readonly NotificationEventId[];
  readonly stateKey: string;
  readonly store: LocalSettingStore<PollerState<unknown>>;
  readonly load: (characterId: number) => Promise<readonly unknown[] | null>;
  readonly toSnapshot: (raw: readonly unknown[], nowMs: number, prevSnapshot?: unknown) => unknown;
  /** Every one of its events' diffs, in `eventIds` order, each run only when its own event is enabled. */
  readonly diff: (
    characterId: number,
    prev: unknown,
    next: unknown,
    enabledEvents: ReadonlySet<NotificationEventId>
  ) => AnyNotificationFire[];
  readonly disproven?: (characterId: number, prev: unknown, next: unknown) => AnyNotificationFire[];
  readonly projection?: (
    characterId: number,
    characterName: string,
    snapshot: unknown,
    nowMs: number
  ) => Promise<ProjectionRow[]>;
  /** Looks up this fire's names, then renders its live copy through its event's entry. */
  readonly render: (fire: AnyNotificationFire, characterName: string) => Promise<NotificationCopy>;
}

/**
 * The single erasure point. Inside this function a domain's `TSnapshot` is
 * known and every cast is checked against the spec above; outside it, nothing
 * needs to know which domain it is holding.
 */
function defineDomain<TRaw, TSnapshot, TFire extends AnyNotificationFire, TNames = NoNames>(
  spec: PollDomainSpec<TRaw, TSnapshot, TFire, TNames>
): PollDomain {
  const store = createPollerStateStore<TSnapshot>(
    spec.stateKey,
    isSnapshotWith<TSnapshot>(spec.entriesKey, spec.isEntry)
  );
  const eventIds = NOTIFICATION_EVENT_IDS.filter(
    (eventId) => eventEntry(eventId).source.id === spec.source.id
  );
  return {
    id: spec.source.id,
    eventIds,
    stateKey: spec.stateKey,
    store: store as unknown as LocalSettingStore<PollerState<unknown>>,
    load: spec.load,
    toSnapshot: (raw, nowMs, prevSnapshot) =>
      spec.toSnapshot(raw as readonly TRaw[], nowMs, prevSnapshot as TSnapshot | undefined),
    // One gate per event, not per domain: the fetch is skipped only when
    // every event of the domain is off, so a domain answering for two events
    // with one of them enabled must still not fire the other.
    diff: (characterId, prev, next, enabledEvents) => {
      const fires: AnyNotificationFire[] = [];
      for (const eventId of eventIds) {
        if (!enabledEvents.has(eventId)) continue;
        fires.push(...eventEntry(eventId).diff(characterId, prev, next));
      }
      return fires;
    },
    disproven: spec.disproven
      ? (characterId, prev, next) =>
          spec.disproven!(characterId, prev as TSnapshot | undefined, next as TSnapshot)
      : undefined,
    projection: spec.projection
      ? (characterId, characterName, snapshot, nowMs) =>
          spec.projection!(characterId, characterName, snapshot as TSnapshot, nowMs)
      : undefined,
    // Only ever handed a fire whose eventId is in `eventIds` —
    // `domainForEvent` is the one caller that picks the domain.
    render: async (fire, characterName) => {
      const names = spec.names ? await spec.names(fire as TFire) : ({} as TNames);
      return eventEntry(fire.eventId).copy.poll(fire, characterName, names);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Skill queue                                                                 */
/* -------------------------------------------------------------------------- */

function isSkillQueueEntrySnapshot(raw: unknown): raw is SkillQueueEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.skillId !== 'number' ||
    typeof r.finishedLevel !== 'number' ||
    typeof r.queuePosition !== 'number' ||
    (r.finishMs !== null && typeof r.finishMs !== 'number')
  ) {
    return false;
  }
  // Optional in storage as well as on the wire: every snapshot written
  // before `diffSkillQueueEnding` needed `endingLeadMs` (issue #1410) lacks
  // the field, and those must stay readable rather than being discarded as a
  // stale shape on the first poll after an update — the same
  // `ColonyExtractorSnapshot.installTimeMs` precedent.
  return r.endingLeadMs === undefined || typeof r.endingLeadMs === 'number';
}

function toSkillQueueEntrySnapshot(
  entry: SkillQueueEntry,
  endingLeadMs: number
): SkillQueueEntrySnapshot {
  const finishMs = entry.finish_date ? Date.parse(entry.finish_date) : NaN;
  return {
    skillId: entry.skill_id,
    finishedLevel: entry.finished_level,
    queuePosition: entry.queue_position,
    finishMs: Number.isFinite(finishMs) ? finishMs : null,
    endingLeadMs,
  };
}

export const skillQueueDomain = defineDomain<
  SkillQueueEntrySnapshot,
  SkillQueueSnapshot,
  NotificationFire,
  SkillNames
>({
  source: SNAPSHOT_SOURCES.skillQueue,
  stateKey: 'notifications.pollerState.skillQueue',
  entriesKey: 'entries',
  isEntry: isSkillQueueEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterSkillQueueWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const endingLeadMs = (await currentThresholds(characterId)).skillQueueEndingLeadHours * HOUR_MS;
    return result.cached.data.map((entry) => toSkillQueueEntrySnapshot(entry, endingLeadMs));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // The baseline's baked-in `endingLeadMs` stays as the diff needs it (the
  // setting in force at load time); the Projection instead uses the current
  // lead time, so a Settings change rebuilt from that baseline (issue #1248,
  // `projectionRebuild.ts`) projects the new warning time, not the old one —
  // the same split `colonyDomain.projection` documents in full.
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const endingLeadMs = (await currentThresholds(characterId)).skillQueueEndingLeadHours * HOUR_MS;
    const entries = snapshot.entries.map((entry) => ({ ...entry, endingLeadMs }));
    const skillNames = await resolveProjectionNames(
      entries.map((entry) => entry.skillId),
      universeTypeName
    );
    return projectSkillQueue(
      characterId,
      characterName,
      entries,
      skillNames,
      (fire, character, names) =>
        NOTIFICATION_EVENT_ENTRIES[fire.eventId].projection.push(fire, character, names),
      nowMs
    );
  },
  names: async (fire) => ({
    skill: fire.skillId === null ? undefined : await typeNameOrAbsent(fire.skillId),
  }),
});

/* -------------------------------------------------------------------------- */
/* SP extraction (grilling session, 2026-09-09)                               */
/* -------------------------------------------------------------------------- */

function isSpExtractionEntrySnapshot(raw: unknown): raw is SpExtractionEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.totalSp === 'number' && typeof r.thresholdSp === 'number';
}

/** Re-read every poll, same reasoning as `currentThresholds` below: AC4's "without a reload" needs the live value, not a value captured at store-creation time. */
async function currentSpExtractionEnabled(): Promise<boolean> {
  await useSpExtractionMonitoringEnabled.getState().hydrate();
  return useSpExtractionMonitoringEnabled.getState().value;
}

async function currentSpExtractionThresholdSp(): Promise<number> {
  await useSpExtractionThresholdSp.getState().hydrate();
  return useSpExtractionThresholdSp.getState().value;
}

export const spExtractionDomain = defineDomain<
  SpExtractionEntrySnapshot,
  SpExtractionSnapshot,
  SpExtractionFire
>({
  source: SNAPSHOT_SOURCES.spExtraction,
  stateKey: 'notifications.pollerState.spExtraction',
  entriesKey: 'entries',
  isEntry: isSpExtractionEntrySnapshot,
  load: async (characterId) => {
    // The opt-in gate: skipped entirely (no ESI call at all) unless the
    // pilot has turned monitoring on, matching `corpContextFor`'s "err
    // toward not calling the endpoint" precedent above.
    if (!(await currentSpExtractionEnabled())) return null;
    const result = await loadCharacterSkillsWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const thresholdSp = await currentSpExtractionThresholdSp();
    // Exactly one entry — see SpExtractionSnapshot's doc comment for why it's
    // an array at all.
    return [{ totalSp: result.cached.data.total_sp, thresholdSp }];
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});

/* -------------------------------------------------------------------------- */
/* Industry jobs                                                               */
/* -------------------------------------------------------------------------- */

function isIndustryJobEntrySnapshot(raw: unknown): raw is IndustryJobEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.jobId === 'number' &&
    typeof r.endMs === 'number' &&
    typeof r.blueprintTypeId === 'number' &&
    (r.productTypeId === null || typeof r.productTypeId === 'number') &&
    typeof r.activityId === 'number'
  );
}

function toIndustryJobEntrySnapshot(job: IndustryJob): IndustryJobEntrySnapshot {
  return {
    jobId: job.job_id,
    endMs: Date.parse(job.end_date),
    blueprintTypeId: job.blueprint_type_id,
    productTypeId: job.product_type_id ?? null,
    activityId: job.activity_id,
  };
}

export const industryJobDomain = defineDomain<
  IndustryJob,
  IndustryJobSnapshot,
  IndustryJobNotificationFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.industryJobs,
  stateKey: 'notifications.pollerState.industryJobs',
  entriesKey: 'entries',
  isEntry: isIndustryJobEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterIndustryJobs(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (jobs, nowMs) => ({ entries: jobs.map(toIndustryJobEntrySnapshot), nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const itemNames = await resolveProjectionNames(
      snapshot.entries.map((entry) => entry.productTypeId ?? entry.blueprintTypeId),
      universeTypeName
    );
    return projectIndustryJobs(
      characterId,
      characterName,
      snapshot.entries,
      itemNames,
      NOTIFICATION_EVENT_ENTRIES.industryJobComplete.projection.push,
      nowMs
    );
  },
  names: async (fire) => ({ item: await typeNameOrAbsent(industryItemTypeId(fire)) }),
});

/* -------------------------------------------------------------------------- */
/* Planetary colonies                                                          */
/* -------------------------------------------------------------------------- */

function isExtractorSnapshot(raw: unknown): raw is ColonyExtractorSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.pinId !== 'number' ||
    typeof r.expiryTimeMs !== 'number' ||
    typeof r.thresholdMs !== 'number'
  ) {
    return false;
  }
  // Optional in storage as well as on the wire: every snapshot written before
  // `disprovenExtractorOccurrences` needed `install_time` lacks the field,
  // and those must stay readable rather than being discarded as a stale shape
  // on the first poll after an update.
  return r.installTimeMs === undefined || typeof r.installTimeMs === 'number';
}

function isColonySnapshotEntry(raw: unknown): raw is ColonySnapshotEntry {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.planetId === 'number' &&
    Array.isArray(r.extractors) &&
    r.extractors.every(isExtractorSnapshot)
  );
}

export const colonyDomain = defineDomain<
  ColonySnapshotEntry,
  PlanetarySnapshot,
  PlanetaryNotificationFire | ExtractorExpiringFire,
  PlanetNames
>({
  source: SNAPSHOT_SOURCES.colonies,
  stateKey: 'notifications.pollerState.colonies',
  entriesKey: 'colonies',
  isEntry: isColonySnapshotEntry,
  load: async (characterId) => {
    const planetsResult = await loadCharacterPlanets(characterId);
    if (planetsResult.needsReauth || planetsResult.cached === null) return null;
    const planets = planetsResult.cached.data;
    const details = await loadAllColonyDetails(
      characterId,
      planets.map((p) => p.planet_id)
    );
    const thresholds = await currentThresholds(characterId);
    const thresholdMs = thresholds.extractorExpiringLeadHours * HOUR_MS;
    const colonies: ColonySnapshotEntry[] = [];
    for (const planet of planets) {
      const detail = details.get(planet.planet_id);
      if (!detail || detail.needsReauth || detail.cached === null) continue;
      const programs = extractorProgramsFromPins(detail.cached.data.pins);
      colonies.push({
        planetId: planet.planet_id,
        extractors: programs.map((p) => ({
          pinId: p.pinId,
          expiryTimeMs: p.expiryTimeMs,
          thresholdMs,
          ...(p.installTimeMs !== undefined ? { installTimeMs: p.installTimeMs } : {}),
          // Carried only for `disprovenExtractorOccurrences`; no warning
          // reads it (ADR 0005). Omitted rather than defaulted when ESI left
          // it out, since a default would be evidence this does not have.
        })),
      });
    }
    return colonies;
  },
  toSnapshot: (colonies, nowMs) => ({ colonies: [...colonies], nowMs }),
  disproven: disprovenExtractorOccurrences,
  // The baseline's baked-in `thresholdMs` stays as the diff needs it (the
  // setting in force at load time); the Projection instead uses the current
  // lead time, so a Settings change rebuilt from that baseline (issue #1248,
  // `projectionRebuild.ts`) projects the new warning time, not the old one.
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const thresholdMs = (await currentThresholds(characterId)).extractorExpiringLeadHours * HOUR_MS;
    const colonies = snapshot.colonies.map((colony) => ({
      ...colony,
      extractors: colony.extractors.map((extractor) => ({ ...extractor, thresholdMs })),
    }));
    const planetNames = await resolveProjectionNames(
      colonies.map((colony) => colony.planetId),
      loadPlanetName
    );
    return projectColonies(
      characterId,
      characterName,
      colonies,
      planetNames,
      (fire, character, names) =>
        fire.eventId === 'planetaryExtractionDone'
          ? NOTIFICATION_EVENT_ENTRIES.planetaryExtractionDone.projection.push(
              fire,
              character,
              names
            )
          : NOTIFICATION_EVENT_ENTRIES.planetaryExtractorExpiring.projection.push(
              fire,
              character,
              names
            ),
      nowMs
    );
  },
  names: async (fire) => ({ planet: (await loadPlanetName(fire.planetId)) ?? undefined }),
});

/* -------------------------------------------------------------------------- */
/* Mail                                                                        */
/* -------------------------------------------------------------------------- */

function isMailHeaderSnapshot(raw: unknown): raw is MailHeaderSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.mailId === 'number';
}

export const mailDomain = defineDomain<MailHeader, MailSnapshot, MailNotificationFire>({
  source: SNAPSHOT_SOURCES.mail,
  stateKey: 'notifications.pollerState.mail',
  entriesKey: 'entries',
  isEntry: isMailHeaderSnapshot,
  load: async (characterId) => {
    const result = await loadMailHeaders(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (headers, nowMs) => ({
    entries: headers.map((header) => ({ mailId: header.mail_id })),
    nowMs,
  }),
});

/* -------------------------------------------------------------------------- */
/* Calendar                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `title` and `response` are deliberately **not** required: this validates
 * persisted baselines, and a snapshot written before either field existed is
 * still a usable baseline. Rejecting it would discard the high-water mark and
 * re-announce every event on the calendar as new.
 */
function isCalendarEventEntrySnapshot(raw: unknown): raw is CalendarEventEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (r.title !== undefined && typeof r.title !== 'string') return false;
  if (
    r.response !== undefined &&
    !(CALENDAR_EVENT_RESPONSES as readonly unknown[]).includes(r.response)
  ) {
    return false;
  }
  return typeof r.calendarEventId === 'number' && typeof r.startMs === 'number';
}

export const calendarDomain = defineDomain<
  CalendarEventSummary,
  CalendarSnapshot,
  NewCalendarEventFire | CalendarEventStartingFire,
  CalendarNames
>({
  source: SNAPSHOT_SOURCES.calendar,
  stateKey: 'notifications.pollerState.calendar',
  entriesKey: 'entries',
  isEntry: isCalendarEventEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterCalendarEvents(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (events, nowMs) => ({
    entries: events.map((event) => ({
      calendarEventId: event.event_id,
      startMs: Date.parse(event.event_date),
      title: event.title,
      response: event.event_response,
    })),
    nowMs,
  }),
  // The one domain running two diffs off a single snapshot and a single fetch:
  // each is gated on its own event so switching one off leaves the other alone.
  // `newCalendarEvent` has no fixed future timestamp to project — only
  // `calendarEventStarting`'s `startMs` is; the pure `projectCalendar`
  // already emits `calendarEventStarting` rows exclusively.
  projection: async (characterId, characterName, snapshot, nowMs) =>
    projectCalendar(
      characterId,
      characterName,
      snapshot.entries,
      NOTIFICATION_EVENT_ENTRIES.calendarEventStarting.projection.push,
      nowMs
    ),
  names: async (fire) =>
    fire.eventId === 'newCalendarEvent' ? { when: calendarStartLabel(fire.startMs) } : {},
});

/* -------------------------------------------------------------------------- */
/* Contracts                                                                   */
/* -------------------------------------------------------------------------- */

const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'outstanding',
  'in_progress',
  'finished_issuer',
  'finished_contractor',
  'finished',
  'cancelled',
  'rejected',
  'failed',
  'deleted',
  'reversed',
];

function isContractStatus(raw: unknown): raw is ContractStatus {
  return typeof raw === 'string' && (CONTRACT_STATUSES as readonly string[]).includes(raw);
}

/**
 * Strict about `issuerId`/`acceptorId` for the same reason `isWalletJournalEntrySnapshot`
 * is strict about `dateMs` (issue #1091): a baseline written before these
 * fields existed fails validation, so `pollerState.ts` reads it as `null` and
 * the first poll after this change fires nothing rather than replaying every
 * contract's history against a baseline that never recorded who was party to it.
 *
 * The invalidation is store-wide, not per-character: `isSnapshotWith`'s
 * `entries.every(isEntry)` fails a whole character's snapshot on one bad
 * entry, and `isPollerState` requires every character in the stored blob to
 * pass — so one character still on a pre-#1091 baseline invalidates
 * `notifications.pollerState.contracts` for every character on the device,
 * not just that one. Still net-correct (no false completed/failed backfire
 * for anyone), just a wider one-time reset than "a baseline" implies.
 */
function isContractEntrySnapshot(raw: unknown): raw is ContractEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.contractId === 'number' &&
    isContractStatus(r.status) &&
    typeof r.issuerId === 'number' &&
    typeof r.acceptorId === 'number'
  );
}

export const contractDomain = defineDomain<Contract, ContractSnapshot, ContractNotificationFire>({
  source: SNAPSHOT_SOURCES.contracts,
  stateKey: 'notifications.pollerState.contracts',
  entriesKey: 'entries',
  isEntry: isContractEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterContracts(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // A truncated page set would persist a short ContractSnapshot missing
    // contracts already in_progress; the next complete poll would then see
    // them as newly appearing and false-fire contractAccepted (issue #174
    // review) — skip this poll entirely rather than save a partial baseline.
    if (result.cached.truncated) return null;
    return result.cached.data;
  },
  toSnapshot: (contracts, nowMs) => ({
    entries: contracts.map((contract) => ({
      contractId: contract.contract_id,
      status: contract.status,
      issuerId: contract.issuer_id,
      acceptorId: contract.acceptor_id,
    })),
    nowMs,
  }),
});

/* -------------------------------------------------------------------------- */
/* Wallet                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Strict about `dateMs` for `isMarketOrderEntrySnapshot`'s reason: a baseline
 * written before the field existed fails validation, so `pollerState.ts`
 * reads it as `null`, `diffWalletBalanceChanged` fires nothing without a
 * baseline, and the upgrade costs one quiet poll rather than replaying the
 * journal. `Number.isFinite` rather than `typeof === 'number'` because an
 * unparseable ESI date yields `NaN`, which is a number and would sort the row
 * nowhere and never trim.
 */
function isWalletJournalEntrySnapshot(raw: unknown): raw is WalletJournalEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.id === 'number' &&
    (r.amount === null || typeof r.amount === 'number') &&
    typeof r.thresholdIsk === 'number' &&
    Number.isFinite(r.dateMs)
  );
}

/**
 * `TRaw` is already the engine snapshot shape here, not the ESI type
 * (`structureFuelDomain`'s precedent): the Character's wallet-change
 * threshold is a preference, only readable in `load()`'s async context, so
 * it's baked into each entry there rather than in the synchronous
 * `toSnapshot`.
 */
export const walletDomain = defineDomain<
  WalletJournalEntrySnapshot,
  WalletSnapshot,
  WalletNotificationFire
>({
  source: SNAPSHOT_SOURCES.wallet,
  stateKey: 'notifications.pollerState.wallet',
  entriesKey: 'entries',
  isEntry: isWalletJournalEntrySnapshot,
  load: async (characterId) => {
    const result = await loadWalletJournalWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // A truncated page set could lower the high-water mark diffWalletBalanceChanged
    // tracks, re-firing for entries already reported once the next complete poll
    // sees them again (same reasoning as the contracts truncation guard above).
    if (result.cached.truncated) return null;
    const thresholds = await currentThresholds(characterId);
    return result.cached.data.map((entry) => {
      // An entry ESI dates unparseably falls back to the poll clock rather
      // than poisoning the feed's ordering with NaN.
      const dateMs = Date.parse(entry.date);
      return {
        id: entry.id,
        amount: entry.amount ?? null,
        thresholdIsk: thresholds.walletBalanceChangedThresholdIsk,
        dateMs: Number.isFinite(dateMs) ? dateMs : Date.now(),
      };
    });
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});

/* -------------------------------------------------------------------------- */
/* Market orders                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately strict about the buy/sell and item fields, so a baseline
 * written before they existed fails validation rather than being read with
 * them missing. `pollerState.ts` parses a state it does not recognise as
 * `null`, and `diffMarketOrderFilled` fires nothing without a baseline — so
 * the upgrade costs one quiet poll and then a fresh, complete snapshot. The
 * tolerant alternative (default the missing fields) would have every stored
 * buy order read as a sell order exactly once, which is the notification this
 * change exists to stop.
 */
function isMarketOrderEntrySnapshot(raw: unknown): raw is MarketOrderEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.orderId === 'number' &&
    typeof r.filled === 'boolean' &&
    typeof r.isBuyOrder === 'boolean' &&
    typeof r.typeId === 'number' &&
    typeof r.quantity === 'number'
  );
}

/**
 * Merges open orders with order history into the engine's `filled` shape.
 * ESI's history `state` enum ('cancelled' | 'expired') has no distinct
 * "filled" value, so filled-ness is derived here, at the ESI/engine boundary
 * (ARCHITECTURE.md): an order still open is never filled; an order gone from
 * the open list and present in history is filled once `volume_remain` is 0.
 */
export function deriveMarketOrderEntries(
  openOrders: readonly MarketOrder[],
  history: readonly MarketOrderHistory[]
): MarketOrderEntrySnapshot[] {
  const openIds = new Set(openOrders.map((order) => order.order_id));
  // ESI omits `is_buy_order` entirely on a sell order rather than sending
  // false, so absent has to read as "sell" — the same shape the Market views
  // already assume of this field.
  const common = (order: MarketOrder) => ({
    orderId: order.order_id,
    isBuyOrder: order.is_buy_order === true,
    typeId: order.type_id,
    quantity: order.volume_total,
  });
  const entries: MarketOrderEntrySnapshot[] = openOrders.map((order) => ({
    ...common(order),
    filled: false,
  }));
  for (const order of history) {
    if (openIds.has(order.order_id)) continue;
    entries.push({ ...common(order), filled: order.volume_remain === 0 });
  }
  return entries;
}

export const marketOrderDomain = defineDomain<
  MarketOrderEntrySnapshot,
  MarketOrderSnapshot,
  MarketOrderNotificationFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.marketOrders,
  stateKey: 'notifications.pollerState.marketOrders',
  entriesKey: 'entries',
  isEntry: isMarketOrderEntrySnapshot,
  load: async (characterId) => {
    const [openResult, historyResult] = await Promise.all([
      loadOrders(characterId),
      loadOrderHistory(characterId),
    ]);
    if (openResult.needsReauth || openResult.cached === null) return null;
    if (historyResult.needsReauth || historyResult.cached === null) return null;
    // A truncated history page set would misreport a still-open order as
    // filled-and-gone; skip this poll entirely rather than save a partial
    // baseline (same reasoning as the contracts truncation guard above).
    if (historyResult.cached.truncated) return null;
    return deriveMarketOrderEntries(openResult.cached.data, historyResult.cached.data);
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // Best-effort: `loadTypeNames` reads the local SDE snapshot first, falls
  // back to one batched ESI call, and yields "Type #id" rather than throwing.
  // A name we cannot resolve is no reason to hold the notification back.
  names: async (fire) => {
    const names = await loadTypeNames([fire.typeId]).catch(() => new Map<number, string>());
    return { item: names.get(fire.typeId) };
  },
});

/* -------------------------------------------------------------------------- */
/* Market orders: station undercut/outbid (issue #1423)                      */
/* -------------------------------------------------------------------------- */

/** What `load()` produces per order, before `toSnapshot` folds in the `armed` anti-flap latch (`buildOrderUndercutEntry`). */
type OrderUndercutRawEntry = Omit<OrderUndercutEntrySnapshot, 'armed'>;

const ORDER_UNDERCUT_STATES = ['beaten', 'clear', 'unknown'] as const;

/**
 * Strict about every field, `isMarketOrderEntrySnapshot`'s reason: a stored
 * baseline this domain does not fully recognise is discarded (read as no
 * baseline at all) rather than read partially, which would corrupt the
 * `armed` latch's own carry-forward logic on the very poll meant to rebuild
 * it.
 */
function isOrderUndercutEntrySnapshot(raw: unknown): raw is OrderUndercutEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.orderId === 'number' &&
    typeof r.typeId === 'number' &&
    typeof r.isBuyOrder === 'boolean' &&
    typeof r.locationId === 'number' &&
    typeof r.price === 'number' &&
    (ORDER_UNDERCUT_STATES as readonly unknown[]).includes(r.state) &&
    (r.rivalPrice === null || typeof r.rivalPrice === 'number') &&
    typeof r.armed === 'boolean'
  );
}

/**
 * A new poll domain rather than widening `marketOrderDomain` (issue #1423,
 * per the ticket brief): `isMarketOrderEntrySnapshot` validates a closed shape,
 * and widening it would discard every device's stored `marketOrderFilled`
 * baseline on upgrade, risking a missed fill being reported as newly filled
 * against a rebuilt, empty baseline. A separate domain also means this fetch
 * — and the Fuzzwork calls inside it — is skipped entirely (AC5, same gate
 * `spExtractionDomain` uses) when `marketOrderUndercut` is off for every
 * Character, independent of whether `marketOrderFilled` is on.
 */
export const marketOrderUndercutDomain = defineDomain<
  OrderUndercutRawEntry,
  OrderUndercutSnapshot,
  MarketOrderUndercutFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.marketOrderUndercut,
  stateKey: 'notifications.pollerState.marketOrderUndercut',
  entriesKey: 'entries',
  isEntry: isOrderUndercutEntrySnapshot,
  load: async (characterId) => {
    const result = await loadOrders(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // Structure-parked orders never reach Fuzzwork: it aggregates public
    // NPC-station data only, and the page's own `orderCompetition.ts` already
    // routes those through `loadStructureCompetition` instead — asking
    // Fuzzwork about a structure id would spend a call for an answer it can
    // never have. Station-only detection ships first (owner decision #2);
    // these orders are simply absent from the snapshot.
    const npcOrders = result.cached.data.filter(
      (order) => order.location_id < UPWELL_STRUCTURE_ID_FLOOR
    );
    if (npcOrders.length === 0) return [];

    const typeIdsByStation = new Map<number, number[]>();
    for (const order of npcOrders) {
      const existing = typeIdsByStation.get(order.location_id);
      if (existing) existing.push(order.type_id);
      else typeIdsByStation.set(order.location_id, [order.type_id]);
    }

    // Fanned out at most ESI_FANOUT_CONCURRENCY stations at a time
    // (`loadStationBestPrices`'s own precedent) — a character with orders
    // scattered across many stations must not fire them all at once.
    // `getStationPrices` shares the same 15-minute cache the Open Orders page
    // reads through (issue #1423's decision file), so two polls inside that
    // window cost one Fuzzwork request per station, not two.
    const pricesByStation = new Map<number, Map<number, HubAggregate>>();
    await mapWithConcurrencyLimit(
      [...typeIdsByStation.entries()],
      ESI_FANOUT_CONCURRENCY,
      async ([stationId, typeIds]) => {
        pricesByStation.set(stationId, await getStationPrices(stationId, [...new Set(typeIds)]));
      }
    );

    return npcOrders.map((order): OrderUndercutRawEntry => {
      const isBuyOrder = order.is_buy_order === true;
      const aggregate = pricesByStation.get(order.location_id)?.get(order.type_id) ?? null;
      const { state, rivalPrice } = classifyStationUndercut(order.price, isBuyOrder, aggregate);
      return {
        orderId: order.order_id,
        typeId: order.type_id,
        isBuyOrder,
        locationId: order.location_id,
        price: order.price,
        state,
        rivalPrice,
      };
    });
  },
  // The one domain whose snapshot needs the character's own previous
  // baseline to build itself (issue #1423) — `buildOrderUndercutEntry` folds
  // in the `armed` anti-flap latch, which is what lets `diffMarketOrderUndercut`
  // tell `clear -> unknown -> beaten` apart from `beaten -> unknown -> beaten`.
  toSnapshot: (entries, nowMs, prevSnapshot) => ({
    entries: entries.map((entry) => buildOrderUndercutEntry(entry, prevSnapshot)),
    nowMs,
  }),
  // Best-effort, `marketOrderDomain`'s own precedent: an unresolved item name
  // is no reason to hold the notification back.
  names: async (fire) => {
    const names = await loadTypeNames([fire.typeId]).catch(() => new Map<number, string>());
    return { item: names.get(fire.typeId) };
  },
});

/* -------------------------------------------------------------------------- */
/* EVE's own notifications                                                    */
/* -------------------------------------------------------------------------- */

function isEveNotificationEntrySnapshot(raw: unknown): raw is EveNotificationEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.notificationId === 'number' &&
    typeof r.type === 'string' &&
    typeof r.senderId === 'number' &&
    typeof r.senderType === 'string' &&
    typeof r.text === 'string' &&
    typeof r.timestamp === 'string'
  );
}

/**
 * The ninth domain (issue #274): EVE's own server-pushed notifications, a
 * different, non-overlapping set from every other domain here — those are
 * all synthesized by diffing; this one is fed to the app pre-formed. Single
 * `eveNotification` event covering roughly a hundred underlying `type`
 * strings, filtered individually at delivery time
 * (`foregroundPoller.ts`/`preferences.ts`) rather than modeled as one
 * `NotificationEventId` per type — CCP adds types without notice, so the
 * catalog cannot be a closed enum (esi/esi-issues#1380).
 */
export const eveNotificationDomain = defineDomain<
  CharacterNotification,
  EveNotificationSnapshot,
  EveNotificationFire,
  EveNotificationNames
>({
  source: SNAPSHOT_SOURCES.eveNotification,
  stateKey: 'notifications.pollerState.eveNotification',
  entriesKey: 'entries',
  isEntry: isEveNotificationEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterNotifications(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (notifications, nowMs) => ({
    entries: notifications.map((n) => ({
      notificationId: n.notification_id,
      type: n.type,
      senderId: n.sender_id,
      senderType: n.sender_type,
      text: n.text ?? '',
      timestamp: n.timestamp,
    })),
    nowMs,
  }),
  // Structure reinforcement exits (issue #359): the only EVE Notification
  // shape with a future, fixed-enough timestamp to project. Kept to the same
  // gates the live browser channel already applies to this domain
  // (`foregroundPoller.ts`'s `isEveTypeAllowed` + `eveTypeAllowsChannel`) —
  // Scheduled Push is that channel's closed-app analog (see the comment on
  // `projection` above), so a type the user has switched browser
  // notifications off for, or that fell off the round-45 allow-list, must
  // not reach the backend either.
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const eveTypePrefs = await currentEveTypePrefs(characterId);
    const eligible = snapshot.entries.filter(
      (entry) =>
        isEveTypeAllowed(entry.type) && isEveTypeEnabledFor(eveTypePrefs, entry.type, 'browser')
    );
    // Only ids the projector will actually put in a row's text (issue #359
    // follow-up, Sentry N+1): most of `eligible` is outside the 72-hour
    // horizon and produces no row at all, so resolving every one of their
    // structure ids up front fanned `loadStructureName` out over names whose
    // results were always going to be discarded.
    const structureIds = reinforcementExitStructureIds(eligible, nowMs);
    const structureNames = await resolveProjectionNames(structureIds, (id) =>
      loadStructureName(characterId, id)
    );
    return projectEveNotificationReinforcementExit(
      characterId,
      characterName,
      eligible,
      structureNames,
      NOTIFICATION_EVENT_ENTRIES.eveNotification.projection.push,
      nowMs
    );
  },
  // Best-effort, time-boxed and never rejects (issue #300): whatever it could
  // not look up in its budget renders as an id or a neutral phrase rather
  // than holding the notification back.
  names: resolveEveNotificationNames,
});

/* -------------------------------------------------------------------------- */
/* Corp domains (issue #299)                                                  */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * The corp gate every domain below runs before its own ESI call (AC5): CCP
 * role-gates the corporation endpoints server-side, so a granted scope alone
 * does not mean the Character can read the data (`engine/corpRoles.ts`). Null
 * for "cannot fetch this poll" — corporation unknown, roles unreadable this
 * poll, or the specific role missing — always erring toward *not* calling the
 * endpoint rather than guessing. `loadCharacterRoles` is documented as cheap
 * enough to run for everyone (`features/corp/roles.ts`), and this only runs
 * for a Character whose `enabledEvents` for the domain is already non-empty.
 */
async function corpContextFor(
  characterId: number,
  capability: CorpCapability
): Promise<{ corporationId: number } | null> {
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return null;
  const rolesResult = await loadCharacterRoles(characterId);
  if (rolesResult.needsReauth || rolesResult.cached === null) return null;
  const capabilities = corpCapabilities(corpWideRoles(rolesResult.cached.data));
  if (!capabilities[capability]) return null;
  return { corporationId };
}

/** This Character's current threshold settings (issue #299, synced since #363), re-read every poll — the mechanism AC4's "without a reload" relies on. */
async function currentThresholds(characterId: number) {
  await hydrateNotificationPreferences();
  return characterEventThresholds(useNotificationPreferences.getState().value, characterId);
}

/** This Character's current per-EVE-notification-type settings, re-read every poll for the same reason as `currentThresholds`. */
async function currentEveTypePrefs(characterId: number) {
  await hydrateNotificationPreferences();
  return characterEveTypePrefs(useNotificationPreferences.getState().value, characterId);
}

/* Structure fuel low ------------------------------------------------------- */

function isStructureFuelEntrySnapshot(raw: unknown): raw is StructureFuelEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.structureId === 'number' &&
    typeof r.name === 'string' &&
    (r.fuelExpiresMs === null || typeof r.fuelExpiresMs === 'number') &&
    typeof r.thresholdMs === 'number'
  );
}

export const structureFuelDomain = defineDomain<
  StructureFuelEntrySnapshot,
  StructureFuelSnapshot,
  StructureFuelLowFire
>({
  source: SNAPSHOT_SOURCES.structureFuel,
  stateKey: 'notifications.pollerState.structureFuel',
  entriesKey: 'entries',
  isEntry: isStructureFuelEntrySnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadStructures');
    if (context === null) return null;
    const result = await loadCorporationStructures(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    const thresholds = await currentThresholds(characterId);
    const thresholdMs = thresholds.structureFuelLowDays * DAY_MS;
    // Reuses the board's own ESI-to-engine adaptation (`boardSources.ts`)
    // rather than re-parsing `fuel_expires` here — same underlying data the
    // board already loads, per the ticket brief.
    return toBoardStructures(result.cached.data).map((structure) => ({
      structureId: structure.structureId,
      name: structure.name,
      fuelExpiresMs: structure.fuelExpiresMs,
      thresholdMs,
    }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // Same split as the colony domain: the baseline's baked-in `thresholdMs`
  // stays for the diff, while the Projection uses the current fuel threshold
  // so a Settings change rebuilt from that baseline (issue #1259) projects it.
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const thresholdMs = (await currentThresholds(characterId)).structureFuelLowDays * DAY_MS;
    return projectStructureFuel(
      characterId,
      characterName,
      snapshot.entries.map((entry) => ({ ...entry, thresholdMs })),
      NOTIFICATION_EVENT_ENTRIES.structureFuelLow.projection.push,
      nowMs
    );
  },
});

/* Corp industry jobs --------------------------------------------------------- */

function isCorpIndustryJobEntrySnapshot(raw: unknown): raw is CorpIndustryJobEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.jobId === 'number' &&
    typeof r.endMs === 'number' &&
    typeof r.blueprintTypeId === 'number' &&
    (r.productTypeId === null || typeof r.productTypeId === 'number') &&
    typeof r.activityId === 'number'
  );
}

function toCorpIndustryJobEntrySnapshot(job: CorporationIndustryJob): CorpIndustryJobEntrySnapshot {
  return {
    jobId: job.job_id,
    endMs: Date.parse(job.end_date),
    blueprintTypeId: job.blueprint_type_id,
    productTypeId: job.product_type_id ?? null,
    activityId: job.activity_id,
  };
}

export const corpIndustryJobDomain = defineDomain<
  CorporationIndustryJob,
  CorpIndustryJobSnapshot,
  CorpIndustryJobNotificationFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.corpIndustryJobs,
  stateKey: 'notifications.pollerState.corpIndustryJobs',
  entriesKey: 'entries',
  isEntry: isCorpIndustryJobEntrySnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadIndustry');
    if (context === null) return null;
    const result = await loadCorporationIndustryJobs(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (jobs, nowMs) => ({ entries: jobs.map(toCorpIndustryJobEntrySnapshot), nowMs }),
  names: async (fire) => ({ item: await typeNameOrAbsent(industryItemTypeId(fire)) }),
});

/* Corp roster ----------------------------------------------------------------- */

function isCorpRosterMemberSnapshot(raw: unknown): raw is CorpRosterMemberSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  return typeof (raw as Record<string, unknown>).characterId === 'number';
}

/**
 * `/members`, not `/membertracking` — the diff only needs identity, and the
 * page that needs the richer read (`routes/CorpMembers.tsx`, #333) is a
 * second, independent consumer of the same capability. Both answer to
 * `canReadMembers` (Director-only, `engine/corpRoles.ts`), matching that
 * route's existing gate rather than inventing a narrower one for this poller.
 */
export const corpRosterDomain = defineDomain<
  number,
  CorpRosterSnapshot,
  CorpMemberJoinedFire | CorpMemberLeftFire,
  MemberNames
>({
  source: SNAPSHOT_SOURCES.corpRoster,
  stateKey: 'notifications.pollerState.corpRoster',
  entriesKey: 'entries',
  isEntry: isCorpRosterMemberSnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadMembers');
    if (context === null) return null;
    const result = await loadCorporationMemberIds(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (memberIds, nowMs) => ({
    entries: memberIds.map((characterId) => ({ characterId })),
    nowMs,
  }),
  names: async (fire) => ({
    member: (await resolveNames([fire.memberCharacterId])).get(fire.memberCharacterId),
  }),
});

/* Corp wallet threshold --------------------------------------------------- */

function isCorpWalletJournalEntrySnapshot(raw: unknown): raw is CorpWalletJournalEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.id === 'number' && (r.amount === null || typeof r.amount === 'number');
}

function isCorpWalletDivisionSnapshot(raw: unknown): raw is CorpWalletDivisionSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.division === 'number' &&
    typeof r.balance === 'number' &&
    Array.isArray(r.journal) &&
    r.journal.every(isCorpWalletJournalEntrySnapshot) &&
    typeof r.balanceFloorIsk === 'number' &&
    typeof r.transactionCeilingIsk === 'number'
  );
}

/**
 * Balance-below is checked across every division `/wallets` already returns
 * in one call; transaction-above is checked only on the master division's
 * journal, since ESI publishes no all-divisions journal and the seven are
 * separately paginated and role-gated (CONTEXT.md round 43, `boardData.ts`'s
 * `MASTER_WALLET_DIVISION` reasoning).
 */
export const corpWalletDomain = defineDomain<
  CorpWalletDivisionSnapshot,
  CorpWalletSnapshot,
  CorpWalletThresholdFire
>({
  source: SNAPSHOT_SOURCES.corpWallet,
  stateKey: 'notifications.pollerState.corpWallet',
  entriesKey: 'divisions',
  isEntry: isCorpWalletDivisionSnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadWallet');
    if (context === null) return null;
    const walletsResult = await loadCorporationWallets(characterId, context.corporationId);
    if (walletsResult.needsReauth || walletsResult.cached === null) return null;
    const journalResult = await loadCorporationWalletJournal(
      characterId,
      context.corporationId,
      MASTER_WALLET_DIVISION
    );
    if (journalResult.needsReauth || journalResult.cached === null) return null;
    // A truncated master-division journal could lower the high-water mark
    // `diffCorpWalletThreshold` tracks, re-firing for entries already
    // reported once the next complete poll sees them again (same reasoning
    // as `walletDomain`'s truncation guard above).
    if (journalResult.cached.truncated) return null;
    const journalEntries = journalResult.cached.data;
    const thresholds = await currentThresholds(characterId);
    return walletsResult.cached.data.map((division) => ({
      division: division.division,
      balance: division.balance,
      journal:
        division.division === MASTER_WALLET_DIVISION
          ? journalEntries.map((entry) => ({
              id: entry.id,
              amount: entry.amount ?? null,
            }))
          : [],
      balanceFloorIsk: thresholds.corpWalletBalanceFloorIsk,
      transactionCeilingIsk: thresholds.corpWalletTransactionCeilingIsk,
    }));
  },
  toSnapshot: (divisions, nowMs) => ({ divisions: [...divisions], nowMs }),
});

/* Quickbar: price alerts ----------------------------------------------------- */

function isPriceAlertEntrySnapshot(raw: unknown): raw is PriceAlertEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.typeId === 'number' &&
    typeof r.name === 'string' &&
    typeof r.targetPrice === 'number' &&
    (r.direction === 'above' || r.direction === 'below') &&
    (r.price === null || typeof r.price === 'number')
  );
}

/** The Trade Hub Quickbar prices at, re-read every poll for the same reason as `currentThresholds`: AC4's "without a reload" needs the live value. */
async function currentHub() {
  await useMarketHub.getState().hydrate();
  return getTradeHub(useMarketHub.getState().value) ?? DEFAULT_TRADE_HUB;
}

/**
 * Prices only the Quickbar items carrying a target (issue #680) — an item
 * with no target has nothing for `diffPriceAlertTriggered` to compare, so
 * pricing it would be a wasted Fuzzwork call. Always prices "the item's
 * Quickbar entry" at the one Trade Hub Quickbar and Compare already share
 * (`features/market/hub.ts`); `QuickbarItem` carries no hub of its own.
 */
export const priceAlertDomain = defineDomain<
  PriceAlertEntrySnapshot,
  PriceAlertSnapshot,
  PriceAlertTriggeredFire
>({
  source: SNAPSHOT_SOURCES.priceAlert,
  stateKey: 'notifications.pollerState.priceAlert',
  entriesKey: 'entries',
  isEntry: isPriceAlertEntrySnapshot,
  load: async (characterId) => {
    const record = await db.quickbars.get(String(characterId));
    const targeted = (record?.items ?? []).filter(
      (item): item is QuickbarItem & { targetPrice: number; targetDirection: 'above' | 'below' } =>
        item.targetPrice !== undefined && item.targetDirection !== undefined
    );
    if (targeted.length === 0) return [];
    const hub = await currentHub();
    const prices = await getHubPrices(
      hub,
      targeted.map((item) => item.typeId)
    );
    return targeted.map((item) => ({
      typeId: item.typeId,
      name: item.name,
      targetPrice: item.targetPrice,
      direction: item.targetDirection,
      price: prices.get(item.typeId)?.sellMin ?? null,
    }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});

/**
 * Every polled domain, in fetch order. One entry here is the whole cost of
 * adding a domain: `foregroundPoller.ts` names none of them.
 */
export const POLL_DOMAINS: readonly PollDomain[] = [
  skillQueueDomain,
  spExtractionDomain,
  industryJobDomain,
  colonyDomain,
  mailDomain,
  calendarDomain,
  contractDomain,
  walletDomain,
  marketOrderDomain,
  marketOrderUndercutDomain,
  eveNotificationDomain,
  structureFuelDomain,
  corpIndustryJobDomain,
  corpRosterDomain,
  corpWalletDomain,
  priceAlertDomain,
];

const DOMAIN_BY_EVENT: ReadonlyMap<NotificationEventId, PollDomain> = new Map(
  POLL_DOMAINS.flatMap((domain) => domain.eventIds.map((eventId) => [eventId, domain] as const))
);

/** The one domain whose diffs can fire this event. */
export function domainForEvent(eventId: NotificationEventId): PollDomain {
  const domain = DOMAIN_BY_EVENT.get(eventId);
  if (domain === undefined) throw new Error(`pollDomains: no domain fires ${eventId}`);
  return domain;
}

/** A fire's live copy, names looked up by its own domain. */
export function renderNotification(
  fire: AnyNotificationFire,
  characterName: string
): Promise<NotificationCopy> {
  return domainForEvent(fire.eventId).render(fire, characterName);
}

/** The row a fire was about, where its event has a use for one — see `NotificationFeedRecord.subjectId`. */
export function notificationSubjectId(fire: AnyNotificationFire): number | undefined {
  return eventEntry(fire.eventId).copy.subjectOf?.(fire);
}
