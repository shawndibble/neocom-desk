import { NOTICE_ID_FIELD } from '../../../functions/src/corpTaxBookLateNotice';
import {
  checkpointProblems,
  type RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import type { Adjustment } from './adjustments';
import type { RecordedWriteOff, TaxPayment } from './payments';
import { num, parseBookSettings, str } from './bookDocs';
import { DAY_SETTLE_TOLERANCE_PCT } from './minerRunningAccount';
import type { Miner } from './charges';
import type { Dismissal } from './dismissals';
import { parsePaymentId } from './payouts';
import { readClaimEvidence, type Declaration } from './overdue';
import type { ToleranceExemption } from './toleranceExemptions';

type Data = Record<string, unknown>;

export interface ClaimablePayment {
  id: string;
  characterId: number;
  amount: number;
  at: string;
}

export interface InReviewPayment {
  id: string;
  characterId: number;
  amount: number;
  at: string;
  refId?: number;
  reason?: string;
}

export interface HeldPayment {
  characterId: number;
  amount: number;
  at: string;
  notTaxAmount?: number;
  source?: 'donation' | 'manual';
}

export interface MemberFeederCoverage {
  corporationId: number;
  coveragePeriods: { from: string; to?: string }[];
  lastReadWellAt?: string;
}

export function readBookSettings(corporationId: number, d: Data | undefined, now = Date.now()) {
  if (!d || d.active !== true) return null;
  const settings = parseBookSettings(d);
  if (settings.membersSeeFrom !== undefined && now < settings.membersSeeFrom) return null;
  if (!settings.startDate) return null;
  const syncedAt = num(settings.lastSync?.at);
  const divisionNames = settings.divisionNames ?? {};
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
    hubId: settings.hubId,
    oreForm: settings.oreForm,
    divisions: settings.divisions,
    ...(settings.primaryDivision !== undefined
      ? { primaryDivision: settings.primaryDivision }
      : {}),
    ...(Object.keys(divisionNames).length > 0 ? { divisionNames } : {}),
    ...(settings.taxContact ? { taxContact: settings.taxContact } : {}),
    rates: settings.rates,
    ...(settings.dayTolerancePct !== DAY_SETTLE_TOLERANCE_PCT
      ? { dayTolerancePct: settings.dayTolerancePct }
      : {}),
    ...(syncedAt !== undefined ? { lastSyncedAt: new Date(syncedAt).toISOString() } : {}),
    ...checked,
  };
}

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
      ...(str(d.note) ? { note: str(d.note)! } : {}),
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
    ...(str(d.from) ? { from: str(d.from)! } : {}),
    ...(reversed
      ? {
          reversed: {
            by: num(reversed.by) ?? 0,
            at: str(reversed.at) ?? at,
            ...(str(reversed.from) ? { from: str(reversed.from)! } : {}),
          },
        }
      : {}),
  };
}

const DECLARATION_KINDS: readonly Declaration['kind'][] = [
  'contract',
  'other-division',
  'wrong-corp',
  'another-way',
];

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
            ...(by === 0 ? { by } : {}),
          },
        }
      : {}),
  };
}

function readLeftOn(raw: unknown): Record<number, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entries = Object.entries(raw).filter(
    ([id, day]) => Number.isSafeInteger(Number(id)) && typeof day === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function readMiner(id: string, d: Data): Miner | null {
  const characterIds = Array.isArray(d.characterIds)
    ? d.characterIds.filter((x): x is number => typeof x === 'number')
    : [];
  if (characterIds.length === 0) return null;
  const paidThrough = str(d.paidThrough);
  const leftOn = readLeftOn(d.leftOn);
  return {
    id,
    characterIds,
    mainCharacterId: num(d.mainCharacterId) ?? characterIds[0],
    ...(paidThrough ? { paidThrough } : {}),
    ...(leftOn ? { leftOn } : {}),
  };
}

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
