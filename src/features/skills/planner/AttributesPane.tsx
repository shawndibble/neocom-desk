import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, Panel, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { AttributeChips } from '@/features/skills/AttributeChips';
import type { CachedResult } from '@/features/skills/data';
import { acceleratorBonusOf, type AttributeBaseline } from '@/engine/attributeBaseline';
import type { CharacterAttributes } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import type { RemapAvailability } from './remapAvailability';

interface AttributesPaneProps {
  result: CachedResult<CharacterAttributes> | null;
  implantBonuses: Implants;
  loading?: boolean;
  attributeBaseline?: AttributeBaseline | null;
  remapInfo: RemapAvailability | null;
  onOptimizeQueue?: () => void;
  queueEmpty?: boolean;
  accelerator?: ReactNode;
  className?: string;
}

export function PlanAttributeChips({
  result,
  implantBonuses,
  attributeBaseline,
  loading,
}: Pick<AttributesPaneProps, 'result' | 'implantBonuses' | 'attributeBaseline' | 'loading'>) {
  return (
    <AttributeChips
      attributes={result?.data ?? null}
      implantBonuses={implantBonuses}
      loading={loading}
      boosterBonus={acceleratorBonusOf(attributeBaseline)}
      dense
      short
    />
  );
}

export function AttributesPane({
  result,
  implantBonuses,
  loading,
  attributeBaseline = null,
  remapInfo,
  onOptimizeQueue,
  queueEmpty = false,
  accelerator,
  className,
}: AttributesPaneProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const chips = (
    <PlanAttributeChips
      result={result}
      implantBonuses={implantBonuses}
      loading={loading}
      attributeBaseline={attributeBaseline}
    />
  );
  const optimizeQueue = () => {
    if (!onOptimizeQueue) return null;
    const button = (
      <Button
        size="sm"
        align="start"
        className="w-full"
        aria-disabled={queueEmpty || undefined}
        onClick={onOptimizeQueue}
      >
        <span aria-hidden="true" className="shrink-0 text-text-dim">
          <Icon.OptimizeRemaps size={Icon.ICON_SIZE.sm} />
        </span>
        <span className="flex-1">{t('plans.optimizeQueue')}</span>
      </Button>
    );
    return (
      <div className="mt-3 border-t border-line pt-3">
        {queueEmpty ? (
          <Tooltip content={t('plans.optimizeQueueEmptyTip')}>{button}</Tooltip>
        ) : (
          button
        )}
      </div>
    );
  };
  const acceleratorSection = accelerator ? (
    <div className="mt-3 border-t border-line pt-3 text-xs">{accelerator}</div>
  ) : null;
  return (
    <>
      <Panel
        title={t('skills.attributes')}
        className={className}
        actions={
          result?.fetchedAt && <DataAgeBadge date={result.fetchedAt} expiresAt={result.expiresAt} />
        }
      >
        {chips}
        {remapInfo && (
          <p className="mt-2 text-[0.6875rem] text-text-dim">
            {`${t('plans.remapBudget', { bonus: remapInfo.bonus })} ${
              remapInfo.yearlyReady
                ? t('plans.remapBudgetYearlyReady')
                : t('plans.remapBudgetYearlyFrom', {
                    date: remapInfo.cooldownUntil
                      ? formatLocalDate(remapInfo.cooldownUntil, timeZone)
                      : '',
                  })
            }`}
          </p>
        )}
        {optimizeQueue()}
        {acceleratorSection}
      </Panel>
    </>
  );
}
