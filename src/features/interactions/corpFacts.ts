/**
 * Show Info › Interactions, Corporation scope: the loading. Everything here reads only what the
 * viewer's account can already see on the corp pages; a read the account is not allowed (no role,
 * no grant, no book) resolves to nothing, never an error. Sources and the stat chips share one
 * load per player, kept briefly so opening the tab twice does not read twice.
 */
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { minerIdFor, type Miner } from '@/engine/corpTaxBook/charges';
import { buildBookView, minerDetail } from '@/engine/corpTaxBook/bookView';
import type { Contract } from '@/esi/endpoints';
import { resolveAffiliations } from '@/features/character/affiliations';
import { loadCorporationContracts } from '@/features/corp/contracts';
import { bookViewInputOf, loadBookPrices } from '@/features/corp/moons/bookViewOf';
import { verifyOfficer } from '@/features/corp/taxBook/bookClient';
import { bookPartsFor, readBook } from '@/features/corp/taxBook/bookRead';
import { openBook } from '@/features/corp/taxBook/openBook';
import { loadCorporationWalletJournal } from '@/features/corp/wallet';
import { readSrpHistory } from '@/features/corp/srpOfficerClient';
import { DAY_MS, MINUTE_MS } from '@/lib/age';
import { fetchPilotInvolvements } from '@/lib/zkillboard';
import type { BookFacts } from './corpBookInteractions';
import { classifyCorpKills, type CorpJournalRow, type CorpKill } from './corpOtherInteractions';
import type { CorpQuery } from './sourceTypes';

/** The seven corp wallet divisions. */
const DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;
/** Only recent killmails are matched against the corp's roster: affiliations cost a request per 1000 ids. */
const KILL_WINDOW_MS = 365 * DAY_MS;
const FACTS_TTL_MS = 5 * MINUTE_MS;

const settled = async <T>(work: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await work();
  } catch {
    return fallback;
  }
};

/**
 * The Miner the player's characters bill under: the shared rule (`minerIdFor`), so of two
 * groupings that list the character the earliest wins, as everywhere else; else the solo Miner.
 */
async function billedMinerOf(characterId: number, corporationId: number, otherId: number) {
  const solo = `solo:${otherId}`;
  try {
    const book = await openBook(characterId, corporationId);
    if (!book) return solo;
    const snap = await getDocs(
      query(
        collection(book.db, 'corps', String(corporationId), 'miners'),
        where('characterIds', 'array-contains', otherId)
      )
    );
    return minerIdFor(
      otherId,
      snap.docs.map((d) => ({ ...(d.data() as Miner), id: d.id }))
    );
  } catch {
    return solo;
  }
}

async function readBookFacts(
  characterId: number,
  corporationId: number,
  otherId: number
): Promise<BookFacts | null> {
  const verdict = await verifyOfficer(characterId, corporationId);
  if (!verdict.canView || !verdict.bookActive) return null;
  const minerId = await billedMinerOf(characterId, corporationId, otherId);
  const read = await readBook(characterId, corporationId, {
    parts: bookPartsFor('miners', 'miner'),
    minerId,
  });
  if (!read?.settings.active) return null;
  const prices = await loadBookPrices(read, read.minerScope?.from);
  const view = buildBookView(
    bookViewInputOf(corporationId, new Date().toISOString(), read, prices)
  );
  const detail = minerDetail(view, minerId);
  const inner = view.internals.byMiner.get(minerId);
  if (!detail || !inner) return null;
  const paidDays = new Set(
    detail.paymentDays.filter((p) => p.days.length > 0).map((p) => p.paymentId)
  );

  return {
    minerId,
    standing: detail.row.standing,
    owed: detail.row.owed,
    notices: detail.notices.map((n) => ({
      id: n.id,
      issuedAt: n.issuedAt,
      from: n.lines[0]?.date ?? n.issuedAt.slice(0, 10),
      to: n.lines.at(-1)?.date ?? n.issuedAt.slice(0, 10),
      listed: n.listed,
      mailsSent: n.mail.sent,
      settled: inner.account.standingOf(n).settled,
    })),
    payments: detail.payments.map((p) => ({
      id: p.id,
      at: p.at,
      amount: p.amount,
      paidDays: paidDays.has(p.id),
    })),
    adjustments: view.input.adjustments
      .filter((a) => a.minerId === minerId && !a.reversed)
      .map((a) => ({ id: a.id, date: a.date, at: a.at, amount: a.amount, reason: a.reason })),
    days: detail.days
      .filter((d) => d.status !== 'dismissed' && d.status !== 'not-billable')
      .map((d) => ({
        date: d.date,
        tax: d.tax,
        // A day a dispute holds owes nothing yet, but is not paid.
        settled: d.status === 'paid' || (d.status === 'owed' && d.owed === 0 && !d.disputed),
      })),
  };
}

