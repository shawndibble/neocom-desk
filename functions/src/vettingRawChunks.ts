import { VETTING_RAW_SOURCES } from './vettingEngine.js';
import type { VettingParty, VettingRawRow, VettingRawSource } from './vettingEngine.js';
import type { StoredVettingCharacter, StoredVettingRaw } from './vettingTypes.js';

export const VETTING_RAW_CHUNK_BYTES = 400_000;

export interface RawChunk {
  rows: VettingRawRow[];
  parties: VettingParty[];
}

export function rawRowIds(row: VettingRawRow): number[] {
  const ids = new Set<number>();
  if (row.partyId !== undefined) ids.add(row.partyId);
  for (const recipient of row.recipients ?? []) ids.add(recipient);
  if (row.corporationId !== undefined) ids.add(row.corporationId);
  return [...ids];
}

const size = (value: unknown): number => Buffer.byteLength(JSON.stringify(value)) + 1;

export function chunkRawRows(
  rows: readonly VettingRawRow[],
  parties: readonly VettingParty[],
  maxBytes: number = VETTING_RAW_CHUNK_BYTES
): RawChunk[] {
  const named = new Map(parties.map((party) => [party.id, party]));
  const chunks: RawChunk[] = [];
  let current: RawChunk = { rows: [], parties: [] };
  let used = 0;
  let seen = new Set<number>();
  const price = (row: VettingRawRow) => {
    const fresh = rawRowIds(row).flatMap((id) => {
      const party = named.get(id);
      return party && !seen.has(id) ? [party] : [];
    });
    return { fresh, cost: size(row) + fresh.reduce((sum, party) => sum + size(party), 0) };
  };
  for (const row of rows) {
    let { fresh, cost } = price(row);
    if (current.rows.length > 0 && used + cost > maxBytes) {
      chunks.push(current);
      current = { rows: [], parties: [] };
      used = 0;
      seen = new Set();
      ({ fresh, cost } = price(row));
    }
    used += cost;
    current.rows.push(row);
    for (const party of fresh) {
      seen.add(party.id);
      current.parties.push(party);
    }
  }
  if (current.rows.length > 0) chunks.push(current);
  return chunks;
}

export const encodeRawCursor = (characterId: number, seq: number): string =>
  Buffer.from(`${characterId}:${seq}`).toString('base64url');

export function decodeRawCursor(cursor: string): { characterId: number; seq: number } | null {
  const match = /^(\d{1,15}):(\d{1,6})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match) return null;
  const characterId = Number(match[1]);
  return characterId > 0 ? { characterId, seq: Number(match[2]) } : null;
}

export function sumRawCounts(
  characters: readonly Pick<StoredVettingCharacter, 'raw'>[]
): Record<VettingRawSource, number> | undefined {
  const held = characters.flatMap((character) => (character.raw ? [character.raw] : []));
  if (held.length === 0) return undefined;
  return Object.fromEntries(
    VETTING_RAW_SOURCES.map((source) => [
      source,
      held.reduce((sum, raw) => sum + raw.sources[source].rows, 0),
    ])
  ) as Record<VettingRawSource, number>;
}

export interface RawChunkRef {
  characterId: number;
  gen: string;
  seq: number;
}

export function rawChunkOrder(
  characters: readonly Pick<StoredVettingCharacter, 'characterId' | 'raw'>[],
  source: VettingRawSource
): RawChunkRef[] {
  return characters.flatMap(({ characterId, raw }) =>
    raw
      ? Array.from({ length: raw.sources[source].chunks }, (_, seq) => ({
          characterId,
          gen: raw.gen,
          seq,
        }))
      : []
  );
}

export const rawChunkId = (
  characterId: number,
  gen: string,
  source: VettingRawSource,
  seq: number
): string => `${characterId}_${gen}_${source}_${seq}`;

export const rawChunkIdsOf = (characterId: number, raw: StoredVettingRaw): string[] =>
  VETTING_RAW_SOURCES.flatMap((source) =>
    Array.from({ length: raw.sources[source].chunks }, (_, seq) =>
      rawChunkId(characterId, raw.gen, source, seq)
    )
  );
