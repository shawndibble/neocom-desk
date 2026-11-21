/**
 * Which of the five outcomes a problem on the Tax tab offers (resolving in the app, decision
 * 20261116-194150): settle it yourself — pay it, fix my records, not paying — or ask the
 * corporation — I already paid, I don't owe this. Only the ones that apply, self-service first,
 * with the likeliest preselected — and never one whose button would be disabled.
 */
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { minusLines } from '@/engine/miningTax/oreLines';
import type { OreLine } from '@/engine/miningTax/types';

export type OutcomeId = 'pay' | 'fixRecords' | 'notPaying' | 'paid' | 'notOwed';

/** Settle it yourself, or ask the corporation: the dialog's two groups. */
export const SELF_SERVICE: readonly OutcomeId[] = ['pay', 'fixRecords', 'notPaying'];

interface Of {
  corporationId: number;
  corpName: string;
  characterId: number;
  /** The book row the problem is about; absent when no day of it is in view. */
  row?: BookRowView;
}

export type ResolveProblem =
  /** Donations the book synced past without crediting. */
  | (Of & {
      kind: 'uncredited';
      amount: number;
      /** The Late notice the days they paid are on; without one there is nothing to declare yet. */
      noticeId?: string;
      /** Every day the donations were paying, oldest first: what the mail to the corporation says. */
      days?: string[];
      /**
       * Donations the book holds for an officer's review without counting them (#6207), not ones
       * it lacks: each the member may say was tax (a claim of their own, no Late notice needed).
       */
      held?: { id: string; characterId: number }[];
    })
  /** A billed day whose quantity or rate differs from the member's own record. */
  | (Of & { kind: 'figure'; bookAsksMore: boolean })
  /** Ore the member gave another Payee that the book also recorded. */
  | (Of & { kind: 'conflict' })
  /** A Late notice whose days are still unpaid. */
  | (Of & { kind: 'overdue'; noticeId: string; period: string })
  /** A plain billed day with nothing disputed: pay it, or stop being reminded. */
  | (Of & { kind: 'billed' })
  /** An officer kept the bill, with what to do next. */
  | (Of & {
      kind: 'kept';
      by: 'dispute' | 'declaration';
      nextStep?: string;
      reason?: string;
      noticeId?: string;
    });

/** What "I don't owe this" says about a day: the dispute it sends. */
export type NotOwedPlan =
  { kind: 'payee' } | { kind: 'rate'; pct: number } | { kind: 'quantity'; lines: OreLine[] };

/**
 * The dispute "I don't owe this" would send for a day, or none when the member's own record
 * gives nothing to dispute — never a whole-day quantity dispute: a rate the member recorded
 * lower is a rate dispute at their rate; ore the book recorded beyond their own record is a
 * quantity dispute of the excess; ore they gave another Payee is the original payee dispute.
 */
export function notOwedPlan(row: BookRowView | undefined): NotOwedPlan | undefined {
  if (!row || row.recordKey === undefined) return undefined;
  if (row.state === 'conflict') return { kind: 'payee' };
  const d = row.dispute;
  if (d?.rate === true && d.personalPct !== undefined && d.bookPct > d.personalPct)
    return { kind: 'rate', pct: d.personalPct };
  const excess = row.personalOreLines ? minusLines(row.oreLines, row.personalOreLines) : [];
  if (excess.length > 0) return { kind: 'quantity', lines: excess };
  const f = row.flagged;
  // A Conflict the officer already kept resolved to a plain bill: the member's answer is the same.
  if (f?.kind === 'payee') return { kind: 'payee' };
  // A kept bill whose figures no longer show the claim: say the same thing again.
  if (f?.state !== 'rejected') return undefined;
  if (f.kind === 'rate' && f.claimedPct !== undefined) return { kind: 'rate', pct: f.claimedPct };
  if (f.kind === 'quantity' && f.lines && f.lines.length > 0)
    return { kind: 'quantity', lines: f.lines };
  return undefined;
}

export interface Offer {
  outcomes: OutcomeId[];
  preselected: OutcomeId;
  /** Whether "Not paying" can also tell the corporation why: it needs a day the book recorded. */
  tellWhy: boolean;
  /** "I already paid" is offered, but there is no Late notice to declare it on yet. */
  noNotice: boolean;
}

export function outcomesFor(p: ResolveProblem): Offer {
  // A reason reaches the corporation as a dispute of the day: it needs the book's record, and
  // the server refuses a second dispute of a day already disputed (a kept bill by dispute).
  const tellWhy = p.row?.recordKey !== undefined && p.row.flagged === undefined;
  const plan = notOwedPlan(p.row);
  switch (p.kind) {
    case 'uncredited': {
      // The book holds them already: paying again, or "not paying" ISK it holds, is no answer;
      // claiming needs no Late notice.
      if (p.held)
        return {
          outcomes: ['paid'],
          preselected: 'paid',
          tellWhy,
          noNotice: false,
        };
      const noNotice = p.noticeId === undefined;
      // The donation is the proof, not a quarrel with a figure: no "I don't owe this" here.
      return {
        outcomes: ['pay', 'notPaying', 'paid'],
        preselected: noNotice ? 'pay' : 'paid',
        tellWhy,
        noNotice,
      };
    }
    case 'figure': {
      const canDispute = tellWhy && plan !== undefined;
      return {
        outcomes: ['pay', 'notPaying', ...(canDispute ? (['notOwed'] as const) : [])],
        preselected: p.bookAsksMore && canDispute ? 'notOwed' : 'pay',
        tellWhy,
        noNotice: false,
      };
    }
    case 'conflict':
      return {
        outcomes: ['fixRecords', 'notPaying', ...(tellWhy ? (['notOwed'] as const) : [])],
        preselected: 'fixRecords',
        tellWhy,
        noNotice: false,
      };
    case 'overdue':
      return {
        outcomes: ['pay', 'notPaying', 'paid'],
        preselected: 'pay',
        tellWhy,
        noNotice: false,
      };
    case 'billed':
      return { outcomes: ['pay', 'notPaying'], preselected: 'pay', tellWhy, noNotice: false };
    case 'kept':
      // The member may say it again: a dispute again (the hold does not renew), or the proof again.
      return {
        outcomes: [
          'pay',
          'notPaying',
          ...(p.by === 'declaration' ? (['paid'] as const) : []),
          ...(p.by === 'dispute' && plan !== undefined ? (['notOwed'] as const) : []),
        ],
        preselected: 'pay',
        tellWhy,
        noNotice: p.by === 'declaration' && p.noticeId === undefined,
      };
  }
}
