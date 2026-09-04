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
import { occurrenceKey } from '@/engine/occurrenceKey';
import type { ProjectionRow } from '@/engine/projection';
import { loadUniverseType } from '@/features/skills/data';
import { loadPlanetName } from '@/features/pi/names';
import { resolveNames } from '@/features/character/names';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { formatIsk } from '@/lib/isk';
import i18n from '@/i18n';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';
import { POLL_DOMAINS, type AnyNotificationFire, type PollDomain } from './pollDomains';
import { groupIdenticalFires, type RenderedFire } from './groupFires';
import { withCharacterSnapshot, type PollerState } from './pollerState';
import {
  useNotificationPreferences,
  hydrateNotificationPreferences,
  characterEventPrefs,
  characterEveTypePrefs,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
} from './preferences';
import { recordFeedEntry } from './feed';
import {
  isEventEnabledFor,
  isEveTypeAllowed,
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
import { uploadProjectionRows } from './projectionUpload';

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
  /**
   * `override` carries copy the delivery loop already rendered and grouped
   * (`groupFires.ts`, count-adjusted when more than one fire in this poll
   * rendered identical copy) so it isn't rendered a second time here. Omitted
   * only by a caller reaching this directly outside that loop
   * (`backgroundPoller.test.ts`'s direct calls, `sendBackgroundNotification`
   * used standalone) — those fall back to rendering it themselves. `notify`
   * is the only member grouped this way; `recordToFeed` always renders (and
   * writes) its own copy per fire — see its doc comment.
   */
  notify: (
    fire: AnyNotificationFire,
    character: CharacterRef,
    override?: { title: string; body: string }
  ) => Promise<void>;
  recordToFeed: (fire: AnyNotificationFire, character: CharacterRef) => Promise<void>;
  /**
   * Whether a Notification Feed row already exists for this Occurrence Key
   * (issue #360) — evidence that Web Push, or another device/tab syncing the
   * feed, already delivered this occurrence. Independent of this device's
   * feed channel/event preferences: the row can exist purely because push
   * wrote it, regardless of whether this device would itself record to the
   * feed for that event.
   */
  alreadyDelivered: (occurrenceKey: string) => Promise<boolean>;
  /**
   * This poll's Scheduled Push upload (issue #358, ADR 0010, CONTEXT.md round
   * 45): every Character updated this poll, mapped to its whole 72-hour
   * Projection window. Called once per poll — "every app open and every
   * foreground poll" collapses to this one call site, since
   * `ForegroundNotificationPoller` already runs a poll immediately on mount.
   */
  uploadProjection: (rowsByCharacter: ReadonlyMap<number, ProjectionRow[]>) => Promise<void>;
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
  /** This poll's contribution to the Scheduled Push upload (issue #358) — see `PollDependencies.uploadProjection`. */
  projectionRows: ProjectionRow[];
}

