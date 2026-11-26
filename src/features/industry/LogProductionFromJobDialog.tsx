import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import type { BuildPlanRecord } from '@/db';
import { DialogFooter } from '@/components/ui/DialogFooter';

interface LogProductionFromJobDialogProps {
  productName: string;
  matches: readonly BuildPlanRecord[];
  onCreatePlan: () => Promise<string | null>;
  onResolved: (planId: string) => void;
  onClose: () => void;
}

export function LogProductionFromJobDialog({
  productName,
  matches,
  onCreatePlan,
  onResolved,
  onClose,
}: LogProductionFromJobDialogProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  async function handleCreate() {
    setCreating(true);
    setCreateFailed(false);
    const planId = await onCreatePlan().catch(() => null);
    if (planId) {
      onResolved(planId);
    } else {
      setCreating(false);
      setCreateFailed(true);
    }
  }

  const noMatch = matches.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={
        noMatch
          ? t('industry.jobsLogProductionNoPlanTitle', { name: productName })
          : t('industry.jobsLogProductionPickPlanTitle')
      }
    >
      {noMatch ? (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-text-dim">
            {t('industry.jobsLogProductionNoPlanHint', { name: productName })}
          </p>
          {createFailed && (
            <p role="alert" className="text-danger">
              {t('industry.jobsLogProductionCreateFailed')}
            </p>
          )}
          <DialogFooter>
            <Button size="sm" onClick={onClose} aria-disabled={creating || undefined}>
              {t('industry.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void handleCreate()}
              loading={creating}
            >
              {t('industry.jobsLogProductionCreatePlan')}
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-text-dim">
            {t('industry.jobsLogProductionPickPlanHint', { name: productName })}
          </p>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {matches.map((plan) => (
              <li key={plan.id}>
                <button
                  type="button"
                  className={`${tappableRowClassName} w-full px-1 py-2 text-left ${rowInteractiveClassName} ${focusRingInsetClassName}`}
                  onClick={() => onResolved(plan.id)}
                >
                  {plan.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>
              {t('industry.cancel')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
