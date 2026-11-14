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
  /** ESI's attributes read, carrying its own age; null when it could not be read. */
  result: CachedResult<CharacterAttributes> | null;
  implantBonuses: Implants;
  /** How the base sheet was arrived at — null until ESI has been read at all. */
  attributeBaseline?: AttributeBaseline | null;
  /** Live remap availability, same source the plan editor costs against; null when unreadable. */
  remapInfo: RemapAvailability | null;
  /** Makes a plan from the live skill queue with its best remaps placed; omitted hides the button. */
  onOptimizeQueue?: () => void;
  /** The in-game queue has nothing in it: the button stays focusable and says why. */
  queueEmpty?: boolean;
  /**
   * The injected Accelerator's controls (`AcceleratorSection`), under Optimize
   * queue so the pilot can set its time left without opening a plan; omitted
   * when nothing is injected.
   */
  accelerator?: ReactNode;
  className?: string;
}

/** The attribute chips as the Plans page shows them: here on desktop, in the phone's Accelerator sheet. */
export function PlanAttributeChips({
  result,
  implantBonuses,
  attributeBaseline,
}: Pick<AttributesPaneProps, 'result' | 'implantBonuses' | 'attributeBaseline'>) {
  return (
    <AttributeChips
      attributes={result?.data ?? null}
      implantBonuses={implantBonuses}
      boosterBonus={acceleratorBonusOf(attributeBaseline)}
      dense
      short
    />
  );
}

/**
 * The character's current attributes, filling the plan list's detail pane
 * until a plan is opened (#158 put a "select a plan" placeholder there, which
 * said only what the list beside it already said). Attributes are the input
 * every plan is costed against and the thing a remap changes, so this is
 * reference the planner wants in view, not a duplicate of the trained view.
 *
 * The editor route wants the same reference for the same reason and shows the
 * same `AttributeChips` + `DataAgeBadge` pair — but as a section inside
 * `PlanToolsPane`, not as another panel, because its sidebar already carries
 * the plan list and the tools panel. See `PlanEditor`'s `attributes` section.
 *
 * Desktop only. A phone gets `AcceleratorRow` (the chips live in its sheet)
 * and Optimize queue in the New plan menu, so "Training now" is not pushed
 * below the fold by reference and once-per-booster controls.
 */
export function AttributesPane({
  result,
  implantBonuses,
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
        {/* Same live remap read the plan editor costs against (#1726) — a
            pilot checking Attributes shouldn't have to open a plan to see it. */}
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
