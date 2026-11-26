import type {
  SharedMoonPopEntrySnapshot,
  SharedMoonPopFire,
  SharedMoonPopSnapshot,
} from '@/engine/notificationDiffs';
import { projectSharedMoonPops } from '@/engine/projection';
import { MINUTE_MS } from '@/lib/age';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import { timeZoneFor, useTimeFormat } from '@/lib/timeFormat';
import { loadMoonNames } from '@/features/character/moonNames';
import { resolveNames } from '@/features/character/names';
import type { SharedPopMatchSource } from '@/features/character/calendarSharedPops';
import type { SharedPopView } from '@/sync/sharedPops';
import type { SharedMoonPopNames } from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { isEventEnabledFor, NOTIFICATION_CHANNELS } from '../eventSelection';
import {
  characterEventPrefs,
  hydrateNotificationPreferences,
  mutedSharedPopCorporations,
  useNotificationPreferences,
} from '../preferences';
import { loadSharedPopsCached } from '../sharedPopsCache';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { currentThresholds } from './shared';

const isSharedMoonPopEntry = shapeGuard<SharedMoonPopEntrySnapshot>({
  popId: is.string,
  corporationId: is.number,
  refineryName: is.nullable(is.string),
  popTime: is.oneOf(['ready', 'auto-fracture'] as const),
  popAtMs: is.number,
  ratePct: is.number,
  leadMs: is.number,
  muted: is.optional(is.boolean),
});

function inAudience(pop: SharedPopView, characterId: number): boolean {
  return pop.viewerCharacterIds === undefined || pop.viewerCharacterIds.includes(characterId);
}

export function sharedMoonPopEntries(
  pops: readonly SharedPopView[],
  characterId: number,
  leadMs: number,
  muted: ReadonlySet<number>
): SharedMoonPopEntrySnapshot[] {
  return pops.flatMap((pop) => {
    const popAtMs = Date.parse(pop.popAt);
    if (!Number.isFinite(popAtMs)) return [];
    if (!inAudience(pop, characterId)) return [];
    return [
      {
        popId: pop.id,
        corporationId: pop.corporationId,
        refineryName: pop.refineryName,
        popTime: pop.popTime,
        popAtMs,
        ratePct: pop.ratePct,
        leadMs,
        ...(muted.has(pop.corporationId) ? { muted: true } : {}),
      },
    ];
  });
}

async function currentMuted(): Promise<ReadonlySet<number>> {
  await hydrateNotificationPreferences();
  return mutedSharedPopCorporations(useNotificationPreferences.getState().value);
}

export async function alertedSharedPops(characterId: number): Promise<SharedPopMatchSource[]> {
  await hydrateNotificationPreferences();
  const prefs = useNotificationPreferences.getState().value;
  const eventPrefs = characterEventPrefs(prefs, characterId);
  if (
    !NOTIFICATION_CHANNELS.some((channel) =>
      isEventEnabledFor(eventPrefs, 'sharedMoonPop', channel)
    )
  )
    return [];
  const pops = await loadSharedPopsCached().catch(() => [] as SharedPopView[]);
  const alerted = pops.filter((pop) => inAudience(pop, characterId));
  if (alerted.length === 0) return [];
  const moonNames = await loadMoonNames(alerted.map((pop) => pop.moonId));
  return alerted.map((pop) => ({ pop, moonName: moonNames.get(pop.moonId) ?? null }));
}

async function currentLeadMs(characterId: number): Promise<number> {
  return (await currentThresholds(characterId)).sharedMoonPopLeadMinutes * MINUTE_MS;
}

function popTimeLabel(ms: number): string {
  return formatCalendarTimestamp(new Date(ms), timeZoneFor(useTimeFormat.getState().value));
}

async function corporationNames(ids: readonly number[]): Promise<ReadonlyMap<number, string>> {
  return resolveNames([...new Set(ids)]).catch(() => new Map<number, string>());
}

export const sharedMoonPopDomain = defineDomain<
  SharedMoonPopEntrySnapshot,
  SharedMoonPopSnapshot,
  SharedMoonPopFire,
  SharedMoonPopNames
>({
  source: SNAPSHOT_SOURCES.sharedMoonPops,
  stateKey: 'notifications.pollerState.sharedMoonPops',
  entriesKey: 'entries',
  isEntry: isSharedMoonPopEntry,
  load: async (characterId) => {
    const pops = await loadSharedPopsCached().catch(() => null);
    if (pops === null) return null;
    return sharedMoonPopEntries(
      pops,
      characterId,
      await currentLeadMs(characterId),
      await currentMuted()
    );
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const [leadMs, muted, corporations] = await Promise.all([
      currentLeadMs(characterId),
      currentMuted(),
      corporationNames(snapshot.entries.map((entry) => entry.corporationId)),
    ]);
    return projectSharedMoonPops({
      characterId,
      characterName,
      entries: snapshot.entries.map((entry) => ({ ...entry, leadMs, muted: false })),
      mutedCorporationIds: muted,
      names: { corporations, when: popTimeLabel },
      copy: NOTIFICATION_EVENT_ENTRIES.sharedMoonPop.projection.push,
      nowMs,
    });
  },
  names: async (fire) => ({
    corporation: (await corporationNames([fire.corporationId])).get(fire.corporationId),
    when: popTimeLabel(fire.popAtMs),
  }),
});