/**
 * A layer underneath `isEventEnabledFor` for `eveNotification` fires only
 * (issue #274): every other event's channel gate is the single check above,
 * but this one event covers the Notification Allow-List's types (issue
 * #350), each independently opt-out-able. Non-`eveNotification` fires pass
 * through unchanged. Only ever reached for allow-listed types — the poll
 * loop below drops everything else before this runs.
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
    const projectionRows: ProjectionRow[] = [];

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
      // Scheduled Push upload (issue #358): a Scheduled Push is the
      // closed-app analog of the *browser* channel specifically (it shows an
      // OS notification, same as `notify` below) — never gated on `feed`,
      // which shows nothing. Filtering to `enabledEvents` alone (browser OR
      // feed) would upload — and later push — a feed-only event the user
      // switched browser notifications off for. `projectColonies` in
      // particular emits both colony events off one snapshot regardless of
      // which is individually toggled, so this filter is load-bearing there,
      // not redundant.
      if (run.domain.projection) {
        const domainProjectionRows = await run.domain.projection(
          character.characterId,
          character.name,
          next,
          deps.now()
        );
        projectionRows.push(
          ...domainProjectionRows.filter(
            (row) =>
              enabledEvents.has(row.eventId) &&
              browserEnabled &&
              isEventEnabledFor(eventPrefs, row.eventId, 'browser')
          )
        );
      }
    }

    if (snapshots.size > 0) {
      updates.push({
        characterId: character.characterId,
        eventPrefs,
        eveTypePrefs,
        snapshots,
        fires,
        projectionRows,
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
    // Notification Allow-List (CONTEXT.md round 44): a type outside the
    // closed list is dropped here, before either channel and before any
    // name-resolution work (notificationText → resolveEveNotificationNames)
    // that recordToFeed/notify would otherwise trigger for it.
    const allowedFires = update.fires.filter(
      (fire) => fire.eventId !== 'eveNotification' || isEveTypeAllowed(fire.type)
    );

    // Browser: grouped, and checked against the feed *before* the feed loop
    // below writes anything (issue #360). Web Push, or another device/tab
    // syncing the feed, may have already delivered this exact occurrence —
    // `deps.alreadyDelivered` is what lets the poller suppress its own
    // redundant bubble for it. This must run before this device's own feed
    // loop: that loop's `recordToFeed` writes a row keyed by the very same
    // Occurrence Key, and for the common case of an event with both channels
    // enabled, checking after that write would make every occurrence appear
    // "already delivered" by itself. Checked per fire, by Occurrence Key, not
    // by comparing rendered copy — grouping (`groupIdenticalFires`) happens
    // after, on whatever survives.
    const browserFires: AnyNotificationFire[] = [];
    for (const fire of allowedFires) {
      if (
        !browserEnabled ||
        !isEventEnabledFor(update.eventPrefs, fire.eventId, 'browser') ||
        !eveTypeAllowsChannel(fire, update.eveTypePrefs, 'browser')
      ) {
        continue;
      }
      if (await deps.alreadyDelivered(occurrenceKey(fire, deps.now()))) continue;
      browserFires.push(fire);
    }

    // Feed: one row per actual occurrence, never grouped — each fire's own
    // Occurrence Key (`@/engine/occurrenceKey`) is what lets the Scheduled
    // Push backend, independently observing the same occurrence, agree with
    // the Foreground Poller on the feed row it belongs to (CONTEXT.md round
    // 44/48). Collapsing several fires into one feed write, the way the
    // browser channel below does, would permanently lose the other
    // occurrences from the feed's history — nothing re-fires an
    // already-high-water-marked diff to recover them.
    for (const fire of allowedFires) {
      const eventId = fire.eventId;
      if (
        feedEnabled &&
        isEventEnabledFor(update.eventPrefs, eventId, 'feed') &&
        eveTypeAllowsChannel(fire, update.eveTypePrefs, 'feed')
      ) {
        await deps.recordToFeed(fire, character);
      }
    }
    const rendered: RenderedFire<AnyNotificationFire>[] = [];
    for (const fire of browserFires) {
      rendered.push({ fire, ...(await notificationText(fire, character)) });
    }
    for (const group of groupIdenticalFires(rendered)) {
      const title = group.count > 1 ? groupedTitle(group.title, group.count) : group.title;
      await deps.notify(group.fire, character, { title, body: group.body });
    }
  }

  await deps.uploadProjection(
    new Map(updates.map((update) => [update.characterId, update.projectionRows]))
  );
}

/** `"{{title}} x{{count}}"` — the suffix a grouped browser-toast title carries (`groupFires.ts`). */
function groupedTitle(title: string, count: number): string {
  return i18n.t('notifications.groupedTitle', { title, count });
}

/** Exported for `backgroundPoller.ts` — the Service Worker's `push` handler renders the exact same copy the Foreground Poller does, driven by the same registry. */
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
 *
 * `override` is the copy the delivery loop already rendered (and, for a
 * grouped burst, already count-adjusted) — `notificationText` is only called
 * here as a fallback for a caller reaching this directly, outside that loop.
 */
async function sendBrowserNotification(
  fire: AnyNotificationFire,
  character: CharacterRef,
  override?: { title: string; body: string }
): Promise<void> {
  const { title, body } = override ?? (await notificationText(fire, character));
  await displayPageNotification(
    livePageDisplayEnv(),
    title,
    notificationOptionsFor({ eventId: fire.eventId, characterId: character.characterId }, body)
  );
}

/**
 * Files the same copy the browser notification carries into the Notification
 * Feed. Always renders its own copy from the raw `fire` — never grouped the
 * way `sendBrowserNotification`'s toast is (`runForegroundPollOnce`'s doc
 * comment on the feed-delivery loop): one row per actual occurrence, each
 * keyed by its own `occurrenceKey`, is what keeps the feed agreeing with the
 * Scheduled Push backend's independent view of the same occurrences.
 */
async function recordFeedNotification(
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<void> {
  try {
    const { title, body } = await notificationText(fire, character);
    const firedAt = Date.now();
    await recordFeedEntry({
      id: occurrenceKey(fire, firedAt),
      characterId: character.characterId,
      eventId: fire.eventId,
      eveType: fire.eventId === 'eveNotification' ? fire.type : undefined,
      title,
      body,
      firedAt,
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

/** Same shape as {@link hydratedValue}, but also splices in synced feed data (issue #363) on every call. */
async function currentNotificationPreferences() {
  await hydrateNotificationPreferences();
  return useNotificationPreferences.getState().value;
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
    masterEnabled: async () => (await currentNotificationPreferences()).masterEnabled,
    browserChannelEnabled: async () =>
      isBrowserChannelEnabled(await currentNotificationPreferences()),
    feedChannelEnabled: async () => isFeedChannelEnabled(await currentNotificationPreferences()),
    eventPrefsFor: async (characterId) =>
      characterEventPrefs(await currentNotificationPreferences(), characterId),
    eveTypePrefsFor: async (characterId) =>
      characterEveTypePrefs(await currentNotificationPreferences(), characterId),
    permission: () => readNotificationPermission(),
    notify: sendBrowserNotification,
    recordToFeed: recordFeedNotification,
    alreadyDelivered: async (key) => (await db.notificationFeed.get(key)) !== undefined,
    uploadProjection: uploadProjectionRows,
  };
}
