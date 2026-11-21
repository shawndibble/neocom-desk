// Firestore side of donation matching (corpTaxBookDonationMatch.ts): what the resolver needs to
// decide whose money a set of senders' donations are, read from the book. Every donation the
// server stores goes through it, whichever sync sent it (decision 20261120-235011).

import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { chunk, IN_QUERY_LIMIT } from './chunk.js';
import {
  RUNNING_ACCOUNTS,
  BILLED_BY_COLLECTION,
  FEEDERS,
  MINERS,
  OBSERVED,
  PAYMENTS,
} from './corpTaxBook.js';
import { isDayCovered, type CoveragePeriod } from './corpTaxBookEngine.js';

/** How many of a sender's stored rows are looked at for one the book bills. */
const SEEN_ROWS = 50;
import {
  codesIn,
  matchBookOf,
  soloMinerId,
  type MatchBook,
  type MatchMiner,
} from './corpTaxBookDonationMatch.js';
import { dbReader, readNotices } from './corpTaxBookLateNoticeStore.js';

/**
 * The resolver's view of the book for these senders: the groupings, every code (each notice's,
 * and the own code of each Miner the book knows: grouped, with a recorded account, named by a
 * notice, or a sender seen mining), which senders the book has seen mine (`mined` already known,
 * else a stored row the book bills), and the Miners each sender's earlier payments named.
 */
export async function loadMatchBook(
  db: Firestore,
  corporationId: number,
  donations: readonly { characterId?: number; reason?: string }[],
  mined: Iterable<number> = []
): Promise<MatchBook> {
  const senderIds = donations.flatMap((d) =>
    typeof d.characterId === 'number' ? [d.characterId] : []
  );
  const book = db.collection('corps').doc(String(corporationId));
  const [minerSnap, notices, accounts] = await Promise.all([
    book.collection(MINERS).get(),
    readNotices(dbReader(db), book),
    book.collection(RUNNING_ACCOUNTS).select().get(),
  ]);
  const miners: MatchMiner[] = minerSnap.docs.map((d) => ({
    id: d.id,
    characterIds: (d.get('characterIds') as number[] | undefined) ?? [],
    ...(Array.isArray(d.get('aliases')) ? { aliases: d.get('aliases') as string[] } : {}),
    ...(typeof d.get('createdAt') === 'string' ? { createdAt: d.get('createdAt') as string } : {}),
  }));
  const grouped = new Set(miners.flatMap((m) => m.characterIds));
  const minedCharacterIds = new Set(mined);
  const senders = [...new Set(senderIds)];
  // A sender grouped already is theirs; one not seen in this read is looked for in the stored
  // rows the book bills: its own refineries', and a moon owner's on a day its coverage holds.
  const unseen = senders.filter((c) => !grouped.has(c) && !minedCharacterIds.has(c));
  if (unseen.length > 0) {
    const feeders = await book.collection(FEEDERS).get();
    const coverage = new Map(
      feeders.docs.map((d) => [Number(d.id), d.get('coveragePeriods') as CoveragePeriod[]])
    );
    await Promise.all(
      unseen.map(async (c) => {
        const rows = await book
          .collection(OBSERVED)
          .where('characterId', '==', c)
          .select('sourceCorporationId', 'date')
          .limit(SEEN_ROWS)
          .get();
        const billed = rows.docs.some((d) => {
          const source = d.get('sourceCorporationId') as number | undefined;
          return (
            source === undefined ||
            source === corporationId ||
            isDayCovered(coverage.get(source) ?? [], d.get('date') as string)
          );
        });
        if (billed) minedCharacterIds.add(c);
      })
    );
  }
  const paidBefore = new Map<number, string[]>();
  for (const ids of chunk(senders, IN_QUERY_LIMIT)) {
    const snap = await book
      .collection(PAYMENTS)
      .where('characterId', 'in', ids)
      .select('characterId', 'minerId')
      .get();
    for (const d of snap.docs) {
      const minerId = d.get('minerId');
      const characterId = d.get('characterId');
      if (typeof minerId !== 'string' || typeof characterId !== 'number') continue;
      const held = paidBefore.get(characterId) ?? [];
      if (!held.includes(minerId)) paidBefore.set(characterId, [...held, minerId]);
    }
  }
  const recorded = accounts.docs.map((d) => d.id);
  const ofBook = (recordedMinerIds: string[]) =>
    matchBookOf({ miners, notices, minedCharacterIds, recordedMinerIds, paidBefore });
  const first = ofBook(recorded);
  // A code none of those names may be a solo Miner's the book bills but holds no record of yet:
  // only then are the Characters it bills read (their billed-by pointers name the book).
  if (!donations.some((d) => codesIn(d.reason).some((c) => !first.codes.has(c)))) return first;
  const billed = await db
    .collection(BILLED_BY_COLLECTION)
    .where(new FieldPath('books', String(corporationId)), '>', 0)
    .select()
    .get();
  const solos = billed.docs.flatMap((d) => {
    const character = /^char:(\d+)$/.exec(d.id);
    return character ? [soloMinerId(Number(character[1]))] : [];
  });
  return ofBook([...recorded, ...solos]);
}
