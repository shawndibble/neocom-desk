/**
 * The member's reads of a Corp Tax Book (issue #4065, ADR 0023). Firestore
 * rules let any signed-in Character `get` a book's settings and read their OWN
 * lines (`uid` / `uids`) — observed rows, payments, Statements, dismissals and
 * Miner groupings — in any corp's book, including after leaving the corp. This
 * module reads exactly those, as each tracked Character in turn (the Firebase
 * session is one Character at a time), and parses them defensively into the
 * engine's shapes. Every write is a callable; the only one a player makes is
 * claiming their own Unmatched donation.
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore/lite';
import { httpsCallable } from 'firebase/functions';
import { db as localDb } from '@/db';
import type { TaxPayment } from '@/engine/corpTaxBook/allocation';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import { groupObservedEntries } from '@/engine/corpTaxBook/observed';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Statement } from '@/engine/corpTaxBook/statements';
import type { ObservedMiningEntry, ObservedRow } from '@/engine/corpTaxBook/types';
import { getSyncFirestore, getSyncFunctions } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { underFirebaseSession } from '@/features/communities/pledgeWrites';

type Data = Record<string, unknown>;

/** A donation of the member's own that no Miner has been credited with yet — theirs to claim. */
export interface ClaimablePayment {
  id: string;
  characterId: number;
  amount: number;
  at: string;
}

/** What the book holds of a donation, for telling "sent, waiting" from "credited". */
export interface HeldPayment {
  characterId: number;
  amount: number;
  at: string;
  notTaxAmount?: number;
}

export interface LoadedCorpBook {
  corporationId: number;
  startDate: string;
  graceHours: number;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  /** The book's divisions, division 1 by default — where a donation should go. */
  divisions: number[];
  rates: TaxRate[];
  /** When an officer last synced it; absent when never. */
  lastSyncedAt?: string;
  observed: ObservedMiningEntry[];
  payments: TaxPayment[];
  held: HeldPayment[];
  claimable: ClaimablePayment[];
  dismissals: Dismissal[];
  statements: Statement[];
  miners: Miner[];
  /** The tracked Characters this was read for — the ones whose lines it holds. */
  characterIds: number[];
  /** Which of them are in the corporation now; none means every one has left (Leavers keep read access). */
  memberCharacterIds: number[];
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The book's settings doc; `null` when it is not an active book, or is still in its setup window (D24: then nothing changes). */
export function readBookSettings(corporationId: number, d: Data | undefined, now = Date.now()) {
  if (!d || d.active !== true) return null;
  // A freshly turned-on book is still being set up (rates, sync, payment matching): members see nothing yet.
  const seeFrom = num(d.membersSeeFrom);
  if (seeFrom !== undefined && now < seeFrom) return null;
  const startDate = str(d.startDate);
  if (!startDate) return null;
  const rates = (Array.isArray(d.rates) ? d.rates : []).filter((r): r is TaxRate => {
    if (typeof r !== 'object' || r === null) return false;
    const rate = r as Data;
    return (
      num(rate.pct) !== undefined &&
      ['corp', 'guest', 'feeder', 'miner', 'moon', 'structure', 'record'].includes(
        String(rate.scope)
      )
    );
  });
  const syncedAt = num((d.lastSync as Data | null | undefined)?.at);
  return {
    corporationId,
    startDate,
    graceHours: num(d.graceHours) ?? 6,
    hubId: str(d.hubId) ?? 'jita',
    oreForm: d.oreForm === 'raw' ? ('raw' as const) : ('compressed' as const),
    divisions: (Array.isArray(d.divisions) ? d.divisions : [1]).filter(
      (x): x is number => typeof x === 'number'
    ),
    rates,
    ...(syncedAt !== undefined ? { lastSyncedAt: new Date(syncedAt).toISOString() } : {}),
  };
}

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
    ...(sourceCorporationId !== undefined ? { sourceCorporationId } : {}),
  };
}

