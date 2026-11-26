import { bookInteractions } from './corpBookInteractions';
import { loadCorpFacts } from './corpFacts';
import { summarizeCorpInteractions } from './corpSummary';
import {
  corpContractInteractions,
  corpKillInteractions,
  corpWalletInteractions,
} from './corpOtherInteractions';
import type { CorpSource } from './sourceTypes';

const corpBookSource: CorpSource = async (q) => {
  const book = await loadCorpFacts(q).book();
  return book ? bookInteractions(book, q.t) : [];
};

const corpWalletSource: CorpSource = async (q) => {
  const facts = loadCorpFacts(q);
  const [rows, book] = await Promise.all([facts.journal(), facts.book()]);
  const bookPaymentIds = new Set(book?.payments.map((p) => p.id));
  return corpWalletInteractions(rows, q.otherId, bookPaymentIds, q.t);
};

const corpContractSource: CorpSource = async (q) =>
  corpContractInteractions(await loadCorpFacts(q).contracts(), q.otherId, q.t);

const corpKillSource: CorpSource = async (q) =>
  corpKillInteractions(await loadCorpFacts(q).kills(), q.t);

export const corpSources: readonly CorpSource[] = [
  corpBookSource,
  corpWalletSource,
  corpContractSource,
  corpKillSource,
];

export async function loadCorpSummary(q: Parameters<CorpSource>[0], now = Date.now()) {
  const facts = loadCorpFacts(q);
  const [book, kills, isMember] = await Promise.all([
    facts.book(),
    facts.kills(),
    facts.isMember(),
  ]);
  return summarizeCorpInteractions({
    book,
    kills,
    isMember: isMember || book?.standing === 'member',
    now,
  });
}
