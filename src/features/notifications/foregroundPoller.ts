/**
 * Foreground Poller (CONTEXT.md round 20): every `POLL_INTERVAL_MS` while the
 * app is open and visible, checks each enabled Notification Event's
 * underlying ESI data and fires a browser Notification for whatever the
 * shared `engine/notificationDiffs.ts` registry says changed. The scheduling
 * shell (`ForegroundNotificationPoller.tsx`) owns the interval/visibility
 * wiring; `runForegroundPoll` here is the impure-but-injectable orchestration
 * step, kept separate so it's testable without mocking `setInterval`.
 *
 * One poll per character does at most one fetch per data domain (skill
 * queue, industry jobs, planetary colonies, mail, calendar, contracts) and
 * runs every diff driven by that domain against it — not one
 * fetch-and-compare loop per event (AC2).
 */
import { db } from '@/db';
import { loadCharacterSkillQueueWithStatus, loadUniverseType } from '@/features/skills/data';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { loadPlanetName } from '@/features/pi/names';
import { extractorProgramsFromPins } from '@/features/pi/adapters';
import { loadMailHeaders } from '@/features/character/mail';
import { loadCalendarEvents as loadCharacterCalendarEvents } from '@/features/character/calendar';
import { loadContracts as loadCharacterContracts } from '@/features/character/contracts';
import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import type {
  SkillQueueEntry,
  IndustryJob,
  MailHeader,
  CalendarEventSummary,
  Contract,
  WalletJournalEntry,
  MarketOrder,
  MarketOrderHistory,
} from '@/esi/endpoints';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { formatIsk } from '@/lib/isk';
import i18n from '@/i18n';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import {
  runSkillQueueNotificationDiffs,
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  diffIndustryJobComplete,
  diffPlanetaryExtractionDone,
  diffNewMail,
  diffNewCalendarEvent,
  diffCalendarEventStarting,
  diffContractAccepted,
  type NotificationFire,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
  type SkillQueueNotificationEventId,
  type IndustryJobSnapshot,
  type IndustryJobEntrySnapshot,
  type IndustryJobNotificationFire,
  type ColonySnapshotEntry,
  type PlanetarySnapshot,
  type PlanetaryNotificationFire,
  type MailHeaderSnapshot,
  type MailSnapshot,
  type MailNotificationFire,
  type CalendarEventEntrySnapshot,
  type CalendarSnapshot,
  type NewCalendarEventFire,
  type CalendarEventStartingFire,
  type ContractEntrySnapshot,
  type ContractSnapshot,
  type ContractNotificationFire,
  diffWalletBalanceChanged,
  diffMarketOrderFilled,
  type WalletJournalEntrySnapshot,
  type WalletSnapshot,
  type WalletNotificationFire,
  type MarketOrderEntrySnapshot,
  type MarketOrderSnapshot,
  type MarketOrderNotificationFire,
} from '@/engine/notificationDiffs';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';
import {
  useNotificationPreferences,
  characterEventPrefs,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
} from './preferences';
import { recordFeedEntry } from './feed';
import { isEventEnabledFor, type EventEnabledMap } from './eventSelection';
import { readNotificationPermission } from './permission';
import { displayPageNotification, livePageDisplayEnv } from './display';
import { notificationOptionsFor } from './notificationOptions';
import {
  useSkillQueuePollerState,
  withCharacterSnapshot,
  type SkillQueuePollerState,
  useIndustryJobPollerState,
  withCharacterJobSnapshot,
  type IndustryJobPollerState,
  useColonyPollerState,
  withCharacterColonySnapshot,
  type ColonyPollerState,
  useMailPollerState,
  withCharacterMailSnapshot,
  type MailPollerState,
  useCalendarPollerState,
  withCharacterCalendarSnapshot,
  type CalendarPollerState,
  useContractPollerState,
  withCharacterContractSnapshot,
  type ContractPollerState,
  useWalletPollerState,
  withCharacterWalletSnapshot,
  type WalletPollerState,
  useMarketOrderPollerState,
  withCharacterMarketOrderSnapshot,
  type MarketOrderPollerState,
} from './pollerState';

