/**
 * The registry's entry shape and the one function that builds an entry. Each
 * domain file in this directory is a `defineDomain` call plus the guard and
 * conversion helpers only it needs; `index.ts` lists them in fetch order.
 */
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import type { ProjectionRow } from '@/engine/projection';
import type { NotificationCopy } from '@/engine/notificationWording';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from '../events';
import type { NoNames } from '../domainCopy';
import { eventEntry, type AnyNotificationFire, type SnapshotSource } from '../eventEntries';
import { createPollerStateStore, isSnapshotWith, type PollerState } from '../pollerState';

/** One registry entry, as written. Fully typed; `defineDomain` erases it. */
export interface PollDomainSpec<TRaw, TSnapshot, TFire extends AnyNotificationFire, TNames> {
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
   * `prevSnapshot` — the character's baseline from before this poll — lets a
   * domain carry state forward across a poll that saw nothing new (an
   * anti-flap latch that must survive an "unknown" reading in between, as
   * `marketOrderUndercutDomain` needs). Every other domain ignores this
   * optional third parameter.
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
   * declares a projection (`pollDomains/index.test.ts` holds that). Resolves
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
export function defineDomain<TRaw, TSnapshot, TFire extends AnyNotificationFire, TNames = NoNames>(
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
