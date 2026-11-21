/**
 * The pilot's books and personal Payees together (`miningTaxMixed.book.spec.ts`): the same ore
 * claimed by a corporation's book and a personal Payee, a corporation with no book beside one
 * with, a pilot in two books, a corporation that starts its book over personal history.
 *
 * Each scenario returns what to seed (`docs`, `personal`, ESI answers) and the figures that follow
 * from `bookSeed.ts`'s flat pricing, so a spec reads facts, never builds data inline. `openMixed`
 * signs the pilot in, adds a held alt and the personal rows, and lands on the Tax tab.
 */
import type { Page } from '@playwright/test';
import { BookSeed, DAY_TAX, REFINERY, day, verifyToken } from './bookSeed';
import type { SeedDoc } from './emulator';
import { signInAsOfficer, type EsiOverride } from './bookTest';
import { CORP, MINER, solo } from './identities';
import {
  ALT_B,
  OTHER_CORP,
  PERSONAL_SYSTEM,
  PILOT,
  PILOT_ALT,
  PILOT_MINER_ID,
  characterEsi,
  miningLedger,
  pilotEsi,
  seedTrackedAlt,
} from './memberSeed';
import {
  ROOK,
  ROOK_PAYEE_ID,
  assignment,
  paymentLink,
  payeeRecord,
  seedPersonal,
  type PersonalData,
} from './personalSeed';

/** A corporation with no book on Neocom Desk, which the pilot pays moon tax to as a personal Payee. */
export const CINDER = { id: 98_000_777, name: 'Cinder Mining Corp' };
export const CINDER_PAYEE_ID = 'p-cinder';
/** The book B Miner the pilot's alt is grouped into, with a corp mate the pilot has not added. */
export const PROSPECTOR_MINER_ID = 'm-prospector';

export interface Scenario {
  docs: SeedDoc[];
  personal?: PersonalData;
  /** More ESI answers, tried in order before the defaults (`esi(...)`). */
  esi: EsiOverride[];
  /** Adds the alt (`ALT_B`) as a held Character. */
  alt?: boolean;
}

/** Seeds a scenario, signs the pilot in and opens the Tax tab (reloaded once the personal rows are in). */
export async function openMixed(
  page: Page,
  scenario: Scenario,
  book: { seed: (docs: readonly SeedDoc[]) => Promise<void> },
  esi: (answer: EsiOverride) => void,
  path = './mining/tax'
): Promise<void> {
  await book.seed(scenario.docs);
  for (const answer of [...scenario.esi].reverse()) esi(answer);
  await signInAsOfficer(page, path);
  if (scenario.alt) await seedTrackedAlt(page);
  if (scenario.personal) await seedPersonal(page, scenario.personal);
  if (scenario.alt || scenario.personal) await page.reload();
}

const rook = (over: Partial<Parameters<typeof payeeRecord>[0]> = {}) =>
  payeeRecord({
    id: ROOK_PAYEE_ID,
    characterId: PILOT.id,
    name: ROOK.name,
    entityId: ROOK.id,
    ...over,
  });

/**
 * One system, two claimants. Rook is the pilot's Default System Payee for the book's refinery
 * system, so ore there is given to Rook only until a book bills it.
 *
 * - day 6: the book recorded 6,000 of the 10,000 units mined: it bills those, Rook keeps 4,000.
 * - day 4: at a refinery of the book's no Default Payee covers, the book recorded 6,000 of 10,000:
 *   the other 4,000 is Unattributed.
 *
 * `locked` adds a day before the lock date to the book (a long history).
 */
export function overlapScenario(p: { locked?: boolean; journal?: Journal } = {}) {
  const seed = new BookSeed({ startBack: p.locked ? 130 : 40 })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, [
      ...(p.locked ? [{ back: 100 }] : []),
      { back: 6, qty: 6000 },
      { back: 4, qty: 6000, refinery: 'beta' as const },
    ]);
  const scenario: Scenario = {
    docs: seed.docs(),
    esi: [
      pilotEsi({
        mining: [...miningLedger([6]), ...miningLedger([4], REFINERY.beta.systemId)],
        journal: p.journal ?? [],
      }),
    ],
    personal: {
      payees: [rook({ defaultSystemId: REFINERY.alpha.systemId })],
      assignments: [
        assignment({
          characterId: PILOT.id,
          payeeId: ROOK_PAYEE_ID,
          back: 6,
          systemId: REFINERY.alpha.systemId,
          override: false,
        }),
      ],
    },
  };
  return {
    ...scenario,
    /** The book bills 6,000 of day 6 and of day 4, and day 100 whole when `locked`. */
    bookOwes: (p.locked ? DAY_TAX : 0) + 2 * 0.6 * DAY_TAX,
    bookDays: p.locked ? 3 : 2,
    /** Rook keeps the 4,000 units of day 6 the book did not record. */
    rookOwes: 0.4 * DAY_TAX,
    /** The ore of day 4 no one claims. */
    unattributedValue: 0.4 * DAY_QTY_VALUE,
    minerId: PILOT_MINER_ID,
  };
}
const DAY_QTY_VALUE = DAY_TAX * 10;

