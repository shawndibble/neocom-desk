import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { BoardStructureSource, CorpBoardItem } from '@/engine/corp/board';
import { formatCountdown } from '@/lib/duration';
import type { Translate } from '@/lib/translate';

export function shortStructureName(name: string): string {
  const cut = name.indexOf(' - ');
  return cut > 0 && cut + 3 < name.length ? name.slice(cut + 3) : name;
}

export function structureWhen(item: CorpBoardItem, t: Translate): string {
  if (item.timing === 'passed') return t('overview.board.structureDry');
  if (item.timing === 'untimed') return t('overview.board.structureOffline');
  if (item.withinStaleWindow) return t('overview.board.structureSoon');
  return formatCountdown(Math.max(0, item.remainingMs ?? 0) / 1000);
}

export interface TowerFacts {
  blocks: number | null;
  perDay: number | null;
}

export type StructureSource = BoardStructureSource & { tower?: TowerFacts };

export interface StructureRow {
  source: StructureSource;
  fuel: CorpBoardItem | undefined;
  timer: CorpBoardItem | undefined;
  offline: CorpBoardItem[];
  unanchor: CorpBoardItem | undefined;
  items: CorpBoardItem[];
  tone: DeadlineSeverity;
  lowFuel: boolean;
  problem: boolean;
  remaining: number;
}

export function structureRows(
  structures: readonly StructureSource[],
  items: readonly CorpBoardItem[]
): StructureRow[] {
  return structures.map((source) => {
    const id = source.tower ? `sb${source.structureId}` : source.structureId;
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

export function byUrgency(a: StructureRow, b: StructureRow): number {
  const timers = timerKey(a) - timerKey(b);
  if (timers !== 0 && !Number.isNaN(timers)) return timers;
  const fuelA = a.fuel === undefined ? Number.POSITIVE_INFINITY : a.remaining;
  const fuelB = b.fuel === undefined ? Number.POSITIVE_INFINITY : b.remaining;
  if (fuelA !== fuelB) return fuelA < fuelB ? -1 : 1;
  return a.source.name.localeCompare(b.source.name);
}

export interface StructureFilter {
  corp: number | null;
  problems: boolean;
  q: string;
}

export interface StructureNames {
  corporation: (corporationId: number | undefined) => string;
  system: (systemId: number | undefined) => string;
}

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
