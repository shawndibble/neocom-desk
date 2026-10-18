/**
 * One Character's slice of a foreground poll: which domains to fetch, the diffs
 * they drive and the snapshots to persist. Split out of `foregroundPoller.ts`
 * (#4111).
 */
import { occurrenceKey } from '@/engine/occurrenceKey';
import { inBackgroundLane } from '@/esi/lane';
import { hasEventScope, type NotificationEventId } from '../events';
import type { AnyNotificationFire, PollDomain } from '../pollDomains';
import type { PollerState } from '../pollerState';
import { isEventEnabledFor, type EventEnabledMap, type EveTypeEnabledMap } from '../eventSelection';
import type { CharacterRef, DomainPollState, PollDependencies } from '../foregroundPoller';

/** Which delivery channels are live for this poll, before per-event opinions. */
export interface LiveChannels {
  browser: boolean;
  feed: boolean;
}

/**
 * Whether this event would reach *somewhere* — a live channel that the event
 * is also switched on for. An event set to feed-only still has its data
 * fetched when the feed is on and browser notifications are off; one switched
 * off on both columns is not fetched at all.
 */
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

/** The contract events whose alerts can carry a wallet line (`ContractCauseEventId`). */
export const CONTRACT_CAUSE_EVENTS = [
  'contractAccepted',
  'contractCompleted',
  'contractFailed',
] as const;

/**
 * Which of a set of candidate events this character is eligible for right
 * now: has the scope (or, for `priceAlertTriggered`, needs none at all — see
 * `NotificationEventDef.scope`), and reaches at least one live channel.
 */
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

/** One domain's state for the length of one poll: where to read/write it, and the value being built. */
export interface DomainRun {
  domain: PollDomain;
  state: DomainPollState;
  /** Starts as the persisted baseline; every character's snapshot is merged in. */
  next: PollerState<unknown>;
}

export interface CharacterUpdate {
  characterId: number;
  /** Carried through so the delivery loop can honour each event's per-channel columns. */
  eventPrefs: EventEnabledMap;
  /** Carried through so the delivery loop can honour each eveNotification type's per-channel columns. */
  eveTypePrefs: EveTypeEnabledMap;
  /** The snapshot this poll built per domain — absent for a domain it skipped. */
  snapshots: Map<DomainRun, unknown>;
  fires: AnyNotificationFire[];
  /** Occurrence Keys this poll disproved — see `PollDependencies.retractFromFeed`. */
  retractedKeys: string[];
  /** Whether a wallet line is an alert on its own for this Character this poll — see `WalletFoldInput`. */
  walletStandalone: boolean;
  walletFoldEnabled: boolean;
}

/**
 * Fetches and diffs every domain this Character is eligible for. Returns null
 * when no domain produced a snapshot (nothing to persist or deliver).
 */
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

  for (const run of runs) {
    const enabledEvents = new Set(
      enabledEventsFor(run.domain.eventIds, scopes, eventPrefs, channels)
    );
    if (enabledEvents.has('walletBalanceChanged')) walletStandalone = true;
    // The journal is fetched anyway when a contract alert wants to count its
    // lines, even with Wallet Balance Changed itself off: the fold drops
    // whatever nothing absorbs.
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
    }
    // Nothing this domain could fire is both in scope and switched on for a
    // live channel: no fetch at all (AC5).
    if (enabledEvents.size === 0) continue;
    // Background at the ESI gate (issue #2271): a poll across every
    // Character must not queue the page in view behind it. Wraps only the
    // synchronous call — the lane cannot outlive an `await` (`esi/lane.ts`).
    const rows = await inBackgroundLane(() => deps.loadDomain(run.domain, character.characterId));
    // A failed — or deliberately skipped, as the truncation guards do —
    // load persists no snapshot and fires nothing, leaving the previous
    // baseline for the next complete poll.
    if (rows === null) continue;
    const previous = run.next[character.characterId];
    // `previous` goes to `toSnapshot` as well as `diff` (issue #1423): a
    // domain whose own snapshot needs to carry state forward across a poll
    // that observed nothing new — `marketOrderUndercutDomain`'s `armed`
    // latch surviving an `unknown` poll — reads the very same baseline the
    // diff below compares against, never a second, possibly stale copy.
    const next = run.domain.toSnapshot(rows, deps.now(), previous);
    snapshots.set(run, next);
    fires.push(...run.domain.diff(character.characterId, previous, next, enabledEvents));
    // Unlike the diffs, not filtered per event: the row being retracted may
    // have been written by Web Push or another device, for either of this
    // domain's two events, so one enabled event's fetch retracts both.
    //
    // It still rides on the domain having been fetched at all (the
    // `enabledEvents.size === 0` skip above, AC5), and that is the right
    // bound rather than a gap: a character with both planetary events off
    // on both channels has those rows hidden from the feed anyway
    // (`feedSelection.isEntryVisible`), so there is nothing visible left to
    // retract — and one with the scope revoked cannot prove anything about
    // them either way.
    if (run.domain.disproven) {
      retractedKeys.push(
        ...run.domain
          .disproven(character.characterId, previous, next)
          .map((fire) => occurrenceKey(fire, deps.now()))
      );
    }
  }

  // Fills an earlier poll could only date by when it noticed them; the feed
  // rows this poll writes below get their turn on the next one.
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
