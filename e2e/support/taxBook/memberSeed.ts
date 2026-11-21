/**
 * Phase-2 fixtures: the pilot's own Moon Mining Tax tab against a Corp Tax Book (decision
 * 20261120-235011, "every Payee is paid oldest first"). Not used by a spec yet: the member side is
 * being rebuilt, so these hold only what will not change with its UI.
 *
 * - The corp book (Firestore, the server's layout) the pilot's corp-book Payee reads.
 * - What ESI tells the pilot's tab: their mining ledger and wallet journal, served on the network
 *   (never written into Dexie's `esiCache`, whose shape belongs to the app).
 *
 * The pilot is the suite's signed-in Character (`fixtureData.ts`), here as a Miner of their own
 * corporation's book: `signInAsOfficer` signs them in. The book's refinery is in
 * `REFINERY.alpha.systemId`; mining in `PERSONAL_SYSTEM` is no book's, so it is owed to the
 * pilot's personal Payee.
 */
import { BookSeed, DAY_QTY, DAY_TAX, ORE_TYPE, REFINERY, day, noonOf } from './bookSeed';
import type { SeedDoc } from './emulator';
import type { EsiOverride } from './bookTest';
import { CORP, MINER, OFFICER } from './identities';

export const PILOT = { id: OFFICER.id, name: OFFICER.name };
/** The pilot's alt: grouped with the pilot in the book, so its donations pay the pilot's days. */
export const PILOT_ALT = MINER.pilotAlt;
/** The pilot's Miner in the book: a group, since the alt is in it. */
export const PILOT_MINER_ID = 'm-pilot';
/** A system with no book's refinery: mining there is owed to a personal Payee. */
export const PERSONAL_SYSTEM = 30000144;
/** The personal Payee: a real character in EVE, as every Payee is. */
export const PERSONAL_PAYEE = { ...MINER.rook, taxPct: 10 };

/** One ESI mining-ledger row (`MiningLedgerRow`) per day, `DAY_QTY` of `ORE_TYPE`. */
export function miningLedger(
  days: readonly number[],
  solarSystemId: number = REFINERY.alpha.systemId,
  now = Date.now()
) {
  return days.map((back) => ({
    date: day(back, now),
    quantity: DAY_QTY,
    solar_system_id: solarSystemId,
    type_id: ORE_TYPE,
  }));
}

/** A `player_donation` the pilot sent (`WalletJournalEntry`): ISK leaving the wallet is negative. */
export function donationSent(p: {
  refId: number;
  to: number;
  amount: number;
  back: number;
  reason?: string;
  now?: number;
}) {
  return {
    id: p.refId,
    date: noonOf(p.back, p.now),
    ref_type: 'player_donation',
    description: `${PILOT.name} deposited cash into ${p.to}'s account`,
    amount: -p.amount,
    first_party_id: PILOT.id,
    second_party_id: p.to,
    ...(p.reason ? { reason: p.reason } : {}),
  };
}

/** Answers the pilot's mining ledger and wallet journal (pass to the `esi` fixture). */
export function pilotEsi(p: {
  mining: ReturnType<typeof miningLedger>;
  journal?: ReturnType<typeof donationSent>[];
}): EsiOverride {
  return (path: string) => {
    if (path === `/characters/${PILOT.id}/mining`) return p.mining;
    if (path === `/characters/${PILOT.id}/wallet/journal`) return p.journal ?? [];
    return undefined;
  };
}

/**
 * The pilot's corp book: the pilot and their alt are one Miner (`m-pilot`). The pilot mined
 * `bookDays` at the book's refinery; the book has none of their personal-Payee mining.
 */
export function memberBook(bookDays: readonly number[] = [6, 5, 4]) {
  const seed = new BookSeed({ startBack: 40 })
    .group(PILOT_MINER_ID, [PILOT.id, PILOT_ALT.id])
    .mine(PILOT.id, bookDays);
  return {
    seed,
    bookDays,
    owed: bookDays.length * DAY_TAX,
    personalDays: [5, 4],
    /** The pilot's ESI: book days at the refinery, personal days elsewhere. */
    esi: (journal: ReturnType<typeof donationSent>[] = []) =>
      pilotEsi({
        mining: [...miningLedger(bookDays), ...miningLedger([5, 4], PERSONAL_SYSTEM)],
        journal,
      }),
  };
}

/** Settle up's three outcomes on the corp-book Payee of `memberBook()` (three days owed). */
export const SETTLE_UP = {
  exact: 3 * DAY_TAX,
  short: 2.5 * DAY_TAX,
  over: 3.5 * DAY_TAX,
} as const;

/**
 * The book's record of a donation, as the server stores it once a sync brings it in: what turns
 * a donation the pilot's tab shows "in flight" into one the book credits. Write it mid-test with
 * `book.seed([creditedDonation(...)])`.
 */
export function creditedDonation(p: {
  refId: number;
  characterId: number;
  amount: number;
  back: number;
  minerId?: string;
  now?: number;
}): SeedDoc {
  const id = `j1_${p.refId}`;
  return {
    path: `corps/${CORP}/payments/${id}`,
    data: {
      id,
      source: 'donation',
      characterId: p.characterId,
      uid: `char:${p.characterId}`,
      amount: p.amount,
      at: noonOf(p.back, p.now),
      division: 1,
      minerId: p.minerId ?? PILOT_MINER_ID,
    },
  };
}
