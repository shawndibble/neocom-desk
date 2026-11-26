import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Close } from '@/components/ui/icons';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useFitToViewport } from '@/lib/useFitToViewport';
import { useTranslation } from 'react-i18next';
import { IconButton, Modal, Panel, Toast } from '@/components/ui';
import {
  applyImproveCandidate,
  type ImproveOption,
  type RejectedOption,
} from '@/engine/fittings/improve';
import { fittedSide } from '@/engine/fittings/improve';
import { overBudgetResources } from '@/engine/fittings/improve';
import { hullRoleOf } from '@/engine/fittings/improve';
import { loadBestCharges, unloadedWeapons } from '@/engine/fittings/improve';
import type { Fitting, FittingImplantSet, FittingModuleResult } from '@/engine/fittings/types';
import type { FittingStatsDelta } from '@/engine/fittings/variationDelta';
import type { FittingContext } from './fittingContext';
import { useChargeChoices } from './useChargeChoices';
import type { ChargeLoading } from './useChargeLoading';
import { ImproveFlyableImplants as FlyableImplants } from './ImproveFlyableImplants';
import { ImproveImplants } from './ImproveImplants';
import { ImprovePanel } from './ImprovePanel';
import { ImproveTrain } from './ImproveTrain';
import type { FitResource } from './makeItFitContext';
import type { TargetProfiles } from './targetProfiles';
import type { FittingCatalogue } from './useFittingCatalogue';
import { hullOf, useImprove } from './useImprove';
import { useImproveSettings } from './useImproveSettings';
import { isPerFit, type ImproveChoices, type PerFitField } from './improveSettings';
import { hasImproveResults } from './improveHasResults';
import type { FittingWorkspace } from './useFittingWorkspace';

const moduleKey = (f: Fitting) =>
  f.modules.map((m) => `${m.slot}${m.slotIndex}:${m.typeId}:${m.chargeTypeId ?? ''}`).join();
const sameModules = (a: Fitting, b: Fitting) => a === b || moduleKey(a) === moduleKey(b);

interface UseImproveDrawerArgs {
  workspace: FittingWorkspace;
  fitting: Fitting | null;
  catalogue: FittingCatalogue | null;
  targetProfiles: TargetProfiles;
  edit: FittingWorkspace['edit'];
  characterId: number | null;
  charges: ChargeLoading;
  context: FittingContext | null;
  moduleResults: FittingModuleResult[] | null;
  openMakeItFit: (resource: FitResource) => void;
  showWhatToTrain: () => void;
}

