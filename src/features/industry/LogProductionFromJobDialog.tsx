/**
 * The "Log production…" job-row action (issue #1787) resolves to exactly one
 * Build Plan before it navigates anywhere: this dialog is what asks the
 * pilot when that isn't already obvious — no plan builds the job's
 * blueprint yet (offer to create one), or more than one does (pick which).
 * Never shown for the single-match case, which `ActiveJobsPanel` navigates
 * straight through.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { BuildPlanRecord } from '@/db';

interface LogProductionFromJobDialogProps {
  /** The job's product/blueprint name, for the dialog's copy. */
  productName: string;
  /** The character's own plans that already build this blueprint — never length 1 (the caller resolves that case without opening this dialog). */
  matches: readonly BuildPlanRecord[];
  /** Creates a new plan for the job's blueprint and resolves to its id, or null if the blueprint isn't in the SDE catalog. */
  onCreatePlan: () => Promise<string | null>;
  /** A target plan was resolved — the pilot picked one, or one was just created. */
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
    const planId = await onCreatePlan();
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
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={onClose} disabled={creating}>
              {t('industry.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void handleCreate()}
              disabled={creating}
            >
              {t('industry.jobsLogProductionCreatePlan')}
            </Button>
          </div>
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
                  className={`${tappableRowClassName} w-full px-1 py-2 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
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
