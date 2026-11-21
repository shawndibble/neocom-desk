/**
 * The pilot's payment links in Dexie (decision 20261120-235011): each Made Payment linked to one
 * Payee, stored under that Payee's Character and synced as Editable Data. Linking a payment that
 * is already linked moves it: its key is the payment, so it can pay one Payee only.
 *
 * Also reads the paid marks Assignments carried into links, once each (`legacyPaidMarks.ts`). The
 * marks themselves are never written or cleared, so older clients see what they always saw; a
 * legacy link the pilot unlinks is kept as unlinked, so the next read does not bring it back.
 */
import { db, type MiningTaxPaymentLinkRecord } from '@/db';
import {
  dropPayeeCheckpointsFrom,
  earliestDay,
  PAYEE_CHECKPOINTS_KEY,
  readPayeeHistoryGen,
  readStoredCheckpoints,
} from '@/db/payeeCheckpoints';
import {
  paymentLinkKey,
  type PayeePaymentLink,
  type StoredPayeeCheckpoint,
} from '@/engine/miningTax/payeeAccount';
import { scheduleSync } from '@/sync';
import {
  appendTombstones,
  pullCursorKey,
  readTombstones,
  tombstoneKey,
} from '@/sync/localBookkeeping';
import { isSyncConfigured } from '@/app/syncStatus';
import { MINING_TAX_PAYMENT_LINKS } from '@/sync/syncedCollections';
import { unreadLegacyLinks } from './legacyPaidMarks';
import { linkOf, PayeeAccounts } from './payeeAccounts';

/** Every stored link, every Character's: a merged Payee's money can come from any of them. */
export function loadPaymentLinks(): Promise<MiningTaxPaymentLinkRecord[]> {
  return db.miningTaxPaymentLinks.toArray();
}

/** Assignments an older client marked paid (`status` is not indexed: a filtered scan). */
const paidMarks = () => db.miningTaxAssignments.filter((a) => a.status === 'paid').toArray();

const recordOf = (link: PayeePaymentLink, characterId: number): MiningTaxPaymentLinkRecord => ({
  ...link,
  id: paymentLinkKey(link),
  characterId,
  updatedAt: Date.now(),
});

/**
 * Takes links off by key; they pay nothing from now on. An ordinary link is deleted and
 * tombstoned under its Character, so the payment is offered again. A legacy link is kept,
 * marked `unlinked`: reading the old marks again finds its id and never brings it back, on this
 * device or another (a deletion leaves no lasting trace once its tombstone is pushed). The old
 * marks are never touched. Run inside a transaction over the links and `db.settings`. Returns the
 * Characters it touched.
 */