export function useImproveDrawer({
  workspace,
  fitting,
  catalogue,
  targetProfiles,
  edit,
  characterId,
  charges,
  context,
  moduleResults,
  openMakeItFit,
  showWhatToTrain,
}: UseImproveDrawerArgs): {
  open: () => void;
  close: () => void;
  drawer: ReactNode;
  column: ReactNode;
  docked: boolean;
  preview: FittingStatsDelta | null;
  previewIsk: number | null;
} {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  const role = hullRoleOf(hullOf(fitting, catalogue));
  const remembered = useImproveSettings(role);
  const [perFit, setPerFit] = useState<Pick<ImproveChoices, PerFitField>>({
    defense: 'keep',
    includeOfficer: false,
    allowMutated: false,
  });
  const { goal, sort, ...rememberedConfig } = remembered.value;
  const choices: ImproveChoices = { ...rememberedConfig, ...perFit, sort };
  const onChange = (patch: Partial<ImproveChoices>) => {
    const fields = Object.entries(patch);
    const fit = fields.filter(([field]) => isPerFit(field));
    const kept = fields.filter(([field]) => !isPerFit(field));
    if (fit.length > 0) setPerFit((prev) => ({ ...prev, ...Object.fromEntries(fit) }));
    if (kept.length > 0) void remembered.set(Object.fromEntries(kept));
  };
  const [preview, setPreview] = useState<FittingStatsDelta | null>(null);
  const [previewIsk, setPreviewIsk] = useState<number | null>(null);
  const onPreview = useCallback((delta: FittingStatsDelta | null, isk: number | null = null) => {
    setPreview(delta);
    setPreviewIsk(isk);
  }, []);
  const [undo, setUndo] = useState<{ before: Fitting; applied: Fitting; message: string } | null>(
    null
  );
  if (fitting === null && isOpen) setIsOpen(false);
  const undoable = undo !== null && fitting !== null && sameModules(fitting, undo.applied);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const asColumn = useIsDesktop();
  const columnHeading = useRef<HTMLHeadingElement | null>(null);
  const columnRef = useFitToViewport<HTMLDivElement>(isOpen && asColumn);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen || !asColumn) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    columnHeading.current?.focus({ preventScroll: true });
    const column = columnRef.current;
    return () => {
      const back = opener.current;
      opener.current = null;
      const active = document.activeElement;
      const lost = active === null || active === document.body || !!column?.contains(active);
      if (lost && back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [isOpen, asColumn, columnRef]);
  const { groups: chargeGroups } = useChargeChoices({
    fitting: isOpen ? fitting : null,
    context,
    moduleResults,
  });
  const unloaded = fitting && chargeGroups ? unloadedWeapons(fitting, chargeGroups) : null;
  const chargeSteps = fitting && chargeGroups ? loadBestCharges(fitting, chargeGroups) : [];

  const search = useImprove(
    workspace.variants,
    catalogue,
    goal,
    targetProfiles.hydrated ? targetProfiles.selected : undefined,
    isOpen && remembered.ready,
    { ...rememberedConfig, ...perFit },
    chargeSteps
  );

  function loadBestCharge() {
    if (!fitting) return;
    const applied = charges.loadSteps(chargeSteps);
    if (applied === null) return;
    setUndo({
      before: fitting,
      applied,
      message: t('fittings.improve.chargesLoaded', {
        count: applied.modules.filter((m, i) => m.chargeTypeId !== fitting.modules[i]?.chargeTypeId)
          .length,
      }),
    });
  }

  const crystals = search.state.status === 'done' ? search.state.crystals : undefined;
  const crystalSteps = crystals?.unloaded?.steps ?? [];

  function loadBestCrystal() {
    if (!fitting || !crystals?.unloaded) return;
    const applied = charges.loadSteps(crystalSteps);
    if (applied === null) return;
    setUndo({
      before: fitting,
      applied,
      message: t('fittings.improve.crystalsLoaded', {
        count: applied.modules.filter((m, i) => m.chargeTypeId !== fitting.modules[i]?.chargeTypeId)
          .length,
      }),
    });
  }

  function apply(options: ImproveOption[]) {
    if (!fitting) return;
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

  const profile = workspace.profile;

  function applyWithImplants(fix: RejectedOption, implantSet: FittingImplantSet) {
    if (!fitting) return;
    const applied = { ...applyImproveCandidate(fitting, fix.candidate), implantSet };
    edit(() => applied);
    setUndo({
      before: fitting,
      applied,
      message: t('fittings.improve.appliedWithImplants'),
    });
  }

  const body = (
    <ImprovePanel
      goal={search.goal}
      onGoalChange={(next) => void remembered.set({ goal: next })}
      search={search}
      catalogue={catalogue}
      onApply={apply}
      renderFlyableImplants={
        fitting && profile
          ? (fix, label) => (
              <FlyableImplants
                fix={fix}
                label={label}
                open={isOpen}
                implants={{
                  fitting,
                  profile,
                  basis: workspace.implantBasis,
                  onChange: workspace.setImplantSet,
                }}
                iskBudget={choices.iskBudget}
                fitTotal={search.state.status === 'done' ? search.state.fitTotal : null}
                onApply={applyWithImplants}
              />
            )
          : undefined
      }
      fitting={fitting}
      target={targetProfiles.hydrated ? targetProfiles.selected : undefined}
      onPreview={onPreview}
      footerTarget={footerTarget}
      unloaded={unloaded}
      onLoadBestCharge={chargeSteps.length > 0 ? loadBestCharge : undefined}
      onLoadBestCrystal={crystalSteps.length > 0 ? loadBestCrystal : undefined}
      onFixFirst={(resource) => {
        setIsOpen(false);
        openMakeItFit(resource);
      }}
      freeSections={
        fitting &&
        search.before &&
        overBudgetResources(search.before).length === 0 && (
          <>
            <ImproveTrain
              goal={search.goal}
              evaluator={workspace.skillGains}
              characterId={characterId}
              fittingName={fitting.name}
              catalogue={catalogue}
              onShowWhatToTrain={showWhatToTrain}
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
              />
            )}
          </>
        )
      }
      settings={{
        value: choices,
        onChange,
        fittedSide: fitting
          ? fittedSide(fitting.modules, (typeId) => catalogue?.types[String(typeId)]?.groupID)
          : null,
      }}
    />
  );

  const doneState = search.state.status === 'done' ? search.state : null;
  const found = doneState !== null && hasImproveResults(doneState, { blocked: false });
  const footer = found && <div ref={setFooterTarget} />;

  const column = fitting && isOpen && asColumn && (
    <div
      ref={columnRef}
      className="slide-in-left sticky top-3 h-[calc(100vh-1.5rem)]"
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          !event.currentTarget.contains(event.target as Node) ||
          document.querySelector('dialog[open]')
        )
          return;
        close();
      }}
    >
      <Panel
        title={t('fittings.improve.title')}
        headingRef={columnHeading}
        actions={<IconButton icon={<Close />} label={t('common.close')} onClick={close} />}
        padded={false}
        fill
        className="flex h-full flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{body}</div>
        {footer && <div className="border-line shrink-0 border-t px-3 py-2">{footer}</div>}
      </Panel>
    </div>
  );

  const drawer = fitting && (
    <>
      {!asColumn ? (
        <Modal
          open={isOpen}
          onClose={close}
          placement="sheet"
          title={t('fittings.improve.title')}
          footer={footer}
        >
          {body}
        </Modal>
      ) : null}
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
  return {
    open,
    close,
    drawer,
    column: column || null,
    docked: isOpen && asColumn,
    preview: isOpen ? preview : null,
    previewIsk: isOpen ? previewIsk : null,
  };
}
