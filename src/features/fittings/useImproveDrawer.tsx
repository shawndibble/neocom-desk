import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, SlideOver, Toast, useTimedToast } from '@/components/ui';
import {
  applyImproveCandidate,
  type DefenseChoice,
  type ImproveOption,
} from '@/engine/fittings/improve';
import type { Fitting } from '@/engine/fittings/types';
import { ImproveImplants } from './ImproveImplants';
import { ImprovePanel } from './ImprovePanel';
import { ImproveTrain } from './ImproveTrain';
import type { FitResource } from './makeItFitContext';
import type { TargetProfiles } from './targetProfiles';
import type { FittingCatalogue } from './useFittingCatalogue';
import {
  useImprove,
  useImproveGoal,
  useImproveMode,
  useImproveReach,
  useImproveSpendCap,
} from './useImprove';
import type { FittingWorkspace } from './useFittingWorkspace';

const moduleKey = (f: Fitting) =>
  f.modules.map((m) => `${m.slot}${m.slotIndex}:${m.typeId}`).join();
const sameModules = (a: Fitting, b: Fitting) => a === b || moduleKey(a) === moduleKey(b);

interface UseImproveDrawerArgs {
  workspace: FittingWorkspace;
  /** Null on the Start screen, where there is nothing to improve. */
  fitting: Fitting | null;
  catalogue: FittingCatalogue | null;
  targetProfiles: TargetProfiles;
  isPhone: boolean;
  edit: FittingWorkspace['edit'];
  /** The active Character, for Train; null shows no Train section. */
  characterId: number | null;
  /** Opens Make it fit on a budget, for "Fix this first". */
  openMakeItFit: (resource: FitResource) => void;
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
  characterId,
  openMakeItFit,
}: UseImproveDrawerArgs): { open: () => void; drawer: ReactNode } {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const goal = useImproveGoal((state) => state.value);
  const setGoal = useImproveGoal((state) => state.setValue);
  const reach = useImproveReach((state) => state.value);
  const setReach = useImproveReach((state) => state.setValue);
  const mode = useImproveMode((state) => state.value);
  const setMode = useImproveMode((state) => state.setValue);
  const spendCap = useImproveSpendCap((state) => state.value);
  const setSpendCap = useImproveSpendCap((state) => state.setValue);
  // Not remembered: a Defense Choice, and the Rigs and Officer ticks, are about this fit.
  const [defense, setDefense] = useState<DefenseChoice>('keep');
  const [includeRigs, setIncludeRigs] = useState(false);
  const [includeOfficer, setIncludeOfficer] = useState(false);
  // The Fitting before the last Apply and the one it made, for the toast's Undo; null once it is gone.
  const [undo, setUndo] = useState<{ before: Fitting; applied: Fitting; message: string } | null>(
    null
  );
  // Back to the Start screen closes it, so the next Fitting doesn't open into a search.
  if (fitting === null && isOpen) setIsOpen(false);
  // A later edit (a Ring change while the toast is up) ends the Undo: restoring would discard it.
  const undoable = undo !== null && fitting !== null && sameModules(fitting, undo.applied);
  // What the last implant put in the set was, for its confirmation toast.
  const [implantApplied, setImplantApplied] = useState<string | null>(null);
  useTimedToast(implantApplied, () => setImplantApplied(null));
  const open = useCallback(() => setIsOpen(true), []);
  const close = () => setIsOpen(false);
  const search = useImprove(
    workspace.variants,
    catalogue,
    goal,
    targetProfiles.hydrated ? targetProfiles.selected : undefined,
    isOpen,
    { reach, mode, spendCap, defense, includeRigs, includeOfficer }
  );

  function apply(options: ImproveOption[]) {
    if (!fitting) return;
    // One edit for every ticked row, so Back undoes them together.
    const applied = options.reduce(
      (acc, option) => applyImproveCandidate(acc, option.candidate),
      fitting
    );
    edit(() => applied);
    setUndo({
      before: fitting,
      applied,
      message: t('fittings.improve.applied', { count: options.length }),
    });
  }

  const body = (
    <ImprovePanel
      goal={search.goal}
      onGoalChange={(next) => void setGoal(next)}
      search={search}
      catalogue={catalogue}
      onApply={apply}
      onFixFirst={(resource) => {
        setIsOpen(false);
        openMakeItFit(resource);
      }}
      freeSections={
        fitting && (
          <>
            <ImproveTrain
              goal={search.goal}
              evaluator={workspace.skillGains}
              characterId={characterId}
              fittingName={fitting.name}
              catalogue={catalogue}
            />
            {workspace.profile && (
              <ImproveImplants
                goal={search.goal}
                open={isOpen}
                implants={{
                  fitting,
                  profile: workspace.profile,
                  basis: workspace.implantBasis,
                  onChange: workspace.setImplantSet,
                }}
                onApplied={(name) =>
                  setImplantApplied(t('fittings.makeItFit.implantsApplied', { names: name }))
                }
              />
            )}
          </>
        )
      }
      settings={{
        reach,
        onReachChange: (next) => void setReach(next),
        mode,
        onModeChange: (next) => void setMode(next),
        spendCap,
        onSpendCapChange: (next) => void setSpendCap(next),
        defense,
        onDefenseChange: setDefense,
        includeRigs,
        onIncludeRigsChange: setIncludeRigs,
        includeOfficer,
        onIncludeOfficerChange: setIncludeOfficer,
      }}
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
      {implantApplied !== null && <Toast message={implantApplied} />}
      {undo && undoable && (
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