/** A payment doc: `Matched` ones credit a Miner, the rest are claimable by their donor. */
export function readPayment(
  id: string,
  d: Data
): { payment?: TaxPayment; held: HeldPayment; claimable?: ClaimablePayment } | null {
  const characterId = num(d.characterId);
  const amount = num(d.amount);
  const at = str(d.at);
  if (characterId === undefined || amount === undefined || !at) return null;
  const notTaxAmount = num(d.notTaxAmount);
  const held: HeldPayment = {
    characterId,
    amount,
    at,
    ...(notTaxAmount !== undefined ? { notTaxAmount } : {}),
  };
  const minerId = str(d.minerId);
  if (!minerId) {
    // Only a donation can be claimed, and not one an officer has marked "not tax" in full.
    const claimable =
      d.source === 'donation' && (notTaxAmount ?? 0) < amount
        ? { id, characterId, amount, at }
        : undefined;
    return { held, ...(claimable ? { claimable } : {}) };
  }
  const statementId = str(d.statementId);
  return {
    held,
    payment: {
      id,
      minerId,
      characterId,
      amount,
      at,
      source: d.source === 'manual' ? 'manual' : 'donation',
      ...(statementId ? { statementId } : {}),
      ...(notTaxAmount !== undefined ? { notTaxAmount } : {}),
    },
  };
}

export function readDismissal(id: string, d: Data): Dismissal | null {
  const scope = str(d.scope);
  const targetId = str(d.targetId);
  const at = str(d.at);
  if (!scope || !targetId || !at || !['record', 'miner', 'moon', 'extraction'].includes(scope)) {
    return null;
  }
  const reversed = d.reversed as Data | undefined | null;
  return {
    id,
    scope: scope as Dismissal['scope'],
    targetId,
    by: num(d.by) ?? 0,
    at,
    reason: str(d.reason) ?? '',
    ...(reversed ? { reversed: { by: num(reversed.by) ?? 0, at: str(reversed.at) ?? at } } : {}),
  };
}

export function readStatement(id: string, d: Data): Statement | null {
  const minerId = str(d.minerId);
  const amount = num(d.amount);
  const issuedAt = str(d.issuedAt);
  if (!minerId || amount === undefined || !issuedAt || !Array.isArray(d.lines)) return null;
  return { ...(d as unknown as Statement), id, minerId, amount, issuedAt };
}

export function readMiner(id: string, d: Data): Miner | null {
  const characterIds = Array.isArray(d.characterIds)
    ? d.characterIds.filter((x): x is number => typeof x === 'number')
    : [];
  if (characterIds.length === 0) return null;
  return { id, characterIds, mainCharacterId: num(d.mainCharacterId) ?? characterIds[0] };
}

function mergeById<T extends { id: string }>(lists: readonly (readonly T[])[]): T[] {
  return [...new Map(lists.flat().map((x) => [x.id, x])).values()];
}

/**
 * The books of the corporations the tracked Characters are in, each with those
 * Characters' own lines. A corp with no active book (D24) is simply absent;
 * a read that fails (offline, signed out, a lapsed grant) drops that corp
 * rather than the tab — the personal ledger never depends on it.
 */
export async function loadCorpBooks(
  characters: readonly { characterId: number; corporationId: number }[]
): Promise<LoadedCorpBook[]> {
  // A leaver keeps read access to their own lines, but nothing says which corp they left: remember
  // each corporation whose book a Character has been read in.
  const remembered = await readRememberedCorps();
  const byCorp = new Map<number, { characterIds: Set<number>; members: Set<number> }>();
  const entry = (corporationId: number) => {
    const held = byCorp.get(corporationId) ?? { characterIds: new Set(), members: new Set() };
    byCorp.set(corporationId, held);
    return held;
  };
  for (const c of characters) {
    entry(c.corporationId).characterIds.add(c.characterId);
    entry(c.corporationId).members.add(c.characterId);
    for (const corporationId of remembered[c.characterId] ?? []) {
      entry(corporationId).characterIds.add(c.characterId);
    }
    // The books that bill this Character, whatever corporation they are in (#4517).
    for (const corporationId of await readBilledBy(c.characterId)) {
      entry(corporationId).characterIds.add(c.characterId);
      entry(corporationId).members.add(c.characterId);
    }
  }
  const books: LoadedCorpBook[] = [];
  for (const [corporationId, { characterIds, members }] of byCorp) {
    try {
      const book = await underFirebaseSession(() => readOneBook(corporationId, [...characterIds]));
      if (!book) continue;
      books.push({ ...book, memberCharacterIds: [...members] });
      await rememberCorp(book.characterIds, corporationId);
    } catch {
      // Quiet by design: see above.
    }
  }
  return books;
}

/**
 * The corporations whose books bill a Character, from the pointer the sync writes
 * (rules: only that Character reads it). A moon owner's miner is billed by a book
 * that is not their corporation's; nothing else would lead the client to it.
 */
