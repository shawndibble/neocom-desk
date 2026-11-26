import { snapshotThroughFor } from '../../../functions/src/corpTaxBookCheckpoint';
import { BookSeed, DAY_TAX, day, verifyToken } from './bookSeed';
import { MINER, OFFICER, solo } from './identities';

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
    .lateNotice({ ...notices.adaAugust, characterId: MINER.ada.id, token: tokens.adaAugust })
    .lateNotice({ ...notices.adaNovember, characterId: MINER.ada.id, token: tokens.adaNovember })
    .mine(MINER.bram.id, [60, 59, 58])
    .donation({
      id: 'j1_910002',
      characterId: MINER.bram.id,
      amount: 3 * DAY_TAX,
      back: 45,
      minerId: solo(MINER.bram.id),
    })
    .lateNotice({ ...notices.bram, characterId: MINER.bram.id, token: tokens.bram })
    .mine(MINER.cora.id, [5, 4]);
  return {
    seed,
    notices,
    tokens,
    adaOwes: { amount: 3 * DAY_TAX, days: 3, oldestBack: 10 },
    bramPaidThroughBack: 58,
    coraOwes: { amount: 2 * DAY_TAX, days: 2, oldestBack: 5 },
  };
}

export type PaymentCase = 'exact' | 'shortWithinTolerance' | 'shortBeyondTolerance' | 'over';

export const DAY_TOLERANCE = DAY_TAX * 0.005;

const PAID: Record<PaymentCase, number> = {
  exact: DAY_TAX,
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

export function lateNoticeBook() {
  const tokens = {
    ada: verifyToken('ada-current'),
    bram: verifyToken('bram-old-style'),
    guest: verifyToken('guest'),
  };
  const coraDays = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
  const seed = new BookSeed({ startBack: 40 })
    .mine(MINER.cora.id, coraDays)
    .mine(MINER.ada.id, [9, 8, 7])
    .lateNotice({
      id: 'ln-ada',
      characterId: MINER.ada.id,
      days: [9, 8, 7],
      issuedBack: 3,
      token: tokens.ada,
    })
    .mine(MINER.bram.id, [12, 11])
    .lateNotice({
      id: 'st-bram',
      characterId: MINER.bram.id,
      days: [12, 11],
      issuedBack: 5,
      token: tokens.bram,
    })
    .mine(MINER.guest.id, [9, 8, 4, 3])
    .lateNotice({
      id: 'ln-guest',
      characterId: MINER.guest.id,
      days: [9, 8],
      issuedBack: 6,
      token: tokens.guest,
    });
  return {
    seed,
    tokens,
    cora: { owed: coraDays.length * DAY_TAX, days: coraDays.length, oldestBack: 20 },
    ada: { owed: 3 * DAY_TAX },
    bram: { owed: 2 * DAY_TAX },
    guest: { unlisted: 2 * DAY_TAX, unlistedFromBack: 4, unlistedThroughBack: 3 },
  };
}

export function closedMonthBook(how: { checkpointed?: boolean } = {}) {
  const minerId = solo(MINER.ada.id);
  const seed = new BookSeed({ startBack: 130 }).mine(MINER.ada.id, [100, 99, 98, 20, 10]).donation({
    id: 'j1_940001',
    characterId: MINER.ada.id,
    amount: 2 * DAY_TAX,
    back: 95,
    minerId,
  });
  const checkpoint = {
    minerId,
    through: snapshotThroughFor(day(0, seed.now)),
    owed: [{ date: day(98, seed.now), remaining: DAY_TAX, tax: DAY_TAX, credited: 0 }],
    credit: 0,
    balance: DAY_TAX,
    paidThrough: day(99, seed.now),
    characterIds: [MINER.ada.id],
  };
  if (how.checkpointed) {
    seed.raw('accounts', minerId, {
      minerId,
      snapshot: { ...checkpoint, at: new Date(seed.now).toISOString(), by: OFFICER.id },
    });
  }
  return {
    seed,
    minerId,
    checkpoint,
    owed: 3 * DAY_TAX,
    days: 3,
    oldestBack: 98,
    paid: 2 * DAY_TAX,
  };
}
