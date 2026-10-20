/**
 * The Corp Tax Book's feed of refinery observer rows (D9): any officer's
 * client syncs on visit, so two officers may upload overlapping, differently
 * aged reads of the same ledger. The merge is monotonic so neither can undo
 * the other.
 */
import type { ObservedMiningEntry, ObservedRow, OreLine } from './types';

/** The upsert key: miner + ore + day + structure. */
export function observedRowKey(row: ObservedRow): string {
  return `${row.characterId}:${row.typeId}:${row.date}:${row.structureId}`;
}

/** One Observed Mining Entry's key: character + refinery + day. Also its day charge's and per-record rate's key. */
export function observedEntryKey(entry: {
  characterId: number;
  structureId: number;
  date: string;
}): string {
  return `${entry.characterId}:${entry.structureId}:${entry.date}`;
}

export interface ObservedMerge {
  /** Every row the book holds after the merge. */
  rows: ObservedRow[];
  /** The rows this merge added or raised — what the sync has to write. */
  changed: ObservedRow[];
}

/**
 * Upserts `fresh` into `existing`. A row's quantity never goes down, and a row
 * from an ESI cache older than the stored one is ignored outright (its
 * quantity and recorded corporation are both stale). Rows the fresh read no
 * longer lists are kept: ESI's retention is shorter than the book's, and the
 * book is the only long-term record.
 */
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

/**
 * Groups observer rows into Observed Mining Entries — one per character,
 * refinery and day, summed per ore type — sorted by date, then refinery, then
 * character.
 */
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
    // A character who changed corp mid-day is judged by the freshest read.
    if (Date.parse(row.cachedAt) > Date.parse(group.cachedAt)) {
      group.cachedAt = row.cachedAt;
      group.entry.recordedCorporationId = row.recordedCorporationId;
    }
    group.lines.set(row.typeId, (group.lines.get(row.typeId) ?? 0) + row.quantity);
  }
  return [...byKey.values()]
    .map(({ entry, lines }) => ({
      ...entry,
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
