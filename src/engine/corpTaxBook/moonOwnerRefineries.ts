import { utcDaysBetween } from '@/engine/localDay';
import { utcDay } from '@/engine/localDay';

export const REFINERY_IDLE_DAYS = 60;

export type ArchiveReason = 'gone' | 'idle' | 'manual';

export interface RefineryArchive {
  at: number;
  by: number;
  reason: ArchiveReason;
}

export type ArchiveOffer = { kind: 'gone' } | { kind: 'idle'; days: number };

export interface RefineryExtraction {
  structureId: number;
  moonId: number;
  startedAt: string;
  chunkArrivalAt: string;
}

export interface RefineryMining {
  structureId: number;
  characterId: number;
  date: string;
  quantity: number;
  value: number;
}

export interface RefineryRow {
  structureId: number;
  moonId?: number;
  extractionCount: number;
  lastExtractionAt?: string;
  lastMinedOn?: string;
  mined: number;
  offer: ArchiveOffer | null;
  archive?: RefineryArchive;
}

export interface RefineryRowsInput {
  now: string;
  structureIds: readonly number[];
  extractions: readonly RefineryExtraction[];
  mining: readonly RefineryMining[];
  isGone: (structureId: number) => boolean;
  archive?: Readonly<Record<string, RefineryArchive>>;
}

const maxOf = (values: readonly string[]) =>
  values.length === 0 ? undefined : values.reduce((a, b) => (a > b ? a : b));

export function refineryRows(input: RefineryRowsInput): {
  active: RefineryRow[];
  archived: RefineryRow[];
} {
  const today = utcDay(Date.parse(input.now));
  const active: RefineryRow[] = [];
  const archived: RefineryRow[] = [];
  for (const structureId of input.structureIds) {
    const exts = input.extractions
      .filter((x) => x.structureId === structureId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const mining = input.mining.filter((m) => m.structureId === structureId);
    const lastMinedOn = maxOf(mining.map((m) => m.date));
    const lastExtractionAt = exts[0]?.startedAt;
    const stored = input.archive?.[String(structureId)];
    const archive =
      stored && !(lastMinedOn !== undefined && lastMinedOn > utcDay(stored.at))
        ? stored
        : undefined;
    const lastActive = maxOf([
      ...exts.flatMap((x) => [x.startedAt.slice(0, 10), x.chunkArrivalAt.slice(0, 10)]),
      ...(lastMinedOn ? [lastMinedOn] : []),
    ]);
    const idleDays = lastActive === undefined ? 0 : utcDaysBetween(lastActive, today);
    const offer: ArchiveOffer | null = archive
      ? null
      : input.isGone(structureId)
        ? { kind: 'gone' }
        : idleDays >= REFINERY_IDLE_DAYS
          ? { kind: 'idle', days: idleDays }
          : null;
    const row: RefineryRow = {
      structureId,
      ...(exts[0] ? { moonId: exts[0].moonId } : {}),
      extractionCount: exts.length,
      ...(lastExtractionAt ? { lastExtractionAt } : {}),
      ...(lastMinedOn ? { lastMinedOn } : {}),
      mined: mining.reduce((sum, m) => sum + m.value, 0),
      offer,
      ...(archive ? { archive } : {}),
    };
    (archive ? archived : active).push(row);
  }
  return { active, archived };
}

export interface RefineryMonth {
  month: string;
  miners: number;
  quantity: number;
  value: number;
}

export function refineryMonths(
  mining: readonly RefineryMining[],
  structureId: number
): RefineryMonth[] {
  const byMonth = new Map<string, { miners: Set<number>; quantity: number; value: number }>();
  for (const m of mining) {
    if (m.structureId !== structureId) continue;
    const key = m.date.slice(0, 7);
    const g = byMonth.get(key) ?? { miners: new Set<number>(), quantity: 0, value: 0 };
    g.miners.add(m.characterId);
    g.quantity += m.quantity;
    g.value += m.value;
    byMonth.set(key, g);
  }
  return [...byMonth]
    .map(([month, g]) => ({ month, miners: g.miners.size, quantity: g.quantity, value: g.value }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
