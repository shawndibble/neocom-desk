/**
 * Foreground Poller (GLOSSARY.md round 20): every `POLL_INTERVAL_MS` while the
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
 * drives all live in `pollDomains/`; this file names none of them (#273).
 */
import { db } from '@/db';
import type { ContractNotificationFire } from '@/engine/notificationDiffs';
import type { ProjectionRow } from '@/engine/projection';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import { POLL_DOMAINS, type AnyNotificationFire, type PollDomain } from './pollDomains';
import { withCharacterSnapshot, type PollerState } from './pollerState';
import {
  useNotificationPreferences,
  hydrateNotificationPreferences,
  characterEventPrefs,
  characterEveTypePrefs,
  characterEventThresholds,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
} from './preferences';
import { feedSuppressesToast, markFeedNotifiedHere } from './feed';
import { dismissFeedKeysAndSync } from './feedSync';
import { settleFillTimes } from './fillTimeSettle';
import type { EventEnabledMap, EveTypeEnabledMap } from './eventSelection';
import { readNotificationPermission } from './permission';
import { uploadProjectionRows } from './projectionUpload';
import { rebuildProjection } from './projectionRebuild';
import type {
  ServerEventInputs,
  ServerEventRegistration,
  ServerPushedEventId,
} from './serverEvents';
import { readServerInputs } from './serverEventInputs';
import {
  reviseContractFeedRow,
  sendBrowserNotification,
  recordFeedNotification,
} from './fireDelivery';
import {
  pollCharacter,
  type DomainRun,
  type CharacterUpdate,
  type LiveChannels,
} from './foregroundPoller/pollCharacter';
import { dispatchFires } from './foregroundPoller/dispatchFire';
import { keepOneSharedFire } from './foregroundPoller/sharedWorldFires';

export type { AnyNotificationFire } from './pollDomains';
export { reviseContractFeedRow };

export const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How long after mount the first poll waits. A poll reads every Character's
 * notification domains, and at boot those reads would queue against the
 * visible route's own (and the cache warm-up's) for the shared ESI budget.
 * Regaining visibility still polls at once.
 */
