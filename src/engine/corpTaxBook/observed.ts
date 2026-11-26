import { isFiniteNumber } from '../guards';
import type { ObservedMiningEntry, ObservedRow, OreLine } from './types';

type Data = Record<string, unknown>;

export interface CorpRecord {
  date: string;
  cachedAt?: string;
  structureId?: number;
  recordedCorporationId: number;
}

const readMs = (cachedAt: string | undefined) => {
  const ms = cachedAt === undefined ? Number.NaN : Date.parse(cachedAt);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

export function recordedLater(a: CorpRecord, b: CorpRecord): boolean {
  if (a.date !== b.date) return a.date > b.date;
  const read = readMs(a.cachedAt) - readMs(b.cachedAt);
  if (read !== 0 && !Number.isNaN(read)) return read > 0;
  const structure = (a.structureId ?? 0) - (b.structureId ?? 0);
  if (structure !== 0) return structure > 0;
  return a.recordedCorporationId > b.recordedCorporationId;
}

const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function readObservedRow(d: Data): ObservedRow | null {
  const structureId = num(d.structureId);
  const characterId = num(d.characterId);
  const typeId = num(d.typeId);
  const quantity = num(d.quantity);
  const date = str(d.date);
  if (
    structureId === undefined ||
    characterId === undefined ||
    typeId === undefined ||
    quantity === undefined ||
    !date
  ) {
    return null;
  }
  const solarSystemId = num(d.solarSystemId);
  const moonId = num(d.moonId);
  const extractionId = str(d.extractionId);
  const sourceCorporationId = num(d.sourceCorporationId);
  return {
    structureId,
    characterId,
    recordedCorporationId: num(d.recordedCorporationId) ?? 0,
    typeId,
    date,
    quantity,
    cachedAt: str(d.cachedAt) ?? '1970-01-01T00:00:00Z',
    ...(solarSystemId !== undefined ? { solarSystemId } : {}),
    ...(moonId !== undefined ? { moonId } : {}),
    ...(extractionId !== undefined ? { extractionId } : {}),
    ...(sourceCorporationId !== undefined ? { sourceCorporationId } : {}),
  };
}

export function observedRowKey(row: ObservedRow): string {
  return `${row.characterId}:${row.typeId}:${row.date}:${row.structureId}`;
}

export function observedEntryKey(entry: {
  characterId: number;
  structureId: number;
  date: string;
}): string {
  return `${entry.characterId}:${entry.structureId}:${entry.date}`;
}

export interface ObservedMerge {
  rows: ObservedRow[];
  changed: ObservedRow[];
}

export function mergeObservedRows(
  existing: readonly ObservedRow[],
  fresh: readonly ObservedRow[]
): ObservedMerge {
  const byKey = new Map(existing.map((row) => [observedRowKey(row), row]));
  const changed: ObservedRow[] = [];
  for (const row of fresh) {
    const key = observedRowKey(row);
    const held = byKey.get(key);
    if (held) {
      if (Date.parse(row.cachedAt) < Date.parse(held.cachedAt)) continue;
      if (row.quantity <= held.quantity) continue;
    }
    byKey.set(key, row);
    changed.push(row);
  }
  return { rows: [...byKey.values()], changed };
}

export function groupObservedEntries(rows: readonly ObservedRow[]): ObservedMiningEntry[] {
  const byKey = new Map<
    string,
    { entry: ObservedMiningEntry; lines: Map<number, number>; cachedAt: string }
  >();
  for (const row of rows) {
    const key = observedEntryKey(row);
    let group = byKey.get(key);
    if (!group) {
      group = {
        entry: {
          characterId: row.characterId,
          recordedCorporationId: row.recordedCorporationId,
          structureId: row.structureId,
          date: row.date,
          ...(row.solarSystemId !== undefined ? { solarSystemId: row.solarSystemId } : {}),
          ...(row.moonId !== undefined ? { moonId: row.moonId } : {}),
          ...(row.sourceCorporationId !== undefined
            ? { sourceCorporationId: row.sourceCorporationId }
            : {}),
          oreLines: [],
        },
        lines: new Map(),
        cachedAt: row.cachedAt,
      };
      byKey.set(key, group);
    }
    if (recordedLater(row, { ...group.entry, cachedAt: group.cachedAt })) {
      group.cachedAt = row.cachedAt;
      group.entry.recordedCorporationId = row.recordedCorporationId;
    }
    group.lines.set(row.typeId, (group.lines.get(row.typeId) ?? 0) + row.quantity);
  }
  return [...byKey.values()]
    .map(({ entry, lines, cachedAt }) => ({
      ...entry,
      cachedAt,
      oreLines: [...lines]
        .map(([typeId, quantity]): OreLine => ({ typeId, quantity }))
        .sort((a, b) => a.typeId - b.typeId),
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.structureId - b.structureId ||
        a.characterId - b.characterId
    );
}
