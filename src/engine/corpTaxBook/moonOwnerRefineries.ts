import { utcDaysBetween } from '@/engine/localDay';
import { utcDay } from '@/engine/localDay';

/**
 * A moon owner's refineries as its page lists them (#6298): what each has seen, whether the
 * page offers to archive it, and which are archived. Pure. Archive hides, never deletes: the
 * rows, Extractions and labels stay, and every figure still counts them.
 */

/** Days with no Extraction and no mining before the page offers to archive (R3, decision 20261117). */
export const REFINERY_IDLE_DAYS = 60;

/** What an archive was offered for when the officer took it; `manual` is by hand with no offer. */
export type ArchiveReason = 'gone' | 'idle' | 'manual';

/** A refinery's archive, as stored on the moon owner's record (`refineryArchive`). */
export interface RefineryArchive {
  /** When it was archived (ms). */
  at: number;
  /** The officer's Character id. */
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

/** One mined line at a refinery: the covered days, valued at 100%. */
export interface RefineryMining {
  structureId: number;
  characterId: number;
  /** UTC `YYYY-MM-DD`. */
  date: string;
  quantity: number;
  value: number;
}

export interface RefineryRow {
  structureId: number;
  /** The moon of its newest Extraction. */
  moonId?: number;
  extractionCount: number;
  lastExtractionAt?: string;
  lastMinedOn?: string;
  mined: number;
  /** Why the page offers Archive; null when it does not. Never set on an archived refinery. */
  offer: ArchiveOffer | null;
  /** Set only while it is archived. */
  archive?: RefineryArchive;
}

export interface RefineryRowsInput {
  /** ISO instant the page is read at. */
  now: string;
  structureIds: readonly number[];
  extractions: readonly RefineryExtraction[];
  mining: readonly RefineryMining[];
  /** ESI shows the structure gone (the structure lookup was refused). */
  isGone: (structureId: number) => boolean;
  /** The record's `refineryArchive`, by structure id. */
  archive?: Readonly<Record<string, RefineryArchive>>;
}

const maxOf = (values: readonly string[]) =>
  values.length === 0 ? undefined : values.reduce((a, b) => (a > b ? a : b));

/**
 * The page's refineries, split into active and archived, in the order given. An archive stops
 * counting once mining shows up at the refinery on a day after it was archived: it is back.
 */
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
  /** `YYYY-MM`. */
  month: string;
  miners: number;
  quantity: number;
  value: number;
}

/** One refinery's mining by month, newest first. */
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