export const FIRST_POLL_DELAY_MS = 10 * 1000;

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
   * `pollDomains/` `load`.
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
   * rendered identical copy) so it isn't rendered a second time here. `notify`
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
   * Whether this device should skip its own notification for this Occurrence
   * Key (issue #360): it already notified for it (a Web Push, or an earlier
   * poll's toast), the row was dismissed on any device, or the row is stale
   * (`feed.rowSuppressesToast`). A row another device synced in is *not*
   * enough on its own — that device's toast never reached this one.
   * Independent of this device's feed channel/event preferences: the row can
   * exist purely because push wrote it.
   */
  alreadyDelivered: (occurrenceKey: string) => Promise<boolean>;
  /**
   * Whether the Character folds a wallet change a contract caused into that
   * contract's alert (`walletFoldIntoContract`), read every poll.
   */
  walletFoldEnabled: (characterId: number) => Promise<boolean>;
  /** Whether a Notification Feed row exists for this Occurrence Key — the proof a contract alert is there to carry a wallet line. */
  feedRowExists: (occurrenceKey: string) => Promise<boolean>;
  /**
   * Rewrites an existing contract alert's feed row so its body includes the
   * wallet change (`fire.walletChangeIsk`). A no-op when the row is gone.
   */
  reviseContractFeedRow: (fire: ContractNotificationFire, character: CharacterRef) => Promise<void>;
  /** Records that this device just notified for these Occurrence Keys — what `alreadyDelivered` reads back. */
  markDelivered: (occurrenceKeys: readonly string[]) => Promise<void>;
  /**
   * Clears Notification Feed rows for occurrences this poll proved never
   * happened (`pollDomains/`'s `disproven`). A Scheduled Push fires
   * without a re-check (ADR 0010), so a pilot who restarts an extractor
   * program in game with the app closed is told it expired; the row that
   * push wrote is keyed on the dead program's expiry, so no later poll ever
   * writes over it.
   *
   * Dismissal rather than deletion, on `feed.dismissFeedEntry`'s reasoning:
   * the feed syncs, and a deleted row leaves no tombstone for the other
   * device to honour, so it would simply come back on the next pull. A
   * dismissal is the one thing `mergeFeedRecord` carries across in both
   * directions. Called with keys, not fires, because the row being addressed
   * may have been written by another party entirely. The Characters come
   * alongside because the retraction still has to be *pushed* under each
   * one's uid (`feedSync.dismissFeedKeysAndSync`), not because any key
   * belongs to a particular one.
   */
  retractFromFeed: (
    characterIds: readonly number[],
    occurrenceKeys: readonly string[]
  ) => Promise<void>;
  /**
   * Re-dates this Character's provisionally dated market order fills once
   * the wallet shows the sale (`fillTimeSettle.ts`). Never throws.
   */
  settleFillTimes: (characterId: number, scopes: ReadonlySet<string>) => Promise<void>;
  /**
   * The Scheduled Push upload (issue #358, ADR 0010, GLOSSARY.md round 45):
   * every Character mapped to its whole 72-hour Projection window, built by
   * `projectionRebuild.ts` from the saved baselines — once per poll that
   * updated anything ("every app open and every foreground poll", since
   * `ForegroundNotificationPoller` polls on mount), and directly from
   * Settings (issue #1248).
   */
  uploadProjection: (
    rowsByCharacter: ReadonlyMap<number, ProjectionRow[]>,
    eveTypesByCharacter: ReadonlyMap<number, readonly string[]>,
    serverEventsByCharacter: ReadonlyMap<number, ServerEventRegistration>
  ) => Promise<void>;
  /**
   * What the server needs to push this Character's enabled server events
   * (issue #5121): the Quickbar's price targets and hub, the ship-lost minimum.
   * Absent sends no inputs.
   */
  serverInputsFor?: (
    characterId: number,
    events: readonly ServerPushedEventId[]
  ) => Promise<ServerEventInputs>;
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
    const update = await pollCharacter(deps, runs, channels, character);
    if (update) updates.push(update);
  });

  if (updates.length === 0) return;

  // `run.next` still holds the baseline every diff above compared against; it
  // is only advanced now that every character has been diffed.
  const touchedRuns = new Set<DomainRun>();
  for (const update of updates) {
    for (const [run, snapshot] of update.snapshots) {
      run.next = withCharacterSnapshot(run.next, update.characterId, snapshot);
      touchedRuns.add(run);
    }
  }
  // Only the domains some character's fetch actually reached this poll — not
  // every registered domain. Before `priceAlertTriggered` (issue #680), every
  // domain needed a scope, so `updates.length > 0` almost always meant every
  // fetched domain belonged to the same handful of characters; now that one
  // domain needs no scope at all, it alone can make `updates` non-empty on a
  // poll where every other domain was skipped (no scope, truncated load,
  // etc.) — saving `runs` unconditionally would then rewrite every other
  // domain's untouched baseline back to Dexie on every single poll.
  await Promise.all([...touchedRuns].map((run) => run.state.save(run.next)));

  const charactersById = new Map(characters.map((c) => [c.characterId, c]));
  for (const update of keepOneSharedFire(updates, channels)) {
    const character = charactersById.get(update.characterId);
    if (character) await dispatchFires(deps, channels, character, update);
  }

  // A retraction cannot address a row this poll just wrote: a retracted key
  // carries the *replaced* program's expiry and every key written above
  // carries the live one, and `disprovenExtractorOccurrences` requires those
  // to differ. That is the whole safety argument — running after the delivery
  // loop does not add to it, since `mergeFeedRecord` takes the later
  // `dismissedAt` and so a dismissal sticks whichever order the two land in.
  const retracted = updates.filter((update) => update.retractedKeys.length > 0);
  if (retracted.length > 0) {
    await deps.retractFromFeed(
      retracted.map((update) => update.characterId),
      retracted.flatMap((update) => update.retractedKeys)
    );
  }

  // Scheduled Push upload (issue #358), from every domain's baseline as just
  // saved — including one this poll skipped or failed to load, whose last
  // good snapshot still stands (issue #1248).
  await rebuildProjection(deps, new Map(runs.map((run) => [run.domain, run.next])));
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
    walletFoldEnabled: async (characterId) =>
      characterEventThresholds(await currentNotificationPreferences(), characterId)
        .walletFoldIntoContract !== 0,
    feedRowExists: async (key) => {
      const row = await db.notificationFeed.get(key);
      return row !== undefined && row.dismissedAt === undefined;
    },
    reviseContractFeedRow: reviseContractFeedRow,
    alreadyDelivered: (key) => feedSuppressesToast(key, Date.now()),
    markDelivered: (keys) => markFeedNotifiedHere(keys, Date.now()),
    retractFromFeed: dismissFeedKeysAndSync,
    settleFillTimes: (characterId, scopes) => settleFillTimes(characterId, scopes, Date.now()),
    uploadProjection: uploadProjectionRows,
    serverInputsFor: readServerInputs,
  };
}
