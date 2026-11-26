import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, BuildStrategySelect } from './autoBuildShared';

interface BuildPlanAutoBuildControlProps {
  maxDepth: number;
  scope: readonly MakeMethod[];
  disabled?: boolean;
  onApply: (options: { strategy: BuildStrategy }) => void;
}

export function BuildPlanAutoBuildControl({
  maxDepth,
  scope,
  disabled,
  onApply,
}: BuildPlanAutoBuildControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<BuildStrategy>('cost-effective');
  const canApply = !disabled && maxDepth > 0;

  function handleStrategyChange(next: BuildStrategy) {
    setStrategy(next);
    if (canApply) onApply({ strategy: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="whitespace-nowrap">{t('industry.buildStrategyLabel')}</span>
      <BuildStrategySelect
        strategy={strategy}
        onChange={handleStrategyChange}
        size="sm"
        disabled={!canApply}
      />
      <CraftScopeChips scope={scope} />
    </div>
  );
}
