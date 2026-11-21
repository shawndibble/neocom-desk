/**
 * The pilot's own Moon Mining Tax tab against a Corp Tax Book (decision 20261120-235011, "every
 * Payee is paid oldest first"), for `miningTaxCorpBook.book.spec.ts`. The personal side's Dexie
 * rows are `personalSeed.ts`'s.
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
import {
  BookSeed,
  DAY_QTY,
  DAY_TAX,
  ORE_TYPE,
  REFINERY,
  day,
  noonOf,
  verifyToken,
} from './bookSeed';
import type { SeedDoc } from './emulator';
import { OFFICER_SCOPES, type EsiOverride } from './bookTest';
import { signedAccessToken } from './eveToken';
import { CORP, MINER, OFFICER, OTHER_CORP, corpOf, nameOf } from './identities';
import type { Page } from '@playwright/test';
import { PERSONAL_SYSTEM_ID } from './personalSeed';

export const PILOT = { id: OFFICER.id, name: OFFICER.name };
/** The pilot's alt: grouped with the pilot in the book, so its donations pay the pilot's days. */
export const PILOT_ALT = MINER.pilotAlt;
/** The pilot's Miner in the book: a group, since the alt is in it. */
export const PILOT_MINER_ID = 'm-pilot';
/** A system with no book's refinery: mining there is owed to a personal Payee. */
export const PERSONAL_SYSTEM = PERSONAL_SYSTEM_ID;
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
  /** The sender; the pilot by default. */
  from?: { id: number; name: string };
  amount: number;
  back: number;
  reason?: string;
  now?: number;
}) {
  return {
    id: p.refId,
    date: noonOf(p.back, p.now),
    ref_type: 'player_donation',
    description: `${(p.from ?? PILOT).name} deposited cash into ${p.to}'s account`,
    amount: -p.amount,
    first_party_id: (p.from ?? PILOT).id,
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
  /** The book's corporation; the pilot's own by default. */
  corporationId?: number;
  refId: number;
  characterId: number;
  amount: number;
  back: number;
  minerId?: string;
  now?: number;
}): SeedDoc {
  const id = `j1_${p.refId}`;
  return {
    path: `corps/${p.corporationId ?? CORP}/payments/${id}`,
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

/** The pilot's alt in `OTHER_CORP` (`MINER.pilotAltB`): a Character the pilot holds in Neocom Desk too. */
export const ALT_B = MINER.pilotAltB;
export { OTHER_CORP };

/**
 * Adds the pilot's alt as a tracked Character of the app's database (the app must have opened it
 * already: sign in first). Its token is one the server verifies, so the tab reads the alt's own
 * lines as they would be, and its corporation is recorded as ESI's affiliation answers it.
 */
export async function seedTrackedAlt(page: Page, alt = ALT_B, corporationId = OTHER_CORP) {
  const accessToken = signedAccessToken({
    characterId: alt.id,
    name: alt.name,
    ownerHash: 'OWNERHASH-ALT',
    scopes: OFFICER_SCOPES,
  });
  await page.evaluate(
    async (seed) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['characters', 'tokens'], 'readwrite');
        tx.objectStore('characters').put({
          characterId: seed.id,
          name: seed.name,
          ownerHash: 'OWNERHASH-ALT',
          addedAt: Date.now(),
          corporationId: seed.corporationId,
        });
        tx.objectStore('tokens').put({
          characterId: seed.id,
          accessToken: seed.accessToken,
          refreshToken: 'fake-refresh',
          expiresAt: Date.now() + 3_600_000 * 24,
          scopes: seed.scopes,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { ...alt, corporationId, accessToken, scopes: [...OFFICER_SCOPES] }
  );
}

/** Answers a held Character's mining ledger and wallet journal (the alt's counterpart of `pilotEsi`). */
export function characterEsi(
  characterId: number,
  p: { mining: ReturnType<typeof miningLedger>; journal?: ReturnType<typeof donationSent>[] }
): EsiOverride {
  return (path: string) => {
    if (path === `/characters/${characterId}/mining`) return p.mining;
    if (path === `/characters/${characterId}/wallet/journal`) return p.journal ?? [];
    // The rest of what a held Character's boot reads: who they are, no roles, no contracts.
    if (path === `/characters/${characterId}`)
      return { name: nameOf(characterId), corporation_id: corpOf(characterId) };
    if (path === `/characters/${characterId}/roles`) return { roles: [] };
    if (path === `/characters/${characterId}/contracts`) return [];
    // What the header's widgets read for the Character a page switches to.
    if (path === `/characters/${characterId}/skillqueue`) return [];
    if (path === `/characters/${characterId}/clones`) return { jump_clones: [] };
    if (path === `/characters/${characterId}/location`) return { solar_system_id: 30000142 };
    return undefined;
  };
}

/**
 * A book the pilot and the officers write to each other in (`corpTaxBookNotes.book.spec.ts`): the
 * pilot's group mined two days a month ago, listed on a late notice that is now overdue, and
 * three days this week, still billed.
 */
export function notesBook() {
  const oldDays = [30, 29];
  const newDays = [6, 5, 4];
  const seed = new BookSeed({ startBack: 60 })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, [...oldDays, ...newDays])
    .lateNotice({
      id: 'ln-pilot',
      characterId: PILOT.id,
      minerId: PILOT_MINER_ID,
      days: oldDays,
      issuedBack: 25,
      token: verifyToken('pilot-notes'),
    });
  return {
    seed,
    owed: (oldDays.length + newDays.length) * DAY_TAX,
    esi: pilotEsi({ mining: miningLedger([...oldDays, ...newDays]) }),
  };
}