/**
 * The pilot gave day 5's ore to Rook by hand; the book recorded the same ore. A Conflict: not owed
 * to the book while it stands, resolving to the corporation 14 days after the day closed.
 */
export function conflictScenario() {
  const seed = new BookSeed({ startBack: 40 })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, [5]);
  const scenario: Scenario = {
    docs: seed.docs(),
    esi: [pilotEsi({ mining: miningLedger([5]) })],
    personal: {
      payees: [rook()],
      assignments: [
        assignment({
          characterId: PILOT.id,
          payeeId: ROOK_PAYEE_ID,
          back: 5,
          systemId: REFINERY.alpha.systemId,
        }),
      ],
    },
  };
  return { ...scenario, minerId: PILOT_MINER_ID, rookOwes: DAY_TAX };
}

/**
 * The pilot's book owes three days (days 6, 5, 4 at its refinery); Cinder Mining Corp, a corporation
 * with no book on Neocom Desk, is a personal Payee owed three days of Jita mining. Wallet:
 * a donation to Cinder, and one to the book's corporation with the Miner's code.
 */
export function twoPayeesScenario() {
  const bookDays = [6, 5, 4];
  const seed = new BookSeed({ startBack: 40 })
    .group(PILOT_MINER_ID, [PILOT.id, PILOT_ALT.id])
    .mine(PILOT.id, bookDays);
  const cinderRefId = 970_001;
  const corpRefId = 970_002;
  return {
    docs: seed.docs(),
    cinderRefId,
    corpRefId,
    bookDays,
    owed: 3 * DAY_TAX,
    personal: {
      payees: [
        payeeRecord({
          id: CINDER_PAYEE_ID,
          characterId: PILOT.id,
          name: CINDER.name,
          entityId: CINDER.id,
          entityKind: 'corporation',
        }),
      ],
      assignments: [6, 5, 4].map((back) =>
        assignment({ characterId: PILOT.id, payeeId: CINDER_PAYEE_ID, back })
      ),
    } satisfies PersonalData,
    seed,
    /** The pilot's ESI: book days at the refinery, the Cinder days in Jita; `journal` is their wallet. */
    esi: (journal: Journal = []): EsiOverride[] => [
      pilotEsi({
        mining: [...miningLedger(bookDays), ...miningLedger([6, 5, 4], PERSONAL_SYSTEM)],
        journal,
      }),
    ],
  };
}

type Journal = NonNullable<Parameters<typeof pilotEsi>[0]['journal']>;

/**
 * The pilot in two books. Their main is in `CORP` (days 6, 5, 4), their alt `ALT_B` is held and in
 * `OTHER_CORP` (days 6 and 5 at its refinery). Each book also groups a Character the pilot has not
 * added: the main's alt in `CORP`, a corp mate of the alt in `OTHER_CORP`.
 */
export function twoBooksScenario() {
  const a = new BookSeed({ startBack: 40 })
    .group(PILOT_MINER_ID, [PILOT.id, PILOT_ALT.id])
    .mine(PILOT.id, [6, 5, 4]);
  const b = new BookSeed({ startBack: 40, corporationId: OTHER_CORP })
    .group(PROSPECTOR_MINER_ID, [ALT_B.id, MINER.cora.id])
    .mine(ALT_B.id, [
      { back: 6, refinery: 'beta' },
      { back: 5, refinery: 'beta' },
    ]);
  return {
    docs: [...a.docs(), ...b.docs()],
    a,
    b,
    alt: true as const,
    ownerMinerId: PILOT_MINER_ID,
    altMinerId: PROSPECTOR_MINER_ID,
    ownerOwes: 3 * DAY_TAX,
    altOwes: 2 * DAY_TAX,
    /** The pilot's and the alt's ESI; `journal` is each one's wallet. */
    esi: (journal: { main?: Journal; alt?: Journal } = {}): EsiOverride[] => [
      pilotEsi({ mining: miningLedger([6, 5, 4]), journal: journal.main ?? [] }),
      characterEsi(ALT_B.id, {
        mining: miningLedger([6, 5], REFINERY.beta.systemId),
        journal: journal.alt ?? [],
      }),
    ],
  };
}

