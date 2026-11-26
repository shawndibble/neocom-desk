import { isPlainRecord } from '@/engine/guards';
import { DAY_MS } from '@/lib/age';

export const DEFAULT_OVERDUE_DAYS = 14;
export const DECLARATION_PAUSE_DAYS = 14;

export type DeclarationKind = 'contract' | 'other-division' | 'wrong-corp' | 'another-way';

export type TransferRecipient = 'corporation' | 'character' | 'otherCorporation';
export const TRANSFER_RECIPIENTS: readonly TransferRecipient[] = [
  'corporation',
  'character',
  'otherCorporation',
];

export interface ClaimedTransfer {
  amount: number;
  at: string;
  journalRef: number;
  recipient: TransferRecipient;
  recipientId?: number;
}

export type ClaimCheckResult =
  | 'found'
  | 'credited'
  | 'division'
  | 'notSynced'
  | 'tooOld'
  | 'notFound'
  | 'ambiguous'
  | 'person'
  | 'otherCorp';
export const CLAIM_CHECK_RESULTS: readonly ClaimCheckResult[] = [
  'found',
  'credited',
  'division',
  'notSynced',
  'tooOld',
  'notFound',
  'ambiguous',
  'person',
  'otherCorp',
];

export interface ClaimCheck {
  result: ClaimCheckResult;
  paymentId?: string;
  minerId?: string;
  division?: number;
}

export interface Declaration {
  id: string;
  noticeId: string;
  kind: DeclarationKind;
  at: string;
  note?: string;
  amount?: number;
  transfers?: ClaimedTransfer[];
  checks?: ClaimCheck[];
  resolution?: {
    kind: 'confirmed' | 'rejected';
    at: string;
    reason?: string;
    nextStep?: string;
    by?: number;
  };
}

export function readClaimEvidence(d: {
  transfers?: unknown;
  checks?: unknown;
}): Pick<Declaration, 'transfers' | 'checks'> {
  const transfers = Array.isArray(d.transfers)
    ? d.transfers.flatMap((t): ClaimedTransfer[] =>
        isPlainRecord(t) &&
        typeof t.amount === 'number' &&
        typeof t.at === 'string' &&
        typeof t.journalRef === 'number' &&
        TRANSFER_RECIPIENTS.includes(t.recipient as TransferRecipient)
          ? [
              {
                amount: t.amount,
                at: t.at,
                journalRef: t.journalRef,
                recipient: t.recipient as TransferRecipient,
                ...(typeof t.recipientId === 'number' ? { recipientId: t.recipientId } : {}),
              },
            ]
          : []
      )
    : [];
  const checks = Array.isArray(d.checks)
    ? d.checks.flatMap((c): ClaimCheck[] =>
        isPlainRecord(c) && CLAIM_CHECK_RESULTS.includes(c.result as ClaimCheckResult)
          ? [
              {
                result: c.result as ClaimCheckResult,
                ...(typeof c.paymentId === 'string' ? { paymentId: c.paymentId } : {}),
                ...(typeof c.minerId === 'string' ? { minerId: c.minerId } : {}),
                ...(typeof c.division === 'number' ? { division: c.division } : {}),
              },
            ]
          : []
      )
    : [];
  return {
    ...(transfers.length > 0 ? { transfers } : {}),
    ...(checks.length > 0 ? { checks } : {}),
  };
}

export type OverdueState = 'settled' | 'open' | 'paused' | 'overdue';

export interface OverdueStatus {
  state: OverdueState;
  overdueAt: string;
  pausedUntil?: string;
  resumedAfterPause: boolean;
}

export interface OverdueInput {
  issuedAt: string;
  settled: boolean;
  now: string;
  declarations: readonly Declaration[];
  overdueDays?: number;
}

export function overdueStatus(input: OverdueInput): OverdueStatus {
  const now = Date.parse(input.now);
  const cap = DECLARATION_PAUSE_DAYS * DAY_MS;
  const requested = input.declarations
    .map((d) => {
      const start = Date.parse(d.at);
      const capped = start + cap;
      const end = d.resolution ? Math.min(Date.parse(d.resolution.at), capped) : capped;
      return { start, end, unanswered: !d.resolution };
    })
    .sort((a, b) => a.start - b.start);
  const windows: typeof requested = [];
  let paused = 0;
  let cursor = -Infinity;
  for (const w of requested) {
    const start = Math.max(w.start, cursor);
    const end = Math.min(w.end, start + (cap - paused));
    if (end > start) {
      paused += end - start;
      windows.push({ ...w, start, end });
    }
    cursor = Math.max(cursor, w.end);
  }

  const overdueAt =
    Date.parse(input.issuedAt) + (input.overdueDays ?? DEFAULT_OVERDUE_DAYS) * DAY_MS + paused;

  const active = windows.filter((w) => w.start <= now && now < w.end);
  const resumedAfterPause = windows.some((w) => w.unanswered && now >= w.end);
  const base = { overdueAt: new Date(overdueAt).toISOString(), resumedAfterPause };
  if (input.settled) return { state: 'settled', ...base };
  if (active.length > 0) {
    const until = Math.max(...active.map((w) => w.end));
    return { state: 'paused', ...base, pausedUntil: new Date(until).toISOString() };
  }
  return { state: now >= overdueAt ? 'overdue' : 'open', ...base };
}
