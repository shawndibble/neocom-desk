import { occurrenceKey } from '@/engine/occurrenceKey';
import { MINUTE_MS } from '@/lib/age';
import { inBackgroundLane } from '@/esi/lane';
import { hasEventScope, type NotificationEventId } from '../events';
import type { AnyNotificationFire, PollDomain } from '../pollDomains';
import type { PollerState } from '../pollerState';
import { isEventEnabledFor, type EventEnabledMap, type EveTypeEnabledMap } from '../eventSelection';
import type { CharacterRef, DomainPollState, PollDependencies } from '../foregroundPoller';

export const SLOW_DOMAIN_GAP_MS = 14 * MINUTE_MS;

export interface LiveChannels {
  browser: boolean;
  feed: boolean;
}

export function reachesAnyChannel(
  eventPrefs: EventEnabledMap,
  eventId: NotificationEventId,
  channels: LiveChannels
): boolean {
  return (
    (channels.browser && isEventEnabledFor(eventPrefs, eventId, 'browser')) ||
    (channels.feed && isEventEnabledFor(eventPrefs, eventId, 'feed'))
  );
}

export const CONTRACT_CAUSE_EVENTS = [
  'contractAccepted',
  'contractCompleted',
  'contractFailed',
] as const;

export function enabledEventsFor(
  eventIds: readonly NotificationEventId[],
  scopes: ReadonlySet<string>,
  eventPrefs: EventEnabledMap,
  channels: LiveChannels
): ReadonlySet<NotificationEventId> {
  const enabled = new Set<NotificationEventId>();
  for (const eventId of eventIds) {
    if (hasEventScope(eventId, scopes) && reachesAnyChannel(eventPrefs, eventId, channels)) {
      enabled.add(eventId);
    }
  }
  return enabled;
}

export interface DomainRun {
  domain: PollDomain;
  state: DomainPollState;
  next: PollerState<unknown>;
}

export interface CharacterUpdate {
  characterId: number;
  eventPrefs: EventEnabledMap;
  eveTypePrefs: EveTypeEnabledMap;
  snapshots: Map<DomainRun, unknown>;
  fires: AnyNotificationFire[];
  retractedKeys: string[];
  walletStandalone: boolean;
  walletFoldEnabled: boolean;
}

export async function pollCharacter(
  deps: PollDependencies,
  runs: readonly DomainRun[],
  channels: LiveChannels,
  character: CharacterRef
): Promise<CharacterUpdate | null> {
  const [scopes, eventPrefs, eveTypePrefs] = await Promise.all([
    deps.grantedScopes(character.characterId),
    deps.eventPrefsFor(character.characterId),
    deps.eveTypePrefsFor(character.characterId),
  ]);

  const fires: AnyNotificationFire[] = [];
  const retractedKeys: string[] = [];
  const snapshots = new Map<DomainRun, unknown>();
  const walletFoldEnabled = await deps.walletFoldEnabled(character.characterId);
  let walletStandalone = false;
  const lastSlow = deps.lastSlowLoadAt;

  for (const run of runs) {
    const enabledEvents = new Set(
      enabledEventsFor(run.domain.eventIds, scopes, eventPrefs, channels)
    );
    let foldForced = false;
    if (enabledEvents.has('walletBalanceChanged')) walletStandalone = true;
    else if (
      walletFoldEnabled &&
      run.domain.eventIds.includes('walletBalanceChanged') &&
      hasEventScope('walletBalanceChanged', scopes) &&
      CONTRACT_CAUSE_EVENTS.some(
        (eventId) =>
          hasEventScope(eventId, scopes) && reachesAnyChannel(eventPrefs, eventId, channels)
      )
    ) {
      enabledEvents.add('walletBalanceChanged');
      foldForced = true;
    }
    if (enabledEvents.size === 0) continue;
    const slowKey = `${character.characterId}:${run.domain.id}`;
    if (
      run.domain.slow &&
      !foldForced &&
      lastSlow &&
      deps.now() - (lastSlow.get(slowKey) ?? -Infinity) < SLOW_DOMAIN_GAP_MS
    ) {
      continue;
    }
    const rows = await inBackgroundLane(() => deps.loadDomain(run.domain, character.characterId));
    if (rows === null) continue;
    if (run.domain.slow && !foldForced) lastSlow?.set(slowKey, deps.now());
    const previous = run.next[character.characterId];
    const next = run.domain.toSnapshot(rows, deps.now(), previous);
    snapshots.set(run, next);
    fires.push(...run.domain.diff(character.characterId, previous, next, enabledEvents));
    if (run.domain.disproven) {
      retractedKeys.push(
        ...run.domain
          .disproven(character.characterId, previous, next)
          .map((fire) => occurrenceKey(fire, deps.now()))
      );
    }
  }

  await deps.settleFillTimes(character.characterId, scopes);

  if (snapshots.size === 0) return null;
  return {
    characterId: character.characterId,
    eventPrefs,
    eveTypePrefs,
    snapshots,
    fires,
    retractedKeys,
    walletStandalone,
    walletFoldEnabled,
  };
}
