import type {
  BoardCalendarEventSource,
  BoardClockSource,
  BoardCorporation,
} from '@/engine/character/board';
import { MINUTE_MS } from '@/lib/age';
import type { SharedPopView } from '@/sync/sharedPops';

export interface SharedPopEntry {
  pop: SharedPopView;
  moonName: string | null;
  corporation: BoardCorporation;
  ore: { name: string; quantity: number }[] | null;
  survey?: SharedPopSurvey;
}

export interface SharedPopSurvey {
  finished: boolean;
  percentLeft: number;
  ores: { name: string; percent: number }[];
}

export type SharedPopTimePref = 'asShared' | 'ready' | 'autoFracture';

type PopTimeKey = 'ready' | 'autoFracture';

export function sharedPopTitle(entry: SharedPopEntry): string {
  return entry.pop.refineryName ?? entry.moonName ?? `#${entry.pop.structureId}`;
}

export function sharedPopIsShown(pop: SharedPopView, nowMs: number): boolean {
  const start = Date.parse(pop.startedAt);
  const end = Date.parse(pop.retainUntil ?? pop.expiresAt);
  return start <= nowMs && nowMs < end;
}

function popTimes(pop: SharedPopView): { ready: number; autoFracture: number } {
  const popAt = Date.parse(pop.popAt);
  if (pop.fractured) return { ready: popAt, autoFracture: popAt };
  const asKey = pop.popTime === 'ready' ? 'ready' : 'autoFracture';
  const ready = pop.readyAt === undefined ? NaN : Date.parse(pop.readyAt);
  const autoFracture = pop.autoFractureAt === undefined ? NaN : Date.parse(pop.autoFractureAt);
  return {
    ready: Number.isNaN(ready) ? (asKey === 'ready' ? popAt : NaN) : ready,
    autoFracture: Number.isNaN(autoFracture)
      ? asKey === 'autoFracture'
        ? popAt
        : NaN
      : autoFracture,
  };
}

function shownKey(pop: SharedPopView, pref: SharedPopTimePref): PopTimeKey {
  const officer: PopTimeKey = pop.popTime === 'ready' ? 'ready' : 'autoFracture';
  if (pref === 'asShared' || pop.fractured) return officer;
  return Number.isNaN(popTimes(pop)[pref]) ? officer : pref;
}

export function sharedPopShownAtMs(pop: SharedPopView, pref: SharedPopTimePref): number {
  const at = popTimes(pop)[shownKey(pop, pref)];
  return Number.isNaN(at) ? Date.parse(pop.popAt) : at;
}

export function sharedPopDeadlineMs(
  pop: SharedPopView,
  pref: SharedPopTimePref = 'asShared'
): number {
  return sharedPopShownAtMs(pop, pref);
}

export function sharedPopMiningState(
  entry: SharedPopEntry
): 'fullyMined' | 'likelyMinedOut' | null {
  if (entry.pop.fullyMined !== undefined || entry.survey?.finished) return 'fullyMined';
  return entry.pop.likelyMinedOut ? 'likelyMinedOut' : null;
}

