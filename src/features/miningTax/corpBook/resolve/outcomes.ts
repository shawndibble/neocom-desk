/**
 * Which of the five outcomes a problem on the Tax tab offers (resolving in the app, decision
 * 20261116-194150): settle it yourself — pay it, fix my records, not paying — or ask the
 * corporation — I already paid, I don't owe this. Only the ones that apply, self-service first,
 * with the likeliest preselected.
 */
import type { BookRowView } from '@/engine/corpTaxBook/personal';

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
      /** The Statement the days they paid are on; without one there is nothing to declare yet. */
      statementId?: string;
    })
  /** A billed day whose quantity or rate differs from the member's own record. */
  | (Of & { kind: 'figure'; bookAsksMore: boolean })
  /** Ore the member gave another Payee that the book also recorded. */
  | (Of & { kind: 'conflict' })
  /** An officer kept the bill, with what to do next. */
  | (Of & {
      kind: 'kept';
      by: 'dispute' | 'declaration';
      nextStep?: string;
      reason?: string;
      statementId?: string;
    });

export interface Offer {
  outcomes: OutcomeId[];
  preselected: OutcomeId;
  /** Whether "Not paying" can also tell the corporation why: it needs a day the book recorded. */
  tellWhy: boolean;
  /** "I already paid" is offered, but there is no Statement to declare it on yet. */
  noStatement: boolean;
}

export function outcomesFor(p: ResolveProblem): Offer {
  // A reason reaches the corporation as a dispute of the day: it needs the book's record, and
  // the server refuses a second dispute of a day an officer answered.
  const tellWhy =
    p.row?.recordKey !== undefined && p.row.flagged === undefined && p.kind !== 'kept';
  switch (p.kind) {
    case 'uncredited':
      return {
        outcomes: ['pay', 'notPaying', 'paid', ...(tellWhy ? (['notOwed'] as const) : [])],
        preselected: 'paid',
        tellWhy,
        noStatement: p.statementId === undefined,
      };
    case 'figure':
      return {
        outcomes: ['pay', 'notPaying', ...(tellWhy ? (['notOwed'] as const) : [])],
        preselected: p.bookAsksMore && tellWhy ? 'notOwed' : 'pay',
        tellWhy,
        noStatement: false,
      };
    case 'conflict':
      return {
        outcomes: ['fixRecords', 'notPaying', ...(tellWhy ? (['notOwed'] as const) : [])],
        preselected: 'fixRecords',
        tellWhy,
        noStatement: false,
      };
    case 'kept':
      return {
        outcomes: ['pay', 'notPaying', ...(p.by === 'declaration' ? (['paid'] as const) : [])],
        preselected: 'pay',
        tellWhy: false,
        noStatement: p.by === 'declaration' && p.statementId === undefined,
      };
  }
}
