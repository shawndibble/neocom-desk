/**
 * DESIGN.md §6c amber warning mark after a List row's name: a rule break points
 * at this module. The tooltip sends the pilot to the stats column's warning.
 */
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import type { FittingModule } from '@/engine/fittings/types';
import { useBreaksRule } from './ruleBreakFlags';

export function RuleBreakBadge({ module }: { module: Pick<FittingModule, 'slot' | 'slotIndex'> }) {
  const { t } = useTranslation();
  if (!useBreaksRule(module)) return null;
  return (
    <HintText
      content={t('fittings.ruleBreak.tooltip')}
      className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-warning"
    >
      <Icon.Warn aria-hidden className="size-3" />
      {t('fittings.ruleBreak.label')}
    </HintText>
  );
}
