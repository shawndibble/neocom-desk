import type { ClosedDayPlan } from '@/engine/corpTaxBook/closedDayFix';
import type { BookRowView } from '@/engine/corpTaxBook/personal';

type Day = Pick<BookRowView, 'corporationId' | 'characterId' | 'date' | 'solarSystemId'>;

export function closedConflictFor(
  plans: readonly ClosedDayPlan[],
  row: Day
): ClosedDayPlan | undefined {
  return plans.find(
    (p) =>
      p.state === 'conflict' &&
      p.characterId === row.characterId &&
      p.date === row.date &&
      p.solarSystemId === row.solarSystemId &&
      p.books.some((b) => b.corporationId === row.corporationId)
  );
}

export interface ConflictNames {
  payee: (payeeId: string) => string;
  corp: (corporationId: number) => string;
  typeNames: ReadonlyMap<number, string>;
}

export const closedConflictCorps = (plan: ClosedDayPlan, names: ConflictNames): string =>
  plan.books.map((b) => names.corp(b.corporationId)).join(', ');

export const closedConflictPayees = (plan: ClosedDayPlan, names: ConflictNames): string =>
  plan.fixes
    .filter((f) => f.corporationId === undefined)
    .map((f) => names.payee(f.payeeId))
    .join(', ');
