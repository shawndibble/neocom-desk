// Vetting: splitting a character's raw rows into stored chunks, and the cursor over them
// (ADR 0035). Pure. A chunk is one Firestore document, so it must stay well under 1 MiB: rows
// and the names of the ids they mention are measured together, as the bytes they will be stored as.

import { VETTING_RAW_SOURCES } from './vettingEngine.js';
import type { VettingParty, VettingRawRow, VettingRawSource } from './vettingEngine.js';
import type { StoredVettingCharacter, StoredVettingRaw } from './vettingTypes.js';

/** Most bytes of rows plus their parties in one chunk: well under Firestore's 1 MiB document. */
export const VETTING_RAW_CHUNK_BYTES = 400_000;

export interface RawChunk {
  rows: VettingRawRow[];
  /** Name and category of each id the rows name, as far as ESI could name them. */
  parties: VettingParty[];
}

/** Every id a row names: the other side, each recipient, a corporation. Once each. */
export function rawRowIds(row: VettingRawRow): number[] {
  const ids = new Set<number>();
  if (row.partyId !== undefined) ids.add(row.partyId);
  for (const recipient of row.recipients ?? []) ids.add(recipient);
  if (row.corporationId !== undefined) ids.add(row.corporationId);
  return [...ids];
}

const size = (value: unknown): number => Buffer.byteLength(JSON.stringify(value)) + 1;

/**
 * Rows in order, grouped so each group's rows plus parties stay within `maxBytes` (a single row
 * past it still gets a chunk of its own).
 */
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
  /** What adding `row` to the open chunk costs: its own bytes and the parties not yet in it. */
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

/** Where the next page starts: one chunk of one character. Opaque to the client. */
export const encodeRawCursor = (characterId: number, seq: number): string =>
  Buffer.from(`${characterId}:${seq}`).toString('base64url');

/** The position a cursor names, or null for anything this module did not write. */
export function decodeRawCursor(cursor: string): { characterId: number; seq: number } | null {
  const match = /^(\d{1,15}):(\d{1,6})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match) return null;
  const characterId = Number(match[1]);
  return characterId > 0 ? { characterId, seq: Number(match[2]) } : null;
}

/**
 * Rows of each source across the characters that carry raw metadata; undefined when none does
 * (a review read before rows were kept has nothing to browse, which is not the same as no rows).
 */
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

/** One stored chunk of one source, in the order an officer pages through them. */
export interface RawChunkRef {
  characterId: number;
  gen: string;
  seq: number;
}

/**
 * The chunks of `source` across the review's characters, in the order stored: each character's
 * in the review's character order, then by `seq`. Only what the characters' metadata names, so
 * a chunk the metadata does not name (a replaced read, a dropped character) is never listed.
 */
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

/** The Firestore document id of a chunk. `gen` has no underscore, so the id splits cleanly. */
export const rawChunkId = (
  characterId: number,
  gen: string,
  source: VettingRawSource,
  seq: number
): string => `${characterId}_${gen}_${source}_${seq}`;

/** Every chunk document id a character's metadata names. */
export const rawChunkIdsOf = (characterId: number, raw: StoredVettingRaw): string[] =>
  VETTING_RAW_SOURCES.flatMap((source) =>
    Array.from({ length: raw.sources[source].chunks }, (_, seq) =>
      rawChunkId(characterId, raw.gen, source, seq)
    )
  );
