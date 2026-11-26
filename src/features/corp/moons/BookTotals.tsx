import { useId, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatChip, StatChips } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  balanceOfBucket,
  matchesMinerBalance,
  overdueAging,
  type MinerBalance,
} from '@/engine/corpTaxBook/overdueAging';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { useBook } from './useBook';
import { isk } from './moonsFormat';
import { minersBalancePath } from './moonsPaths';

function linkTo(miners: readonly MinerRow[], balance: MinerBalance) {
  return miners.some((m) => matchesMinerBalance(m, balance))
    ? { to: minersBalancePath(balance) }
    : {};
}

export function BookTotals({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { totals, miners } = useBook().view;
  return (
    <StatChips>
      <StatChip
        label={t('corpTaxBook.moons.chips.owed')}
        value={isk(totals.owed)}
        emphasis
        {...linkTo(miners, 'owing')}
      />
      <StatChip
        label={t('corpTaxBook.moons.chips.overdue')}
        value={t('corpTaxBook.moons.chips.overdueValue', {
          amount: isk(totals.overdue),
          count: totals.overdueCount,
        })}
        {...(totals.overdueCount > 0 ? { tone: 'danger' as const } : {})}
        {...linkTo(miners, 'overdue')}
      />
      <StatChip
        label={t('corpTaxBook.moons.chips.credit')}
        value={isk(totals.credit)}
        {...linkTo(miners, 'credit')}
      />
      {children}
    </StatChips>
  );
}

export function OverdueAging() {
  const { t } = useTranslation();
  const { miners, totals } = useBook().view;
  const aging = useMemo(() => overdueAging(miners), [miners]);
  const titleId = useId();
  if (totals.overdueCount === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-wrap items-center gap-x-3">
      <h3 id={titleId} className={eyebrowClassName}>
        {t('corpTaxBook.moons.aging.title')}
      </h3>
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
            {...(b.count > 0 ? { to: minersBalancePath(balanceOfBucket(b.id)) } : {})}
          />
        ))}
      </StatChips>
    </section>
  );
}
