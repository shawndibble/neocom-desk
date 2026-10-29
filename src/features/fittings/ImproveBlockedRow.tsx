import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import type { RejectedOption } from '@/engine/fittings/improve';
import { overageOf, RESOURCES } from '@/engine/fittings/makeItFit';
import type { FittingStats } from '@/engine/fittings/types';
import { changeLine } from './improveChangeLines';
import { brokeText, m3sFormat } from './improveLineText';
import type { ImproveSettings } from './improveSettings';

interface Props {
  option: RejectedOption;
  own: FittingStats;
  fitTotal: number | null;
  /** Whether the implant alternative was searched for this fix. */
  searched: boolean;
  swapLabel: string;
  settings: ImproveSettings;
}

/** A fix that cannot be applied as it stands: greyed, with what it needs and why nothing covers it. */
export function ImproveBlockedRow({ option, own, fitTotal, searched, swapLabel, settings }: Props) {
  const { t } = useTranslation();
  const short = RESOURCES.filter((resource) => overageOf(option.after, resource) > 0).map(
    (resource) =>
      t('fittings.improve.flyableShort', {
        amount: m3sFormat(overageOf(option.after, resource)),
        resource: t(`fittings.improve.resource.${resource}`),
      })
  );
  return (
    <li
      className="border-line text-text-dim rounded-xs border p-2 text-sm"
      data-testid="improve-flyable-blocked"
    >
      <span className="flex items-start gap-2">
        <TypeIcon typeId={option.candidate.toTypeId} size={32} width={24} height={24} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{swapLabel}</span>
          <span className="block text-xs">{t('fittings.improve.unflyable')}</span>
          <span className="text-warning block text-xs">
            {option.guardrail === 'budget' && searched
              ? t('fittings.improve.flyableNoCover', { short: short.join(', ') })
              : brokeText(t, option, settings, fitTotal)}
          </span>
          <span className="block text-xs">{changeLine(t, option, own)}</span>
        </span>
      </span>
    </li>
  );
}
