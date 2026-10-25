import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, SlideOver, Toast } from '@/components/ui';
import type { ImproveOption } from '@/engine/fittings/improve';
import { applyModuleUpgrade } from '@/engine/fittings/moduleUpgrades';
import type { Fitting } from '@/engine/fittings/types';
import { ImprovePanel } from './ImprovePanel';
import type { TargetProfiles } from './targetProfiles';
import type { FittingCatalogue } from './useFittingCatalogue';
import { useImprove, useImproveGoal } from './useImprove';
import type { FittingWorkspace } from './useFittingWorkspace';

interface UseImproveDrawerArgs {
  workspace: FittingWorkspace;
  /** Null on the Start screen, where there is nothing to improve. */
  fitting: Fitting | null;
  catalogue: FittingCatalogue | null;
  targetProfiles: TargetProfiles;
  isPhone: boolean;
  edit: FittingWorkspace['edit'];
}

/**
 * Improve: `open()` from the header's ⋮ menu, and the `drawer` (with its
 * Undo toast) to render once in the editor. A `SlideOver` beside the fit on
 * desktop, so the Ring stays steerable; a bottom sheet on a phone.
 */
export function useImproveDrawer({
  workspace,
  fitting,
  catalogue,
  targetProfiles,
  isPhone,
  edit,
}: UseImproveDrawerArgs): { open: () => void; drawer: ReactNode } {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const goal = useImproveGoal((state) => state.value);
  const setGoal = useImproveGoal((state) => state.setValue);
  // The Fitting before the last Apply, for the toast's Undo; null once it is gone.
  const [undo, setUndo] = useState<{ before: Fitting; message: string } | null>(null);
  const open = useCallback(() => setIsOpen(true), []);
  const close = () => setIsOpen(false);
  const search = useImprove(
    workspace.variants,
    catalogue,
    goal,
    targetProfiles.hydrated ? targetProfiles.selected : undefined,
    isOpen
  );

  function apply(options: ImproveOption[]) {
    if (!fitting) return;
    // One edit for every ticked row, so Back undoes them together.
    edit((f) => options.reduce((acc, option) => applyModuleUpgrade(acc, option.candidate), f));
    setUndo({
      before: fitting,
      message: t('fittings.improve.applied', { count: options.length }),
    });
  }

  const body = (
    <ImprovePanel
      goal={goal}
      onGoalChange={(next) => void setGoal(next)}
      search={search}
      catalogue={catalogue}
      onApply={apply}
    />
  );

  const drawer = fitting && (
    <>
      {isPhone ? (
        <Modal open={isOpen} onClose={close} placement="sheet" title={t('fittings.improve.title')}>
          {body}
        </Modal>
      ) : (
        <SlideOver open={isOpen} onClose={close} title={t('fittings.improve.title')}>
          {body}
        </SlideOver>
      )}
      {undo && (
        <Toast
          message={undo.message}
          instance={undo}
          undo={{
            label: t('fittings.improve.undo'),
            onUndo: () => {
              const before = undo.before;
              edit(() => before);
              setUndo(null);
            },
          }}
          onClose={() => setUndo(null)}
        />
      )}
    </>
  );
  return { open, drawer };
}
