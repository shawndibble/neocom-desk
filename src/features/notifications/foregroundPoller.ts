/**
 * Foreground Poller (CONTEXT.md round 20): every `POLL_INTERVAL_MS` while the
 * app is open and visible, checks each enabled Notification Event's
 * underlying ESI data and fires a browser Notification for whatever the
 * shared `engine/notificationDiffs.ts` registry says changed. The scheduling
 * shell (`ForegroundNotificationPoller.tsx`) owns the interval/visibility
 * wiring; `runForegroundPoll` here is the impure-but-injectable orchestration
 * step, kept separate so it's testable without mocking `setInterval`.
 *
 * One poll per character does at most one fetch per data domain and runs every
 * diff driven by that domain against it — not one fetch-and-compare loop per
 * event (AC2). Which domains exist, what each fetches and which diffs it
 * drives all live in `pollDomains.ts`; this file names none of them (#273).
 */
import { db } from '@/db';
import { loadUniverseType } from '@/features/skills/data';
import { loadPlanetName } from '@/features/pi/names';
import { resolveNames } from '@/features/character/names';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { formatIsk } from '@/lib/isk';
import i18n from '@/i18n';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';
import { POLL_DOMAINS, type AnyNotificationFire, type PollDomain } from './pollDomains';
import { withCharacterSnapshot, type PollerState } from './pollerState';
import {
  useNotificationPreferences,
  characterEventPrefs,
  characterEveTypePrefs,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
} from './preferences';
import { recordFeedEntry } from './feed';
import {
  isEventEnabledFor,
  isEveTypeEnabledFor,
  type EventEnabledMap,
  type EveTypeEnabledMap,
  type NotificationChannel,
} from './eventSelection';
import { readNotificationPermission } from './permission';
import { displayPageNotification, livePageDisplayEnv } from './display';
import { notificationOptionsFor } from './notificationOptions';
import { eveNotificationText } from './eveNotificationText';
import { resolveEveNotificationNames } from './eveNotificationNames';

export type { AnyNotificationFire } from './pollDomains';

export const POLL_INTERVAL_MS = 5 * 60 * 1000;

const SCOPE_BY_EVENT = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event.scope]));

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const DAY_MS = 86_400_000;

export interface CharacterRef {
  characterId: number;
  name: string;
}

/** One domain's persisted baseline, read once per poll and written back once. */
export interface DomainPollState {
  prev: () => Promise<PollerState<unknown>>;
  save: (state: PollerState<unknown>) => Promise<void>;
}