export const POLL_INTERVAL_MS = 5 * 60 * 1000;

export type AnyNotificationFire =
  | NotificationFire
  | IndustryJobNotificationFire
  | PlanetaryNotificationFire
  | MailNotificationFire
  | NewCalendarEventFire
  | CalendarEventStartingFire
  | ContractNotificationFire
  | WalletNotificationFire
  | MarketOrderNotificationFire;

/** `SKILL_QUEUE_NOTIFICATION_DIFFS` is the one source of which skill-queue-driven events this poller runs; industry jobs, PI colonies, mail, calendar, and contracts aren't skill-queue-driven (engine/notificationDiffs.ts), so those are listed directly. */
const SKILL_QUEUE_EVENT_IDS = Object.keys(
  SKILL_QUEUE_NOTIFICATION_DIFFS
) as SkillQueueNotificationEventId[];

const INDUSTRY_JOB_EVENT_IDS = ['industryJobComplete'] as const;
const PLANETARY_EVENT_IDS = ['planetaryExtractionDone'] as const;
const MAIL_EVENT_IDS = ['newMail'] as const;
const CALENDAR_EVENT_IDS = ['newCalendarEvent', 'calendarEventStarting'] as const;
const CONTRACT_EVENT_IDS = ['contractAccepted'] as const;
const WALLET_EVENT_IDS = ['walletBalanceChanged'] as const;
const MARKET_ORDER_EVENT_IDS = ['marketOrderFilled'] as const;

const SCOPE_BY_EVENT = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event.scope]));

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

function toSnapshotEntry(entry: SkillQueueEntry): SkillQueueEntrySnapshot {
  const finishMs = entry.finish_date ? Date.parse(entry.finish_date) : NaN;
  return {
    skillId: entry.skill_id,
    finishedLevel: entry.finished_level,
    queuePosition: entry.queue_position,
    finishMs: Number.isFinite(finishMs) ? finishMs : null,
  };
}

function toJobSnapshotEntry(job: IndustryJob): IndustryJobEntrySnapshot {
  return {
    jobId: job.job_id,
    endMs: Date.parse(job.end_date),
    blueprintTypeId: job.blueprint_type_id,
    productTypeId: job.product_type_id ?? null,
    activityId: job.activity_id,
  };
}

function toMailSnapshotEntry(header: MailHeader): MailHeaderSnapshot {
  return { mailId: header.mail_id };
}

function toCalendarSnapshotEntry(event: CalendarEventSummary): CalendarEventEntrySnapshot {
  return { calendarEventId: event.event_id, startMs: Date.parse(event.event_date) };
}

function toContractSnapshotEntry(contract: Contract): ContractEntrySnapshot {
  return { contractId: contract.contract_id, status: contract.status };
}

function toWalletSnapshotEntry(entry: WalletJournalEntry): WalletJournalEntrySnapshot {
  return { id: entry.id, amount: entry.amount ?? null };
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
  const entries: MarketOrderEntrySnapshot[] = openOrders.map((order) => ({
    orderId: order.order_id,
    filled: false,
  }));
  for (const order of history) {
    if (openIds.has(order.order_id)) continue;
    entries.push({ orderId: order.order_id, filled: order.volume_remain === 0 });
  }
  return entries;
}

export interface CharacterRef {
  characterId: number;
  name: string;
}

