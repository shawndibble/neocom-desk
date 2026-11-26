import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { minusLines } from '@/engine/miningTax/oreLines';
import type { OreLine } from '@/engine/miningTax/types';

export type OutcomeId = 'pay' | 'fixRecords' | 'notPaying' | 'paid' | 'notOwed';

export const SELF_SERVICE: readonly OutcomeId[] = ['pay', 'fixRecords', 'notPaying'];

interface Of {
  corporationId: number;
  corpName: string;
  characterId: number;
  row?: BookRowView;
}

export type ResolveProblem =
  | (Of & {
      kind: 'uncredited';
      amount: number;
      noticeId?: string;
      days?: string[];
      held?: { id: string; characterId: number }[];
    })
  | (Of & { kind: 'figure'; bookAsksMore: boolean })
  | (Of & { kind: 'conflict' })
  | (Of & { kind: 'overdue'; noticeId: string; period: string })
  | (Of & { kind: 'billed' })
  | (Of & {
      kind: 'kept';
      by: 'dispute' | 'declaration';
      nextStep?: string;
      reason?: string;
      noticeId?: string;
    });

export type NotOwedPlan =
  { kind: 'payee' } | { kind: 'rate'; pct: number } | { kind: 'quantity'; lines: OreLine[] };

export function notOwedPlan(row: BookRowView | undefined): NotOwedPlan | undefined {
  if (!row || row.recordKey === undefined) return undefined;
  if (row.state === 'conflict') return { kind: 'payee' };
  const d = row.dispute;
  if (d?.rate === true && d.personalPct !== undefined && d.bookPct > d.personalPct)
    return { kind: 'rate', pct: d.personalPct };
  const excess = row.personalOreLines ? minusLines(row.oreLines, row.personalOreLines) : [];
  if (excess.length > 0) return { kind: 'quantity', lines: excess };
  const f = row.flagged;
  if (f?.kind === 'payee') return { kind: 'payee' };
  if (f?.state !== 'rejected') return undefined;
  if (f.kind === 'rate' && f.claimedPct !== undefined) return { kind: 'rate', pct: f.claimedPct };
  if (f.kind === 'quantity' && f.lines && f.lines.length > 0)
    return { kind: 'quantity', lines: f.lines };
  return undefined;
}

export interface Offer {
  outcomes: OutcomeId[];
  preselected: OutcomeId;
  tellWhy: boolean;
  noNotice: boolean;
}

export function outcomesFor(p: ResolveProblem): Offer {
  const tellWhy = p.row?.recordKey !== undefined && p.row.flagged === undefined;
  const plan = notOwedPlan(p.row);
  switch (p.kind) {
    case 'uncredited': {
      if (p.held)
        return {
          outcomes: ['paid'],
          preselected: 'paid',
          tellWhy,
          noNotice: false,
        };
      const noNotice = p.noticeId === undefined;
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
