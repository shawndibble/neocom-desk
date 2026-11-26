import { useEffect, useRef } from 'react';
import { db } from '@/db';
import {
  closedDayRecordChangeId,
  planClosedDayFix,
  type ClosedDay,
  type ClosedDayPlan,
} from '@/engine/corpTaxBook/closedDayFix';
import { RESIDUE_ISK } from '@/engine/corpTaxBook/minerRunningAccount';
import { isSyncConfigured } from '@/app/syncStatus';
import { pullCursorKey } from '@/sync/localBookkeeping';
import { MINING_TAX_ASSIGNMENTS } from '@/sync/syncedCollections';
import { fixClosedDay } from '../ledgerActions';
import { linksReady } from '../paymentLinkStore';
import type { PayeeRunningAccounts } from '../payeeRunningAccounts';
import { recordChangesReady } from '../recordChangeStore';
import type { CorpBookView } from './corpBookView';

type Accounts = Pick<PayeeRunningAccounts, 'of' | 'historyOf'>;

export function paidIntoOf(day: ClosedDay, accounts: Accounts): Set<string> {
  return new Set(
    day.allocations.flatMap((a) => {
      if (a.id === undefined) return [];
      const settled = (accounts.of(a.payeeId) ?? accounts.historyOf(a.payeeId))?.account.day(
        day.date
      );
      return settled && settled.credited - settled.forgiven >= RESIDUE_ISK ? [a.id] : [];
    })
  );
}

export function closedDayPlans(view: CorpBookView, accounts: Accounts): ClosedDayPlan[] {
  return view.overlay.closedDays
    .map((day) => planClosedDayFix(day, paidIntoOf(day, accounts)))
    .filter((plan) => plan.state !== 'aligned');
}

async function closedDayFixReady(characterIds: readonly number[]): Promise<boolean> {
  if (!(await recordChangesReady(characterIds)) || !(await linksReady(characterIds))) return false;
  if (!isSyncConfigured()) return true;
  const cursors = await db.settings.bulkGet(
    characterIds.map((id) => pullCursorKey(id, MINING_TAX_ASSIGNMENTS.remoteName))
  );
  return cursors.every((c) => c !== undefined);
}

export function useClosedDayFixes(
  view: CorpBookView | null,
  accounts: Accounts | null,
  onFixed?: () => void
): void {
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!view || !accounts) return;
    const due = closedDayPlans(view, accounts)
      .filter((plan) => plan.state === 'fix')
      .map((plan) => ({ plan, id: closedDayRecordChangeId(plan, 'autoFix') }))
      .filter(({ id }) => !tried.current.has(id));
    if (due.length === 0) return;
    for (const { id } of due) tried.current.add(id);
    const forget = (ids: readonly string[]) => {
      for (const id of ids) tried.current.delete(id);
    };
    void (async () => {
      const characterIds = [...new Set(due.map(({ plan }) => plan.characterId))];
      if (!(await closedDayFixReady(characterIds))) return forget(due.map((d) => d.id));
      let fixed = false;
      for (const { plan, id } of due) {
        const result = await fixClosedDay(plan, 'autoFix');
        if (!result.ok) forget([id]);
        else if (result.value) fixed = true;
      }
      if (fixed) onFixed?.();
    })().catch(() => forget(due.map((d) => d.id)));
  }, [view, accounts, onFixed]);
}
