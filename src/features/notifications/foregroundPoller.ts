import { db } from '@/db';
import type { ContractNotificationFire } from '@/engine/notificationDiffs';
import type { ProjectionRow } from '@/engine/projection';
import { MINUTE_MS } from '@/lib/age';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useActiveCharacter } from '@/stores/activeCharacter';
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
import { loadGrantedScopes } from '@/app/grantedScopes';

export type { AnyNotificationFire } from './pollDomains';
export { reviseContractFeedRow };

export const POLL_INTERVAL_MS = 5 * 60 * 1000;

export const POLL_FANOUT_CONCURRENCY = 3;

export const REGAIN_MIN_GAP_MS = 2 * MINUTE_MS;

export function regainPollDue(lastPollAt: number | null, now: number): boolean {
  return lastPollAt === null || now - lastPollAt >= REGAIN_MIN_GAP_MS;
}

export function activeFirst<T extends { characterId: number }>(
  characters: readonly T[],
  activeId: number | null
): T[] {
  return [...characters].sort(
    (a, b) => Number(b.characterId === activeId) - Number(a.characterId === activeId)
  );
}

export const FIRST_POLL_DELAY_MS = 10 * 1000;

export interface CharacterRef {
  characterId: number;
  name: string;
}

export interface DomainPollState {
  prev: () => Promise<PollerState<unknown>>;
  save: (state: PollerState<unknown>) => Promise<void>;
}

export interface PollDependencies {
  lastSlowLoadAt?: Map<string, number>;
  activeCharacterId?: () => number | null;
  now: () => number;
  characters: () => Promise<CharacterRef[]>;
  grantedScopes: (characterId: number) => Promise<ReadonlySet<string>>;
  loadDomain: (domain: PollDomain, characterId: number) => Promise<readonly unknown[] | null>;
  domainState: (domain: PollDomain) => DomainPollState;
  masterEnabled: () => Promise<boolean>;
  browserChannelEnabled: () => Promise<boolean>;
  feedChannelEnabled: () => Promise<boolean>;
  eventPrefsFor: (characterId: number) => Promise<EventEnabledMap>;
  eveTypePrefsFor: (characterId: number) => Promise<EveTypeEnabledMap>;
  permission: () => NotificationPermission | 'unsupported' | 'default' | 'denied';
  notify: (
    fire: AnyNotificationFire,
    character: CharacterRef,
    override?: { title: string; body: string }
  ) => Promise<void>;
  recordToFeed: (fire: AnyNotificationFire, character: CharacterRef) => Promise<void>;
  alreadyDelivered: (occurrenceKey: string) => Promise<boolean>;
  walletFoldEnabled: (characterId: number) => Promise<boolean>;
  feedRowExists: (occurrenceKey: string) => Promise<boolean>;
  reviseContractFeedRow: (fire: ContractNotificationFire, character: CharacterRef) => Promise<void>;
  markDelivered: (occurrenceKeys: readonly string[]) => Promise<void>;
  retractFromFeed: (
    characterIds: readonly number[],
    occurrenceKeys: readonly string[]
  ) => Promise<void>;
  settleFillTimes: (characterId: number, scopes: ReadonlySet<string>) => Promise<void>;
  uploadProjection: (
    rowsByCharacter: ReadonlyMap<number, ProjectionRow[]>,
    eveTypesByCharacter: ReadonlyMap<number, readonly string[]>,
    serverEventsByCharacter: ReadonlyMap<number, ServerEventRegistration>
  ) => Promise<void>;
  serverInputsFor?: (
    characterId: number,
    events: readonly ServerPushedEventId[]
  ) => Promise<ServerEventInputs>;
}

let inFlightPoll: Promise<void> | null = null;

export function runForegroundPoll(deps: PollDependencies): Promise<void> {
  if (inFlightPoll) return inFlightPoll;
  const run = runForegroundPollOnce(deps).finally(() => {
    if (inFlightPoll === run) inFlightPoll = null;
  });
  inFlightPoll = run;
  return run;
}

async function runForegroundPollOnce(deps: PollDependencies): Promise<void> {
  if (!(await deps.masterEnabled())) return;

  const [browserAllowed, feedEnabled] = await Promise.all([
    deps.browserChannelEnabled(),
    deps.feedChannelEnabled(),
  ]);
  const browserEnabled = browserAllowed && deps.permission() === 'granted';
  if (!browserEnabled && !feedEnabled) return;
  const channels: LiveChannels = { browser: browserEnabled, feed: feedEnabled };

  const characters = activeFirst(await deps.characters(), deps.activeCharacterId?.() ?? null);
  if (characters.length === 0) return;

  const runs: DomainRun[] = await Promise.all(
    POLL_DOMAINS.map(async (domain) => {
      const state = deps.domainState(domain);
      return { domain, state, next: await state.prev() };
    })
  );

  const updates: CharacterUpdate[] = [];
  await mapWithConcurrencyLimit(characters, POLL_FANOUT_CONCURRENCY, async (character) => {
    const update = await pollCharacter(deps, runs, channels, character);
    if (update) updates.push(update);
  });

  if (updates.length === 0) return;

  const touchedRuns = new Set<DomainRun>();
  for (const update of updates) {
    for (const [run, snapshot] of update.snapshots) {
      run.next = withCharacterSnapshot(run.next, update.characterId, snapshot);
      touchedRuns.add(run);
    }
  }
  await Promise.all([...touchedRuns].map((run) => run.state.save(run.next)));

  const charactersById = new Map(characters.map((c) => [c.characterId, c]));
  for (const update of keepOneSharedFire(updates, channels)) {
    const character = charactersById.get(update.characterId);
    if (character) await dispatchFires(deps, channels, character, update);
  }

  const retracted = updates.filter((update) => update.retractedKeys.length > 0);
  if (retracted.length > 0) {
    await deps.retractFromFeed(
      retracted.map((update) => update.characterId),
      retracted.flatMap((update) => update.retractedKeys)
    );
  }

  await rebuildProjection(deps, new Map(runs.map((run) => [run.domain, run.next])));
}

async function hydratedValue<T>(store: LocalSettingStore<T>): Promise<T> {
  await store.getState().hydrate();
  return store.getState().value;
}

async function currentNotificationPreferences() {
  await hydrateNotificationPreferences();
  return useNotificationPreferences.getState().value;
}

const lastSlowLoadAt = new Map<string, number>();

export function liveDependencies(): PollDependencies {
  return {
    lastSlowLoadAt,
    activeCharacterId: () => useActiveCharacter.getState().activeCharacterId,
    now: () => Date.now(),
    characters: async () =>
      (await db.characters.toArray()).map((c) => ({ characterId: c.characterId, name: c.name })),
    grantedScopes: loadGrantedScopes,
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