export interface PollDependencies {
  now: () => number;
  characters: () => Promise<CharacterRef[]>;
  grantedScopes: (characterId: number) => Promise<ReadonlySet<string>>;
  loadSkillQueue: (characterId: number) => Promise<SkillQueueEntry[] | null>;
  loadIndustryJobs: (characterId: number) => Promise<IndustryJob[] | null>;
  loadColonyExtractors: (characterId: number) => Promise<ColonySnapshotEntry[] | null>;
  loadMail: (characterId: number) => Promise<MailHeader[] | null>;
  loadCalendarEvents: (characterId: number) => Promise<CalendarEventSummary[] | null>;
  loadContracts: (characterId: number) => Promise<Contract[] | null>;
  loadWalletJournal: (characterId: number) => Promise<WalletJournalEntry[] | null>;
  loadMarketOrders: (characterId: number) => Promise<MarketOrderEntrySnapshot[] | null>;
  masterEnabled: () => Promise<boolean>;
  /** The two delivery channels, independently toggleable (preferences.ts). */
  browserChannelEnabled: () => Promise<boolean>;
  feedChannelEnabled: () => Promise<boolean>;
  eventPrefsFor: (characterId: number) => Promise<EventEnabledMap>;
  permission: () => NotificationPermission | 'unsupported' | 'default' | 'denied';
  prevState: () => Promise<SkillQueuePollerState>;
  saveState: (state: SkillQueuePollerState) => Promise<void>;
  prevIndustryJobState: () => Promise<IndustryJobPollerState>;
  saveIndustryJobState: (state: IndustryJobPollerState) => Promise<void>;
  prevColonyState: () => Promise<ColonyPollerState>;
  saveColonyState: (state: ColonyPollerState) => Promise<void>;
  prevMailState: () => Promise<MailPollerState>;
  saveMailState: (state: MailPollerState) => Promise<void>;
  prevCalendarState: () => Promise<CalendarPollerState>;
  saveCalendarState: (state: CalendarPollerState) => Promise<void>;
  prevContractState: () => Promise<ContractPollerState>;
  saveContractState: (state: ContractPollerState) => Promise<void>;
  prevWalletState: () => Promise<WalletPollerState>;
  saveWalletState: (state: WalletPollerState) => Promise<void>;
  prevMarketOrderState: () => Promise<MarketOrderPollerState>;
  saveMarketOrderState: (state: MarketOrderPollerState) => Promise<void>;
  notify: (fire: AnyNotificationFire, character: CharacterRef) => Promise<void>;
  recordToFeed: (fire: AnyNotificationFire, character: CharacterRef) => Promise<void>;
}

/** Which delivery channels are live for this poll, before per-event opinions. */
interface LiveChannels {
  browser: boolean;
  feed: boolean;
}

/**
 * Whether this event would reach *somewhere* — a live channel that the event
 * is also switched on for. An event set to feed-only still has its data
 * fetched when the feed is on and browser notifications are off; one switched
 * off on both columns is not fetched at all.
 */
function reachesAnyChannel(
  eventPrefs: EventEnabledMap,
  eventId: NotificationEventId,
  channels: LiveChannels
): boolean {
  return (
    (channels.browser && isEventEnabledFor(eventPrefs, eventId, 'browser')) ||
    (channels.feed && isEventEnabledFor(eventPrefs, eventId, 'feed'))
  );
}

/** Which of a set of candidate events this character is eligible for right now: has the scope, and reaches at least one live channel. */
function enabledEventsFor<T extends NotificationEventId>(
  eventIds: readonly T[],
  scopes: ReadonlySet<string>,
  eventPrefs: EventEnabledMap,
  channels: LiveChannels
): ReadonlySet<T> {
  const enabled = new Set<T>();
  for (const eventId of eventIds) {
    const scope = SCOPE_BY_EVENT.get(eventId);
    if (scope && scopes.has(scope) && reachesAnyChannel(eventPrefs, eventId, channels)) {
      enabled.add(eventId);
    }
  }
  return enabled;
}

interface CharacterUpdate {
  characterId: number;
  /** Carried through so the delivery loop can honour each event's per-channel columns. */
  eventPrefs: EventEnabledMap;
  skillQueue?: SkillQueueSnapshot;
  industryJobs?: IndustryJobSnapshot;
  colonies?: PlanetarySnapshot;
  mail?: MailSnapshot;
  calendar?: CalendarSnapshot;
  contracts?: ContractSnapshot;
  wallet?: WalletSnapshot;
  marketOrders?: MarketOrderSnapshot;
  fires: AnyNotificationFire[];
}

/**
 * One poll across every character, respecting the master switch and live
 * browser permission up front — no ESI calls at all when neither could ever
 * result in a fired notification (AC5).
 */
