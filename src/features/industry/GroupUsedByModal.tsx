import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { sum } from '@/engine/math';
import type { ItemMenuFor } from '@/features/market/ItemContextMenu';
import { formatCount } from '@/lib/formatCount';
import type { GroupMaterialConsumer } from './groupMaterialConsumers';
import { onPlanLinkClick, planHref } from './planLinkClick';

interface GroupUsedByModalProps {
  /** The material to list consuming plans of; `null` closes the dialog. */
  typeID: number | null;
  onClose: () => void;
  /** The material's row quantity in the group table, for the reconciling footer. */
  tableTotal: number | null;
  consumers: readonly GroupMaterialConsumer[];
  nameFor: (typeID: number) => string;
  onOpenPlan: (planId: string) => void;
  itemMenuFor?: ItemMenuFor;
  itemActionsFor?: (typeId: number, bordered?: boolean) => ReactElement;
}

/**
 * Which plans of a Build Group need a material, and how much each takes: the
 * "where does this row come from" the merged Group Rollup gives up. The plan
 * level sibling of `UsedByModal` (a plan, not a job, is the consumer here).
 */
export function GroupUsedByModal({
  typeID,
  onClose,
  tableTotal,
  consumers,
  nameFor,
  onOpenPlan,
  itemMenuFor,
  itemActionsFor,
}: GroupUsedByModalProps) {
  const { t } = useTranslation();
  const plansTotal = sum(consumers.map((consumer) => consumer.quantity));
  const material = typeID === null ? '' : nameFor(typeID);
  const withMenu = (id: number, trigger: ReactElement) =>
    itemMenuFor ? itemMenuFor(id, trigger) : trigger;

  return (
    <Modal
      open={typeID !== null}
      onClose={onClose}
      title={
        typeID === null
          ? ''
          : withMenu(
              typeID,
              <span>{t('industry.usedBy.groupTitle', { material, count: consumers.length })}</span>
            )
      }
      titleActions={typeID !== null && itemActionsFor ? itemActionsFor(typeID) : undefined}
    >
      {typeID !== null && (
        <div className="space-y-3">
          <ul className="divide-y divide-line border-y border-line text-xs">
            <li className="grid grid-cols-[1fr_auto] gap-x-4 py-1.5 text-text-dim">
              <span>{t('industry.usedBy.plan')}</span>
              <span className="min-w-16 text-right">{t('industry.usedBy.quantity')}</span>
            </li>
            {consumers.map((consumer) => (
              <li key={consumer.planId} className="grid grid-cols-[1fr_auto] gap-x-4 py-1.5">
                <Link
                  to={planHref(consumer.planId)}
                  onClick={onPlanLinkClick(() => {
                    onClose();
                    onOpenPlan(consumer.planId);
                  })}
                  className={inlineLinkClassName}
                >
                  {consumer.planName}
                </Link>
                <span className="min-w-16 text-right tabular-nums">
                  {formatCount(consumer.quantity)}
                </span>
              </li>
            ))}
          </ul>
          {tableTotal !== null && (
            <p className="text-xs text-text-dim">
              {t('industry.usedBy.groupTotal', {
                total: formatCount(tableTotal),
                plans: formatCount(plansTotal),
              })}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
