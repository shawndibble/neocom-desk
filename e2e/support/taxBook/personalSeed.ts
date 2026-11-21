/**
 * The pilot's own Moon Mining Tax data, written into the app's IndexedDB (Dexie `neocom`), for the
 * member-side specs: Payees, Assignments, payment links (`miningTaxPaymentLinks`, Dexie v34), and
 * an older client's paid marks. Personal data lives on the device; nothing here needs Firebase.
 *
 * The app must have opened (and so upgraded) its database first: sign in, then seed, then open
 * the Tax tab, as `miningTaxNarrow.spec.ts` does.
 *
 * Figures follow `bookSeed.ts`: flat prices (`prices.ts`), so one ordinary day of `DAY_QTY` units
 * at a Payee's `taxPct` of 10 owes `DAY_TAX`.
 */
import { expect, type Page } from '@playwright/test';
import { signInAndGoto } from '../authSeed';
import type {
  MiningTaxAssignmentRecord,
  MiningTaxPaymentLinkRecord,
  PayeeRecord,
} from '../../../src/db/records';
import { DAY_QTY, DAY_TAX, ORE_TYPE, day } from './bookSeed';
import { MINER, nameOf } from './identities';
import { UNIT_PRICE, installFlatPrices } from './prices';

/** The personal Payee the member specs pay: a player, `MINER.rook`. */
export const ROOK = MINER.rook;
export const ROOK_PAYEE_ID = 'p-rook';

/** Jita: the one system `mockEsi.ts` names, so the personal Payee's rows need no more ESI. */
export const PERSONAL_SYSTEM_ID = 30000142;

/** A Payee record of the pilot's: linked to a real recipient, as a saved Payee always is. */
export function payeeRecord(p: {
  id: string;
  characterId: number;
  name: string;
  entityId: number;
  entityKind?: 'character' | 'corporation';
  taxPct?: number;
  defaultSystemId?: number;
}): PayeeRecord {
  return {
    id: p.id,
    characterId: p.characterId,
    name: p.name,
    defaultTaxPct: p.taxPct ?? 10,
    entityId: p.entityId,
    entityKind: p.entityKind ?? 'character',
    ...(p.defaultSystemId !== undefined
      ? { defaultSystems: [{ systemId: p.defaultSystemId, from: day(60) }] }
      : {}),
    updatedAt: Date.now(),
  } as PayeeRecord;
}

/** One Assignment of a whole day's ore to a Payee, at `taxPct` (10 by default). */
export function assignment(p: {
  characterId: number;
  payeeId: string;
  back: number;
  systemId?: number;
  taxPct?: number;
  status?: MiningTaxAssignmentRecord['status'];
  qty?: number;
}): MiningTaxAssignmentRecord {
  const taxPct = p.taxPct ?? 10;
  const qty = p.qty ?? DAY_QTY;
  const value = qty * UNIT_PRICE;
  const date = day(p.back);
  const systemId = p.systemId ?? PERSONAL_SYSTEM_ID;
  return {
    id: `e2e-${p.characterId}-${date}-${systemId}-${p.payeeId}`,
    characterId: p.characterId,
    date,
    solarSystemId: systemId,
    payeeId: p.payeeId,
    oreLines: [{ typeId: ORE_TYPE, quantity: qty }],
    taxPct,
    estimatedValue: value,
    taxOwed: (value * taxPct) / 100,
    status: p.status ?? 'outstanding',
    updatedAt: Date.now(),
  } as MiningTaxAssignmentRecord;
}

/**
 * An older client's "paid" mark (decision 20261120-235011): `status: 'paid'` and a `payment` that
 * names the lump sum. The app reads each into a payment link once; the figures must not move.
 */
export function legacyPaidAssignment(
  base: MiningTaxAssignmentRecord,
  payment: { paymentId: string; amount: number; paidBack: number; journalRefId?: number }
): MiningTaxAssignmentRecord {
  return {
    ...base,
    status: 'paid',
    paidAt: Date.parse(`${day(payment.paidBack)}T12:00:00Z`),
    payment: {
      paymentId: payment.paymentId,
      paidOn: day(payment.paidBack),
      method: 'donation',
      amount: payment.amount,
      ...(payment.journalRefId !== undefined
        ? { journalLinks: [{ refId: payment.journalRefId, source: 'manual' }] }
        : {}),
    },
  } as MiningTaxAssignmentRecord;
}