export async function runForegroundPoll(deps: PollDependencies): Promise<void> {
  if (!(await deps.masterEnabled())) return;

  // Each channel decides for itself. The browser channel additionally needs a
  // live permission grant; the feed needs nothing, which is the point of it —
  // a device that can never raise an OS notification (iOS, a denied grant)
  // still accumulates everything the poll finds. AC5 survives as "no ESI
  // calls when *neither* channel could show anything", not "when the browser
  // one can't".
  const [browserAllowed, feedEnabled] = await Promise.all([
    deps.browserChannelEnabled(),
    deps.feedChannelEnabled(),
  ]);
  const browserEnabled = browserAllowed && deps.permission() === 'granted';
  if (!browserEnabled && !feedEnabled) return;
  const channels: LiveChannels = { browser: browserEnabled, feed: feedEnabled };

  const characters = await deps.characters();
  if (characters.length === 0) return;

  const [
    prevSkillQueueAll,
    prevIndustryJobAll,
    prevColonyAll,
    prevMailAll,
    prevCalendarAll,
    prevContractAll,
    prevWalletAll,
    prevMarketOrderAll,
  ] = await Promise.all([
    deps.prevState(),
    deps.prevIndustryJobState(),
    deps.prevColonyState(),
    deps.prevMailState(),
    deps.prevCalendarState(),
    deps.prevContractState(),
    deps.prevWalletState(),
    deps.prevMarketOrderState(),
  ]);

  const updates: CharacterUpdate[] = [];

  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    const [scopes, eventPrefs] = await Promise.all([
      deps.grantedScopes(character.characterId),
      deps.eventPrefsFor(character.characterId),
    ]);

    const fires: AnyNotificationFire[] = [];
    const update: CharacterUpdate = { characterId: character.characterId, eventPrefs, fires };

    const skillQueueEvents = enabledEventsFor(SKILL_QUEUE_EVENT_IDS, scopes, eventPrefs, channels);
    if (skillQueueEvents.size > 0) {
      const entries = await deps.loadSkillQueue(character.characterId);
      if (entries !== null) {
        const next: SkillQueueSnapshot = {
          entries: entries.map(toSnapshotEntry),
          nowMs: deps.now(),
        };
        update.skillQueue = next;
        fires.push(
          ...runSkillQueueNotificationDiffs(
            character.characterId,
            prevSkillQueueAll[character.characterId],
            next,
            skillQueueEvents
          )
        );
      }
    }

    const industryJobEvents = enabledEventsFor(
      INDUSTRY_JOB_EVENT_IDS,
      scopes,
      eventPrefs,
      channels
    );
    if (industryJobEvents.size > 0) {
      const jobs = await deps.loadIndustryJobs(character.characterId);
      if (jobs !== null) {
        const next: IndustryJobSnapshot = {
          entries: jobs.map(toJobSnapshotEntry),
          nowMs: deps.now(),
        };
        update.industryJobs = next;
        fires.push(
          ...diffIndustryJobComplete(
            character.characterId,
            prevIndustryJobAll[character.characterId],
            next
          )
        );
      }
    }

    const planetaryEvents = enabledEventsFor(PLANETARY_EVENT_IDS, scopes, eventPrefs, channels);
    if (planetaryEvents.size > 0) {
      const colonies = await deps.loadColonyExtractors(character.characterId);
      if (colonies !== null) {
        const next: PlanetarySnapshot = { colonies, nowMs: deps.now() };
        update.colonies = next;
        fires.push(
          ...diffPlanetaryExtractionDone(
            character.characterId,
            prevColonyAll[character.characterId],
            next
          )
        );
      }
    }

    const mailEvents = enabledEventsFor(MAIL_EVENT_IDS, scopes, eventPrefs, channels);
    if (mailEvents.size > 0) {
      const headers = await deps.loadMail(character.characterId);
      if (headers !== null) {
        const next: MailSnapshot = { entries: headers.map(toMailSnapshotEntry), nowMs: deps.now() };
        update.mail = next;
        fires.push(...diffNewMail(character.characterId, prevMailAll[character.characterId], next));
      }
    }

    const calendarEvents = enabledEventsFor(CALENDAR_EVENT_IDS, scopes, eventPrefs, channels);
    if (calendarEvents.size > 0) {
      const events = await deps.loadCalendarEvents(character.characterId);
      if (events !== null) {
        const next: CalendarSnapshot = {
          entries: events.map(toCalendarSnapshotEntry),
          nowMs: deps.now(),
        };
        update.calendar = next;
        const prevCalendar = prevCalendarAll[character.characterId];
        if (calendarEvents.has('newCalendarEvent')) {
          fires.push(...diffNewCalendarEvent(character.characterId, prevCalendar, next));
        }
        if (calendarEvents.has('calendarEventStarting')) {
          fires.push(...diffCalendarEventStarting(character.characterId, prevCalendar, next));
        }
      }
    }

    const contractEvents = enabledEventsFor(CONTRACT_EVENT_IDS, scopes, eventPrefs, channels);
    if (contractEvents.size > 0) {
      const contracts = await deps.loadContracts(character.characterId);
      if (contracts !== null) {
        const next: ContractSnapshot = {
          entries: contracts.map(toContractSnapshotEntry),
          nowMs: deps.now(),
        };
        update.contracts = next;
        fires.push(
          ...diffContractAccepted(
            character.characterId,
            prevContractAll[character.characterId],
            next
          )
        );
      }
    }

    const walletEvents = enabledEventsFor(WALLET_EVENT_IDS, scopes, eventPrefs, channels);
    if (walletEvents.size > 0) {
      const entries = await deps.loadWalletJournal(character.characterId);
      if (entries !== null) {
        const next: WalletSnapshot = {
          entries: entries.map(toWalletSnapshotEntry),
          nowMs: deps.now(),
        };
        update.wallet = next;
        fires.push(
          ...diffWalletBalanceChanged(
            character.characterId,
            prevWalletAll[character.characterId],
            next
          )
        );
      }
    }

    const marketOrderEvents = enabledEventsFor(
      MARKET_ORDER_EVENT_IDS,
      scopes,
      eventPrefs,
      channels
    );
    if (marketOrderEvents.size > 0) {
      const entries = await deps.loadMarketOrders(character.characterId);
      if (entries !== null) {
        const next: MarketOrderSnapshot = { entries, nowMs: deps.now() };
        update.marketOrders = next;
        fires.push(
          ...diffMarketOrderFilled(
            character.characterId,
            prevMarketOrderAll[character.characterId],
            next
          )
        );
      }
    }

    if (
      update.skillQueue ||
      update.industryJobs ||
      update.colonies ||
      update.mail ||
      update.calendar ||
      update.contracts ||
      update.wallet ||
      update.marketOrders
    ) {
      updates.push(update);
    }
  });

  if (updates.length === 0) return;

  let nextSkillQueueAll = prevSkillQueueAll;
  let nextIndustryJobAll = prevIndustryJobAll;
  let nextColonyAll = prevColonyAll;
  let nextMailAll = prevMailAll;
  let nextCalendarAll = prevCalendarAll;
  let nextContractAll = prevContractAll;
  let nextWalletAll = prevWalletAll;
  let nextMarketOrderAll = prevMarketOrderAll;
  for (const update of updates) {
    if (update.skillQueue) {
      nextSkillQueueAll = withCharacterSnapshot(
        nextSkillQueueAll,
        update.characterId,
        update.skillQueue
      );
    }
    if (update.industryJobs) {
      nextIndustryJobAll = withCharacterJobSnapshot(
        nextIndustryJobAll,
        update.characterId,
        update.industryJobs
      );
    }
    if (update.colonies) {
      nextColonyAll = withCharacterColonySnapshot(
        nextColonyAll,
        update.characterId,
        update.colonies
      );
    }
    if (update.mail) {
      nextMailAll = withCharacterMailSnapshot(nextMailAll, update.characterId, update.mail);
    }
    if (update.calendar) {
      nextCalendarAll = withCharacterCalendarSnapshot(
        nextCalendarAll,
        update.characterId,
        update.calendar
      );
    }
    if (update.contracts) {
      nextContractAll = withCharacterContractSnapshot(
        nextContractAll,
        update.characterId,
        update.contracts
      );
    }
    if (update.wallet) {
      nextWalletAll = withCharacterWalletSnapshot(nextWalletAll, update.characterId, update.wallet);
    }
    if (update.marketOrders) {
      nextMarketOrderAll = withCharacterMarketOrderSnapshot(
        nextMarketOrderAll,
        update.characterId,
        update.marketOrders
      );
    }
  }
  await Promise.all([
    deps.saveState(nextSkillQueueAll),
    deps.saveIndustryJobState(nextIndustryJobAll),
    deps.saveColonyState(nextColonyAll),
    deps.saveMailState(nextMailAll),
    deps.saveCalendarState(nextCalendarAll),
    deps.saveContractState(nextContractAll),
    deps.saveWalletState(nextWalletAll),
    deps.saveMarketOrderState(nextMarketOrderAll),
  ]);

  const charactersById = new Map(characters.map((c) => [c.characterId, c]));
  for (const update of updates) {
    const character = charactersById.get(update.characterId);
    if (!character) continue;
    for (const fire of update.fires) {
      // No cast: every AnyNotificationFire's eventId is already the literal
      // union, so a genuinely new engine fire type must fail here rather than
      // be waved through.
      const eventId = fire.eventId;
      // Feed first: it is the channel that cannot fail for platform reasons,
      // so a fire is recorded before anything that might silently no-op.
      if (feedEnabled && isEventEnabledFor(update.eventPrefs, eventId, 'feed')) {
        await deps.recordToFeed(fire, character);
      }
      if (browserEnabled && isEventEnabledFor(update.eventPrefs, eventId, 'browser')) {
        await deps.notify(fire, character);
      }
    }
  }
}

