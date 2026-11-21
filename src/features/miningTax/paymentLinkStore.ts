/**
 * The pilot's payment links in Dexie (decision 20261120-235011): each Made Payment linked to one
 * Payee, stored under that Payee's Character and synced as Editable Data. Linking a payment that
 * is already linked moves it: its key is the payment, so it can pay one Payee only.
 *
 * Also reads the paid marks Assignments carried into links, once per device, and clears them
 * (`legacyPaidMarks.ts`).
 */
import { db, type MiningTaxPaymentLinkRecord } from '@/db';
import { paymentLinkKey, type PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { scheduleSync } from '@/sync';
import { appendTombstones, pullCursorKey, tombstoneKey } from '@/sync/localBookkeeping';
import { isSyncConfigured } from '@/app/syncStatus';
import { MINING_TAX_PAYMENT_LINKS } from '@/sync/syncedCollections';
import { legacyPaymentLinks } from './legacyPaidMarks';
import { linkOf, PayeeRunningAccounts } from './payeeRunningAccounts';
import { putAssignments } from './storedAssignments';

/** Every stored link, every Character's: a merged Payee's money can come from any of them. */
export function loadPaymentLinks(): Promise<MiningTaxPaymentLinkRecord[]> {
  return db.miningTaxPaymentLinks.toArray();
}

const recordOf = (link: PayeePaymentLink, characterId: number): MiningTaxPaymentLinkRecord => ({
  ...link,
  id: paymentLinkKey(link),
  characterId,
  updatedAt: Date.now(),
});

/**
 * Takes links off by key: each is deleted and tombstoned under its Character, so the payment is
 * offered again. Run inside a transaction over the links and `db.settings`. Returns the
 * Characters it touched.
 */
async function removeLinks(keys: readonly string[]): Promise<Set<number>> {
  const touched = new Set<number>();
  const stored = (await db.miningTaxPaymentLinks.bulkGet([...keys])).filter(
    (r): r is MiningTaxPaymentLinkRecord => r !== undefined
  );
  for (const r of stored) {
    touched.add(r.characterId);
    await db.miningTaxPaymentLinks.delete(r.id);
    await appendTombstones(tombstoneKey(MINING_TAX_PAYMENT_LINKS, r.characterId), [r.id]);
  }
  return touched;
}

const syncAll = (characterIds: Iterable<number>) => {
  for (const characterId of characterIds)
    scheduleSync(characterId, { collections: ['miningTaxPaymentLinks'] });
};

/**
 * Links a payment to a Payee, stored under `characterId`, the one Character that owns it (the
 * payer: `MiningTaxPaymentLinkRecord.characterId`), replacing any link the payment already had.
 * `replaces` names a link it stands in for: a recorded payment whose transaction has now shown up.
 */
export async function savePaymentLink(
  link: PayeePaymentLink,
  characterId: number,
  replaces?: string
): Promise<void> {
  const key = paymentLinkKey(link);
  const touched = await db.transaction('rw', db.miningTaxPaymentLinks, db.settings, async () => {
    const stored = await db.miningTaxPaymentLinks.get(key);
    const gone = [
      // Stored under another Character: its tombstone goes there.
      ...(stored && stored.characterId !== characterId ? [key] : []),
      ...(replaces !== undefined && replaces !== key ? [replaces] : []),
    ];
    const touched = await removeLinks(gone);
    await db.miningTaxPaymentLinks.put(recordOf(link, characterId));
    touched.add(characterId);
    return touched;
  });
  syncAll(touched);
}

/** Unlinks payments: they pay nothing, and are offered again. */
export async function removePaymentLinks(keys: readonly string[]): Promise<void> {
  const touched = await db.transaction('rw', db.miningTaxPaymentLinks, db.settings, () =>
    removeLinks(keys)
  );
  syncAll(touched);
}

/** Per device: the old paid marks were read into links (`readLegacyPaidMarks`). */
const PAID_MARKS_READ_KEY = 'miningTaxPaidMarksRead';

/**
 * Reads the Assignments' old paid marks into links, once per device, and clears the marks: from
 * then on a day is paid only by its Payee's account. A link already there (another device read
 * the same mark first: the ids never change) is kept. Run only once the links are known
 * (`linksReady`).
 */
export async function readLegacyPaidMarks(): Promise<void> {
  const touched = await db.transaction(
    'rw',
    db.miningTaxPaymentLinks,
    db.miningTaxAssignments,
    db.settings,
    async () => {
      if ((await db.settings.get(PAID_MARKS_READ_KEY))?.value === true) return [];
      // `status` is not indexed: a filtered scan, once.
      const marked = await db.miningTaxAssignments.filter((a) => a.status === 'paid').toArray();
      const known = new Set(await db.miningTaxPaymentLinks.toCollection().primaryKeys());
      const links = legacyPaymentLinks(marked).filter((l) => !known.has(paymentLinkKey(l)));
      await db.miningTaxPaymentLinks.bulkPut(links.map((l) => recordOf(l, l.characterId)));
      await putAssignments(marked.map((a) => ({ ...a, updatedAt: Date.now() })));
      await db.settings.put({ key: PAID_MARKS_READ_KEY, value: true });
      return marked.map((a) => a.characterId);
    }
  );
  for (const characterId of new Set(touched))
    scheduleSync(characterId, { collections: ['miningTaxPaymentLinks', 'miningTaxAssignments'] });
}

/**
 * Whether the links are known for every tracked Character (decision 20261120-235011, "nothing that
 * changes Assignments runs before links are known"): the links collection has completed a pull for
 * each, or this device does not sync. Until then a day a link pays elsewhere could read as unpaid
 * here, so takeovers, growth, coalescing, repricing and the old-mark read all wait.
 */
export async function linksReady(characterIds: readonly number[]): Promise<boolean> {
  if (!isSyncConfigured()) return true;
  const cursors = await db.settings.bulkGet(
    characterIds.map((id) => pullCursorKey(id, MINING_TAX_PAYMENT_LINKS.remoteName))
  );
  return cursors.every((c) => c !== undefined);
}

/** What a Corp Tax Book bills too of the member's Assignments, as the device last saw it. */
const BILLED_ELSEWHERE_KEY = 'miningTaxBilledElsewhere';

/** By Assignment id, the share (0–1) of its tax a Corp Tax Book bills too (#6204). */
export async function loadBilledElsewhere(): Promise<Map<string, number>> {
  const value = (await db.settings.get(BILLED_ELSEWHERE_KEY))?.value;
  if (!value || typeof value !== 'object') return new Map();
  return new Map(
    Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number'
    )
  );
}

