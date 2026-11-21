// The Overview and Miners tab read models (issue #5259, ADR 0032): two docs under
// `corps/{id}/readModels`. The screens read them, and fall back to the whole-book view while
// they are missing.
//
// Every book is a Running account (decision 20261120-235011), so the Miners list is built from
// what officers' tabs record, never from Statements: each Miner's account (`accounts/{minerId}`,
// `recordAccounts`) less what they paid since, and their Late notices still unsettled by it. The
// server holds no prices, so it never works an account out itself.
//
// They hold inputs, never time-derived figures. Overdue days, paused, standing, the
// "Pops in 7 days" window, billable-through and the open set (unbilled, pending, unrated)
// are computed on read by src/engine/corpTaxBook/readModels.ts. Names are never stored.
//
// Pure and dependency-free: the client imports it.

import {
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  isBeforeBook,
  type MirrorExtraction,
} from './corpTaxBookEngine.js';
import type { OwedDay } from './corpTaxBookAccounts.js';
import { READ_MODELS_SCHEMA } from './corpTaxBookVersionKeys.js';
import { liveAccount, paidSinceRecord } from './corpTaxBookAccounts.js';
import {
  NOTICE_ID_FIELD,
  lateNoticeStanding,
  type LateNotice,
  type LateNoticeDayState,
  type LateNoticeLine,
} from './corpTaxBookLateNotice.js';
import { DAY_MS } from './timeConstants.js';

export const READ_MODELS = 'readModels';
export const MINER_LIST_DOC = 'minerList';
export const OVERVIEW_DOC = 'overview';
export { READ_MODELS_SCHEMA };

type Data = Record<string, unknown>;

/** A Miner's account, as the Miners tab and the Needs you queue read it. */
export interface MinerListEntry {
  minerId: string;
  /** What the account an officer's tab last recorded still owes, less what the Miner paid since. */
  owed: number;
  /** The credit the record counted, and what the Miner paid since beyond what it said they owed. */
  credit: number;
  /** When an officer's tab recorded the account these figures rest on; null when none did. */
  asOf: string | null;
  /**
   * The figures may be behind: no account was recorded, the record is more than a day old, or a
   * notice was issued or an officer's edit moved the account after it. A tab recomputes such a
   * Miner rather than trusting the entry.
   */
  stale: boolean;
  /** ISO instant of the latest payment that was tax; null when none. */
  lastPaidAt: string | null;
  /** Late notices not yet settled, oldest first, each with its declarations. */
  unsettled: { id: string; issuedAt: string; declarations: Data[] }[];
  /** Declarations nobody resolved yet, on any of the Miner's Late notices. */
  unresolvedDeclarations: Data[];
}

export interface MinerListDoc {
  schema: number;
  miners: MinerListEntry[];
}

export interface OverviewDoc {
  schema: number;
  /** Donations dated before the book's start date: counted, never credited or listed. */
  donationsBeforeBook: number;
  /** Payments no Miner claimed, in the payments' stored order. */
  unmatchedPayments: Data[];
  /**
   * The rolling window of Extractions: those not cancelled and not expired more than a day
   * before the doc was built. State is computed on read.
   */
  extractions: Data[];
}

export interface ReadModels {
  [MINER_LIST_DOC]: MinerListDoc;
  [OVERVIEW_DOC]: OverviewDoc;
}

/** The part of a Late notice the Miners list reads. */
export type ListedNotice = Pick<LateNotice, 'id' | 'minerId' | 'issuedAt'> & {
  lines: readonly Pick<LateNoticeLine, 'date' | 'tax'>[];
};

/** What both docs are built from: no ledger row, no Statement. */
export interface ReadModelInputs {
  startDate?: string;
  expiryHours: Readonly<Record<string, number>>;
  /** Every payment; a Miner's carry its `minerId`. */
  payments: readonly Data[];
  declarations: readonly Data[];
  extractions: readonly Data[];
  /** `accounts/{minerId}` docs, each with its `id`; absent reads as none recorded. */
  accounts?: readonly Data[];
  /** Late notices from both collections; absent reads as none issued. */
  notices?: readonly ListedNotice[];
  /**
   * Officers' edits that move what an account owes (write-offs, corrections, dismissals, dispute
   * answers), each with its Miner, or none when it may touch any Miner: a record made before one
   * is behind it.
   */
  edits?: readonly { minerId?: string; at: string }[];
}

