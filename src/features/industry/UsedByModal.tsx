import { Fragment, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import type { ItemMenuFor } from '@/features/market/ItemContextMenu';
import { formatCount } from '@/lib/formatCount';
import { materialConsumers } from './subBuildPlan';

interface UsedByModalProps {
  /** The bought material to list consumers of; `null` closes the dialog. */
  typeID: number | null;
  onClose: () => void;
  /** The material's row quantity in the table, for the reconciling footer. */
  tableTotal: number | null;
  materials: readonly ResolvedMaterial[];
  /** The plan's own job, which is not part of the resolved tree. */
  mainJob: { typeID: number; runs: number };
  nameFor: (typeID: number) => string;
  itemMenuFor?: ItemMenuFor;
  itemActionsFor?: (typeId: number) => ReactElement;
}

/**
 * Which jobs consume a bought material, and how much each takes — the
 * "where does this line come from" the flat Materials table gives up
 * (`subBuildPlan`). Opened from the row menu, only in a plan that builds
 * something.
 */
export function UsedByModal({
  typeID,
  onClose,
  tableTotal,
  materials,
  mainJob,
  nameFor,
  itemMenuFor,
  itemActionsFor,
}: UsedByModalProps) {
  const { t } = useTranslation();
  const consumers = typeID === null ? [] : materialConsumers(materials, typeID, mainJob);
  const jobsTotal = consumers.reduce((sum, consumer) => sum + consumer.quantity, 0);
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
              <span>{t('industry.usedBy.title', { material, count: consumers.length })}</span>
            )
      }
      titleActions={typeID !== null && itemActionsFor ? itemActionsFor(typeID) : undefined}
    >
      {typeID !== null && (
        <div className="space-y-3">
          <ul className="divide-y divide-line border-y border-line text-xs">
            <li className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-1.5 text-text-dim">
              <span>{t('industry.usedBy.job')}</span>
              <span className="text-right">{t('industry.usedBy.runs')}</span>
              <span className="min-w-16 text-right">{t('industry.usedBy.quantity')}</span>
            </li>
            {consumers.map((consumer, index) => (
              <Fragment key={`${consumer.typeID}-${index}`}>
                {withMenu(
                  consumer.typeID,
                  <li className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-1.5">
                    <span>{nameFor(consumer.typeID)}</span>
                    <span className="text-right tabular-nums">{formatCount(consumer.runs)}</span>
                    <span className="min-w-16 text-right tabular-nums">
                      {formatCount(consumer.quantity)}
                    </span>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
          {tableTotal !== null && (
            <p className="text-xs text-text-dim">
              {t('industry.usedBy.total', {
                total: formatCount(tableTotal),
                jobs: formatCount(jobsTotal),
              })}{' '}
              {jobsTotal !== tableTotal && t('industry.usedBy.roundUp')}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
