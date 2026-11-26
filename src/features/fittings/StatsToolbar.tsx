import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import type { FittingStats } from '@/engine/fittings/types';
import { useOverheatAll } from './statsConditions';

export function StatsToolbar({ stats }: { stats: FittingStats }) {
  const { t } = useTranslation();
  const overheatAll = useOverheatAll((state) => state.overheatAll);
  const setOverheatAll = useOverheatAll((state) => state.setOverheatAll);
  const canOverheat = overheatAll || stats.allOverheated || stats.overheated !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1 text-xs">
      <label
        className={`flex min-h-9 items-center gap-2 ${
          stats.allOverheated ? 'text-warning' : ''
        } ${canOverheat ? 'cursor-pointer' : 'text-text-dim'}`}
      >
        <Checkbox
          checked={overheatAll}
          disabled={!canOverheat}
          onChange={(event) => setOverheatAll(event.target.checked)}
        />
        {t('fittings.stats.overheatAll')}
      </label>
    </div>
  );
}