/** Whether an Extraction is still worth listing at `now` (ms): not cancelled, expiry no more than a day gone. */
function inWindow(
  x: MirrorExtraction,
  expiryHours: Readonly<Record<string, number>>,
  now: number
): boolean {
  if (x.cancelledAt) return false;
  const fractured = Date.parse(x.laserFiredAt ?? x.naturalDecayTime);
  if (Number.isNaN(fractured)) return true;
  const hours = Math.min(
    expiryHours[String(x.structureId)] ?? DEFAULT_EXPIRY_HOURS,
    MAX_EXPIRY_HOURS
  );
  return fractured + hours * 3_600_000 >= now - DAY_MS;
}

/** A record older than this is stale: officers' tabs record their Miners' accounts on every load. */
export const RECORD_STALE_MS = DAY_MS;

/**
 * How each day a notice listed stands on the recorded account, as `lateNoticeStanding` reads it:
 * a day the record still lists as owed is owed; a day up to the record's own date that it does
 * not list is paid; a day after it is unknown, so it reads as still owed, never as paid.
 */
function listedDays(
  notice: ListedNotice,
  unpaid: readonly OwedDay[],
  recordDay: string
): Map<string, LateNoticeDayState> {
  const owed = new Map(unpaid.map((d) => [d.date, d]));
  const out = new Map<string, LateNoticeDayState>();
  for (const { date, tax } of notice.lines) {
    const day = owed.get(date);
    const known = day !== undefined || date <= recordDay;
    const remaining = day ? day.owed : known ? 0 : tax;
    const dayTax = day ? day.tax : tax;
    out.set(date, {
      tax: dayTax,
      held: false,
      credited: dayTax - remaining,
      forgiven: 0,
      writtenOff: 0,
      remaining,
      settled: remaining <= 0,
    });
  }
  return out;
}

/** Builds both docs. `now` is epoch ms. */
export function buildReadModels(inputs: ReadModelInputs, now: number): ReadModels {
  const accounts = new Map((inputs.accounts ?? []).map((a) => [a.id as string, a]));
  const notices = inputs.notices ?? [];
  const minerIds = new Set<string>([...accounts.keys(), ...notices.map((n) => n.minerId)]);
  for (const p of inputs.payments) if (typeof p.minerId === 'string') minerIds.add(p.minerId);

  const entries: MinerListEntry[] = [];
  for (const minerId of [...minerIds].sort()) {
    const payments = inputs.payments.filter((p) => p.minerId === minerId);
    let lastPaidAt: string | null = null;
    for (const p of payments) {
      const at = p.at as string;
      // A donation before the book is neither credited nor shown as a payment.
      if (p.source === 'donation' && inputs.startDate && isBeforeBook(at, inputs.startDate))
        continue;
      const tax = (p.amount as number) - ((p.notTaxAmount as number | undefined) ?? 0);
      if (tax > 0 && (lastPaidAt === null || at > lastPaidAt)) lastPaidAt = at;
    }
    const account = accounts.get(minerId);
    const live = account && liveAccount(account, payments);
    const asOf = typeof account?.at === 'string' ? account.at : null;
    const mine = notices
      .filter((n) => n.minerId === minerId)
      .sort((x, y) => x.issuedAt.localeCompare(y.issuedAt) || x.id.localeCompare(y.id));
    // Without the days recorded, a notice cannot be read as settled.
    const unpaid = live?.unpaidDays;
    const unsettled = mine
      .filter(
        (n) =>
          !unpaid ||
          !asOf ||
          !lateNoticeStanding(n, listedDays(n, unpaid, asOf.slice(0, 10))).settled
      )
      .map((n) => ({
        id: n.id,
        issuedAt: n.issuedAt,
        declarations: inputs.declarations.filter((d) => d[NOTICE_ID_FIELD] === n.id),
      }));
    const ids = new Set(mine.map((n) => n.id));
    entries.push({
      minerId,
      owed: live?.owed ?? 0,
      credit: account
        ? (Number(account.credit) || 0) +
          Math.max(0, paidSinceRecord(account, payments) - (Number(account.owed) || 0))
        : 0,
      asOf,
      stale:
        asOf === null ||
        now - Date.parse(asOf) > RECORD_STALE_MS ||
        mine.some((n) => n.issuedAt > asOf) ||
        (inputs.edits ?? []).some(
          (e) => (e.minerId === undefined || e.minerId === minerId) && e.at > asOf
        ),
      lastPaidAt,
      unsettled,
      unresolvedDeclarations: inputs.declarations.filter(
        (d) => !d.resolution && ids.has(d[NOTICE_ID_FIELD] as string)
      ),
    });
  }

  let donationsBeforeBook = 0;
  const unmatchedPayments: Data[] = [];
  for (const p of inputs.payments) {
    if (
      p.source === 'donation' &&
      inputs.startDate &&
      isBeforeBook(p.at as string, inputs.startDate)
    )
      donationsBeforeBook += 1;
    // A donation wholly marked not tax needs nothing more; a partly marked one still does.
    else if (!p.minerId && (p.amount as number) - ((p.notTaxAmount as number | undefined) ?? 0) > 0)
      unmatchedPayments.push(p);
  }
  const extractions = (inputs.extractions as unknown as MirrorExtraction[]).filter((x) =>
    inWindow(x, inputs.expiryHours, now)
  );
  return {
    [MINER_LIST_DOC]: { schema: READ_MODELS_SCHEMA, miners: entries },
    [OVERVIEW_DOC]: {
      schema: READ_MODELS_SCHEMA,
      donationsBeforeBook,
      unmatchedPayments,
      extractions: extractions as unknown as Data[],
    },
  };
}

