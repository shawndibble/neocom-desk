/**
 * The books the Corp Tax Book specs open, each built once here and shared: a spec names the
 * scenario and reads its facts (who owes what, from which day), never builds data inline.
 * Every figure follows from `bookSeed.ts`'s flat pricing: one ordinary mined day owes `DAY_TAX`.
 */
import { BookSeed, DAY_TAX, verifyToken } from './bookSeed';
import { MINER, solo } from './identities';

/**
 * A book with months of history, from before Late notices moved out of `statements`: its
 * notices are only in the legacy collection (`kind: 'notice'`), none in `lateNotices`.
 *
 * - Ada mined ten days over four months. 7 days' tax came in at once a month ago, so she owes the
 *   three newest. Her August notice is settled; her November one is open.
 * - Bram mined three days in September, got a notice, and paid it exactly: paid through his last.
 * - Cora mined two days last week and has had no notice.
 */
export function historyBook() {
  const ada = { days: [100, 99, 98, 70, 69, 40, 39, 10, 9, 8], paid: 7 * DAY_TAX };
  const notices = {
    adaAugust: { id: 'st-ada-aug', days: [100, 99, 98], issuedBack: 90 },
    adaNovember: { id: 'st-ada-nov', days: [10, 9], issuedBack: 5 },
    bram: { id: 'st-bram-sep', days: [60, 59, 58], issuedBack: 50 },
  };
  const tokens = {
    adaNovember: verifyToken('ada-nov-legacy'),
    adaAugust: verifyToken('ada-aug-legacy'),
    bram: verifyToken('bram-legacy'),
  };
  const seed = new BookSeed({ startBack: 130 })
    .mine(MINER.ada.id, ada.days)
    .donation({
      id: 'j1_910001',
      characterId: MINER.ada.id,
      amount: ada.paid,
      back: 30,
      minerId: solo(MINER.ada.id),
    })
    .legacyNotice({ ...notices.adaAugust, characterId: MINER.ada.id, token: tokens.adaAugust })
    .legacyNotice({ ...notices.adaNovember, characterId: MINER.ada.id, token: tokens.adaNovember })
    .mine(MINER.bram.id, [60, 59, 58])
    .donation({
      id: 'j1_910002',
      characterId: MINER.bram.id,
      amount: 3 * DAY_TAX,
      back: 45,
      minerId: solo(MINER.bram.id),
    })
    .legacyNotice({ ...notices.bram, characterId: MINER.bram.id, token: tokens.bram })
    .mine(MINER.cora.id, [5, 4]);
  return {
    seed,
    notices,
    tokens,
    /** Ada owes her three newest days. */
    adaOwes: { amount: 3 * DAY_TAX, days: 3, oldestBack: 10 },
    /** Bram is paid through his last mined day. */
    bramPaidThroughBack: 58,
    coraOwes: { amount: 2 * DAY_TAX, days: 2, oldestBack: 5 },
  };
}

/**
 * One Miner (Ada) and one donation, to watch where money lands on the Running account. She mined
 * two ordinary days (6 and 5 days ago, `DAY_TAX` each), unless the case adds a second refinery.
 * The donation came in 2 days ago with her payment code, so the server placed it on her.
 */
export type PaymentCase = 'exact' | 'shortWithinTolerance' | 'shortBeyondTolerance' | 'over';

/** What the book's 0.5% per-day tolerance forgives on one `DAY_TAX` day. */
export const DAY_TOLERANCE = DAY_TAX * 0.005;

const PAID: Record<PaymentCase, number> = {
  exact: DAY_TAX,
  // 4,000 short of two days: within the second day's 5,000 tolerance.
  shortWithinTolerance: 2 * DAY_TAX - 4_000,
  shortBeyondTolerance: 1.5 * DAY_TAX,
  over: 2.5 * DAY_TAX,
};

export function paymentBook(kind: PaymentCase) {
  const minerId = solo(MINER.ada.id);
  const paid = PAID[kind];
  const seed = new BookSeed({ startBack: 30 })
    .mine(MINER.ada.id, [6, 5])
    .donation({ id: 'j1_920001', characterId: MINER.ada.id, amount: paid, back: 2, minerId });
  return { seed, minerId, paid, oldestBack: 6, newestBack: 5 };
}

/**
 * Ada mined at two refineries on the same date (6 days ago), and one ordinary day after. One
 * donation pays exactly that date's two lines: the date settles as one, the next stays owed.
 */
export function twoRefineriesBook() {
  const minerId = solo(MINER.ada.id);
  const seed = new BookSeed({ startBack: 30 })
    .mine(MINER.ada.id, [
      { back: 6, refinery: 'alpha' },
      { back: 6, refinery: 'beta' },
      { back: 5, refinery: 'alpha' },
    ])
    .donation({
      id: 'j1_920002',
      characterId: MINER.ada.id,
      amount: 2 * DAY_TAX,
      back: 2,
      minerId,
    });
  return { seed, minerId, sharedBack: 6, owedBack: 5 };
}