export interface CorpFacts {
  book: () => Promise<BookFacts | null>;
  /** Corp wallet journal rows, every division the account may read. */
  journal: () => Promise<CorpJournalRow[]>;
  contracts: () => Promise<Contract[]>;
  /** Whether the player is in the corp now; false when ESI cannot say. */
  isMember: () => Promise<boolean>;
  /** Killmails with corp members; none for a member. */
  kills: () => Promise<CorpKill[]>;
}

const once = <T>(work: () => Promise<T>): (() => Promise<T>) => {
  let started: Promise<T> | undefined;
  return () => (started ??= work());
};

const held = new Map<string, { at: number; facts: CorpFacts }>();

export function loadCorpFacts(
  q: Pick<CorpQuery, 'otherId' | 'corporationId' | 'characterIds'>
): CorpFacts {
  const key = `${q.corporationId}:${q.otherId}:${[...q.characterIds].sort().join(',')}`;
  const cached = held.get(key);
  if (cached && Date.now() - cached.at < FACTS_TTL_MS) return cached.facts;

  const book = once(async () => {
    for (const characterId of q.characterIds) {
      const facts = await settled(
        () => readBookFacts(characterId, q.corporationId, q.otherId),
        null
      );
      if (facts) return facts;
    }
    return null;
  });

  const journal = once(async () => {
    const rows: CorpJournalRow[] = [];
    await Promise.all(
      DIVISIONS.map(async (division) => {
        for (const characterId of q.characterIds) {
          const read = await settled(
            () => loadCorporationWalletJournal(characterId, q.corporationId, division),
            null
          );
          if (read?.cached) {
            for (const entry of read.cached.data) rows.push({ division, entry });
            return;
          }
        }
      })
    );
    return rows;
  });

  const contracts = once(async () => {
    for (const characterId of q.characterIds) {
      const read = await settled(
        () => loadCorporationContracts(characterId, q.corporationId),
        null
      );
      if (read?.cached) return read.cached.data;
    }
    return [];
  });

  const isMember = once(async () =>
    settled(async () => {
      const answers = await resolveAffiliations([q.otherId]);
      return answers.get(q.otherId)?.corporation_id === q.corporationId;
    }, false)
  );

  const kills = once(async () => {
    if (await isMember()) return [];
    const involved = await settled(() => fetchPilotInvolvements(q.otherId), null);
    if (!involved?.ok) return [];
    const since = Date.now() - KILL_WINDOW_MS;
    const recent = (k: { timeMs: number }) => k.timeMs >= since;
    const kills = involved.kills.filter(recent);
    const losses = involved.losses.filter(recent);
    const ids = [
      ...kills.flatMap((k) => (k.victimCharacterId === null ? [] : [k.victimCharacterId])),
      ...losses.flatMap((k) => k.attackerCharacterIds),
    ];
    const answers = await settled(() => resolveAffiliations(ids), new Map());
    const isCorp = (id: number) => answers.get(id)?.corporation_id === q.corporationId;
    let srpPaid = new Set<number>();
    const found = classifyCorpKills({ kills, losses }, isCorp);
    if (found.some((k) => k.side === 'weLost')) {
      for (const characterId of q.characterIds) {
        const claims = await settled(() => readSrpHistory(characterId, q.corporationId, 200), null);
        if (claims) {
          srpPaid = new Set(claims.filter((c) => c.state === 'paid').map((c) => c.killmailId));
          break;
        }
      }
    }
    return classifyCorpKills({ kills, losses }, isCorp, srpPaid);
  });

  const facts: CorpFacts = { book, journal, contracts, isMember, kills };
  held.set(key, { at: Date.now(), facts });
  return facts;
}
