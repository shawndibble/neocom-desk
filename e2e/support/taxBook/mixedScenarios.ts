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

export const CINDER = { id: 98_000_777, name: 'Cinder Mining Corp' };
export const CINDER_PAYEE_ID = 'p-cinder';
export const PROSPECTOR_MINER_ID = 'm-prospector';

export interface Scenario {
  docs: SeedDoc[];
  personal?: PersonalData;
  esi: EsiOverride[];
  alt?: boolean;
}

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
    bookOwes: (p.locked ? DAY_TAX : 0) + 2 * 0.6 * DAY_TAX,
    bookDays: p.locked ? 3 : 2,
    rookOwes: 0.4 * DAY_TAX,
    unattributedValue: 0.4 * DAY_QTY_VALUE,
    minerId: PILOT_MINER_ID,
  };
}
const DAY_QTY_VALUE = DAY_TAX * 10;

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
    esi: (journal: Journal = []): EsiOverride[] => [
      pilotEsi({
        mining: [...miningLedger(bookDays), ...miningLedger([6, 5, 4], PERSONAL_SYSTEM)],
        journal,
      }),
    ],
  };
}

type Journal = NonNullable<Parameters<typeof pilotEsi>[0]['journal']>;

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
    esi: (journal: { main?: Journal; alt?: Journal } = {}): EsiOverride[] => [
      pilotEsi({ mining: miningLedger([6, 5, 4]), journal: journal.main ?? [] }),
      characterEsi(ALT_B.id, {
        mining: miningLedger([6, 5], REFINERY.beta.systemId),
        journal: journal.alt ?? [],
      }),
    ],
  };
}

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

export function guestAltScenario() {
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
