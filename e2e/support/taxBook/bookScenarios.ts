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