async function removeLinks(keys: readonly string[]): Promise<Set<number>> {
  const touched = new Set<number>();
  const stored = (await db.miningTaxPaymentLinks.bulkGet([...keys])).filter(
    (r): r is MiningTaxPaymentLinkRecord => r !== undefined
  );
  if (stored.length > 0) await dropPayeeCheckpointsFrom(earliestDay(stored.map((r) => r.paidOn))!);
  for (const r of stored) {
    touched.add(r.characterId);
    if (r.kind === 'legacy') {
      await db.miningTaxPaymentLinks.put({ ...r, unlinked: true, updatedAt: Date.now() });
      continue;
    }
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
    await dropPayeeCheckpointsFrom(earliestDay([link.paidOn, stored?.paidOn])!);
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

/**
 * Reads the paid marks no link stands for yet into links (`unreadLegacyLinks`): passive and
 * idempotent. A mark whose link exists (unlinked included) or is tombstoned on this device is
 * skipped, and the marks stay exactly as they are. Run only once the links are known
 * (`linksReady`), or a device that has not pulled them yet would bring back an unlinked one.
 */
export async function readLegacyPaidMarks(): Promise<void> {
  const created = await db.transaction(
    'rw',
    db.miningTaxPaymentLinks,
    db.miningTaxAssignments,
    db.settings,
    async () => {
      const marked = await paidMarks();
      if (marked.length === 0) return [];
      const known = new Set(await db.miningTaxPaymentLinks.toCollection().primaryKeys());
      const owners = new Set(marked.map((a) => a.characterId));
      for (const characterId of owners)
        for (const t of await readTombstones(tombstoneKey(MINING_TAX_PAYMENT_LINKS, characterId)))
          known.add(t.id);
      const unread = unreadLegacyLinks(marked, known);
      if (unread.length === 0) return [];
      await dropPayeeCheckpointsFrom(earliestDay(unread.map((l) => l.paidOn))!);
      await db.miningTaxPaymentLinks.bulkPut(unread.map((l) => recordOf(l, l.characterId)));
      return unread;
    }
  );
  syncAll(new Set(created.map((l) => l.characterId)));
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
 * (the load path's, the journal's, the tab's) bills the same. A share that changed reaches back
 * to its Assignment's day, so it drops the checkpoints from there. Returns whether it changed.
 */
export async function saveBilledElsewhere(
  next: ReadonlyMap<string, number>,
  dateOf: (assignmentId: string) => string | undefined
): Promise<boolean> {
  return db.transaction('rw', db.settings, async () => {
    const held = await loadBilledElsewhere();
    const changed = [...new Set([...held.keys(), ...next.keys()])].filter(
      (id) => Math.abs((held.get(id) ?? 0) - (next.get(id) ?? 0)) > 1e-9
    );
    if (changed.length === 0) return false;
    await db.settings.put({ key: BILLED_ELSEWHERE_KEY, value: Object.fromEntries(next) });
    await dropPayeeCheckpointsFrom(earliestDay(changed.map(dateOf)) ?? null);
    return true;
  });
}

/** What every account build reads besides the Assignments and Payees. */
export interface AccountInputs {
  links: PayeePaymentLink[];
  checkpoints: Map<string, StoredPayeeCheckpoint>;
  billedElsewhere: Map<string, number>;
  /** `readPayeeHistoryGen` when these were read: a checkpoint is only saved while it holds. */
  historyGen: number;
}

export async function loadAccountInputs(): Promise<AccountInputs> {
  const [links, checkpoints, billedElsewhere, historyGen] = await Promise.all([
    loadPaymentLinks(),
    loadPayeeCheckpoints(),
    loadBilledElsewhere(),
    readPayeeHistoryGen(),
  ]);
  return { links: links.map(linkOf), checkpoints, billedElsewhere, historyGen };
}

/**
 * Every personal Payee's account as Dexie holds it now: the one build (`PayeeAccounts.build`)
 * every reader shares, the load path's safeguards, the journal and the Tax tab alike.
 */
export async function loadPayeeAccounts(): Promise<PayeeAccounts> {
  const [assignments, payees, inputs] = await Promise.all([
    db.miningTaxAssignments.toArray(),
    db.payees.toArray(),
    loadAccountInputs(),
  ]);
  return PayeeAccounts.build({ assignments, payees, ...inputs });
}

/** The device's checkpoints, by a merged Payee's primary id. */
export async function loadPayeeCheckpoints(): Promise<Map<string, StoredPayeeCheckpoint>> {
  return new Map(
    Object.entries(await readStoredCheckpoints()) as [string, StoredPayeeCheckpoint][]
  );
}

/**
 * Stores the checkpoints that moved forward, the rest kept; nothing when a write reached the
 * accounts since `historyGen` was read (what they were computed from is no longer what is stored).
 */
export async function savePayeeCheckpoints(
  next: ReadonlyMap<string, StoredPayeeCheckpoint>,
  historyGen: number
): Promise<void> {
  if (next.size === 0) return;
  await db.transaction('rw', db.settings, async () => {
    if ((await readPayeeHistoryGen()) !== historyGen) return;
    const held = await loadPayeeCheckpoints();
    for (const [id, cp] of next) held.set(id, { checkpoint: cp.checkpoint });
    await db.settings.put({ key: PAYEE_CHECKPOINTS_KEY, value: Object.fromEntries(held) });
  });
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
  const accounts = await loadPayeeAccounts();
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