/** A stored link of one Made Payment to one Payee. */
export function paymentLink(p: {
  characterId: number;
  payeeId: string;
  refId: number;
  amount: number;
  paidBack: number;
  kind?: 'journal' | 'contract' | 'recorded';
}): MiningTaxPaymentLinkRecord {
  const kind = p.kind ?? 'journal';
  return {
    id: `${kind}:${p.refId}`,
    characterId: p.characterId,
    payeeId: p.payeeId,
    kind,
    refId: p.refId,
    amount: p.amount,
    paidOn: day(p.paidBack),
    source: 'manual',
    updatedAt: Date.now(),
  } as MiningTaxPaymentLinkRecord;
}

export interface PersonalData {
  payees?: PayeeRecord[];
  assignments?: MiningTaxAssignmentRecord[];
  links?: MiningTaxPaymentLinkRecord[];
}

/** Writes the rows into the app's database (opened and upgraded by the app already). */
export async function seedPersonal(page: Page, data: PersonalData): Promise<void> {
  await page.evaluate(async (rows: PersonalData) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ['payees', 'miningTaxAssignments', 'miningTaxPaymentLinks'];
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(stores, 'readwrite');
      for (const p of rows.payees ?? []) tx.objectStore('payees').put(p);
      for (const a of rows.assignments ?? []) tx.objectStore('miningTaxAssignments').put(a);
      for (const l of rows.links ?? []) tx.objectStore('miningTaxPaymentLinks').put(l);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, data);
}

/** What the app holds of a store now, for asserting what an action wrote. */
export async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(async (name: string) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return rows;
  }, store) as Promise<T[]>;
}

export { DAY_TAX };

/** One ESI mining-ledger row per day in `systemId` (`MiningLedgerRow`), `DAY_QTY` of `ORE_TYPE`. */
export function personalLedger(days: readonly number[], systemId = PERSONAL_SYSTEM_ID) {
  return days.map((back) => ({
    date: day(back),
    quantity: DAY_QTY,
    solar_system_id: systemId,
    type_id: ORE_TYPE,
  }));
}

/**
 * Under the main suite's mocks (`testBase.ts`): flat prices, the pilot's mining ledger and wallet
 * journal, and the roster's names. Registered after `installEsiMock`, so these answer first.
 */
export async function installPilotEsi(
  page: Page,
  p: { characterId: number; mining: unknown[]; journal?: unknown[]; names: (id: number) => string }
): Promise<void> {
  await installFlatPrices(page);
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route(`https://esi.evetech.net/**/characters/${p.characterId}/mining/**`, (route) =>
    route.fulfill(json(p.mining))
  );
  await page.route(
    `https://esi.evetech.net/**/characters/${p.characterId}/wallet/journal**`,
    (route) => route.fulfill(json(p.journal ?? []))
  );
  await page.route('https://esi.evetech.net/**/universe/names**', (route) => {
    const ids = route.request().postDataJSON() as number[];
    return route.fulfill(json(ids.map((id) => ({ id, name: p.names(id), category: 'character' }))));
  });
}

/** A `player_donation` the pilot sent, as their wallet journal lists it (ISK out is negative). */
export function journalDonation(p: {
  refId: number;
  from: number;
  to: number;
  amount: number;
  back: number;
  reason?: string;
}) {
  return {
    id: p.refId,
    date: `${day(p.back)}T12:00:00Z`,
    ref_type: 'player_donation',
    description: `${p.from} deposited cash into ${p.to}'s account`,
    amount: -p.amount,
    first_party_id: p.from,
    second_party_id: p.to,
    ...(p.reason ? { reason: p.reason } : {}),
  };
}

/** The pilot's personal Payee Rook, owed `days` of Jita mining at 10% (one Assignment a day). */
export function rookOwed(characterId: number, days: readonly number[] = [6, 5, 4]): PersonalData {
  return {
    payees: [payeeRecord({ id: ROOK_PAYEE_ID, characterId, name: ROOK.name, entityId: ROOK.id })],
    assignments: days.map((back) => assignment({ characterId, payeeId: ROOK_PAYEE_ID, back })),
  };
}

/**
 * Signs the pilot in (main suite: `signInAndGoto`'s token), seeds `data` and opens the Tax tab.
 * It lands on the tab first and reloads after seeding: the app has opened its database by then,
 * and the reload is served the tab's modules from the browser's cache.
 */
export async function openPersonalTax(
  page: Page,
  data: PersonalData,
  esi: { characterId: number; mining: unknown[]; journal?: unknown[] }
): Promise<void> {
  await installPilotEsi(page, { ...esi, names: nameOf });
  await signInAndGoto(page, './mining/tax');
  await seedPersonal(page, data);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Tax', selected: true })).toBeVisible();
}