export function toSharedPopSources(
  entries: readonly SharedPopEntry[],
  readableRefineries: ReadonlySet<number>,
  nowMs: number,
  pref: SharedPopTimePref = 'asShared'
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const entry of entries) {
    const { pop } = entry;
    if (!sharedPopIsShown(pop, nowMs) || readableRefineries.has(pop.structureId)) continue;
    const shownAtMs = sharedPopShownAtMs(pop, pref);
    if (Number.isNaN(shownAtMs)) continue;
    const popped = nowMs >= shownAtMs;
    const mining = sharedPopMiningState(entry);
    const fullyMined = mining === 'fullyMined';
    const likelyMinedOut = mining === 'likelyMinedOut' && popped;
    const key = shownKey(pop, pref);
    const otherKey: PopTimeKey = key === 'ready' ? 'autoFracture' : 'ready';
    const otherAtMs = popTimes(pop)[otherKey];
    const base = { subject: sharedPopTitle(entry), sharedBy: entry.corporation };
    sources.push({
      ...base,
      id: pop.id,
      detail: fullyMined ? 'fullyMined' : key,
      deadlineMs: shownAtMs,
      ...(!popped && !pop.fractured && !Number.isNaN(otherAtMs) && otherAtMs !== shownAtMs
        ? { extra: { detail: otherKey, atMs: otherAtMs } }
        : {}),
      pastLabelKey: fullyMined ? 'calendar.fullyMined' : 'calendar.popped',
    });
    const earliestPopMs = Math.min(
      shownAtMs,
      ...Object.values(popTimes(pop)).filter((ms) => !Number.isNaN(ms))
    );
    if (fullyMined || nowMs < earliestPopMs) continue;
    const expiresAtMs = Date.parse(pop.expiresAt);
    sources.push({
      ...base,
      id: `${pop.id}:expires`,
      detailId: pop.id,
      detail: nowMs >= expiresAtMs ? 'expired' : 'expires',
      deadlineMs: expiresAtMs,
      muted: true,
      ...(likelyMinedOut ? { extra: { detail: 'likelyMinedOut' } } : {}),
    });
  }
  return sources;
}

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export const POP_EVENT_MATCH_MS = 5 * MINUTE_MS;

export type SharedPopMatchSource = Pick<SharedPopEntry, 'pop' | 'moonName'>;

export function sharedPopEventMatcher(
  entries: readonly SharedPopMatchSource[],
  readableRefineries: ReadonlySet<number>,
  nowMs: number,
  pref: SharedPopTimePref
): (subject: string, startMs: number) => boolean {
  const pops = entries
    .filter((e) => sharedPopIsShown(e.pop, nowMs) && !readableRefineries.has(e.pop.structureId))
    .map((e) => {
      const times = popTimes(e.pop);
      return {
        words: new Set(wordsOf(`${e.pop.refineryName ?? ''} ${e.moonName ?? ''}`)),
        times: [times.ready, times.autoFracture, sharedPopShownAtMs(e.pop, pref)].filter(
          (ms) => !Number.isNaN(ms)
        ),
      };
    });
  return (subject, startMs) => {
    const words = wordsOf(subject);
    if (words.length === 0) return false;
    return pops.some(
      (pop) =>
        words.every((word) => pop.words.has(word)) &&
        pop.times.some((ms) => Math.abs(startMs - ms) <= POP_EVENT_MATCH_MS)
    );
  };
}

export function dropEventsOfSharedPops<T extends BoardCalendarEventSource>(
  events: readonly T[],
  entries: readonly SharedPopMatchSource[],
  readableRefineries: ReadonlySet<number>,
  nowMs: number,
  pref: SharedPopTimePref
): T[] {
  const isPop = sharedPopEventMatcher(entries, readableRefineries, nowMs, pref);
  return events.filter((event) => !isPop(event.subject, event.deadlineMs));
}

export interface SharedPopBoardInput {
  calendarEvents?: BoardCalendarEventSource[];
  sharedMoonPops?: BoardClockSource[];
  sharedPops: SharedPopEntry[];
  readableRefineries: number[];
  loadedAtMs: number;
}

export function boardSourcesWithSharedPops<D extends SharedPopBoardInput>(
  data: D,
  pref: SharedPopTimePref,
  calendarEvents: BoardCalendarEventSource[] | undefined = data.calendarEvents
): D {
  const readable = new Set(data.readableRefineries);
  return {
    ...data,
    calendarEvents:
      calendarEvents &&
      dropEventsOfSharedPops(calendarEvents, data.sharedPops, readable, data.loadedAtMs, pref),
    sharedMoonPops:
      data.sharedMoonPops && toSharedPopSources(data.sharedPops, readable, data.loadedAtMs, pref),
  };
}
