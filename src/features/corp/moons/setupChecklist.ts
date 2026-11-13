/**
 * The Overview's first-run setup checklist (decision "Corp Tax Book setup checklist"): what a
 * book just turned on still needs, each step read off state the page already holds. Pure, so
 * the steps and their order are tested without the page.
 */
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import { isRefineryPlaceholder, refineryPlaceholder } from './moonsFormat';

export type SetupStepId = 'rate' | 'autoSync' | 'refineryNames' | 'firstStatement';

/** `checking`: the names are still being looked up, so the step is neither done nor to do. */
export type SetupStepState = 'done' | 'todo' | 'checking';

export interface SetupStep {
  id: SetupStepId;
  state: SetupStepState;
  /** The refineries that read by a stand-in, not their name (`refineryNames` only). */
  unreadable?: number;
}

export interface SetupChecklistInput {
  rates: readonly TaxRate[];
  scheduledSync: ScheduledSyncStatus | null | undefined;
  /** The book's own refineries (not a moon owner's), each with the name it reads by now. */
  refineries: readonly { id: number; name: string }[];
  statementCount: number;
  /** EVE/UTC `YYYY-MM-DD`, to pick the corp rate in force. */
  today: string;
}

export interface SetupChecklist {
  steps: SetupStep[];
  done: number;
  complete: boolean;
  /** The corp rate in force today (else the first one set); undefined with none. */
  corpRatePct?: number;
}

export function setupChecklist(input: SetupChecklistInput): SetupChecklist {
  const corp = input.rates
    .filter((r): r is Extract<TaxRate, { scope: 'corp' }> => r.scope === 'corp')
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const inForce = corp.filter((r) => r.effectiveFrom <= input.today).at(-1) ?? corp[0];
  const steps: SetupStep[] = [
    { id: 'rate', state: corp.length > 0 ? 'done' : 'todo' },
    { id: 'autoSync', state: input.scheduledSync?.status === 'active' ? 'done' : 'todo' },
  ];
  // A book that only collects for moon owners has no refineries of its own to name.
  if (input.refineries.length > 0) {
    const unreadable = input.refineries.filter((r) => isRefineryPlaceholder(r.name, r.id));
    const looking = unreadable.some((r) => r.name === refineryPlaceholder(r.id));
    steps.push(
      looking
        ? { id: 'refineryNames', state: 'checking' }
        : unreadable.length > 0
          ? { id: 'refineryNames', state: 'todo', unreadable: unreadable.length }
          : { id: 'refineryNames', state: 'done' }
    );
  }
  steps.push({ id: 'firstStatement', state: input.statementCount > 0 ? 'done' : 'todo' });
  const done = steps.filter((s) => s.state === 'done').length;
  return {
    steps,
    done,
    complete: done === steps.length,
    ...(inForce ? { corpRatePct: inForce.pct } : {}),
  };
}