/** Exported for `backgroundPoller.ts` — the Periodic Background Sync handler renders the exact same copy the Foreground Poller does, driven by the same registry. */
export async function notificationText(
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<{ title: string; body: string }> {
  if (fire.eventId === 'industryJobComplete') {
    const itemTypeId = fire.productTypeId ?? fire.blueprintTypeId;
    const itemType = await loadUniverseType(itemTypeId);
    const itemName = itemType?.data.name ?? `#${itemTypeId}`;
    return {
      title: i18n.t('notifications.fired.industryJobComplete.title'),
      body: i18n.t('notifications.fired.industryJobComplete.body', {
        character: character.name,
        item: itemName,
      }),
    };
  }
  if (fire.eventId === 'planetaryExtractionDone') {
    const planetName = (await loadPlanetName(fire.planetId)) ?? `#${fire.planetId}`;
    return {
      title: i18n.t('notifications.fired.planetaryExtractionDone.title'),
      body: i18n.t('notifications.fired.planetaryExtractionDone.body', {
        character: character.name,
        planet: planetName,
      }),
    };
  }
  if (fire.eventId === 'newMail') {
    return {
      title: i18n.t('notifications.fired.newMail.title'),
      body: i18n.t('notifications.fired.newMail.body', { character: character.name }),
    };
  }
  if (fire.eventId === 'newCalendarEvent') {
    return {
      title: i18n.t('notifications.fired.newCalendarEvent.title'),
      body: i18n.t('notifications.fired.newCalendarEvent.body', { character: character.name }),
    };
  }
  if (fire.eventId === 'calendarEventStarting') {
    return {
      title: i18n.t('notifications.fired.calendarEventStarting.title'),
      body: i18n.t('notifications.fired.calendarEventStarting.body', { character: character.name }),
    };
  }
  if (fire.eventId === 'contractAccepted') {
    return {
      title: i18n.t('notifications.fired.contractAccepted.title'),
      body: i18n.t('notifications.fired.contractAccepted.body', { character: character.name }),
    };
  }
  if (fire.eventId === 'walletBalanceChanged') {
    const title = i18n.t('notifications.fired.walletBalanceChanged.title');
    if (fire.amount === null) {
      return {
        title,
        body: i18n.t('notifications.fired.walletBalanceChanged.body', {
          character: character.name,
        }),
      };
    }
    return {
      title,
      body: i18n.t('notifications.fired.walletBalanceChanged.bodyWithAmount', {
        character: character.name,
        amount: formatIsk(fire.amount, 2),
      }),
    };
  }
  if (fire.eventId === 'marketOrderFilled') {
    return {
      title: i18n.t('notifications.fired.marketOrderFilled.title'),
      body: i18n.t('notifications.fired.marketOrderFilled.body', { character: character.name }),
    };
  }
  if (fire.eventId === 'characterNotTraining') {
    return {
      title: i18n.t('notifications.fired.characterNotTraining.title'),
      body: i18n.t('notifications.fired.characterNotTraining.body', { character: character.name }),
    };
  }
  // Only NotificationFire's other member left: skillLevelComplete.
  const skillType = fire.skillId === null ? null : await loadUniverseType(fire.skillId);
  const skillName = skillType?.data.name ?? `#${fire.skillId}`;
  const level =
    fire.level !== null && fire.level >= 1 && fire.level <= 5 ? ROMAN[fire.level - 1] : '';
  return {
    title: i18n.t('notifications.fired.skillLevelComplete.title'),
    body: i18n.t('notifications.fired.skillLevelComplete.body', {
      character: character.name,
      skill: skillName,
      level,
    }),
  };
}

/**
 * Delivery goes through `display.ts`, which prefers the Service Worker
 * registration's `showNotification` over `new Notification(...)` — the
 * constructor throws on Android Chrome and does not exist on iOS, so it is
 * the one path that reaches a phone at all. A failure on every path is
 * swallowed there: pollerState.ts is what prevents a re-fire, not this call
 * succeeding.
 */
async function sendBrowserNotification(
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<void> {
  const { title, body } = await notificationText(fire, character);
  await displayPageNotification(
    livePageDisplayEnv(),
    title,
    notificationOptionsFor({ eventId: fire.eventId, characterId: character.characterId }, body)
  );
}

/**
 * Renders the same copy the browser notification carries and files it in the
 * Notification Feed. `notificationText` is called separately from
 * `sendBrowserNotification`'s call rather than threaded through both: its
 * ESI lookups (`loadUniverseType`, `loadPlanetName`) read the Dexie cache, so
 * the second render costs a cache hit, and keeping `notify`'s signature
 * untouched is what lets `backgroundPoller.ts` override it without knowing
 * the feed exists (the Service Worker's poll files to the feed too).
 */
async function recordFeedNotification(
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<void> {
  try {
    const { title, body } = await notificationText(fire, character);
    await recordFeedEntry({
      characterId: character.characterId,
      eventId: fire.eventId,
      title,
      body,
      firedAt: Date.now(),
    });
  } catch {
    // Same fire-and-forget contract as sendBrowserNotification: pollerState
    // is already persisted, so a failed write must not abort the remaining
    // fires of this poll.
  }
}

/** Hydrates a `createLocalSetting` store (a no-op once already hydrated) and returns its current value. */
async function hydratedValue<T>(store: LocalSettingStore<T>): Promise<T> {
  await store.getState().hydrate();
  return store.getState().value;
}

/** Real dependencies, wired against Dexie/ESI/the browser Notification API. */
export function liveDependencies(): PollDependencies {
  return {
    now: () => Date.now(),
    characters: async () =>
      (await db.characters.toArray()).map((c) => ({ characterId: c.characterId, name: c.name })),
    grantedScopes: async (characterId) => {
      const token = await db.tokens.get(characterId);
      return new Set(token?.scopes ?? []);
    },
    loadSkillQueue: async (characterId) => {
      const result = await loadCharacterSkillQueueWithStatus(characterId);
      if (result.needsReauth || result.cached === null) return null;
      return result.cached.data;
    },
    loadIndustryJobs: async (characterId) => {
      const result = await loadCharacterIndustryJobs(characterId);
      if (result.needsReauth || result.cached === null) return null;
      return result.cached.data;
    },
    loadColonyExtractors: async (characterId) => {
      const planetsResult = await loadCharacterPlanets(characterId);
      if (planetsResult.needsReauth || planetsResult.cached === null) return null;
      const planets = planetsResult.cached.data;
      const details = await loadAllColonyDetails(
        characterId,
        planets.map((p) => p.planet_id)
      );
      const colonies: ColonySnapshotEntry[] = [];
      for (const planet of planets) {
        const detail = details.get(planet.planet_id);
        if (!detail || detail.needsReauth || detail.cached === null) continue;
        const programs = extractorProgramsFromPins(detail.cached.data.pins);
        colonies.push({
          planetId: planet.planet_id,
          extractors: programs.map((p) => ({ pinId: p.pinId, expiryTimeMs: p.expiryTimeMs })),
        });
      }
      return colonies;
    },
    loadMail: async (characterId) => {
      const result = await loadMailHeaders(characterId);
      if (result.needsReauth || result.cached === null) return null;
      return result.cached.data;
    },
    loadCalendarEvents: async (characterId) => {
      const result = await loadCharacterCalendarEvents(characterId);
      if (result.needsReauth || result.cached === null) return null;
      return result.cached.data;
    },
    loadContracts: async (characterId) => {
      const result = await loadCharacterContracts(characterId);
      if (result.needsReauth || result.cached === null) return null;
      // A truncated page set would persist a short ContractSnapshot missing
      // contracts already in_progress; the next complete poll would then see
      // them as newly appearing and false-fire contractAccepted (issue #174
      // review) — skip this poll entirely rather than save a partial baseline.
      if (result.cached.truncated) return null;
      return result.cached.data;
    },
    loadWalletJournal: async (characterId) => {
      const result = await loadWalletJournalWithStatus(characterId);
      if (result.needsReauth || result.cached === null) return null;
      // A truncated page set could lower the high-water mark diffWalletBalanceChanged
      // tracks, re-firing for entries already reported once the next complete poll
      // sees them again (same reasoning as loadContracts' truncation guard above).
      if (result.cached.truncated) return null;
      return result.cached.data;
    },
    loadMarketOrders: async (characterId) => {
      const [openResult, historyResult] = await Promise.all([
        loadOrders(characterId),
        loadOrderHistory(characterId),
      ]);
      if (openResult.needsReauth || openResult.cached === null) return null;
      if (historyResult.needsReauth || historyResult.cached === null) return null;
      // A truncated history page set would misreport a still-open order as
      // filled-and-gone; skip this poll entirely rather than save a partial
      // baseline (same reasoning as loadContracts' truncation guard above).
      if (historyResult.cached.truncated) return null;
      return deriveMarketOrderEntries(openResult.cached.data, historyResult.cached.data);
    },
    masterEnabled: async () => (await hydratedValue(useNotificationPreferences)).masterEnabled,
    browserChannelEnabled: async () =>
      isBrowserChannelEnabled(await hydratedValue(useNotificationPreferences)),
    feedChannelEnabled: async () =>
      isFeedChannelEnabled(await hydratedValue(useNotificationPreferences)),
    eventPrefsFor: async (characterId) =>
      characterEventPrefs(await hydratedValue(useNotificationPreferences), characterId),
    permission: () => readNotificationPermission(),
    prevState: () => hydratedValue(useSkillQueuePollerState),
    saveState: (state) => useSkillQueuePollerState.getState().setValue(state),
    prevIndustryJobState: () => hydratedValue(useIndustryJobPollerState),
    saveIndustryJobState: (state) => useIndustryJobPollerState.getState().setValue(state),
    prevColonyState: () => hydratedValue(useColonyPollerState),
    saveColonyState: (state) => useColonyPollerState.getState().setValue(state),
    prevMailState: () => hydratedValue(useMailPollerState),
    saveMailState: (state) => useMailPollerState.getState().setValue(state),
    prevCalendarState: () => hydratedValue(useCalendarPollerState),
    saveCalendarState: (state) => useCalendarPollerState.getState().setValue(state),
    prevContractState: () => hydratedValue(useContractPollerState),
    saveContractState: (state) => useContractPollerState.getState().setValue(state),
    prevWalletState: () => hydratedValue(useWalletPollerState),
    saveWalletState: (state) => useWalletPollerState.getState().setValue(state),
    prevMarketOrderState: () => hydratedValue(useMarketOrderPollerState),
    saveMarketOrderState: (state) => useMarketOrderPollerState.getState().setValue(state),
    notify: sendBrowserNotification,
    recordToFeed: recordFeedNotification,
  };
}