/** Edits that change what either doc is built from, whatever they name. */
const READ_MODEL_EDITS: ReadonlySet<string> = new Set([
  'recordAccounts',
  'writeOff',
  'reverseWriteOff',
  'dismiss',
  'dismissRecords',
  'reverseDismissal',
  'addAdjustment',
  'reverseAdjustment',
  'editAdjustment',
  'rejectDispute',
  'dismissDispute',
  'issueLateNotice',
  'issueStatement',
  'closeAccount',
  'declare',
  'resolveDeclaration',
  'recordPayment',
  'assignPayment',
  'reassignPayment',
  'markNotTax',
  'setMiner',
  'unlink',
  'regroupMiner',
  'linkSurvey',
  'setFullyMined',
]);

/**
 * Whether an edit moves the Overview or Miners doc: a Miner's recorded account, notices,
 * payments, declarations, grouping, write-offs, dismissals, corrections or dispute answers (each
 * moves what the record is judged against, so the entry turns stale), an Extraction, or the book's
 * start date or expiry.
 */
export function movesReadModels(action: { action: string; patch?: object }): boolean {
  if (READ_MODEL_EDITS.has(action.action)) return true;
  const patch = (action.action === 'updateSettings' ? action.patch : undefined) as Data | undefined;
  return patch?.startDate !== undefined || patch?.structureExpiryHours !== undefined;
}

/** Drops `undefined`, which Firestore refuses. */
export function plainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** JSON with sorted keys: Firestore hands fields back in its own order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

export interface ReadModelsPlan {
  writes: { id: string; data: Data }[];
  mismatches: { id: string; kind: 'missing' | 'stale' }[];
}

/** Which docs differ from what `fresh` says they should be (`updatedAt` and unknown fields ignored). */
export function planReadModels(
  fresh: ReadModels,
  existing: ReadonlyMap<string, Data>
): ReadModelsPlan {
  const plan: ReadModelsPlan = { writes: [], mismatches: [] };
  for (const id of [MINER_LIST_DOC, OVERVIEW_DOC] as const) {
    const want = plainData(fresh[id]) as unknown as Data;
    const held = existing.get(id);
    const same =
      held !== undefined &&
      Object.entries(want).every(([k, v]) => canonical(held[k]) === canonical(v));
    if (same) continue;
    plan.writes.push({ id, data: want });
    plan.mismatches.push({ id, kind: held === undefined ? 'missing' : 'stale' });
  }
  return plan;
}
