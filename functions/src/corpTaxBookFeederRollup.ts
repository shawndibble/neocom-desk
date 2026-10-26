// A moon owner's observed rows, packed one document per day and refinery.
//
// The feeder view and the moon owner's status sum every row a feeder's refineries recorded,
// and a capped read would drop an arbitrary slice of them. Scanning `observed` for them cost
// one read per row on every rebuild. This mirror holds the same rows at the same grain,
// `corps/{collector}/feederObserved/{feeder}_{structure}_{date}` -> `lines[characterId_typeId]`,
// so a rebuild reads one document per day and refinery instead. Exact: `mergeObservedInto`
// writes it in the same transaction as the row, with the stored row's own value (never an
// increment, so a retried transaction repeats itself harmlessly).
//
// A feeder with no `ready_{feeder}` marker has not been backfilled: its rows are read the old
// way, then copied in, and the marker is written. Rollup entries already present came from a
// merge, so they are newer than that scan and the backfill never overwrites one.

import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { observedRowKey, type ObservedRow } from './corpTaxBookEngine.js';

export const FEEDER_OBSERVED = 'feederObserved';
const OBSERVED_COLLECTION = 'observed';
const BACKFILL_CHUNK = 200;

export interface RollupLine {
  quantity: number;
  cachedAt: string;
  solarSystemId?: number;
}

export interface RollupRow {
  structureId: number;
  characterId: number;
  typeId: number;
  date: string;
  quantity: number;
  solarSystemId?: number;
}

export const rollupDocId = (feeder: number, structureId: number, date: string) =>
  `${feeder}_${structureId}_${date}`;
export const readyMarkerId = (feeder: number) => `ready_${feeder}`;
export const lineKey = (characterId: number, typeId: number) => `${characterId}_${typeId}`;

const lineOf = (row: Pick<ObservedRow, 'quantity' | 'cachedAt' | 'solarSystemId'>): RollupLine => ({
  quantity: row.quantity,
  cachedAt: row.cachedAt,
  ...(row.solarSystemId !== undefined ? { solarSystemId: row.solarSystemId } : {}),
});

export interface RollupChange {
  feeder: number;
  structureId: number;
  date: string;
  set: Record<string, RollupLine>;
  remove: string[];
}

/**
 * What a merge changes in the mirror. `changed` are the rows about to be written, `held` the
 * stored row each replaces (by `observedRowKey`). A row's entry is set
 * under its new feeder and removed from the old one when the feeder differs.
 */
export function rollupChanges(
  changed: readonly ObservedRow[],
  held: ReadonlyMap<string, Pick<ObservedRow, 'sourceCorporationId'>>
): Map<string, RollupChange> {
  const out = new Map<string, RollupChange>();
  const at = (feeder: number, r: ObservedRow): RollupChange => {
    const id = rollupDocId(feeder, r.structureId, r.date);
    let c = out.get(id);
    if (!c)
      out.set(id, (c = { feeder, structureId: r.structureId, date: r.date, set: {}, remove: [] }));
    return c;
  };
  for (const r of changed) {
    const old = held.get(observedRowKey(r))?.sourceCorporationId;
    const lk = lineKey(r.characterId, r.typeId);
    if (old !== undefined && old !== r.sourceCorporationId) {
      const c = at(old, r);
      c.remove.push(lk);
      delete c.set[lk];
    }
    if (r.sourceCorporationId !== undefined) {
      const c = at(r.sourceCorporationId, r);
      c.set[lk] = lineOf(r);
      c.remove = c.remove.filter((k) => k !== lk);
    }
  }
  return out;
}

/** Stages the mirror writes for one merge chunk. Call after the transaction's reads. */
export function writeRollupChanges(
  tx: Transaction,
  collection: FirebaseFirestore.CollectionReference,
  changes: ReadonlyMap<string, RollupChange>
): void {
  for (const [id, c] of changes) {
    const lines: Record<string, RollupLine | FieldValue> = { ...c.set };
    for (const k of c.remove) lines[k] = FieldValue.delete();
    tx.set(
      collection.doc(id),
      { feederCorporationId: c.feeder, structureId: c.structureId, date: c.date, lines },
      { merge: true }
    );
  }
}

