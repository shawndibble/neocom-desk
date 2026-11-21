/**
 * The pilot's payment links in Dexie (decision 20261120-235011): each Made Payment linked to one
 * Payee, stored under that Payee's Character and synced as Editable Data. Linking a payment that
 * is already linked moves it: its key is the payment, so it can pay one Payee only.
 *
 * Also reads the paid marks Assignments carried into links, once each (`legacyPaidMarks.ts`). The
 * marks themselves stay, for older clients; a link read from one that the pilot later unlinks or
 * replaces takes its marks with it, so the next read does not bring it back.
 */
import { db, type MiningTaxAssignmentRecord, type MiningTaxPaymentLinkRecord } from '@/db';
import { paymentLinkKey, type PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import { scheduleSync } from '@/sync';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_PAYMENT_LINKS } from '@/sync/syncedCollections';
import { legacyPaymentLinks, unreadLegacyLinks } from './legacyPaidMarks';

/** Every stored link, every Character's: a merged Payee's money can come from any of them. */
export function loadPaymentLinks(): Promise<MiningTaxPaymentLinkRecord[]> {
  return db.miningTaxPaymentLinks.toArray();
}

/** Assignments an older client marked paid (`status` is not indexed: a filtered scan). */
const paidMarks = () => db.miningTaxAssignments.filter((a) => a.status === 'paid').toArray();

const recordOf = (link: PayeePaymentLink, characterId: number): MiningTaxPaymentLinkRecord => ({
  id: paymentLinkKey(link),
  characterId,
  payeeId: link.payeeId,
  kind: link.kind,
  refId: link.refId,
  amount: link.amount,
  paidOn: link.paidOn,
  source: link.source,
  updatedAt: Date.now(),
});

/**
 * Takes links off by key: deleted and tombstoned under their Character, and any paid marks they
 * were read from cleared, so the marks are not read into them again. Run inside a transaction over
 * the links, the Assignments and `db.settings`. Returns the Characters it touched.
 */
async function removeLinks(keys: readonly string[]): Promise<Set<number>> {
  const touched = new Set<number>();
  const stored = (await db.miningTaxPaymentLinks.bulkGet([...keys])).filter(
    (r): r is MiningTaxPaymentLinkRecord => r !== undefined
  );
  if (stored.length === 0) return touched;
  await db.miningTaxPaymentLinks.bulkDelete(stored.map((r) => r.id));
  for (const r of stored) {
    touched.add(r.characterId);
    await appendTombstones(tombstoneKey(MINING_TAX_PAYMENT_LINKS, r.characterId), [r.id]);
  }
  const gone = new Set(stored.map((r) => r.id));
  const marked = await paidMarks();
  const from = new Set(
    legacyPaymentLinks(marked)
      .filter((l) => gone.has(paymentLinkKey(l)))
      .flatMap((l) => l.from)
  );
  const cleared = marked.filter((a) => from.has(a.id)).map(withoutMark);
  if (cleared.length > 0) {
    await db.miningTaxAssignments.bulkPut(cleared);
    for (const a of cleared) touched.add(a.characterId);
  }
  return touched;
}

/** The Assignment with its legacy paid mark gone: billed, its Payee's account deciding what is paid. */
function withoutMark(a: MiningTaxAssignmentRecord): MiningTaxAssignmentRecord {
  const out: MiningTaxAssignmentRecord = { ...a, status: 'outstanding', updatedAt: Date.now() };
  delete out.payment;
  delete out.paidAt;
  return out;
}

const syncAll = (characterIds: Iterable<number>) => {
  for (const characterId of characterIds)
    scheduleSync(characterId, {
      collections: ['miningTaxPaymentLinks', 'miningTaxAssignments'],
    });
};

/**
 * Links a payment to a Payee (stored under `characterId`, the Payee record's), replacing any link
 * the payment already had. `replaces` names a link it stands in for: a recorded payment whose
 * transaction has now shown up.
 */
export async function savePaymentLink(
  link: PayeePaymentLink,
  characterId: number,
  replaces?: string
): Promise<void> {
  const key = paymentLinkKey(link);
  const touched = await db.transaction(
    'rw',
    db.miningTaxPaymentLinks,
    db.miningTaxAssignments,
    db.settings,
    async () => {
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
    }
  );
  syncAll(touched);
}

/** Unlinks payments: they pay nothing, and are offered again. */
export async function removePaymentLinks(keys: readonly string[]): Promise<void> {
  const touched = await db.transaction(
    'rw',
    db.miningTaxPaymentLinks,
    db.miningTaxAssignments,
    db.settings,
    () => removeLinks(keys)
  );
  syncAll(touched);
}

/**
 * Reads the paid marks no link stands for yet into links (`unreadLegacyLinks`). Additive: the
 * marks stay as they are, and a healthy ledger writes nothing.
 */
export async function readLegacyPaidMarks(): Promise<void> {
  const created = await db.transaction(
    'rw',
    db.miningTaxPaymentLinks,
    db.miningTaxAssignments,
    async () => {
      const marked = await paidMarks();
      if (marked.length === 0) return [];
      const keys = new Set(await db.miningTaxPaymentLinks.toCollection().primaryKeys());
      const unread = unreadLegacyLinks(marked, keys);
      await db.miningTaxPaymentLinks.bulkPut(unread.map((l) => recordOf(l, l.characterId)));
      return unread;
    }
  );
  for (const characterId of new Set(created.map((l) => l.characterId)))
    scheduleSync(characterId, { collections: ['miningTaxPaymentLinks'] });
}
