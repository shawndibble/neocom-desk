import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatChip, StatChips } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { overdueAging } from '@/engine/corpTaxBook/overdueAging';
import { useTabsProjection } from './useTabsProjection';
import { isk } from './moonsFormat';
import { minersBalancePath } from './moonsPaths';

/**
 * The book's totals strip on the Overview and Miners tabs. A figure that a Miners view lists
 * (Owed, Overdue, Credit held) links to the Miners tab narrowed to those Miners, only while it
 * counts someone; Next Statement has no such view and stays a readout. `children` adds the
 * Overview's own chips after them.
 */
export function BookTotals({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { totals } = useTabsProjection();
  return (
    <StatChips>
      <StatChip
        label={t('corpTaxBook.moons.chips.owed')}
        value={isk(totals.owed)}
        emphasis
        {...(Math.round(totals.owed) > 0 ? { to: minersBalancePath('owing') } : {})}
      />
      <StatChip
        label={t('corpTaxBook.moons.chips.overdue')}
        value={t('corpTaxBook.moons.chips.overdueValue', {
          amount: isk(totals.overdue),
          count: totals.overdueCount,
        })}
        {...(totals.overdue > 0 ? { tone: 'danger' as const } : {})}
        {...(totals.overdueCount > 0 ? { to: minersBalancePath('overdue') } : {})}
      />
      <StatChip label={t('corpTaxBook.moons.chips.unbilled')} value={isk(totals.unbilled)} />
      <StatChip
        label={t('corpTaxBook.moons.chips.credit')}
        value={isk(totals.credit)}
        {...(Math.round(totals.credit) > 0 ? { to: minersBalancePath('credit') } : {})}
      />
      {children}
    </StatChips>
  );
}

/**
 * Overdue debt by age (0–30, 31–60, 61–90, over 90 days), each bucket linking to the Miners in
 * it. Every bucket shows, an empty one as a dash, so the line keeps its shape; the line is gone
 * while nothing is overdue.
 */
export function OverdueAging() {
  const { t } = useTranslation();
  const { miners, totals } = useTabsProjection();
  const aging = useMemo(() => overdueAging(miners), [miners]);
  if (totals.overdueCount === 0) return null;
  const title = t('corpTaxBook.moons.aging.title');
  return (
    <section aria-label={title} className="flex flex-wrap items-center gap-x-3">
      <h3 className={eyebrowClassName}>{title}</h3>
      <StatChips>
        {aging.map((b) => (
          <StatChip
            key={b.id}
            label={t(`corpTaxBook.moons.aging.${b.id}`)}
            value={
              b.count > 0
                ? t('corpTaxBook.moons.chips.overdueValue', {
                    amount: isk(b.amount),
                    count: b.count,
                  })
                : '—'
            }
            {...(b.count > 0 ? { to: minersBalancePath(`overdue-${b.id}`) } : {})}
          />
        ))}
      </StatChips>
    </section>
  );
}
