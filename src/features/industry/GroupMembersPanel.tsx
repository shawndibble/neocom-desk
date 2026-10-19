import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IskAmount, Panel } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import { onPlanLinkClick, planHref } from './planLinkClick';
import type { ComparedBuildRow } from './useComparedBuildResults';

interface GroupMembersPanelProps {
  plans: readonly BuildPlanRecord[];
  rowByPlanId: ReadonlyMap<string, ComparedBuildRow>;
  /** Opens one member on its own, the way clicking it in the list would. */
  onOpenPlan: (planId: string) => void;
}

export function GroupMembersPanel({ plans, rowByPlanId, onOpenPlan }: GroupMembersPanelProps) {
  const { t } = useTranslation();
  return (
    <Panel title={t('industry.groupMembers')} padded={false}>
      <ul className="divide-y divide-line text-xs">
        {plans.map((plan) => {
          const row = rowByPlanId.get(plan.id);
          return (
            <li key={plan.id}>
              <Link
                to={planHref(plan.id)}
                onClick={onPlanLinkClick(() => onOpenPlan(plan.id))}
                className={`${tappableRowClassName} group flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left ${rowInteractiveClassName} ${focusRingInsetClassName}`}
              >
                <span className="min-w-0 flex-1 truncate text-accent">{plan.name}</span>
                <span className="shrink-0 text-right tabular-nums text-text-dim">
                  {row?.result ? <IskAmount value={row.result.totalCost} decimals={0} /> : '—'}
                </span>
                <Icon.Descend
                  size={Icon.ICON_SIZE.sm}
                  aria-hidden="true"
                  className="-mr-1 shrink-0 text-text-faint group-hover:text-accent"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
