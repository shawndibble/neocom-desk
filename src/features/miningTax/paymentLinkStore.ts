import { db, type MiningTaxPaymentLinkRecord } from '@/db';
import { paymentLinkKey, type PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { scheduleSync } from '@/sync';
import { appendTombstones, pullCursorKey, tombstoneKey } from '@/sync/localBookkeeping';
import { isSyncConfigured } from '@/app/syncStatus';
import { MINING_TAX_PAYMENT_LINKS } from '@/sync/syncedCollections';
import { legacyPaymentLinks } from './legacyPaidMarks';
import { linkOf, PayeeRunningAccounts } from './payeeRunningAccounts';
import { putAssignments } from './storedAssignments';

export function loadPaymentLinks(): Promise<MiningTaxPaymentLinkRecord[]> {
  return db.miningTaxPaymentLinks.toArray();
}

const recordOf = (link: PayeePaymentLink, characterId: number): MiningTaxPaymentLinkRecord => ({
  ...link,
  id: paymentLinkKey(link),
  characterId,
  updatedAt: Date.now(),
});

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

export async function savePaymentLink(
  link: PayeePaymentLink,
  characterId: number,
  replaces?: string
): Promise<void> {
  const key = paymentLinkKey(link);
  const touched = await db.transaction('rw', db.miningTaxPaymentLinks, db.settings, async () => {
    const stored = await db.miningTaxPaymentLinks.get(key);
    const gone = [
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

export async function removePaymentLinks(keys: readonly string[]): Promise<void> {
  const touched = await db.transaction('rw', db.miningTaxPaymentLinks, db.settings, () =>
    removeLinks(keys)
  );
  syncAll(touched);
}

const PAID_MARKS_READ_KEY = 'miningTaxPaidMarksRead';

export async function readLegacyPaidMarks(): Promise<void> {
  const touched = await db.transaction(
    'rw',
    db.miningTaxPaymentLinks,
    db.miningTaxAssignments,
    db.settings,
    async () => {
      if ((await db.settings.get(PAID_MARKS_READ_KEY))?.value === true) return [];
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

export async function linksReady(characterIds: readonly number[]): Promise<boolean> {
  if (!isSyncConfigured()) return true;
  const cursors = await db.settings.bulkGet(
    characterIds.map((id) => pullCursorKey(id, MINING_TAX_PAYMENT_LINKS.remoteName))
  );
  return cursors.every((c) => c !== undefined);
}

const BILLED_ELSEWHERE_KEY = 'miningTaxBilledElsewhere';

export async function loadBilledElsewhere(): Promise<Map<string, number>> {
  const value = (await db.settings.get(BILLED_ELSEWHERE_KEY))?.value;
  if (!value || typeof value !== 'object') return new Map();
  return new Map(
    Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number'
    )
  );
}

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

const BOOK_OWNED_KEY = 'miningTaxBookOwnedPayees';

export async function loadBookOwned(): Promise<Set<string>> {
  const value = (await db.settings.get(BOOK_OWNED_KEY))?.value;
  return new Set(
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  );
}

export async function isBookOwnedKnown(): Promise<boolean> {
  return (await db.settings.get(BOOK_OWNED_KEY)) !== undefined;
}

export async function saveBookOwned(next: ReadonlySet<string>): Promise<boolean> {
  return db.transaction('rw', db.settings, async () => {
    const known = (await db.settings.get(BOOK_OWNED_KEY)) !== undefined;
    const held = await loadBookOwned();
    if (known && held.size === next.size && [...next].every((id) => held.has(id))) return false;
    await db.settings.put({ key: BOOK_OWNED_KEY, value: [...next].sort() });
    return true;
  });
}

export interface RunningAccountInputs {
  links: PayeePaymentLink[];
  billedElsewhere: Map<string, number>;
  bookOwned: Set<string>;
}

export async function loadRunningAccountInputs(): Promise<RunningAccountInputs> {
  const [links, billedElsewhere, bookOwned] = await Promise.all([
    loadPaymentLinks(),
    loadBilledElsewhere(),
    loadBookOwned(),
  ]);
  return { links: links.map(linkOf), billedElsewhere, bookOwned };
}

export async function loadPayeeRunningAccounts(): Promise<PayeeRunningAccounts> {
  const [assignments, payees, inputs] = await Promise.all([
    db.miningTaxAssignments.toArray(),
    db.payees.toArray(),
    loadRunningAccountInputs(),
  ]);
  return PayeeRunningAccounts.build({ assignments, payees, ...inputs });
}

export interface LinkedDay {
  id: string;
  date: string;
  taxOwed: number;
}

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
      const link = account.links.find((l) => paymentLinkKey(l) === applied.paymentId);
      for (const ref of link?.refs ?? []) out.set(paymentLinkKey(ref), days);
    }
  }
  return out;
}
