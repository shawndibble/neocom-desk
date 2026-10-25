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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore/lite';
import { db as localDb } from '@/db';
import type { RecordedWriteOff, TaxPayment } from '@/engine/corpTaxBook/allocation';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import { groupObservedEntries } from '@/engine/corpTaxBook/observed';
import { ownerRefinerySystemsToLearn } from '@/engine/corpTaxBook/refinery';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Adjustment, Statement } from '@/engine/corpTaxBook/statements';
import { loadStructureName } from '@/features/character/structures';
import type { ObservedMiningEntry, ObservedRow } from '@/engine/corpTaxBook/types';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { callRouted } from '@/sync/routedCallable';
import { ensureSignedIn } from '@/sync/syncAuth';
import { underFirebaseSession } from '@/features/communities/pledgeWrites';
import { refineryPlaceholder } from '@/features/corp/moons/moonsFormat';
import { bookVersionsOf, cachedPart } from '@/features/corp/taxBook/bookCache';

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
  /** Each moon owner's coverage and read clock, when the book lets this reader see them (#4622). */
  feeders?: MemberFeederCoverage[];
  /** The tracked Characters' own corrections (#4622). */
  adjustments?: Adjustment[];
  /** The tracked Characters' own officer write-offs (#4637). */
  writeOffs?: RecordedWriteOff[];
  /** Refinery names, where a Statement or ESI gave one (#4622). */
  structureNames?: Record<number, string>;
}

/** A moon owner's coverage and read clock as the miner reads them: never a name, payee or rate. */
export interface MemberFeederCoverage {
  corporationId: number;
  coveragePeriods: { from: string; to?: string }[];
  lastReadWellAt?: string;
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

/** `corps/{book}/feederCoverage/{corp}`, written by the server (#4622). */
export function readFeederCoverage(id: string, d: Data): MemberFeederCoverage | null {
  const corporationId = Number(id);
  if (!Number.isSafeInteger(corporationId) || corporationId <= 0) return null;
  if (!Array.isArray(d.coveragePeriods)) return null;
  const coveragePeriods = d.coveragePeriods.flatMap((p) => {
    const from = str((p as Data | null)?.from);
    if (!from) return [];
    const to = str((p as Data).to);
    return [{ from, ...(to !== undefined ? { to } : {}) }];
  });
  const readAt = num(d.lastReadWellAt);
  return {
    corporationId,
    coveragePeriods,
    ...(readAt !== undefined ? { lastReadWellAt: new Date(readAt).toISOString() } : {}),
  };
}

export function readAdjustment(id: string, d: Data): Adjustment | null {
  const minerId = str(d.minerId);
  const date = str(d.date);
  const amount = num(d.amount);
  if (!minerId || !date || amount === undefined) return null;
  return {
    id,
    minerId,
    date,
    amount,
    reason: str(d.reason) ?? '',
    by: num(d.by) ?? 0,
    at: str(d.at) ?? '',
  };
}

export function readWriteOff(id: string, d: Data): RecordedWriteOff | null {
  const minerId = str(d.minerId);
  const amount = num(d.amount);
  const at = str(d.at);
  if (!minerId || amount === undefined || !at) return null;
  const statementId = str(d.statementId);
  return {
    id,
    minerId,
    amount,
    at,
    reason: str(d.reason) ?? '',
    ...(statementId ? { statementId } : {}),
  };
}

/** Refinery names the Statements were issued with; the officer side's placeholder (older Statements) is no name. */
export function refineryNamesOf(
  statements: readonly { refineryNames?: Record<string, string> }[]
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const s of statements) {
    for (const [id, name] of Object.entries(s.refineryNames ?? {})) {
      const structureId = Number(id);
      if (!Number.isSafeInteger(structureId) || typeof name !== 'string') continue;
      if (name.trim() === '' || name === refineryPlaceholder(id)) continue;
      out[structureId] = name;
    }
  }
  return out;
}

/** Names ESI gives the miner's own Characters for refineries no Statement named. Never throws. */
async function namesFromEsi(
  observed: readonly { structureId: number; characterId: number }[],
  known: Record<number, string>
): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const asked = new Set<number>();
  for (const o of observed) {
    if (known[o.structureId] !== undefined || asked.has(o.structureId)) continue;
    asked.add(o.structureId);
    const name = await loadStructureName(o.characterId, o.structureId).catch(() => null);
    if (name) out[o.structureId] = name;
  }
  return out;
}