export interface PollDependencies {
  now: () => number;
  characters: () => Promise<CharacterRef[]>;
  grantedScopes: (characterId: number) => Promise<ReadonlySet<string>>;
  /**
   * Fetches one registry domain for one character, or null to skip it this
   * poll. The single seam that replaced the eight `load*` members: the live
   * loader (truncation guards included) is the registry entry's own
   * `pollDomains.ts` `load`.
   */
  loadDomain: (domain: PollDomain, characterId: number) => Promise<readonly unknown[] | null>;
  /** Reads and writes one domain's baseline — replaces the eight `prev*`/`save*` pairs. */
  domainState: (domain: PollDomain) => DomainPollState;
  masterEnabled: () => Promise<boolean>;
  /** The two delivery channels, independently toggleable (preferences.ts). */
  browserChannelEnabled: () => Promise<boolean>;
  feedChannelEnabled: () => Promise<boolean>;
  eventPrefsFor: (characterId: number) => Promise<EventEnabledMap>;
  /** Per-`type` opt-out underneath the single `eveNotification` event (issue #274). */
  eveTypePrefsFor: (characterId: number) => Promise<EveTypeEnabledMap>;
  permission: () => NotificationPermission | 'unsupported' | 'default' | 'denied';
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
function enabledEventsFor(
  eventIds: readonly NotificationEventId[],
  scopes: ReadonlySet<string>,
  eventPrefs: EventEnabledMap,
  channels: LiveChannels
): ReadonlySet<NotificationEventId> {
  const enabled = new Set<NotificationEventId>();
  for (const eventId of eventIds) {
    const scope = SCOPE_BY_EVENT.get(eventId);
    if (scope && scopes.has(scope) && reachesAnyChannel(eventPrefs, eventId, channels)) {
      enabled.add(eventId);
    }
  }
  return enabled;
}

/** One domain's state for the length of one poll: where to read/write it, and the value being built. */
interface DomainRun {
  domain: PollDomain;
  state: DomainPollState;
  /** Starts as the persisted baseline; every character's snapshot is merged in. */
  next: PollerState<unknown>;
}

interface CharacterUpdate {
  characterId: number;
  /** Carried through so the delivery loop can honour each event's per-channel columns. */
  eventPrefs: EventEnabledMap;
  /** Carried through so the delivery loop can honour each eveNotification type's per-channel columns. */
  eveTypePrefs: EveTypeEnabledMap;
  /** The snapshot this poll built per domain — absent for a domain it skipped. */
  snapshots: Map<DomainRun, unknown>;
  fires: AnyNotificationFire[];
}

/**
 * A layer underneath `isEventEnabledFor` for `eveNotification` fires only
 * (issue #274): every other event's channel gate is the single check above,
 * but this one event covers ~100 underlying types, each independently
 * opt-out-able. Non-`eveNotification` fires pass through unchanged.
 */
function eveTypeAllowsChannel(
  fire: AnyNotificationFire,
  eveTypePrefs: EveTypeEnabledMap,
  channel: NotificationChannel
): boolean {
  if (fire.eventId !== 'eveNotification') return true;
  return isEveTypeEnabledFor(eveTypePrefs, fire.type, channel);
}

/**
 * Guards against overlapping polls: `ForegroundNotificationPoller` can call
 * this from mount, its interval, and a visibility-change handler in close
 * succession (e.g. a tab flip landing right on an interval tick), and with
 * no guard two runs would both diff against the same unsaved baseline and
 * each record the same fire — duplicate feed entries whose write order (not
 * the underlying event order) then decided their `firedAt`, so the feed
 * looked misordered too. A poll already running is left to finish rather
 * than started twice; the caller's `void runForegroundPoll(...)` doesn't
 * need the result.
 */
let inFlightPoll: Promise<void> | null = null;

export function runForegroundPoll(deps: PollDependencies): Promise<void> {
  if (inFlightPoll) return inFlightPoll;
  const run = runForegroundPollOnce(deps).finally(() => {
    if (inFlightPoll === run) inFlightPoll = null;
  });
  inFlightPoll = run;
  return run;
}

/**
 * One poll across every character, respecting the master switch and live
 * browser permission up front — no ESI calls at all when neither could ever
 * result in a fired notification (AC5).
 */
async function runForegroundPollOnce(deps: PollDependencies): Promise<void> {
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

  const runs: DomainRun[] = await Promise.all(
    POLL_DOMAINS.map(async (domain) => {
      const state = deps.domainState(domain);
      return { domain, state, next: await state.prev() };
    })
  );

  const updates: CharacterUpdate[] = [];

  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    const [scopes, eventPrefs, eveTypePrefs] = await Promise.all([
      deps.grantedScopes(character.characterId),
      deps.eventPrefsFor(character.characterId),
      deps.eveTypePrefsFor(character.characterId),
    ]);

    const fires: AnyNotificationFire[] = [];
    const snapshots = new Map<DomainRun, unknown>();

    for (const run of runs) {
      const enabledEvents = enabledEventsFor(run.domain.eventIds, scopes, eventPrefs, channels);
      // Nothing this domain could fire is both in scope and switched on for a
      // live channel: no fetch at all (AC5).
      if (enabledEvents.size === 0) continue;
      const rows = await deps.loadDomain(run.domain, character.characterId);
      // A failed — or deliberately skipped, as the truncation guards do —
      // load persists no snapshot and fires nothing, leaving the previous
      // baseline for the next complete poll.
      if (rows === null) continue;
      const next = run.domain.toSnapshot(rows, deps.now());
      snapshots.set(run, next);
      fires.push(
        ...run.domain.diff(
          character.characterId,
          run.next[character.characterId],
          next,
          enabledEvents
        )
      );
    }

    if (snapshots.size > 0) {
      updates.push({
        characterId: character.characterId,
        eventPrefs,
        eveTypePrefs,
        snapshots,
        fires,
      });
    }
  });

  if (updates.length === 0) return;

  // `run.next` still holds the baseline every diff above compared against; it
  // is only advanced now that every character has been diffed.
  for (const update of updates) {
    for (const [run, snapshot] of update.snapshots) {
      run.next = withCharacterSnapshot(run.next, update.characterId, snapshot);
    }
  }
  await Promise.all(runs.map((run) => run.state.save(run.next)));

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
      if (
        feedEnabled &&
        isEventEnabledFor(update.eventPrefs, eventId, 'feed') &&
        eveTypeAllowsChannel(fire, update.eveTypePrefs, 'feed')
      ) {
        await deps.recordToFeed(fire, character);
      }
      if (
        browserEnabled &&
        isEventEnabledFor(update.eventPrefs, eventId, 'browser') &&
        eveTypeAllowsChannel(fire, update.eveTypePrefs, 'browser')
      ) {
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
  if (fire.eventId === 'planetaryExtractorExpiring') {
    const planetName = (await loadPlanetName(fire.planetId)) ?? `#${fire.planetId}`;
    return {
      title: i18n.t('notifications.fired.planetaryExtractorExpiring.title'),
      body: i18n.t('notifications.fired.planetaryExtractorExpiring.body', {
        character: character.name,
        planet: planetName,
        hours: Math.round(fire.thresholdMs / 3_600_000),
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
  if (fire.eventId === 'eveNotification') {
    // Resolution is best-effort, time-boxed and never rejects (issue #300):
    // whatever it could not look up in its budget renders as an id or a
    // neutral phrase rather than holding the notification back.
    return eveNotificationText(fire, character, await resolveEveNotificationNames(fire));
  }
  if (fire.eventId === 'characterNotTraining') {
    return {
      title: i18n.t('notifications.fired.characterNotTraining.title'),
      body: i18n.t('notifications.fired.characterNotTraining.body', { character: character.name }),
    };
  }
  if (fire.eventId === 'structureFuelLow') {
    return {
      title: i18n.t('notifications.fired.structureFuelLow.title'),
      body: i18n.t('notifications.fired.structureFuelLow.body', {
        character: character.name,
        structure: fire.structureName,
        days: Math.round(fire.thresholdMs / DAY_MS),
      }),
    };
  }
  if (fire.eventId === 'corpIndustryJobReady') {
    const itemTypeId = fire.productTypeId ?? fire.blueprintTypeId;
    const itemType = await loadUniverseType(itemTypeId);
    const itemName = itemType?.data.name ?? `#${itemTypeId}`;
    return {
      title: i18n.t('notifications.fired.corpIndustryJobReady.title'),
      body: i18n.t('notifications.fired.corpIndustryJobReady.body', {
        character: character.name,
        item: itemName,
      }),
    };
  }
  if (fire.eventId === 'corpMemberJoined' || fire.eventId === 'corpMemberLeft') {
    const names = await resolveNames([fire.memberCharacterId]);
    const memberName = names.get(fire.memberCharacterId) ?? `#${fire.memberCharacterId}`;
    return {
      title: i18n.t(`notifications.fired.${fire.eventId}.title`),
      body: i18n.t(`notifications.fired.${fire.eventId}.body`, {
        character: character.name,
        member: memberName,
      }),
    };
  }
  if (fire.eventId === 'corpWalletThreshold') {
    const title = i18n.t('notifications.fired.corpWalletThreshold.title');
    if (fire.kind === 'balanceBelow') {
      return {
        title,
        body: i18n.t('notifications.fired.corpWalletThreshold.balanceBelowBody', {
          character: character.name,
          division: fire.division,
          balance: formatIsk(fire.balance, 2),
        }),
      };
    }
    return {
      title,
      body: i18n.t('notifications.fired.corpWalletThreshold.transactionAboveBody', {
        character: character.name,
        division: fire.division,
        amount: formatIsk(Math.abs(fire.amount), 2),
      }),
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
 * ESI lookups (`loadUniverseType`, `loadPlanetName`) read the Dexie cache and
 * `resolveEveNotificationNames` memoizes per notification id, so the second
 * render costs a cache hit rather than a second round-trip — issue #300's
 * `postUniverseNames` path asks ESI live before it consults its own cache, so
 * that memo is what keeps this sentence true. Keeping `notify`'s signature
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
      eveType: fire.eventId === 'eveNotification' ? fire.type : undefined,
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
    // Both per-domain seams delegate straight to the registry entry: no
    // domain is named here, so a ninth needs no line in this function.
    loadDomain: (domain, characterId) => domain.load(characterId),
    domainState: (domain) => ({
      prev: () => hydratedValue(domain.store),
      save: (state) => domain.store.getState().setValue(state),
    }),
    masterEnabled: async () => (await hydratedValue(useNotificationPreferences)).masterEnabled,
    browserChannelEnabled: async () =>
      isBrowserChannelEnabled(await hydratedValue(useNotificationPreferences)),
    feedChannelEnabled: async () =>
      isFeedChannelEnabled(await hydratedValue(useNotificationPreferences)),
    eventPrefsFor: async (characterId) =>
      characterEventPrefs(await hydratedValue(useNotificationPreferences), characterId),
    eveTypePrefsFor: async (characterId) =>
      characterEveTypePrefs(await hydratedValue(useNotificationPreferences), characterId),
    permission: () => readNotificationPermission(),
    notify: sendBrowserNotification,
    recordToFeed: recordFeedNotification,
  };
}
