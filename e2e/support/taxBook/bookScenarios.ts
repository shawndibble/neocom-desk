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

/**
 * The book an officer works through: one Miner per action, so each test reads one account.
 *
 * - Ada mined four days; her late notice listed the oldest three, and she declared she paid
 *   2,000,000 of it by contract (Needs you: confirm or keep the bill).
 * - Bram's 2,000,000 donation was placed on him, but it was Cora's (move it to Cora). Cora
 *   mined two days and has paid nothing.
 * - Eli is no Miner; his 3,000,000 could be Ada's or Bram's, so it waits in Needs you.
 * - Lev mined two days as a member, got a notice, and left the corp owing (write it off).
 * - Dax disputes 5,000 units of his middle day: the day is held, and his 2,000,000 pays the days
 *   either side of it (waive the disputed tax, or keep the bill).
 * - Fen mined three days; yesterday's 1,000,000 donation is already on his account (a hand
 *   record of the same transfer is refused).
 */
export function officerBook() {
  const id = (key: keyof typeof MINER) => solo(MINER[key].id);
  const seed = new BookSeed({ startBack: 40 })
    .mine(MINER.ada.id, [8, 7, 6, 5])
    .lateNotice({
      id: 'ln-ada',
      characterId: MINER.ada.id,
      days: [8, 7, 6],
      issuedBack: 4,
      token: verifyToken('ada'),
    })
    .declaration({
      id: 'dec-ada',
      noticeId: 'ln-ada',
      kind: 'contract',
      amount: 2 * DAY_TAX,
      note: 'Sent by contract to the CEO',
      back: 2,
      characterId: MINER.ada.id,
    })
    .mine(MINER.bram.id, [10, 9])
    .donation({
      id: 'j1_930001',
      characterId: MINER.bram.id,
      amount: 2 * DAY_TAX,
      back: 3,
      minerId: id('bram'),
    })
    .mine(MINER.cora.id, [9, 8])
    .donation({
      id: 'j1_930002',
      characterId: MINER.eli.id,
      amount: 3 * DAY_TAX,
      back: 2,
      reviewReason: 'ambiguous',
      ambiguousMinerIds: [id('ada'), id('bram')],
    })
    .mine(MINER.lev.id, [12, 11])
    .lateNotice({
      id: 'ln-lev',
      characterId: MINER.lev.id,
      days: [12, 11],
      issuedBack: 9,
      token: verifyToken('lev'),
    })
    .mine(MINER.dax.id, [8, 7, 6])
    .dispute({
      characterId: MINER.dax.id,
      back: 7,
      kind: 'quantity',
      reason: 'I only mined half that',
      qty: 5_000,
    })
    .donation({
      id: 'j1_930003',
      characterId: MINER.dax.id,
      amount: 2 * DAY_TAX,
      back: 1,
      minerId: id('dax'),
    })
    .mine(MINER.fen.id, [6, 5, 4])
    .donation({
      id: 'j1_930004',
      characterId: MINER.fen.id,
      amount: DAY_TAX,
      back: 1,
      minerId: id('fen'),
    });
  return {
    seed,
    id,
    ada: { owed: 4 * DAY_TAX, declared: 2 * DAY_TAX },
    bram: { paid: 2 * DAY_TAX, days: [10, 9] },
    cora: { owed: 2 * DAY_TAX },
    eli: { amount: 3 * DAY_TAX },
    lev: { owed: 2 * DAY_TAX },
    dax: { heldBack: 7, disputedTax: DAY_TAX / 2 },
    fen: { owed: 2 * DAY_TAX, donation: DAY_TAX },
  };
}
