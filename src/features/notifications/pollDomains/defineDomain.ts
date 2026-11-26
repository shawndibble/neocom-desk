import type { LocalSettingStore } from '@/lib/useLocalSetting';
import type { ProjectionRow } from '@/engine/projection';
import type { NotificationCopy } from '@/engine/notificationWording';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from '../events';
import type { NoNames } from '../domainCopy';
import { eventEntry, type AnyNotificationFire, type SnapshotSource } from '../eventEntries';
import { createPollerStateStore, isSnapshotWith, type PollerState } from '../pollerState';

export interface PollDomainSpec<TRaw, TSnapshot, TFire extends AnyNotificationFire, TNames> {
  readonly source: SnapshotSource<TSnapshot, TNames>;
  readonly stateKey: string;
  readonly entriesKey: string;
  readonly isEntry: (raw: unknown) => boolean;
  readonly slow?: boolean;
  readonly load: (characterId: number) => Promise<TRaw[] | null>;
  readonly toSnapshot: (raw: readonly TRaw[], nowMs: number, prevSnapshot?: TSnapshot) => TSnapshot;
  readonly disproven?: (
    characterId: number,
    prev: TSnapshot | undefined,
    next: TSnapshot
  ) => TFire[];
  readonly projection?: (
    characterId: number,
    characterName: string,
    snapshot: TSnapshot,
    nowMs: number
  ) => Promise<ProjectionRow[]>;
  readonly names?: (fire: TFire) => Promise<TNames>;
}

export interface PollDomain {
  readonly id: string;
  readonly eventIds: readonly NotificationEventId[];
  readonly stateKey: string;
  readonly slow: boolean;
  readonly store: LocalSettingStore<PollerState<unknown>>;
  readonly load: (characterId: number) => Promise<readonly unknown[] | null>;
  readonly toSnapshot: (raw: readonly unknown[], nowMs: number, prevSnapshot?: unknown) => unknown;
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
  readonly render: (fire: AnyNotificationFire, characterName: string) => Promise<NotificationCopy>;
}

export function defineDomain<TRaw, TSnapshot, TFire extends AnyNotificationFire, TNames = NoNames>(
  spec: PollDomainSpec<TRaw, TSnapshot, TFire, TNames>
): PollDomain {
  const store = createPollerStateStore<TSnapshot>(
    spec.stateKey,
    isSnapshotWith<TSnapshot>(spec.entriesKey, spec.isEntry)
  );
  const eventIds = NOTIFICATION_EVENT_IDS.filter(
    (eventId) => eventEntry(eventId).source?.id === spec.source.id
  );
  return {
    id: spec.source.id,
    eventIds,
    stateKey: spec.stateKey,
    slow: spec.slow ?? false,
    store: store as unknown as LocalSettingStore<PollerState<unknown>>,
    load: spec.load,
    toSnapshot: (raw, nowMs, prevSnapshot) =>
      spec.toSnapshot(raw as readonly TRaw[], nowMs, prevSnapshot as TSnapshot | undefined),
    diff: (characterId, prev, next, enabledEvents) => {
      const fires: AnyNotificationFire[] = [];
      for (const eventId of eventIds) {
        if (!enabledEvents.has(eventId)) continue;
        fires.push(...(eventEntry(eventId).diff?.(characterId, prev, next) ?? []));
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
    render: async (fire, characterName) => {
      const names = spec.names ? await spec.names(fire as TFire) : ({} as TNames);
      return eventEntry(fire.eventId).copy.poll(fire, characterName, names);
    },
  };
}
