/**
 * Foreground Poller (CONTEXT.md round 20): every `POLL_INTERVAL_MS` while the
 * app is open and visible, checks each enabled Notification Event's
 * underlying ESI data and fires a browser Notification for whatever the
 * shared `engine/notificationDiffs.ts` registry says changed. The scheduling
 * shell (`ForegroundNotificationPoller.tsx`) owns the interval/visibility
 * wiring; `runForegroundPoll` here is the impure-but-injectable orchestration
 * step, kept separate so it's testable without mocking `setInterval`.
 *
 * One poll per character does one skill-queue fetch and runs every
 * skill-queue-driven diff against it — not one fetch-and-compare loop per
 * event (AC2).
 */
import { db } from '@/db';
import { loadCharacterSkillQueueWithStatus } from '@/features/skills/data';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import i18n from '@/i18n';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import {
  runSkillQueueNotificationDiffs,
  SKILL_QUEUE_NOTIFICATION_DIFFS,
  type NotificationFire,
  type SkillQueueEntrySnapshot,
  type SkillQueueSnapshot,
  type SkillQueueNotificationEventId,
} from '@/engine/notificationDiffs';
import { NOTIFICATION_EVENTS } from './events';
import { useNotificationPreferences, characterEventPrefs } from './preferences';
import { isEventEnabled } from './eventSelection';
import { readNotificationPermission } from './permission';
import {
  useSkillQueuePollerState,
  withCharacterSnapshot,
  type SkillQueuePollerState,
} from './pollerState';
import { loadUniverseType } from '@/features/skills/data';

export const POLL_INTERVAL_MS = 5 * 60 * 1000;

/** The registry itself is the one source of which events this poller runs — nothing else enumerates them. */
const SKILL_QUEUE_EVENT_IDS = Object.keys(
  SKILL_QUEUE_NOTIFICATION_DIFFS
) as SkillQueueNotificationEventId[];

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

export interface CharacterRef {
  characterId: number;
  name: string;
}

export interface PollDependencies {
  now: () => number;
  characters: () => Promise<CharacterRef[]>;
  grantedScopes: (characterId: number) => Promise<ReadonlySet<string>>;
  loadSkillQueue: (characterId: number) => Promise<SkillQueueEntry[] | null>;
  masterEnabled: () => Promise<boolean>;
  eventPrefsFor: (
    characterId: number
  ) => Promise<Partial<Record<SkillQueueNotificationEventId, boolean>>>;
  permission: () => NotificationPermission | 'unsupported' | 'default' | 'denied';
  prevState: () => Promise<SkillQueuePollerState>;
  saveState: (state: SkillQueuePollerState) => Promise<void>;
  notify: (fire: NotificationFire, character: CharacterRef) => Promise<void>;
}

/** Which of the two skill-queue events this character is eligible for right now: has the scope, and the event isn't toggled off. */
function enabledEventsFor(
  scopes: ReadonlySet<string>,
  eventPrefs: Partial<Record<SkillQueueNotificationEventId, boolean>>
): ReadonlySet<SkillQueueNotificationEventId> {
  const enabled = new Set<SkillQueueNotificationEventId>();
  for (const eventId of SKILL_QUEUE_EVENT_IDS) {
    const scope = SCOPE_BY_EVENT.get(eventId);
    if (scope && scopes.has(scope) && isEventEnabled(eventPrefs, eventId)) {
      enabled.add(eventId);
    }
  }
  return enabled;
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

  const prevAll = await deps.prevState();
  const updates: {
    characterId: number;
    snapshot: SkillQueueSnapshot;
    fires: NotificationFire[];
  }[] = [];

  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    const [scopes, eventPrefs] = await Promise.all([
      deps.grantedScopes(character.characterId),
      deps.eventPrefsFor(character.characterId),
    ]);
    const enabledEvents = enabledEventsFor(scopes, eventPrefs);
    if (enabledEvents.size === 0) return;

    const entries = await deps.loadSkillQueue(character.characterId);
    if (entries === null) return;

    const next: SkillQueueSnapshot = { entries: entries.map(toSnapshotEntry), nowMs: deps.now() };
    const fires = runSkillQueueNotificationDiffs(
      character.characterId,
      prevAll[character.characterId],
      next,
      enabledEvents
    );
    updates.push({ characterId: character.characterId, snapshot: next, fires });
  });

  if (updates.length === 0) return;

  let nextAll = prevAll;
  for (const update of updates) {
    nextAll = withCharacterSnapshot(nextAll, update.characterId, update.snapshot);
  }
  await deps.saveState(nextAll);

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
  fire: NotificationFire,
  character: CharacterRef
): Promise<{ title: string; body: string }> {
  if (fire.eventId === 'characterNotTraining') {
    return {
      title: i18n.t('notifications.fired.characterNotTraining.title'),
      body: i18n.t('notifications.fired.characterNotTraining.body', { character: character.name }),
    };
  }
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
  fire: NotificationFire,
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
    masterEnabled: async () => (await hydratedValue(useNotificationPreferences)).masterEnabled,
    eventPrefsFor: async (characterId) =>
      characterEventPrefs(await hydratedValue(useNotificationPreferences), characterId),
    permission: () => readNotificationPermission(),
    prevState: () => hydratedValue(useSkillQueuePollerState),
    saveState: (state) => useSkillQueuePollerState.getState().setValue(state),
    notify: sendBrowserNotification,
  };
}