/** A read the rules may not allow yet (a newer collection before its rules deploy): none, never a failed book. */
const orNone = <T>(read: Promise<T>): Promise<T | null> => read.catch(() => null);

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
  /** `${characterId}:${corporationId}` for each book whose pointer names the Character. */
  const billed = new Set<string>();
  /** Characters whose pointer could not be read this load: their coverage is read live. */
  const unknown = new Set<number>();
  for (const c of characters) {
    entry(c.corporationId).characterIds.add(c.characterId);
    entry(c.corporationId).members.add(c.characterId);
    for (const corporationId of remembered[c.characterId] ?? []) {
      entry(corporationId).characterIds.add(c.characterId);
    }
    // The books that bill this Character, whatever corporation they are in (#4517).
    const pointer = await readBilledBy(c.characterId);
    if (pointer === null) unknown.add(c.characterId);
    for (const corporationId of pointer ?? []) {
      entry(corporationId).characterIds.add(c.characterId);
      entry(corporationId).members.add(c.characterId);
      billed.add(`${c.characterId}:${corporationId}`);
    }
  }
  const books: LoadedCorpBook[] = [];
  for (const [corporationId, { characterIds, members }] of byCorp) {
    try {
      const book = await underFirebaseSession(() =>
        readOneBook(corporationId, [...characterIds], (characterId) =>
          billed.has(`${characterId}:${corporationId}`)
            ? 'billed'
            : unknown.has(characterId)
              ? 'unknown'
              : 'not-billed'
        )
      );
      if (!book) continue;
      // ESI names what no Statement did; no Firebase session needed for that.
      const named = book.structureNames ?? {};
      const structureNames = { ...named, ...(await namesFromEsi(book.observed, named)) };
      books.push({ ...book, structureNames, memberCharacterIds: [...members] });
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

/** The pointer's books, or null when it could not be read (offline, signed out). */
async function readBilledBy(characterId: number): Promise<number[] | null> {
  try {
    return await underFirebaseSession(async () => {
      const uid = await ensureSignedIn(characterId);
      const snap = await getDoc(doc(getSyncFirestore(characterId), 'corpTaxBookBilledBy', uid));
      return readBilledByPointer(snap.data());
    });
  } catch {
    // Offline or signed out: the current and remembered corporations still load.
    return null;
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

/** A query's documents as plain data, the shape a book's parts are cached in. */
type Docs = { id: string; data: Data }[];
const docsOf = (snap: QuerySnapshot): Docs => snap.docs.map((d) => ({ id: d.id, data: d.data() }));

/**
 * One book, with the Characters' own lines.
 *
 * Each part is reused from this tab's copy while the book's version marker
 * for its subcollection is unchanged (issue #5050, on #5047's marker; see
 * features/corp/taxBook/bookCache.ts), so an unchanged book costs its settings
 * document — and a ledger reload or Settle up's 10-minute recheck reads only
 * that, unless something was written.
 *
 * Serving a copy never outlives the member's access: every line here is
 * readable by its own `uid`/`uids` field alone (firestore.rules
 * `isOwnLine`/`isOnOwnLine`), so access only changes with a write, which moves
 * the stamp. The one part gated on anything else, `feederCoverage`
 * (`isBilledHere`: the Character's `corpTaxBookBilledBy` pointer, outside the
 * book and so never stamped), is served from the copy only while that pointer —
 * read fresh on every load — still names the book; when the pointer could not
 * be read it is read live, as before, and the rules decide.
 */
async function readOneBook(
  corporationId: number,
  characterIds: readonly number[],
  billedHere: (characterId: number) => 'billed' | 'not-billed' | 'unknown'
): Promise<LoadedCorpBook | null> {
  const fs = getSyncFirestore(characterIds[0]);
  const root = `corps/${corporationId}`;
  await ensureSignedIn(characterIds[0]);
  const bookDoc = (await getDoc(doc(fs, 'corps', String(corporationId)))).data();
  const settings = readBookSettings(corporationId, bookDoc);
  if (!settings) return null;
  const versions = bookVersionsOf(bookDoc);

  const rows: ObservedRow[] = [];
  const payments: TaxPayment[] = [];
  const held: HeldPayment[] = [];
  const claimable: ClaimablePayment[] = [];
  const dismissals: Dismissal[][] = [];
  const statements: Statement[][] = [];
  const miners: Miner[][] = [];
  const adjustments: Adjustment[][] = [];
  const writeOffs: RecordedWriteOff[][] = [];
  let feeders: MemberFeederCoverage[] | null = null;
  for (const characterId of characterIds) {
    const uid = await ensureSignedIn(characterId);
    const memberFs = getSyncFirestore(characterId);
    // Its own key: a member's copy holds only its own lines, never an officer's whole book.
    const key = `member:${characterId}:${corporationId}`;
    const part = (name: string, field: 'uid' | 'uids'): Promise<Docs> =>
      cachedPart(key, name, versions, async () =>
        docsOf(
          await getDocs(
            query(
              collection(memberFs, root, name),
              field === 'uid' ? where('uid', '==', uid) : where('uids', 'array-contains', uid)
            )
          )
        )
      );
    // Readable by a Character the book bills; any one of them will do. Cached only
    // while this load's pointer names the book; with no pointer read, live as before.
    const readCoverage = async () =>
      docsOf(await getDocs(collection(memberFs, root, 'feederCoverage')));
    const billing = feeders === null ? billedHere(characterId) : 'not-billed';
    const coverageRead: Promise<Docs | null> =
      billing === 'billed'
        ? orNone(cachedPart(key, 'feederCoverage', versions, readCoverage))
        : billing === 'unknown'
          ? orNone(readCoverage())
          : Promise.resolve(null);
    const [
      observedDocs,
      paymentDocs,
      dismissalDocs,
      statementDocs,
      minerDocs,
      adjustmentDocs,
      writeOffDocs,
      coverageDocs,
    ] = await Promise.all([
      part('observed', 'uid'),
      part('payments', 'uid'),
      part('dismissals', 'uids'),
      part('statements', 'uids'),
      part('miners', 'uids'),
      orNone(part('adjustments', 'uids')),
      orNone(part('writeOffs', 'uids')),
      coverageRead,
    ]);
    adjustments.push(adjustmentDocs?.flatMap((d) => readAdjustment(d.id, d.data) ?? []) ?? []);
    writeOffs.push(writeOffDocs?.flatMap((d) => readWriteOff(d.id, d.data) ?? []) ?? []);
    if (coverageDocs) {
      feeders = coverageDocs.flatMap((d) => readFeederCoverage(d.id, d.data) ?? []);
    }
    for (const d of observedDocs) {
      const row = readObservedRow(d.data);
      if (row) rows.push(row);
    }
    for (const d of paymentDocs) {
      const read = readPayment(d.id, d.data);
      if (!read) continue;
      held.push(read.held);
      if (read.payment) payments.push(read.payment);
      if (read.claimable) claimable.push(read.claimable);
    }
    dismissals.push(dismissalDocs.flatMap((d) => readDismissal(d.id, d.data) ?? []));
    statements.push(statementDocs.flatMap((d) => readStatement(d.id, d.data) ?? []));
    miners.push(minerDocs.flatMap((d) => readMiner(d.id, d.data) ?? []));
  }
  const merged = mergeById(statements);
  const structureNames = refineryNamesOf(merged as { refineryNames?: Record<string, string> }[]);
  return {
    ...settings,
    observed: groupObservedEntries(rows),
    ...(feeders ? { feeders } : {}),
    adjustments: mergeById(adjustments),
    writeOffs: mergeById(writeOffs),
    structureNames,
    payments: mergeById([payments]),
    held,
    claimable: mergeById([claimable]),
    dismissals: mergeById(dismissals),
    statements: merged,
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
    return callRouted<{ corporationId: number; paymentId: string }, { minerId: string }>(
      'claimCorpTaxBookPaymentCallable',
      { corporationId, paymentId }
    );
  });
}

/** The server's `MAX_LEARNED_SYSTEMS`: it refuses a longer call. */
const MAX_LEARNED_SYSTEMS = 50;
/** `corp:structure` already reported this session, so a reload does not send them again. */
const reportedSystems = new Set<string>();

/**
 * Tells each book the systems the member's own ledger places its moon owner refineries in
 * (#4650): a moon owner's rows rarely carry one, and only the miner holds their own ledger.
 * Each Character reports under its own session, for the refineries it mined at. Never throws:
 * the personal ledger never waits on, or breaks with, a book.
 */
export async function teachRefinerySystems(
  books: readonly Pick<LoadedCorpBook, 'corporationId' | 'characterIds' | 'observed'>[],
  personal: readonly MiningLedgerEntry[]
): Promise<void> {
  for (const book of books) {
    for (const characterId of book.characterIds) {
      // Matching is entries × ledger: skip what this session already reported first.
      const entries = book.observed.filter(
        (o) =>
          o.characterId === characterId &&
          !reportedSystems.has(`${book.corporationId}:${o.structureId}`)
      );
      if (entries.length === 0) continue;
      const learned = ownerRefinerySystemsToLearn(
        entries,
        personal.filter((e) => e.characterId === characterId)
      );
      const fresh = Object.entries(learned).slice(0, MAX_LEARNED_SYSTEMS);
      if (fresh.length === 0) continue;
      for (const [id] of fresh) reportedSystems.add(`${book.corporationId}:${id}`);
      try {
        await underFirebaseSession(async () => {
          await ensureSignedIn(characterId);
          await callRouted<{ corporationId: number; systems: Record<string, number> }, unknown>(
            'learnCorpTaxBookRefinerySystemsCallable',
            { corporationId: book.corporationId, systems: Object.fromEntries(fresh) }
          );
        });
      } catch {
        // Quiet by design: a later load tries again.
        for (const [id] of fresh) reportedSystems.delete(`${book.corporationId}:${id}`);
      }
    }
  }
}
