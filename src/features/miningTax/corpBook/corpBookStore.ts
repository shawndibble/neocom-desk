/**
 * The member's reads of a Corp Tax Book (issue #4065, ADR 0023). Firestore
 * rules let any signed-in Character `get` a book's settings and read their OWN
 * lines (`uid` / `uids`) — observed rows, payments, Statements, dismissals and
 * Miner groupings — in any corp's book, including after leaving the corp. This
 * module reads exactly those, as each tracked Character in turn (the Firebase
 * session is one Character at a time); `engine/corpTaxBook/docShapes.ts` parses them
 * defensively into the engine's shapes. Every write is a callable; the only one a player makes is
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
import {
  readAdjustment,
  readToleranceExemption,
  readBookSettings,
  readDismissal,
  readFeederCoverage,
  readMemberDeclaration,
  readMiner,
  readPayment,
  readStatement,
  readWriteOff,
  type ClaimablePayment,
  type HeldPayment,
  type InReviewPayment,
  type MemberFeederCoverage,
} from '@/engine/corpTaxBook/docShapes';
import type { TaxContact } from '@/engine/corpTaxBook/bookDocs';
import {
  type ClaimCheck,
  type ClaimedTransfer,
  type Declaration,
} from '@/engine/corpTaxBook/overdue';
import { readDisputes, type DisputeKind, type OreDispute } from '@/engine/corpTaxBook/disputes';
import type { RecordedWriteOff, TaxPayment } from '@/engine/corpTaxBook/allocation';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { DivisionNames } from '@/engine/corpTaxBook/divisionNames';
import { groupObservedEntries, readObservedRow } from '@/engine/corpTaxBook/observed';
import { ownerRefinerySystemsToLearn } from '@/engine/corpTaxBook/refinery';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Adjustment, Statement } from '@/engine/corpTaxBook/statements';
import type { ToleranceExemption } from '@/engine/corpTaxBook/toleranceExemptions';
import { loadStructureName } from '@/features/character/structures';
import type { ObservedMiningEntry, ObservedRow } from '@/engine/corpTaxBook/types';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { callSignedIn } from '@/sync/signedInCallable';
import { ensureSignedIn } from '@/sync/syncAuth';
import { getDocUnlessKnownMissing, NOT_FOUND_TTL_MS } from '@/sync/notFoundCache';
import { underFirebaseSession } from '@/features/communities/pledgeWrites';
import { isRefineryPlaceholder } from '@/features/corp/moons/moonsFormat';
import { bookVersionsOf, cachedPart } from '@/features/corp/taxBook/bookCache';
import { forgetMemberParts, memberPartStore } from './memberPartStore';
import { readMemberObserved } from './memberObservedRead';

type Data = Record<string, unknown>;

// Parsers live in the engine (docShapes.ts); these types keep their old import path.
export type { ClaimablePayment, HeldPayment, InReviewPayment, MemberFeederCoverage };

export interface LoadedCorpBook {
  corporationId: number;
  startDate: string;
  graceHours: number;
  /** Days after issue an unsettled Statement goes Overdue (the book's setting). */
  overdueDays?: number;
  /** The instant the book switched to a running account (#6294). */
  runningAccountFrom?: string;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  /** The book's divisions, division 1 by default — where a donation should go. */
  divisions: number[];
  /** The corp's own names for those divisions, when a Director's visit stored them (#6161). */
  divisionNames?: DivisionNames;
  /** Who a member's tax question is also mailed to; absent → the CEO. */
  taxContact?: TaxContact;
  rates: TaxRate[];
  /** When an officer last synced it; absent when never. */
  lastSyncedAt?: string;
  /** The last sync that read the wallet's donations (`PersonalBook.donationsCheckedAt`). */
  donationsCheckedAt?: string | null;
  observed: ObservedMiningEntry[];
  payments: TaxPayment[];
  held: HeldPayment[];
  claimable: ClaimablePayment[];
  /** The tracked Characters' donations it holds for review without counting them (#6207). */
  inReview?: InReviewPayment[];
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
  /** Declarations on their own Statements (#6206); absent before the rules let members read them. */
  declarations?: Declaration[];
  /** Their own Conflict disputes (#6206). */
  disputes?: OreDispute[];
  /** Officers' per-day limits on what a shortfall of theirs may forgive. */
  toleranceExemptions?: ToleranceExemption[];
  /** Each of their Miners' paid-through day, as the book recorded it. */
  minerPaidThrough?: Map<string, string>;
  /** Refinery names, where a Statement or ESI gave one (#4622). */
  structureNames?: Record<number, string>;
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
      if (name.trim() === '' || isRefineryPlaceholder(name, id)) continue;
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
  return (await readCorpBooks(characters)).books;
}

