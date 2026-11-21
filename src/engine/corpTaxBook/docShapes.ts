/**
 * The Corp Tax Book's stored documents as the member's reader parses them (issue #4065): each
 * `read...` takes one Firestore doc's plain data and returns the engine's shape, or null when it
 * is malformed. Pure: the member's reader (`corpBookStore.ts`) fetches, this parses. The officer's
 * reader (`bookClient.ts`, `bookRead/`) keeps the stored shape as written (it trusts what the
 * server wrote under the officer rules) and shares the settings parser, `parseBookSettings`
 * (`bookDocs.ts`), with this one.
 */
import { NOTICE_ID_FIELD } from '../../../functions/src/corpTaxBookLateNotice';
import {
  checkpointProblems,
  type RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import type { Adjustment } from './adjustments';
import type { RecordedWriteOff, TaxPayment } from './payments';
import { num, parseBookSettings, str } from './bookDocs';
import type { Miner } from './charges';
import type { Dismissal } from './dismissals';
import { parsePaymentId } from './payouts';
import { readClaimEvidence, type Declaration } from './overdue';
import type { ToleranceExemption } from './toleranceExemptions';

type Data = Record<string, unknown>;

/** A donation of the member's own that no Miner has been credited with yet — theirs to claim. */
export interface ClaimablePayment {
  id: string;
  characterId: number;
  amount: number;
  at: string;
}

/**
 * A donation of the member's own the sync held for an officer's review (#6207) because their
 * Miner seemed to owe nothing: the book holds the ISK without counting it. The donor may say it
 * was tax (`claimCorpTaxBookPayment` with `inReview`).
 */
export interface InReviewPayment {
  id: string;
  characterId: number;
  amount: number;
  at: string;
  /** The corporation's wallet journal ref (from the payment id `j{division}_{refId}`). */
  refId?: number;
  /** What the donor wrote on it. */
  reason?: string;
}

/** What the book holds of a donation, for telling one it holds from one it does not hold yet. */
export interface HeldPayment {
  characterId: number;
  amount: number;
  at: string;
  notTaxAmount?: number;
  /** A donation the sync read from the wallet, or a hand record an officer dated. */
  source?: 'donation' | 'manual';
}

/** A moon owner's coverage and read clock as the miner reads them: never a name, payee or rate. */
export interface MemberFeederCoverage {
  corporationId: number;
  coveragePeriods: { from: string; to?: string }[];
  lastReadWellAt?: string;
}

/** The book's settings doc; `null` when it is not an active book, or is still in its setup window (D24: then nothing changes). */
export function readBookSettings(corporationId: number, d: Data | undefined, now = Date.now()) {
  if (!d || d.active !== true) return null;
  const settings = parseBookSettings(d);
  // A freshly turned-on book is still being set up (rates, sync, payment matching): members see nothing yet.
  if (settings.membersSeeFrom !== undefined && now < settings.membersSeeFrom) return null;
  if (!settings.startDate) return null;
  const syncedAt = num(settings.lastSync?.at);
  const divisionNames = settings.divisionNames ?? {};
  // Absent on a book no sync has stamped since the record began: the engine then uses lastSync.
  const donationsReadAt = d.donationsReadAt === null ? null : num(d.donationsReadAt);
  const checked: { donationsCheckedAt?: string | null } =
    donationsReadAt === undefined
      ? {}
      : {
          donationsCheckedAt:
            donationsReadAt === null ? null : new Date(donationsReadAt).toISOString(),
        };
  return {
    corporationId,
    startDate: settings.startDate,
    graceHours: settings.graceHours,
    overdueDays: settings.overdueDays,
    ...(settings.runningAccountFrom ? { runningAccountFrom: settings.runningAccountFrom } : {}),
    hubId: settings.hubId,
    oreForm: settings.oreForm,
    divisions: settings.divisions,
    ...(Object.keys(divisionNames).length > 0 ? { divisionNames } : {}),
    ...(settings.taxContact ? { taxContact: settings.taxContact } : {}),
    rates: settings.rates,
    ...(syncedAt !== undefined ? { lastSyncedAt: new Date(syncedAt).toISOString() } : {}),
    ...checked,
  };
}

/** A payment doc: `Matched` ones credit a Miner, the rest are claimable by their donor. */
export function readPayment(
  id: string,
  d: Data
): {
  payment?: TaxPayment;
  held: HeldPayment;
  claimable?: ClaimablePayment;
  inReview?: InReviewPayment;
} | null {
  const characterId = num(d.characterId);
  const amount = num(d.amount);
  const at = str(d.at);
  if (characterId === undefined || amount === undefined || !at) return null;
  const notTaxAmount = num(d.notTaxAmount);
  const held: HeldPayment = {
    characterId,
    amount,
    at,
    ...(notTaxAmount !== undefined ? { notTaxAmount } : {}),
    source: d.source === 'manual' ? 'manual' : 'donation',
  };
  const minerId = str(d.minerId);
  if (!minerId) {
    // Only a donation can be claimed, and not one an officer has marked "not tax" in full
    // or one the sync held for an officer's review (#6207).
    const tax = d.source === 'donation' && (notTaxAmount ?? 0) < amount;
    const claimable =
      tax && d.reviewReason === undefined ? { id, characterId, amount, at } : undefined;
    if (tax && d.reviewReason === 'no-open-balance') {
      const refId = parsePaymentId(id)?.refId ?? NaN;
      const reason = str(d.reason);
      const inReview: InReviewPayment = {
        id,
        characterId,
        amount,
        at,
        ...(Number.isSafeInteger(refId) ? { refId } : {}),
        ...(reason ? { reason } : {}),
      };
      return { held, inReview };
    }
    return { held, ...(claimable ? { claimable } : {}) };
  }
  return {
    held,
    payment: {
      id,
      minerId,
      characterId,
      amount,
      at,
      source: d.source === 'manual' ? 'manual' : 'donation',
      ...(notTaxAmount !== undefined ? { notTaxAmount } : {}),
    },
  };
}

export function readDismissal(id: string, d: Data): Dismissal | null {
  const scope = str(d.scope);
  const targetId = str(d.targetId);
  const at = str(d.at);
  if (!scope || !targetId || !at || !['record', 'miner', 'moon', 'extraction'].includes(scope)) {
    return null;
  }
  const reversed = d.reversed as Data | undefined | null;
  return {
    id,
    scope: scope as Dismissal['scope'],
    targetId,
    by: num(d.by) ?? 0,
    at,
    reason: str(d.reason) ?? '',
    ...(reversed ? { reversed: { by: num(reversed.by) ?? 0, at: str(reversed.at) ?? at } } : {}),
  };
}

const DECLARATION_KINDS: readonly Declaration['kind'][] = [
  'contract',
  'other-division',
  'wrong-corp',
  'another-way',
];

/** A declaration on one of the member's own late notices (#6206). */
export function readMemberDeclaration(id: string, d: Data): Declaration | null {
  const noticeId = str(d[NOTICE_ID_FIELD]);
  const kind = str(d.kind) as Declaration['kind'] | undefined;
  const at = str(d.at);
  if (!noticeId || !at || !kind || !DECLARATION_KINDS.includes(kind)) return null;
  const amount = num(d.amount);
  const note = str(d.note);
  const r = d.resolution as Data | undefined | null;
  const rKind = str(r?.kind);
  const rAt = str(r?.at);
  const reason = str(r?.reason);
  const nextStep = str(r?.nextStep);
  const by = num(r?.by);
  return {
    id,
    noticeId,
    kind,
    at,
    ...(amount !== undefined ? { amount } : {}),
    ...(note !== undefined ? { note } : {}),
    ...readClaimEvidence(d),
    ...((rKind === 'confirmed' || rKind === 'rejected') && rAt
      ? {
          resolution: {
            kind: rKind,
            at: rAt,
            ...(reason !== undefined ? { reason } : {}),
            ...(nextStep !== undefined ? { nextStep } : {}),
            // Only whether the book itself confirmed it (0): the member needs no officer's id.
            ...(by === 0 ? { by } : {}),
          },
        }
      : {}),
  };
}

export function readMiner(id: string, d: Data): Miner | null {
  const characterIds = Array.isArray(d.characterIds)
    ? d.characterIds.filter((x): x is number => typeof x === 'number')
    : [];
  if (characterIds.length === 0) return null;
  const paidThrough = str(d.paidThrough);
  return {
    id,
    characterIds,
    mainCharacterId: num(d.mainCharacterId) ?? characterIds[0],
    ...(paidThrough ? { paidThrough } : {}),
  };
}

/** `corps/{book}/feederCoverage/{corp}`, written by the server (#4622). */
export function readFeederCoverage(id: string, d: Data): MemberFeederCoverage | null {
  const corporationId = Number(id);
  if (!Number.isSafeInteger(corporationId) || corporationId <= 0) return null;
  if (!Array.isArray(d.coveragePeriods)) return null;
  const coveragePeriods = d.coveragePeriods.flatMap((p) => {
    const from = str((p as Data | null)?.from);
    if (!from) return [];
    const to = str((p as Data).to);
    return [{ from, ...(to !== undefined ? { to } : {}) }];
  });
  const readAt = num(d.lastReadWellAt);
  return {
    corporationId,
    coveragePeriods,
    ...(readAt !== undefined ? { lastReadWellAt: new Date(readAt).toISOString() } : {}),
  };
}

export function readAdjustment(id: string, d: Data): Adjustment | null {
  const minerId = str(d.minerId);
  const date = str(d.date);
  const amount = num(d.amount);
  if (!minerId || !date || amount === undefined) return null;
  return {
    id,
    minerId,
    date,
    amount,
    reason: str(d.reason) ?? '',
    by: num(d.by) ?? 0,
    at: str(d.at) ?? '',
    ...reversedOf(d.reversed),
    ...(d.kind === 'opening' ? { kind: 'opening' as const } : {}),
    ...(str(d.replaces) ? { replaces: str(d.replaces) } : {}),
  };
}

/** The `reversed` stamp an officer's undo leaves on a record: who, when and why. */
function reversedOf(raw: unknown): { reversed?: { by: number; at: string; reason: string } } {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Data;
  const at = str(r.at);
  return at ? { reversed: { by: num(r.by) ?? 0, at, reason: str(r.reason) ?? '' } } : {};
}

export function readWriteOff(id: string, d: Data): RecordedWriteOff | null {
  const minerId = str(d.minerId);
  const amount = num(d.amount);
  const at = str(d.at);
  if (!minerId || amount === undefined || !at) return null;
  return {
    id,
    minerId,
    amount,
    at,
    reason: str(d.reason) ?? '',
    ...reversedOf(d.reversed),
  };
}

/** `toleranceExemptions`: an officer set how much of one Miner's day shortfall the book forgives. */
export function readToleranceExemption(id: string, d: Data): ToleranceExemption | null {
  const minerId = str(d.minerId);
  const date = str(d.date);
  const forgive = num(d.forgive);
  if (!minerId || !date || forgive === undefined || forgive < 0) return null;
  return {
    id,
    minerId,
    date,
    forgive,
    reason: str(d.reason) ?? '',
    by: num(d.by) ?? 0,
    at: str(d.at) ?? '',
  };
}

/**
 * A Miner's closed-through checkpoint as the book stores it (`accountCheckpoints/{minerId}`,
 * readable by the Miner); null for anything that does not add up (`checkpointProblems`).
 */
export function readCheckpoint(id: string, d: Data): RunningAccountCheckpoint | null {
  const through = str(d.through);
  const credit = num(d.credit);
  const balance = num(d.balance);
  const at = str(d.at);
  if (!through || credit === undefined || balance === undefined || !at || !Array.isArray(d.owed))
    return null;
  const owed = d.owed.flatMap((o: unknown) => {
    if (typeof o !== 'object' || o === null) return [];
    const r = o as Data;
    const date = str(r.date);
    const remaining = num(r.remaining);
    const opt = (key: 'tax' | 'credited' | 'writtenOff' | 'charge') => {
      const v = num(r[key]);
      return v !== undefined ? { [key]: v } : {};
    };
    return date && remaining !== undefined
      ? [
          {
            date,
            remaining,
            ...opt('tax'),
            ...opt('credited'),
            ...opt('writtenOff'),
            ...opt('charge'),
            ...(r.held === true ? { held: true } : {}),
          },
        ]
      : [];
  });
  const paidThrough = str(d.paidThrough) ?? null;
  const by = num(d.by);
  const characterIds = Array.isArray(d.characterIds)
    ? d.characterIds.filter((c: unknown): c is number => typeof c === 'number')
    : undefined;
  const checkpoint: RunningAccountCheckpoint = {
    minerId: str(d.minerId) ?? id,
    through,
    owed,
    credit,
    balance,
    paidThrough,
    ...(characterIds ? { characterIds } : {}),
    at,
    ...(by !== undefined ? { by } : {}),
  };
  return checkpointProblems(checkpoint).length === 0 ? checkpoint : null;
}
