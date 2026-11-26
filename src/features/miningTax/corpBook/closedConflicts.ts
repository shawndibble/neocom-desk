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
