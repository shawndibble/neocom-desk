// Vetting: the admin-SDK side of the kept raw rows (ADR 0035). Chunks live under
// `vettingReviews/{id}/rawRows`; a character's `raw` metadata names which ones belong to the
// review, and the officer's page reads only those. So a chunk left behind by a failed or replaced
// read is never shown, and every delete here is hygiene for data nobody can see, not what keeps
// it private. Chunks are written outside the review's transaction (a transaction's commit is
// capped at 10 MiB and 30,000 rows is several MiB), a few documents per batch.

import { randomBytes } from 'node:crypto';
import type { DocumentReference } from 'firebase-admin/firestore';
import { chunk } from './chunk.js';
import {
  rawChunkId,
  chunkRawRows,
  rawChunkOrder,
  rawRowIds,
  VETTING_RAW_CHUNK_BYTES,
  type RawChunkRef,
} from './vettingRawChunks.js';
import {
  VETTING_RAW_SOURCES,
  type VettingParty,
  type VettingRawPage,
  type VettingRawRow,
  type VettingRawSource,
} from './vettingEngine.js';
import type { VettingEsi } from './vettingEsi.js';
import {
  VETTING_RAW,
  type StoredRawChunk,
  type StoredVettingCharacter,
  type StoredVettingRaw,
  type VettingRead,
} from './vettingTypes.js';

/** Chunk documents per write batch: ten of ~400 KB stay well under the 10 MiB request cap. */
const WRITE_BATCH = 10;
/** Documents per delete batch (deletes carry no payload). */
const DELETE_BATCH = 400;

export interface PreparedRaw {
  meta: StoredVettingRaw;
  chunks: { id: string; data: StoredRawChunk }[];
}

/**
 * Names for every id the rows mention, in one lookup. An id ESI cannot name, or a lookup ESI
 * refuses (a limit, an outage), leaves rows unnamed: the read is never failed by it.
 */
async function namesFor(
  esi: VettingEsi,
  rows: readonly VettingRawRow[],
  logWarn?: (message: string, meta?: Record<string, unknown>) => void
): Promise<VettingParty[]> {
  const ids = new Set<number>();
  for (const row of rows) {
    for (const id of rawRowIds(row)) {
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    }
  }
  if (ids.size === 0) return [];
  try {
    return await esi.names([...ids]);
  } catch (err) {
    logWarn?.('vetting raw rows left unnamed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** The chunks and metadata for one read, with every party named. Writes nothing. */
export async function prepareRaw(
  esi: VettingEsi,
  characterId: number,
  read: VettingRead['raw'],
  opts: { chunkBytes?: number; logWarn?: (message: string, meta?: Record<string, unknown>) => void }
): Promise<PreparedRaw> {
  const parties = await namesFor(esi, Object.values(read).flat(), opts.logWarn);
  const gen = randomBytes(6).toString('hex');
  const sources = {} as StoredVettingRaw['sources'];
  const chunks: PreparedRaw['chunks'] = [];
  for (const source of VETTING_RAW_SOURCES) {
    const made = chunkRawRows(read[source], parties, opts.chunkBytes ?? VETTING_RAW_CHUNK_BYTES);
    sources[source] = { rows: read[source].length, chunks: made.length };
    made.forEach((piece, seq) => {
      chunks.push({
        id: rawChunkId(characterId, gen, source, seq),
        data: {
          characterId,
          source,
          gen,
          seq,
          rows: piece.rows.length,
          json: JSON.stringify(piece.rows),
          partiesJson: JSON.stringify(piece.parties),
        },
      });
    });
  }
  return { meta: { gen, sources }, chunks };
}

const rawCollection = (review: DocumentReference) => review.collection(VETTING_RAW);

export async function writeRaw(review: DocumentReference, prepared: PreparedRaw): Promise<void> {
  const db = review.firestore;
  for (const group of chunk(prepared.chunks, WRITE_BATCH)) {
    const batch = db.batch();
    for (const { id, data } of group) batch.set(rawCollection(review).doc(id), data);
    await batch.commit();
  }
}

async function deleteRefs(review: DocumentReference, refs: readonly DocumentReference[]) {
  const db = review.firestore;
  for (const group of chunk([...refs], DELETE_BATCH)) {
    const batch = db.batch();
    for (const ref of group) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Deletes every chunk of the review except those of a (character, generation) in `keep`.
 * `keep` empty deletes them all. Lists ids only (no document is read).
 */
export async function pruneRaw(
  review: DocumentReference,
  keep: ReadonlyMap<number, string> = new Map()
): Promise<void> {
  const refs = await rawCollection(review).listDocuments();
  await deleteRefs(
    review,
    refs.filter((ref) => {
      const [character, gen] = ref.id.split('_');
      return keep.get(Number(character)) !== gen;
    })
  );
}

/** Deletes exactly these chunk documents: a read's own, which nothing else is writing. */
export async function deleteRawIds(
  review: DocumentReference,
  ids: readonly string[]
): Promise<void> {
  await deleteRefs(
    review,
    ids.map((id) => rawCollection(review).doc(id))
  );
}

/** Same as `deleteRawIds` after a transaction committed: a failure is noted, never thrown. */
export async function tidyRawIds(
  review: DocumentReference,
  ids: readonly string[],
  logWarn?: (message: string, meta?: Record<string, unknown>) => void
): Promise<void> {
  try {
    await deleteRawIds(review, ids);
  } catch (err) {
    logWarn?.('vetting raw rows not pruned', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/** The (character, generation) pairs a review's characters still own. */
export const keptRaw = (
  characters: readonly Pick<StoredVettingCharacter, 'characterId' | 'raw'>[]
): Map<number, string> =>
  new Map(characters.flatMap(({ characterId, raw }) => (raw ? [[characterId, raw.gen]] : [])));

/**
 * `pruneRaw` after a transaction that already committed: a failure leaves chunks nobody can
 * reach (the metadata no longer names them), deleted with the review, and must not fail the call.
 */
export async function tidyRaw(
  review: DocumentReference,
  keep: ReadonlyMap<number, string>,
  logWarn?: (message: string, meta?: Record<string, unknown>) => void
): Promise<void> {
  try {
    await pruneRaw(review, keep);
  } catch (err) {
    logWarn?.('vetting raw rows not pruned', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Where to start and what comes after, from the metadata alone. Null `at` means no such chunk. */
export function rawPagePosition(
  characters: readonly Pick<StoredVettingCharacter, 'characterId' | 'raw'>[],
  source: VettingRawSource,
  cursor: { characterId: number; seq: number } | null
): { order: RawChunkRef[]; start: number } | null {
  const order = rawChunkOrder(characters, source);
  if (cursor === null) return { order, start: 0 };
  const start = order.findIndex(
    (entry) => entry.characterId === cursor.characterId && entry.seq === cursor.seq
  );
  return start < 0 ? null : { order, start };
}

/** What a page returns for a chunk document read back. Malformed JSON reads as an empty chunk. */
export function pageOfChunk(data: unknown): Pick<VettingRawPage, 'rows' | 'parties'> {
  const parse = <T>(json: unknown): T[] => {
    if (typeof json !== 'string') return [];
    try {
      const value: unknown = JSON.parse(json);
      return Array.isArray(value) ? (value as T[]) : [];
    } catch {
      return [];
    }
  };
  const doc = data as Partial<StoredRawChunk> | undefined;
  return {
    rows: parse<VettingRawRow>(doc?.json),
    parties: parse<VettingParty>(doc?.partiesJson),
  };
}