/** The books read, and the corporations whose read threw (as opposed to a book that is gone or hidden). */
export interface CorpBooksRead {
  books: LoadedCorpBook[];
  failed: number[];
}

/** `loadCorpBooks` that also says which reads failed, so a caller holding the last good book can keep it. */
export async function readCorpBooks(
  characters: readonly { characterId: number; corporationId: number }[]
): Promise<CorpBooksRead> {
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
  const failed: number[] = [];
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
      failed.push(corporationId);
    }
  }
  return { books, failed };
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
      const ref = doc(getSyncFirestore(characterId), 'corpTaxBookBilledBy', uid);
      return readBilledByPointer(
        await getDocUnlessKnownMissing(
          `corpTaxBookBilledBy/${uid}`,
          NOT_FOUND_TTL_MS.billedByPointer,
          () => getDoc(ref)
        )
      );
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
  const bookDoc = await getDocUnlessKnownMissing(
    `corps/${corporationId}`,
    NOT_FOUND_TTL_MS.corpBook,
    () => getDoc(doc(fs, 'corps', String(corporationId)))
  );
  const settings = readBookSettings(corporationId, bookDoc);
  if (!settings) {
    // The book is gone or hidden from members: keep none of its lines on this device.
    for (const characterId of characterIds) await forgetMemberParts(characterId, corporationId);
    return null;
  }
  const versions = bookVersionsOf(bookDoc);
  const written = (name: string) => versions === null || versions.collections[name] !== undefined;
  const bookCreatedAt = typeof bookDoc?.createdAt === 'number' ? bookDoc.createdAt : undefined;

  const rows: ObservedRow[] = [];
  const payments: TaxPayment[] = [];
  const held: HeldPayment[] = [];
  const claimable: ClaimablePayment[] = [];
  const inReview: InReviewPayment[] = [];
  const dismissals: Dismissal[][] = [];
  const statements: Statement[][] = [];
  const miners: Miner[][] = [];
  const adjustments: Adjustment[][] = [];
  const writeOffs: RecordedWriteOff[][] = [];
  const declarations: Declaration[][] = [];
  const disputes: OreDispute[][] = [];
  const exemptions: ToleranceExemption[][] = [];
  const paidThrough = new Map<string, string>();
  let feeders: MemberFeederCoverage[] | null = null;
  for (const characterId of characterIds) {
    const uid = await ensureSignedIn(characterId);
    const memberFs = getSyncFirestore(characterId);
    // Its own key: a member's copy holds only its own lines, never an officer's whole book.
    const key = `member:${characterId}:${corporationId}`;
    const store = memberPartStore(characterId, corporationId);
    const part = (name: string, field: 'uid' | 'uids'): Promise<Docs> =>
      cachedPart(
        key,
        name,
        versions,
        async () =>
          docsOf(
            await getDocs(
              query(
                collection(memberFs, root, name),
                field === 'uid' ? where('uid', '==', uid) : where('uids', 'array-contains', uid)
              )
            )
          ),
        { store }
      );
    // Readable by a Character the book bills; any one of them will do. Cached only
    // while this load's pointer names the book; with no pointer read, live as before.
    const readCoverage = async () =>
      docsOf(await getDocs(collection(memberFs, root, 'feederCoverage')));
    const billing = feeders === null ? billedHere(characterId) : 'not-billed';
    const coverageRead: Promise<Docs | null> =
      billing === 'billed'
        ? orNone(cachedPart(key, 'feederCoverage', versions, readCoverage, { store }))
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
      declarationDocs,
      disputeDocs,
      exemptionDocs,
      paidDocs,
    ] = await Promise.all([
      readMemberObserved({
        db: memberFs,
        key,
        root,
        uid,
        version: versions?.collections.observed,
        store,
        bookCreatedAt,
      }),
      part('payments', 'uid'),
      part('dismissals', 'uids'),
      part('statements', 'uids'),
      part('miners', 'uids'),
      orNone(part('adjustments', 'uids')),
      orNone(part('writeOffs', 'uids')),
      coverageRead,
      // #6206. A collection no write ever stamped holds nothing: no read.
      written('declarations') ? orNone(part('declarations', 'uids')) : Promise.resolve(null),
      written('disputes') ? orNone(part('disputes', 'uids')) : Promise.resolve(null),
      written('toleranceExemptions')
        ? orNone(part('toleranceExemptions', 'uids'))
        : Promise.resolve(null),
      written('minerPaid') ? orNone(part('minerPaid', 'uids')) : Promise.resolve(null),
    ]);
    declarations.push(
      declarationDocs?.flatMap((d) => readMemberDeclaration(d.id, d.data) ?? []) ?? []
    );
    disputes.push(readDisputes(disputeDocs?.map((d) => ({ id: d.id, ...d.data })) ?? []));
    for (const d of paidDocs ?? []) {
      const day = typeof d.data.paidThrough === 'string' ? d.data.paidThrough : undefined;
      if (day && day > (paidThrough.get(d.id) ?? '')) paidThrough.set(d.id, day);
    }
    exemptions.push(
      exemptionDocs?.flatMap((d) => readToleranceExemption(d.id, d.data) ?? []) ?? []
    );
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
      if (read.inReview) inReview.push(read.inReview);
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
    declarations: mergeById(declarations),
    disputes: mergeById(disputes),
    toleranceExemptions: mergeById(exemptions),
    ...(paidThrough.size > 0 ? { minerPaidThrough: paidThrough } : {}),
    structureNames,
    payments: mergeById([payments]),
    held,
    claimable: mergeById([claimable]),
    inReview: mergeById([inReview]),
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