/**
 * Stores what the books bill too, as the Tax tab's overlay reads it now, so every account build
 * (the load path's, the journal's, the tab's) bills the same. Returns whether it changed.
 */
export async function saveBilledElsewhere(next: ReadonlyMap<string, number>): Promise<boolean> {
  return db.transaction('rw', db.settings, async () => {
    const held = await loadBilledElsewhere();
    const changed = [...new Set([...held.keys(), ...next.keys()])].filter(
      (id) => Math.abs((held.get(id) ?? 0) - (next.get(id) ?? 0)) > 1e-9
    );
    if (changed.length === 0) return false;
    await db.settings.put({ key: BILLED_ELSEWHERE_KEY, value: Object.fromEntries(next) });
    return true;
  });
}

/** What every account build reads besides the Assignments and Payees. */
export interface RunningAccountInputs {
  links: PayeePaymentLink[];
  billedElsewhere: Map<string, number>;
}

export async function loadRunningAccountInputs(): Promise<RunningAccountInputs> {
  const [links, billedElsewhere] = await Promise.all([loadPaymentLinks(), loadBilledElsewhere()]);
  return { links: links.map(linkOf), billedElsewhere };
}

/**
 * Every personal Payee's account as Dexie holds it now: the one build (`PayeeRunningAccounts.build`)
 * every reader shares, the load path's safeguards, the journal and the Tax tab alike.
 */
export async function loadPayeeRunningAccounts(): Promise<PayeeRunningAccounts> {
  const [assignments, payees, inputs] = await Promise.all([
    db.miningTaxAssignments.toArray(),
    db.payees.toArray(),
    loadRunningAccountInputs(),
  ]);
  return PayeeRunningAccounts.build({ assignments, payees, ...inputs });
}

/** One day a linked payment's money reached, for the wallet journal's "paid" link. */
export interface LinkedDay {
  /** The Assignment billed that day, to open. */
  id: string;
  date: string;
  taxOwed: number;
}

/**
 * Per linked payment (`paymentLinkKey`), the Assignments on the days its money paid, oldest first:
 * read off each Payee's account, so the journal says what the ledger does.
 */
export async function loadLinkedDays(): Promise<Map<string, LinkedDay[]>> {
  const accounts = await loadPayeeRunningAccounts();
  const out = new Map<string, LinkedDay[]>();
  for (const [, account] of accounts.entries()) {
    for (const applied of account.account.applications.payments) {
      const dates = new Set(applied.days.map((d) => d.date));
      const days = account.charges
        .filter((c) => dates.has(c.date))
        .map((c) => ({ id: c.id, date: c.date, taxOwed: c.tax }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (days.length === 0) continue;
      out.set(applied.paymentId, days);
      // A legacy link's old transactions: the journal line that paid shows the days too.
      const link = account.links.find((l) => paymentLinkKey(l) === applied.paymentId);
      for (const ref of link?.refs ?? []) out.set(paymentLinkKey(ref), days);
    }
  }
  return out;
}
