import { LATE_NOTICES, RUNNING_ACCOUNTS } from '../../../../functions/src/corpTaxBookVersionKeys';
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
  readCheckpoint,
  readToleranceExemption,
  readBookSettings,
  readDismissal,
  readFeederCoverage,
  readMemberDeclaration,
  readMiner,
  readPayment,
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
import type { RecordedWriteOff, TaxPayment } from '@/engine/corpTaxBook/payments';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { DivisionNames } from '@/engine/corpTaxBook/divisionNames';
import { groupObservedEntries, readObservedRow } from '@/engine/corpTaxBook/observed';
import { ownerRefinerySystemsToLearn } from '@/engine/corpTaxBook/refinery';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import { isRecord } from '@/engine/guards';
import { noticesOfDocs } from '@/engine/corpTaxBook/lateNotices';
import { NOTICE_ID_FIELD, type LateNotice } from '../../../../functions/src/corpTaxBookLateNotice';
import type { RunningAccountCheckpoint } from '../../../../functions/src/corpTaxBookCheckpoint';
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

export type { ClaimablePayment, HeldPayment, InReviewPayment, MemberFeederCoverage };

export interface LoadedCorpBook {
  corporationId: number;
  startDate: string;
  graceHours: number;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  divisions: number[];
  primaryDivision?: number;
  divisionNames?: DivisionNames;
  taxContact?: TaxContact;
  rates: TaxRate[];
  lastSyncedAt?: string;
  donationsCheckedAt?: string | null;
  observed: ObservedMiningEntry[];
  payments: TaxPayment[];
  held: HeldPayment[];
  claimable: ClaimablePayment[];
  inReview?: InReviewPayment[];
  dismissals: Dismissal[];
  notices: LateNotice[];
  checkpoints?: Map<string, RunningAccountCheckpoint>;
  miners: Miner[];
  characterIds: number[];
  memberCharacterIds: number[];
  feeders?: MemberFeederCoverage[];
  adjustments?: Adjustment[];
  writeOffs?: RecordedWriteOff[];
  declarations?: Declaration[];
  disputes?: OreDispute[];
  toleranceExemptions?: ToleranceExemption[];
  minerPaidThrough?: Map<string, string>;
  structureNames?: Record<number, string>;
}

export function refineryNamesOf(
  notices: readonly Pick<LateNotice, 'names'>[]
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const n of notices) {
    for (const [id, name] of Object.entries(n.names?.refineryNames ?? {})) {
      const structureId = Number(id);
      if (!Number.isSafeInteger(structureId) || typeof name !== 'string') continue;
      if (name.trim() === '' || isRefineryPlaceholder(name, id)) continue;
      out[structureId] = name;
    }
  }
  return out;
}

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

const orNone = <T>(read: Promise<T>): Promise<T | null> => read.catch(() => null);

function mergeById<T extends { id: string }>(lists: readonly (readonly T[])[]): T[] {
  return [...new Map(lists.flat().map((x) => [x.id, x])).values()];
}

export async function loadCorpBooks(
  characters: readonly { characterId: number; corporationId: number }[]
): Promise<LoadedCorpBook[]> {
  return (await readCorpBooks(characters)).books;
}

export interface CorpBooksRead {
  books: LoadedCorpBook[];
  failed: number[];
}

export async function readCorpBooks(
  characters: readonly { characterId: number; corporationId: number }[]
): Promise<CorpBooksRead> {
  const remembered = await readRememberedCorps();
  const byCorp = new Map<number, { characterIds: Set<number>; members: Set<number> }>();
  const entry = (corporationId: number) => {
    const held = byCorp.get(corporationId) ?? { characterIds: new Set(), members: new Set() };
    byCorp.set(corporationId, held);
    return held;
  };
  const billed = new Set<string>();
  const unknown = new Set<number>();
  for (const c of characters) {
    entry(c.corporationId).characterIds.add(c.characterId);
    entry(c.corporationId).members.add(c.characterId);
    for (const corporationId of remembered[c.characterId] ?? []) {
      entry(corporationId).characterIds.add(c.characterId);
    }
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
      const named = book.structureNames ?? {};
      const structureNames = { ...named, ...(await namesFromEsi(book.observed, named)) };
      books.push({ ...book, structureNames, memberCharacterIds: [...members] });
      await rememberCorp(book.characterIds, corporationId);
    } catch {
      failed.push(corporationId);
    }
  }
  return { books, failed };
}

export function readBilledByPointer(d: Data | undefined): number[] {
  const books = d?.books;
  if (typeof books !== 'object' || books === null) return [];
  return Object.keys(books)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

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
  } catch {}
}

type Docs = { id: string; data: Data }[];
const docsOf = (snap: QuerySnapshot): Docs => snap.docs.map((d) => ({ id: d.id, data: d.data() }));

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
  const noticeDocs: unknown[] = [];
  const checkpoints = new Map<string, RunningAccountCheckpoint>();
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
      lateNoticeDocs,
      checkpointDocs,
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
      written(LATE_NOTICES) ? orNone(part(LATE_NOTICES, 'uids')) : Promise.resolve(null),
      written(RUNNING_ACCOUNTS) ? orNone(part(RUNNING_ACCOUNTS, 'uids')) : Promise.resolve(null),
      part('miners', 'uids'),
      orNone(part('adjustments', 'uids')),
      orNone(part('writeOffs', 'uids')),
      coverageRead,
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
    for (const d of lateNoticeDocs ?? []) noticeDocs.push({ ...d.data, id: d.id });
    for (const d of checkpointDocs ?? []) {
      const { snapshot } = d.data;
      const cp = isRecord(snapshot) ? readCheckpoint(d.id, snapshot) : null;
      if (cp) checkpoints.set(cp.minerId, cp);
    }
    miners.push(minerDocs.flatMap((d) => readMiner(d.id, d.data) ?? []));
  }
  const notices = noticesOfDocs(noticeDocs);
  const structureNames = refineryNamesOf(notices);
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
    payments,
    held,
    claimable,
    inReview,
    dismissals: mergeById(dismissals),
    notices,
    ...(checkpoints.size > 0 ? { checkpoints } : {}),
    miners: mergeById(miners),
    characterIds: [...characterIds],
    memberCharacterIds: [...characterIds],
  };
}

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

export async function declareCorpTaxBookPayment(
  characterId: number,
  {
    noticeId,
    ...input
  }: {
    corporationId: number;
    noticeId: string;
    amount?: number;
    note?: string;
    transfers?: ClaimedTransfer[];
  }
): Promise<{ declarationId: string; checks?: ClaimCheck[]; confirmed?: boolean }> {
  return underFirebaseSession(async () => {
    const payload = { ...input, [NOTICE_ID_FIELD]: noticeId };
    return callSignedIn<
      typeof payload,
      { declarationId: string; checks?: ClaimCheck[]; confirmed?: boolean }
    >(characterId, 'declareCorpTaxBookPaymentCallable', payload);
  });
}

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

const MAX_LEARNED_SYSTEMS = 50;
const reportedSystems = new Set<string>();

export async function teachRefinerySystems(
  books: readonly Pick<LoadedCorpBook, 'corporationId' | 'characterIds' | 'observed'>[],
  personal: readonly MiningLedgerEntry[]
): Promise<void> {
  for (const book of books) {
    for (const characterId of book.characterIds) {
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
        for (const [id] of fresh) reportedSystems.delete(`${book.corporationId}:${id}`);
      }
    }
  }
}