/** The rows one mirror document stands for. Pure. */
export function rowsOfRollupDoc(data: {
  structureId?: unknown;
  date?: unknown;
  lines?: unknown;
}): RollupRow[] {
  const { structureId, date } = data;
  if (typeof structureId !== 'number' || typeof date !== 'string') return [];
  const lines = (data.lines ?? {}) as Record<string, Partial<RollupLine>>;
  return Object.entries(lines).flatMap(([k, l]) => {
    const [characterId, typeId] = k.split('_').map(Number);
    if (!Number.isFinite(characterId) || !Number.isFinite(typeId)) return [];
    if (!l || typeof l.quantity !== 'number') return [];
    return [
      {
        structureId,
        characterId,
        typeId,
        date,
        quantity: l.quantity,
        ...(typeof l.solarSystemId === 'number' ? { solarSystemId: l.solarSystemId } : {}),
      },
    ];
  });
}

/** Lines of `rows` the stored document does not hold yet: the only ones a backfill may add. Pure. */
export function missingLines(
  stored: Readonly<Record<string, unknown>> | undefined,
  rows: readonly ObservedRow[]
): Record<string, RollupLine> {
  const out: Record<string, RollupLine> = {};
  for (const r of rows) {
    const k = lineKey(r.characterId, r.typeId);
    if (stored && k in stored) continue;
    out[k] = lineOf(r);
  }
  return out;
}

const bookCollection = (book: DocumentReference, name: string) => book.collection(name);

/**
 * Every row a feeder's refineries recorded, as `select`ed scan columns. The mirror when the
 * feeder is backfilled (one read per day and refinery); otherwise the full scan, which then
 * backfills the mirror so the next read is cheap.
 */
export async function readFeederRows(
  db: Firestore,
  book: DocumentReference,
  feeder: number
): Promise<RollupRow[]> {
  const mirror = bookCollection(book, FEEDER_OBSERVED);
  const marker = await mirror.doc(readyMarkerId(feeder)).get();
  if (marker.exists) {
    const snap = await mirror.where('feederCorporationId', '==', feeder).get();
    return snap.docs.flatMap((d) => rowsOfRollupDoc(d.data()));
  }
  // Every row: what is owed sums every covered day, so a capped read would understate it.
  const scan = await bookCollection(book, OBSERVED_COLLECTION)
    .where('sourceCorporationId', '==', feeder)
    .select(
      'structureId',
      'characterId',
      'typeId',
      'date',
      'quantity',
      'cachedAt',
      'recordedCorporationId',
      'solarSystemId'
    )
    .get();
  const rows = scan.docs.map((d) => d.data() as ObservedRow);
  try {
    await backfill(db, book, mirror, feeder, rows);
  } catch (e) {
    // The next read tries again; this one already has its rows.
    console.error('feeder rollup not backfilled', e instanceof Error ? e.message : e);
  }
  return rows;
}

async function backfill(
  db: Firestore,
  book: DocumentReference,
  mirror: FirebaseFirestore.CollectionReference,
  feeder: number,
  rows: readonly ObservedRow[]
): Promise<void> {
  const byDoc = new Map<string, ObservedRow[]>();
  for (const r of rows) {
    const id = rollupDocId(feeder, r.structureId, r.date);
    byDoc.set(id, [...(byDoc.get(id) ?? []), r]);
  }
  const ids = [...byDoc.keys()];
  for (let i = 0; i < ids.length; i += BACKFILL_CHUNK) {
    const part = ids.slice(i, i + BACKFILL_CHUNK);
    await db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...part.map((id) => mirror.doc(id)));
      // The scan is older than this transaction: a row may have left the feeder since, and its
      // line was deleted from the mirror, so a missing line is only added back if the stored
      // row still belongs to the feeder (and the line takes that row's current value).
      const current = new Map<string, ObservedRow>();
      const wanted = part.flatMap((id) => byDoc.get(id) ?? []);
      const stored = await tx.getAll(
        ...wanted.map((r) =>
          book
            .collection(OBSERVED_COLLECTION)
            .doc(`${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`)
        )
      );
      stored.forEach((d) => {
        if (d.exists && d.get('sourceCorporationId') === feeder) {
          current.set(d.id, d.data() as ObservedRow);
        }
      });
      snaps.forEach((snap, n) => {
        const mine = (byDoc.get(part[n]) ?? []).flatMap((r) => {
          const row = current.get(`${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`);
          return row ? [row] : [];
        });
        const add = missingLines(snap.get('lines') as Record<string, unknown> | undefined, mine);
        if (Object.keys(add).length === 0) return;
        const first = byDoc.get(part[n])![0];
        tx.set(
          snap.ref,
          {
            feederCorporationId: feeder,
            structureId: first.structureId,
            date: first.date,
            lines: add,
          },
          { merge: true }
        );
      });
    });
  }
  await mirror.doc(readyMarkerId(feeder)).set({ builtAt: Date.now() });
}
