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
import type {
  SkillQueueEntry,
  IndustryJob,
  MailHeader,
  CalendarEventSummary,
  Contract,
} from '@/esi/endpoints';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
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
} from '@/engine/notificationDiffs';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';
import { useNotificationPreferences, characterEventPrefs } from './preferences';
import { isEventEnabled, type EventEnabledMap } from './eventSelection';
import { readNotificationPermission } from './permission';
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
} from './pollerState';

export const POLL_INTERVAL_MS = 5 * 60 * 1000;

export type AnyNotificationFire =
  | NotificationFire
  | IndustryJobNotificationFire
  | PlanetaryNotificationFire
  | MailNotificationFire
  | NewCalendarEventFire
  | CalendarEventStartingFire
  | ContractNotificationFire;

/** `SKILL_QUEUE_NOTIFICATION_DIFFS` is the one source of which skill-queue-driven events this poller runs; industry jobs, PI colonies, mail, calendar, and contracts aren't skill-queue-driven (engine/notificationDiffs.ts), so those are listed directly. */
const SKILL_QUEUE_EVENT_IDS = Object.keys(
  SKILL_QUEUE_NOTIFICATION_DIFFS
) as SkillQueueNotificationEventId[];

const INDUSTRY_JOB_EVENT_IDS = ['industryJobComplete'] as const;
const PLANETARY_EVENT_IDS = ['planetaryExtractionDone'] as const;
const MAIL_EVENT_IDS = ['newMail'] as const;
const CALENDAR_EVENT_IDS = ['newCalendarEvent', 'calendarEventStarting'] as const;
const CONTRACT_EVENT_IDS = ['contractAccepted'] as const;

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
  masterEnabled: () => Promise<boolean>;
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
  notify: (fire: AnyNotificationFire, character: CharacterRef) => Promise<void>;
}

/** Which of a set of candidate events this character is eligible for right now: has the scope, and the event isn't toggled off. */
function enabledEventsFor<T extends NotificationEventId>(
  eventIds: readonly T[],
  scopes: ReadonlySet<string>,
  eventPrefs: EventEnabledMap
): ReadonlySet<T> {
  const enabled = new Set<T>();
  for (const eventId of eventIds) {
    const scope = SCOPE_BY_EVENT.get(eventId);
    if (scope && scopes.has(scope) && isEventEnabled(eventPrefs, eventId)) {
      enabled.add(eventId);
    }
  }
  return enabled;
}

interface CharacterUpdate {
  characterId: number;
  skillQueue?: SkillQueueSnapshot;
  industryJobs?: IndustryJobSnapshot;
  colonies?: PlanetarySnapshot;
  mail?: MailSnapshot;
  calendar?: CalendarSnapshot;
  contracts?: ContractSnapshot;
  fires: AnyNotificationFire[];
}

/**
 * One poll across every character, respecting the master switch and live
 * browser permission up front — no ESI calls at all when neither could ever
 * result in a fired notification (AC5).
 */
export async function runForegroundPoll(deps: PollDependencies): Promise<void> {
  if (!(await deps.masterEnabled())) return;
  if (deps.permission() !== 'granted') return;

  const characters = await deps.characters();
  if (characters.length === 0) return;

  const [
    prevSkillQueueAll,
    prevIndustryJobAll,
    prevColonyAll,
    prevMailAll,
    prevCalendarAll,
    prevContractAll,
  ] = await Promise.all([
    deps.prevState(),
    deps.prevIndustryJobState(),
    deps.prevColonyState(),
    deps.prevMailState(),
    deps.prevCalendarState(),
    deps.prevContractState(),
  ]);

  const updates: CharacterUpdate[] = [];

  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    const [scopes, eventPrefs] = await Promise.all([
      deps.grantedScopes(character.characterId),
      deps.eventPrefsFor(character.characterId),
    ]);

    const fires: AnyNotificationFire[] = [];
    const update: CharacterUpdate = { characterId: character.characterId, fires };

    const skillQueueEvents = enabledEventsFor(SKILL_QUEUE_EVENT_IDS, scopes, eventPrefs);
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

    const industryJobEvents = enabledEventsFor(INDUSTRY_JOB_EVENT_IDS, scopes, eventPrefs);
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

    const planetaryEvents = enabledEventsFor(PLANETARY_EVENT_IDS, scopes, eventPrefs);
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

    const mailEvents = enabledEventsFor(MAIL_EVENT_IDS, scopes, eventPrefs);
    if (mailEvents.size > 0) {
      const headers = await deps.loadMail(character.characterId);
      if (headers !== null) {
        const next: MailSnapshot = { entries: headers.map(toMailSnapshotEntry), nowMs: deps.now() };
        update.mail = next;
        fires.push(...diffNewMail(character.characterId, prevMailAll[character.characterId], next));
      }
    }

    const calendarEvents = enabledEventsFor(CALENDAR_EVENT_IDS, scopes, eventPrefs);
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

    const contractEvents = enabledEventsFor(CONTRACT_EVENT_IDS, scopes, eventPrefs);
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

    if (
      update.skillQueue ||
      update.industryJobs ||
      update.colonies ||
      update.mail ||
      update.calendar ||
      update.contracts
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
  }
  await Promise.all([
    deps.saveState(nextSkillQueueAll),
    deps.saveIndustryJobState(nextIndustryJobAll),
    deps.saveColonyState(nextColonyAll),
    deps.saveMailState(nextMailAll),
    deps.saveCalendarState(nextCalendarAll),
    deps.saveContractState(nextContractAll),
  ]);

  const charactersById = new Map(characters.map((c) => [c.characterId, c]));
  for (const update of updates) {
    const character = charactersById.get(update.characterId);
    if (!character) continue;
    for (const fire of update.fires) {
      await deps.notify(fire, character);
    }
  }
}

async function notificationText(
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

async function sendBrowserNotification(
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<void> {
  if (typeof Notification === 'undefined') return;
  const { title, body } = await notificationText(fire, character);
  try {
    new Notification(title, { body });
  } catch {
    // A denied/changed permission mid-poll, or a platform that rejects
    // construction outright, must not abort the rest of this poll's
    // already-persisted fires (pollerState.ts is what prevents a re-fire,
    // not this call succeeding).
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
    masterEnabled: async () => (await hydratedValue(useNotificationPreferences)).masterEnabled,
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
    notify: sendBrowserNotification,
  };
}