export function readBilledByPointer(d: Data | undefined): number[] {
  const books = d?.books;
  if (typeof books !== 'object' || books === null) return [];
  return Object.keys(books)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function readBilledBy(characterId: number): Promise<number[]> {
  try {
    return await underFirebaseSession(async () => {
      const uid = await ensureSignedIn(characterId);
      const snap = await getDoc(doc(getSyncFirestore(), 'corpTaxBookBilledBy', uid));
      return readBilledByPointer(snap.data());
    });
  } catch {
    // Offline or signed out: the current and remembered corporations still load.
    return [];
  }
}

const REMEMBERED_KEY = 'corpTaxBookCorps';

async function readRememberedCorps(): Promise<Record<number, number[]>> {
  try {
    const raw = (await localDb.settings.get(REMEMBERED_KEY))?.value;
    return typeof raw === 'object' && raw !== null ? (raw as Record<number, number[]>) : {};
  } catch {
    return {};
  }
}

async function rememberCorp(characterIds: readonly number[], corporationId: number): Promise<void> {
  try {
    const held = await readRememberedCorps();
    for (const id of characterIds) {
      held[id] = [...new Set([...(held[id] ?? []), corporationId])];
    }
    await localDb.settings.put({ key: REMEMBERED_KEY, value: held });
  } catch {
    // A remembered corp is a convenience; the next read finds the book again.
  }
}

async function readOneBook(
  corporationId: number,
  characterIds: readonly number[]
): Promise<LoadedCorpBook | null> {
  const fs = getSyncFirestore();
  const root = `corpTaxBooks/${corporationId}`;
  await ensureSignedIn(characterIds[0]);
  const settings = readBookSettings(
    corporationId,
    (await getDoc(doc(fs, 'corpTaxBooks', String(corporationId)))).data()
  );
  if (!settings) return null;

  const rows: ObservedRow[] = [];
  const payments: TaxPayment[] = [];
  const held: HeldPayment[] = [];
  const claimable: ClaimablePayment[] = [];
  const dismissals: Dismissal[][] = [];
  const statements: Statement[][] = [];
  const miners: Miner[][] = [];
  for (const characterId of characterIds) {
    const uid = await ensureSignedIn(characterId);
    const [observedSnap, paymentSnap, dismissalSnap, statementSnap, minerSnap] = await Promise.all([
      getDocs(query(collection(fs, root, 'observed'), where('uid', '==', uid))),
      getDocs(query(collection(fs, root, 'payments'), where('uid', '==', uid))),
      getDocs(query(collection(fs, root, 'dismissals'), where('uids', 'array-contains', uid))),
      getDocs(query(collection(fs, root, 'statements'), where('uids', 'array-contains', uid))),
      getDocs(query(collection(fs, root, 'miners'), where('uids', 'array-contains', uid))),
    ]);
    for (const d of observedSnap.docs) {
      const row = readObservedRow(d.data());
      if (row) rows.push(row);
    }
    for (const d of paymentSnap.docs) {
      const read = readPayment(d.id, d.data());
      if (!read) continue;
      held.push(read.held);
      if (read.payment) payments.push(read.payment);
      if (read.claimable) claimable.push(read.claimable);
    }
    dismissals.push(dismissalSnap.docs.flatMap((d) => readDismissal(d.id, d.data()) ?? []));
    statements.push(statementSnap.docs.flatMap((d) => readStatement(d.id, d.data()) ?? []));
    miners.push(minerSnap.docs.flatMap((d) => readMiner(d.id, d.data()) ?? []));
  }
  return {
    ...settings,
    observed: groupObservedEntries(rows),
    payments: mergeById([payments]),
    held,
    claimable: mergeById([claimable]),
    dismissals: mergeById(dismissals),
    statements: mergeById(statements),
    miners: mergeById(miners),
    characterIds: [...characterIds],
    memberCharacterIds: [...characterIds],
  };
}

/** The tracked Characters' corporations, as last learned from ESI. */
export async function trackedCharacterCorporations(): Promise<
  { characterId: number; corporationId: number }[]
> {
  const rows = await localDb.characters.toArray();
  return rows.flatMap((c) =>
    c.corporationId === undefined
      ? []
      : [{ characterId: c.characterId, corporationId: c.corporationId }]
  );
}

/** A player claims one of their own Unmatched donations (D5); audited server side. */
export async function claimCorpTaxBookPayment(
  characterId: number,
  corporationId: number,
  paymentId: string
): Promise<{ minerId: string }> {
  return underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    const result = await httpsCallable<
      { corporationId: number; paymentId: string },
      { minerId: string }
    >(
      getSyncFunctions(),
      'claimCorpTaxBookPaymentCallable'
    )({ corporationId, paymentId });
    return result.data;
  });
}
