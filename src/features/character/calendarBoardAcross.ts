/**
 * The Calendar board of every Character as one (the Calendar widget on All characters).
 *
 * Pure, so the folding is tested apart from the reads. Two kinds of clock merge differently:
 * a Character's own (events, queue, jobs, colonies, dens, contracts, orders, accelerator) are
 * named by their Character, and what two of them can both see (an invited event, a contract
 * between them) is listed once; a corporation's (structures, moons, corp jobs, pops, skyhooks)
 * is the same read through every Character, so it is listed once and belongs to no Character.
 */
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

/** The first of each id, in order. */
function distinct<T>(items: readonly T[], idOf: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return items.filter((item) => {
    const id = idOf(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** A list read by no Character stays undefined: unreadable is not the same as empty. */
function union<T>(lists: readonly (readonly T[] | undefined)[]): T[] | undefined {
  const read = lists.filter((list): list is readonly T[] => list !== undefined);
  return read.length === 0 ? undefined : read.flat();
}

/** How committed an RSVP is: the answer an event two of the Characters share is kept at. */
const RESPONSE_RANK: Record<CalendarResponse, number> = {
  accepted: 3,
  tentative: 2,
  not_responded: 1,
  declined: 0,
};

/** One entry per event: the Characters were each invited, so the most committed answer stands. */
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
  /** A Character's own clocks, named. A queue slot is "0" for every Character, so a queue's ids are prefixed. */
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
    // A sign-in is asked for only where no Character could read the kind.
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
