import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import { answeredByMember, isoDay } from './memberFlag';
import { notPayingDayKey } from './resolve/notPaying';

export interface ConflictSummary {
  days: number;
  amount: number;
  first: DisplayRow;
  firstCorpName: string;
  firstResolvesOn: string;
  waiting: number;
}

const dayKey = (view: BookRowView) => `${view.characterId}:${view.date}:${view.solarSystemId}`;

export function summarizeConflicts(
  rows: readonly DisplayRow[],
  notPaying: ReadonlySet<string> = new Set()
): ConflictSummary | null {
  const conflicts = rows
    .flatMap((dr) =>
      dr.corp?.kind === 'row' &&
      dr.corp.view.state === 'conflict' &&
      !notPaying.has(
        notPayingDayKey(dr.corp.view.corporationId, dr.corp.view.characterId, dr.corp.view.date)
      )
        ? [{ dr, corp: dr.corp }]
        : []
    )
    .sort(
      (a, b) =>
        Number(!a.corp.view.resolvesAt) - Number(!b.corp.view.resolvesAt) ||
        (a.corp.view.resolvesAt ?? '').localeCompare(b.corp.view.resolvesAt ?? '')
    );
  const head = conflicts.find((c) => !answeredByMember(c.corp.view)) ?? conflicts[0];
  if (!head) return null;
  const byDay = new Map<string, boolean>();
  for (const c of conflicts) {
    const key = dayKey(c.corp.view);
    byDay.set(key, (byDay.get(key) ?? true) && answeredByMember(c.corp.view));
  }
  return {
    days: byDay.size,
    waiting: [...byDay.values()].filter(Boolean).length,
    amount: conflicts.reduce((sum, c) => sum + c.corp.view.billed, 0),
    first: head.dr,
    firstCorpName: head.corp.corpName,
    firstResolvesOn: isoDay(head.corp.view.resolvesAt),
  };
}

export function conflictSiblings(rows: readonly BookRowView[], view: BookRowView): BookRowView[] {
  const key = dayKey(view);
  return rows.filter((r) => r.state === 'conflict' && r.id !== view.id && dayKey(r) === key);
}
