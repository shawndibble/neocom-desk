import { isPlainRecord } from '@/engine/guards';
import { DAY_MS } from '@/lib/age';
/**
 * Overdue (D19, D29): an unsettled Late notice goes Overdue N days (14 by
 * default) after it is issued; no interest, reminders are manual. A miner's
 * declaration ("paid by contract / other division / wrong corp") pauses the
 * clock for at most 14 days, after which it resumes on its own with a note.
 * An officer confirming or rejecting the declaration ends the pause there, and
 * the original clock resumes: a rejection gives no fresh days (#6206).
 */

export const DEFAULT_OVERDUE_DAYS = 14;
/** The most a Late notice's Overdue clock pauses for declarations, in total. */
export const DECLARATION_PAUSE_DAYS = 14;

/** `another-way`: the Miner's own "I paid this another way" (#6206). */
export type DeclarationKind = 'contract' | 'other-division' | 'wrong-corp' | 'another-way';

/** Who received a claimed transfer, as the member's own wallet journal names it. */
export type TransferRecipient = 'corporation' | 'character' | 'otherCorporation';
export const TRANSFER_RECIPIENTS: readonly TransferRecipient[] = [
  'corporation',
  'character',
  'otherCorporation',
];

/** One transfer from the member's wallet journal, sent as the proof of an "I already paid". */
export interface ClaimedTransfer {
  amount: number;
  at: string;
  /** The member's own journal id: what an officer searches their journal on. */
  journalRef: number;
  recipient: TransferRecipient;
  recipientId?: number;
}

/**
 * What the server's check of a claimed transfer found (resolving in the app): in the book
 * (`found`), already placed on a Miner's account (`credited`, whose `minerId` it names), in a division it does not read (`division`), paid after its last sync
 * (`notSynced`), older than any sync could read (`tooOld`), none of those (`notFound`), matched by several
 * payments (`ambiguous`, an officer picks), or paid
 * to a person or another corporation, which the book cannot see.
 */
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
  /** `credited`: the Miner whose account the transfer was placed on. */
  minerId?: string;
  division?: number;
}

export interface Declaration {
  id: string;
  /** The late notice it answers (stored under `NOTICE_ID_FIELD`, its legacy name). */
  noticeId: string;
  kind: DeclarationKind;
  at: string;
  note?: string;
  /** What the Miner says they paid, when they said (#6206). */
  amount?: number;
  /** The transfers the member sent as proof, and what checking each against the book found. */
  transfers?: ClaimedTransfer[];
  checks?: ClaimCheck[];
  /**
   * `nextStep`: when rejected, what the officer says the member should do now. `by` 0: the
   * book confirmed it itself, every transfer found in the corporation's wallet.
   */
  resolution?: {
    kind: 'confirmed' | 'rejected';
    at: string;
    reason?: string;
    nextStep?: string;
    by?: number;
  };
}

/** A stored declaration's transfers and checks, the malformed ones dropped. */
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
  /** When it goes (or went) Overdue, with every pause counted. */
  overdueAt: string;
  /** While paused: when the pause ends on its own. */
  pausedUntil?: string;
  /** A declaration ran its full 14 days unanswered and the clock resumed. */
  resumedAfterPause: boolean;
}

export interface OverdueInput {
  issuedAt: string;
  /** Every day the notice listed is paid (`lateNoticeStanding`). */
  settled: boolean;
  now: string;
  /** This notice's declarations. */
  declarations: readonly Declaration[];
  overdueDays?: number;
}

export function overdueStatus(input: OverdueInput): OverdueStatus {
  const now = Date.parse(input.now);
  const cap = DECLARATION_PAUSE_DAYS * DAY_MS;
  // Each declaration's pause window, merged so overlapping ones count once and
  // capped at 14 days in total, so filing again cannot extend the pause.
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
