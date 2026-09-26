import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';

/** What the tree's marks mean: gold is Mastery V, bright can fly, dim can't yet, Ω needs Omega. */
export function Legend({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim', className)}
    >
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 border border-mastery-elite" />{' '}
        {t('ships.tree.legend.masteryV')}
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 border border-text-dim" /> {t('ships.tree.legend.canFly')}
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 border border-line opacity-50" />{' '}
        {t('ships.tree.legend.cantFly')}
      </span>
      <span className="flex items-center gap-1">
        <span className="font-serif font-bold text-omega">Ω</span> {t('ships.tree.legend.omega')}
      </span>
    </span>
  );
}
