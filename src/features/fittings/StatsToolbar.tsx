import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox } from '@/components/ui';
import type { FittingStats } from '@/engine/fittings/types';
import { writeToClipboard } from '@/lib/clipboard';
import { fittingStatsText } from './fittingStatsText';
import { useOverheatAll } from './statsConditions';
import { SkillOverridesControl } from './SkillOverridesControl';

/**
 * The row above the stats sections: the "Overheat all" switch — every figure
 * on the page (and in Compare) switches to its overheated value, in amber —
 * the skills the numbers are worked out under, and "Copy stats" for pasting
 * the headline numbers into chat.
 */
export function StatsToolbar({ stats }: { stats: FittingStats }) {
  const { t } = useTranslation();
  const overheatAll = useOverheatAll((state) => state.overheatAll);
  const setOverheatAll = useOverheatAll((state) => state.setOverheatAll);
  const [notice, setNotice] = useState<string | null>(null);
  // Nothing to overheat: the switch has nothing to do (unless it's on, so it can be turned off).
  const canOverheat = overheatAll || stats.allOverheated || stats.overheated !== null;

  async function copy() {
    try {
      await writeToClipboard(fittingStatsText(stats, t));
      setNotice(t('fittings.stats.copied'));
    } catch {
      setNotice(t('fittings.stats.copyFailed'));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-1 text-xs">
      <label
        className={`flex min-h-11 items-center gap-2 md:min-h-9 ${
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
      <SkillOverridesControl />
      <span className="flex items-center gap-2">
        {notice && (
          <span role="status" className="text-text-dim">
            {notice}
          </span>
        )}
        <Button size="sm" className="min-h-11 md:min-h-8" onClick={() => void copy()}>
          {t('fittings.stats.copy')}
        </Button>
      </span>
    </div>
  );
}
