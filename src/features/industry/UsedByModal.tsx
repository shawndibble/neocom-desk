import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import type { ItemMenuFor } from '@/features/market/ItemContextMenu';
import { sum } from '@/engine/math';
import { formatCount } from '@/lib/formatCount';
import { materialConsumers } from './subBuildPlan';

interface UsedByModalProps {
  typeID: number | null;
  onClose: () => void;
  tableTotal: number | null;
  materials: readonly ResolvedMaterial[];
  mainJob: { typeID: number; runs: number };
  nameFor: (typeID: number) => string;
  itemMenuFor?: ItemMenuFor;
  itemActionsFor?: (typeId: number, bordered?: boolean) => ReactElement;
}

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
  const jobsTotal = sum(consumers.map((consumer) => consumer.quantity));
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
              <li
                key={`${consumer.typeID}-${index}`}
                className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-1.5"
              >
                <span>{nameFor(consumer.typeID)}</span>
                <span className="text-right tabular-nums">{formatCount(consumer.runs)}</span>
                <span className="min-w-16 text-right tabular-nums">
                  {formatCount(consumer.quantity)}
                </span>
              </li>
            ))}
          </ul>
          {tableTotal !== null && (
            <p className="text-xs text-text-dim">
              {t(
                jobsTotal === tableTotal ? 'industry.usedBy.total' : 'industry.usedBy.totalRoundUp',
                {
                  total: formatCount(tableTotal),
                  jobs: formatCount(jobsTotal),
                }
              )}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