/**
 * A player claims one of their own Unmatched donations (D5); audited server side. `inReview`: one
 * the sync held for an officer's review (#6207), which the player says was tax; never automatic.
 */
export async function claimCorpTaxBookPayment(
  characterId: number,
  corporationId: number,
  paymentId: string,
  options: { inReview?: boolean } = {}
): Promise<{ minerId: string }> {
  return underFirebaseSession(async () => {
    return callSignedIn<
      { corporationId: number; paymentId: string; inReview?: true },
      { minerId: string }
    >(characterId, 'claimCorpTaxBookPaymentCallable', {
      corporationId,
      paymentId,
      ...(options.inReview ? { inReview: true as const } : {}),
    });
  });
}

/**
 * A Miner's own "I paid this another way" on one of their Statements (#6206), with an optional
 * amount and note. It pauses Overdue until an officer confirms or rejects it.
 */
export async function declareCorpTaxBookPayment(
  characterId: number,
  input: {
    corporationId: number;
    statementId: string;
    amount?: number;
    note?: string;
    /** The transfers from the member's wallet journal: checked against the book before any officer sees them. */
    transfers?: ClaimedTransfer[];
  }
): Promise<{ declarationId: string; checks?: ClaimCheck[]; confirmed?: boolean }> {
  return underFirebaseSession(async () => {
    return callSignedIn<
      typeof input,
      { declarationId: string; checks?: ClaimCheck[]; confirmed?: boolean }
    >(characterId, 'declareCorpTaxBookPaymentCallable', input);
  });
}

/**
 * A Miner tells the book about a day (#6206): its ore went to another Payee (`payee`, the
 * default), or — resolving in the app — the book recorded too much ore, billed too high a rate,
 * or they will not pay it, each with their reason. An open one holds the day for 14 days.
 */
export async function disputeCorpTaxBookConflict(
  characterId: number,
  input: {
    corporationId: number;
    date: string;
    kind?: DisputeKind;
    reason?: string;
    claimedPct?: number;
    note?: string;
    lines: { recordKey: string; typeId: number; quantity: number; payeeName?: string }[];
  }
): Promise<{ disputeId: string }> {
  return underFirebaseSession(async () => {
    return callSignedIn<typeof input, { disputeId: string }>(
      characterId,
      'disputeCorpTaxBookConflictCallable',
      input
    );
  });
}

/** A Miner takes back their own Conflict day dispute while no officer has answered it. */
export async function withdrawCorpTaxBookDispute(
  characterId: number,
  input: { corporationId: number; date: string }
): Promise<{ disputeId: string }> {
  return underFirebaseSession(async () => {
    return callSignedIn<typeof input, { disputeId: string }>(
      characterId,
      'withdrawCorpTaxBookDisputeCallable',
      input
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
          await callSignedIn<{ corporationId: number; systems: Record<string, number> }, unknown>(
            characterId,
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
