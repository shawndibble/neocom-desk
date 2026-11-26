import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ControlSize,
} from '@/components/ui';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';

const BUILD_STRATEGIES: readonly BuildStrategy[] = ['cost-effective', 'build', 'buy'];

function useBuildStrategyLabels(): Record<BuildStrategy, string> {
  const { t } = useTranslation();
  return {
    'cost-effective': t('industry.buildStrategyCostEffective'),
    build: t('industry.buildStrategyBuild'),
    buy: t('industry.buildStrategyBuy'),
  };
}

interface BuildStrategySelectProps {
  strategy: BuildStrategy;
  onChange: (strategy: BuildStrategy) => void;
  size?: ControlSize;
  disabled?: boolean;
}

export function BuildStrategySelect({
  strategy,
  onChange,
  size,
  disabled,
}: BuildStrategySelectProps) {
  const { t } = useTranslation();
  const label = useBuildStrategyLabels();
  return (
    <Select
      value={strategy}
      onValueChange={(value) => onChange(value as BuildStrategy)}
      disabled={disabled}
    >
      <SelectTrigger size={size} aria-label={t('industry.buildStrategyLabel')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BUILD_STRATEGIES.map((option) => (
          <SelectItem key={option} value={option}>
            {label[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SCOPE_TEXT_CLASSES = 'shrink-0 text-xs text-text-dim';

interface CraftScopeChipsProps {
  scope: readonly MakeMethod[];
}

export function CraftScopeChips({ scope }: CraftScopeChipsProps) {
  const { t } = useTranslation();
  const reactionsEligible = scope.includes('reaction');
  return (
    <span className="flex items-center gap-1">
      <HintText
        content={
          reactionsEligible
            ? t('industry.craftScopeReactionsEnabledHint')
            : t('industry.craftScopeReactionsDisabledHint')
        }
        className={SCOPE_TEXT_CLASSES}
      >
        {reactionsEligible
          ? t('industry.craftScopeReactionsIncluded')
          : t('industry.craftScopeReactionsExcluded')}
      </HintText>
    </span>
  );
}
