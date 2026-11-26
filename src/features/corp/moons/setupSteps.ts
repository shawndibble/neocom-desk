import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import { isRefineryPlaceholder, refineryPlaceholder } from './moonsFormat';

export type SetupStepId = 'rate' | 'autoSync' | 'refineryNames';

export type SetupStepState = 'done' | 'todo' | 'checking';

export interface SetupStep {
  id: SetupStepId;
  state: SetupStepState;
  unreadable?: number;
}

export interface SetupChecklistInput {
  rates: readonly TaxRate[];
  scheduledSync: ScheduledSyncStatus | null | undefined;
  refineries: readonly { id: number; name: string }[];
  today: string;
}

export interface SetupChecklist {
  steps: SetupStep[];
  done: number;
  complete: boolean;
  corpRatePct?: number;
}

export function setupChecklist(input: SetupChecklistInput): SetupChecklist {
  const corp = input.rates
    .filter((r): r is Extract<TaxRate, { scope: 'corp' }> => r.scope === 'corp')
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const inForce = corp.filter((r) => r.effectiveFrom <= input.today).at(-1);
  const steps: SetupStep[] = [
    { id: 'rate', state: corp.length > 0 ? 'done' : 'todo' },
    { id: 'autoSync', state: input.scheduledSync?.status === 'active' ? 'done' : 'todo' },
  ];
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
  const done = steps.filter((s) => s.state === 'done').length;
  return {
    steps,
    done,
    complete: done === steps.length,
    ...(inForce ? { corpRatePct: inForce.pct } : {}),
  };
}
