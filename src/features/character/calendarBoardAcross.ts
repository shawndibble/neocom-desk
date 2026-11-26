import type {
  BoardCalendarEventSource,
  BoardClockSource,
  CalendarResponse,
  CharacterBoardItemKind,
} from '@/engine/character/board';
import type { CalendarBoardData } from './calendarBoardData';

export interface CharacterCalendarBoard {
  characterId: number;
  name: string;
  data: CalendarBoardData;
}

function distinct<T>(items: readonly T[], idOf: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return items.filter((item) => {
    const id = idOf(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function union<T>(lists: readonly (readonly T[] | undefined)[]): T[] | undefined {
  const read = lists.filter((list): list is readonly T[] => list !== undefined);
  return read.length === 0 ? undefined : read.flat();
}

const RESPONSE_RANK: Record<CalendarResponse, number> = {
  accepted: 3,
  tentative: 2,
  not_responded: 1,
  declined: 0,
};

function distinctEvents(events: readonly BoardCalendarEventSource[] | undefined) {
  if (!events) return undefined;
  const best = new Map<string, BoardCalendarEventSource>();
  for (const event of events) {
    const held = best.get(event.id);
    if (!held || RESPONSE_RANK[event.response] > RESPONSE_RANK[held.response]) {
      best.set(event.id, event);
    }
  }
  return [...best.values()];
}

type ClockList =
  | 'calendarEvents'
  | 'skillTraining'
  | 'industryJobs'
  | 'planetExtractions'
  | 'mercenaryDens'
  | 'contractExpiries'
  | 'orderExpiries'
  | 'accelerator';
type SharedList =
  | 'moonChunks'
  | 'structureFuel'
  | 'structureTimers'
  | 'corpJobs'
  | 'sharedMoonPops'
  | 'skyhookRaids';

export function mergeCalendarBoards(boards: readonly CharacterCalendarBoard[]): CalendarBoardData {
  const own = <K extends ClockList>(key: K, prefixIds = false) =>
    union(
      boards.map(({ characterId, name, data }) =>
        data[key]?.map((source) => ({
          ...source,
          id: prefixIds ? `${characterId}:${source.id}` : source.id,
          characterName: name,
        }))
      )
    ) as CalendarBoardData[K];
  const shared = (key: SharedList): BoardClockSource[] | undefined => {
    const merged = union(boards.map(({ data }) => data[key]));
    return merged && distinct(merged, (source) => source.id);
  };
  const dedupe = <T extends BoardClockSource>(list: T[] | undefined) =>
    list && distinct(list, (source) => source.id);

  const readable = new Set<CharacterBoardItemKind>(
    boards.flatMap(({ data }) => data.readableKinds)
  );
  const reads = boards.flatMap(({ data }) =>
    data.oldestFetchedAt ? [data.oldestFetchedAt.getTime()] : []
  );
  return {
    calendarEvents: distinctEvents(own('calendarEvents')),
    skillTraining: own('skillTraining', true),
    industryJobs: dedupe(own('industryJobs')),
    planetExtractions: dedupe(own('planetExtractions')),
    mercenaryDens: dedupe(own('mercenaryDens')),
    moonChunks: shared('moonChunks'),
    structureFuel: shared('structureFuel'),
    structureTimers: shared('structureTimers'),
    corpJobs: shared('corpJobs'),
    corporations: distinct(
      boards.flatMap(({ data }) => data.corporations),
      (c) => c.id
    ),
    sharedMoonPops: shared('sharedMoonPops'),
    sharedPops: distinct(
      boards.flatMap(({ data }) => data.sharedPops),
      (p) => `${p.corporation.id}:${p.pop.id}`
    ),
    readableRefineries: [...new Set(boards.flatMap(({ data }) => data.readableRefineries))],
    sharingCorporations: distinct(
      boards.flatMap(({ data }) => data.sharingCorporations),
      (c) => c.id
    ),
    skyhookRaids: shared('skyhookRaids'),
    skyhookRaidDetails: distinct(
      boards.flatMap(({ data }) => data.skyhookRaidDetails),
      (raid) => raid.id
    ),
    contractExpiries: dedupe(own('contractExpiries')),
    orderExpiries: dedupe(own('orderExpiries')),
    accelerator: own('accelerator'),
    readableKinds: [...readable],
    reauthKinds: [...new Set(boards.flatMap(({ data }) => data.reauthKinds))].filter(
      (kind) => !readable.has(kind)
    ),
    oldestFetchedAt: reads.length > 0 ? new Date(Math.min(...reads)) : null,
    fromCache: boards.some(({ data }) => data.fromCache),
    events: distinct(
      boards.flatMap(({ data }) => data.events),
      (event) => event.event_id
    ),
    loadedAtMs: Math.max(0, ...boards.map(({ data }) => data.loadedAtMs)),
  };
}
