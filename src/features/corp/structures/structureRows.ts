/**
 * One row per structure, read off the corp board's items: the model the
 * Structures widget and the Structures page (`/corp/structures`) both draw.
 *
 * Pure. The board items carry the clocks and their severities
 * (`engine/corp/board.ts`); this only gathers each structure's own and says
 * whether it is a problem, so the widget's Problems only and the page's filter
 * of the same name keep exactly the same structures.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { BoardStructureSource, CorpBoardItem } from '@/engine/corp/board';

export interface StructureRow {
  source: BoardStructureSource;
  fuel: CorpBoardItem | undefined;
  /** The state timer (reinforcement, vulnerability); absent when none runs. */
  timer: CorpBoardItem | undefined;
  /** One item per service switched off. */
  offline: CorpBoardItem[];
  unanchor: CorpBoardItem | undefined;
  /** Every board item of this structure. */
  items: CorpBoardItem[];
  /** The worst of fuel, timer and offline services. Unanchoring does not tone the row. */
  tone: DeadlineSeverity;
  lowFuel: boolean;
  /** What Problems only keeps: the same three things the State column names. */
  problem: boolean;
  /** Fuel time left in ms; minus infinity when dry or unknown, so those sort first. */
  remaining: number;
}

export function structureRows(
  structures: readonly BoardStructureSource[],
  items: readonly CorpBoardItem[]
): StructureRow[] {
  return structures.map((source) => {
    const id = source.structureId;
    const fuel = items.find((item) => item.id === `fuel:${id}`);
    const timer = items.find((item) => item.id === `state:${id}`);
    const offline = items.filter((item) => item.id.startsWith(`service:${id}:`));
    const unanchor = items.find((item) => item.id === `unanchor:${id}`);
    const own = [fuel, timer, ...offline].filter(
      (item): item is CorpBoardItem => item !== undefined
    );
    const lowFuel =
      fuel !== undefined && (fuel.severity === 'warning' || fuel.severity === 'critical');
    return {
      source,
      fuel,
      timer,
      offline,
      unanchor,
      items: unanchor ? [...own, unanchor] : own,
      tone: worstSeverity(own.map((item) => item.severity)),
      lowFuel,
      problem: timer !== undefined || offline.length > 0 || lowFuel,
      remaining: fuel?.timing === 'timed' ? (fuel.remainingMs ?? 0) : Number.NEGATIVE_INFINITY,
    };
  });
}

function timerKey(row: StructureRow): number {
  if (row.timer === undefined) return Number.POSITIVE_INFINITY;
  return row.timer.deadlineMs ?? Number.NEGATIVE_INFINITY;
}

/**
 * Soonest problem first: running timers by when they end, then fuel by how
 * soon it runs out (a dry structure leads). A structure with no fuel clock at
 * all goes last.
 */
export function byUrgency(a: StructureRow, b: StructureRow): number {
  const timers = timerKey(a) - timerKey(b);
  if (timers !== 0 && !Number.isNaN(timers)) return timers;
  const fuelA = a.fuel === undefined ? Number.POSITIVE_INFINITY : a.remaining;
  const fuelB = b.fuel === undefined ? Number.POSITIVE_INFINITY : b.remaining;
  if (fuelA !== fuelB) return fuelA < fuelB ? -1 : 1;
  return a.source.name.localeCompare(b.source.name);
}

export interface StructureFilter {
  /** One corporation's structures, or null for all. */
  corp: number | null;
  problems: boolean;
  q: string;
}

export interface StructureNames {
  corporation: (corporationId: number | undefined) => string;
  system: (systemId: number | undefined) => string;
}

/** The page's filters, AND-composed. Search reads structure, system and corporation. */
export function filterStructureRows(
  rows: readonly StructureRow[],
  filter: StructureFilter,
  names: StructureNames
): StructureRow[] {
  const q = filter.q.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.corp === null || row.source.corporationId === filter.corp) &&
      (!filter.problems || row.problem) &&
      (q === '' ||
        [
          row.source.name,
          names.system(row.source.systemId),
          names.corporation(row.source.corporationId),
        ].some((text) => text.toLowerCase().includes(q)))
  );
}