/**
 * A corporation starts a book over the history of a pilot who kept personal records for it: a
 * Payee verified as the corporation, with a payment link, owed three days from before the book's
 * start and the three days since, which the book bills too.
 */
export function historyMovesOverScenario() {
  const preDays = [9, 8, 7];
  const bookDays = [6, 5, 4];
  const seed = new BookSeed({ startBack: 6 })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, bookDays);
  const payeeId = 'p-own-corp';
  return {
    docs: seed.docs(),
    payeeId,
    preDays,
    bookDays,
    paidBack: 8,
    esi: [pilotEsi({ mining: miningLedger([...preDays, ...bookDays]) })],
    personal: {
      payees: [
        payeeRecord({
          id: payeeId,
          characterId: PILOT.id,
          name: 'Test Corp',
          entityId: CORP,
          entityKind: 'corporation',
        }),
      ],
      assignments: [...preDays, ...bookDays].map((back) =>
        assignment({
          characterId: PILOT.id,
          payeeId,
          back,
          systemId: REFINERY.alpha.systemId,
        })
      ),
      links: [
        paymentLink({ characterId: PILOT.id, payeeId, refId: 8001, amount: DAY_TAX, paidBack: 8 }),
      ],
    } satisfies PersonalData,
  };
}

/**
 * The pilot's main is in `CORP` and grouped, in its book, with their alt `ALT_B`, who is in
 * `OTHER_CORP` and mines `CORP`'s moons as a guest. The alt has a book of its own in `OTHER_CORP`
 * too (days 6 and 5). Both are held.
 */
export function guestAltScenario() {
  // The sync points each Character a book observed at the book (`corpTaxBookBilledBy`), which is
  // how the pilot's tab finds a book that is not their Character's own corporation's.
  const pointer: SeedDoc = {
    path: `corpTaxBookBilledBy/char:${ALT_B.id}`,
    data: { books: { [String(CORP)]: Date.now(), [String(OTHER_CORP)]: Date.now() } },
  };
  const a = new BookSeed({ startBack: 40 })
    .group(PILOT_MINER_ID, [PILOT.id, ALT_B.id])
    .mine(PILOT.id, [6, 5, 4])
    .mine(ALT_B.id, [3]);
  const b = new BookSeed({ startBack: 40, corporationId: OTHER_CORP }).mine(ALT_B.id, [
    { back: 6, refinery: 'beta' },
    { back: 5, refinery: 'beta' },
  ]);
  return {
    docs: [...a.docs(), ...b.docs(), pointer],
    alt: true as const,
    minerId: PILOT_MINER_ID,
    /** The group's four days in `CORP`'s book, and the alt's two in its own. */
    groupOwes: 4 * DAY_TAX,
    altOwes: 2 * DAY_TAX,
    esi: (journal: { main?: Journal; alt?: Journal } = {}): EsiOverride[] => [
      pilotEsi({ mining: miningLedger([6, 5, 4]), journal: journal.main ?? [] }),
      characterEsi(ALT_B.id, {
        mining: [...miningLedger([3]), ...miningLedger([6, 5], REFINERY.beta.systemId)],
        journal: journal.alt ?? [],
      }),
    ],
  };
}

/** A pilot's own corporation closes nothing: they left it. Their book still lists what they owe. */
export function leaverScenario() {
  const days = [6, 5, 4];
  const seed = new BookSeed({ startBack: 40 })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, days)
    .lateNotice({
      id: 'ln-leaver',
      characterId: PILOT.id,
      minerId: PILOT_MINER_ID,
      days: [6, 5],
      issuedBack: 2,
      token: verifyToken('pilot-leaver'),
    });
  return {
    docs: seed.docs(),
    owed: days.length * DAY_TAX,
    esi: [pilotEsi({ mining: miningLedger(days) })],
  };
}

export { day, solo };
