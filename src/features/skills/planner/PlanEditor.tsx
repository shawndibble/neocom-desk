import { InlineError } from '@/components/ui/InlineError';
import { Panel, Toast } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { FitGoalModal } from './FitGoalModal';
import { useMilestones } from './useMilestones';
import { SkillPicker } from './SkillPicker';
import { EntryList } from './EntryList';
import { PlanHeader } from './PlanHeader';
import { PlanEditorLayout } from './PlanEditorLayout';
import { PlanToolsPane } from './PlanToolsPane';
import { SkillsToBuyPanel } from './SkillsToBuyPanel';
import { LiveQueueLead } from './LiveQueueLead';
import { remapSavingsShrank } from './planHeaderStats';
import { addEntry } from './skillPlanEdit';
import { RemapMarkerModal } from './RemapMarkerModal';
import { MilestoneModal } from './MilestoneModal';
import { whatIfVerdict } from './whatIfImplants';
import { EntryListControls } from './planEditor/EntryListControls';
import { OrphanedMilestoneNotices } from './planEditor/OrphanedMilestoneNotices';
import { PlanConfirmation } from './planEditor/PlanConfirmation';
import { PlanImportDialogs } from './planEditor/PlanImportDialogs';
import { PlanImportExportActions } from './planEditor/PlanImportExportActions';
import { PlanOptimizeModals } from './planEditor/PlanOptimizeModals';
import type { PlanEditorProps } from './planEditor/types';
import { usePlanAssumptions } from './planEditor/usePlanAssumptions';
import { usePlanExport } from './planEditor/usePlanExport';
import { usePlanHeaderStats } from './planEditor/usePlanHeaderStats';
import { usePlanImport } from './planEditor/usePlanImport';
import { usePlanLocationFlags } from './planEditor/usePlanLocationFlags';
import { usePlanLookups } from './planEditor/usePlanLookups';
import { usePlanOptimize } from './planEditor/usePlanOptimize';
import { usePlanRowActions } from './planEditor/usePlanRowActions';
import { usePlanRows } from './planEditor/usePlanRows';
import { usePlanSchedule } from './planEditor/usePlanSchedule';
import { usePlanToolActions } from './planEditor/usePlanToolActions';
import { usePlanToolSections } from './planEditor/usePlanToolSections';
import { usePlanViewPrefs } from './planEditor/usePlanViewPrefs';
import { useRemapMarkers } from './planEditor/useRemapMarkers';
import { useSplitLegacyEntries } from './planEditor/useSplitLegacyEntries';

export type { PlanPatch } from './planEditor/types';

const NO_QUEUE: readonly SkillQueueEntry[] = [];

export function PlanEditor({
  characterId,
  plan,
  catalog,
  trainedSkills,
  trainedSkillsKnown,
  attributes,
  implants,
  attributesResult,
  attributeBaseline = null,
  remapInfo,
  queueEntries = NO_QUEUE,
  queueFetchedAt = null,
  totalSp = null,
  unallocatedSp = null,
  listPane,
  headerActionsContainer = null,
  onUpdate,
}: PlanEditorProps) {
  const { t } = useTranslation();
  // Which side the tools pane lands on — the same hook the rest of the app's two-column
  // layouts switch on, so this pane can never disagree with them.
  const isDesktop = useIsDesktop();
  const { focusName, pastedPlanText } = usePlanLocationFlags(isDesktop);
  const viewPrefs = usePlanViewPrefs();
  const assumptions = usePlanAssumptions({
    characterId,
    plan,
    implants,
    attributeBaseline,
    onUpdate,
  });
  const { cloneState, whatIf, effectiveImplants, implantsAssumed, activeBoosters } = assumptions;

  // Results about the plan as it stood when they were produced (BUG #1).
  // Scoped, not cleared: each reads as null once the plan is swapped or its
  // entries/markers change, and the Optimize ones also once the Clone State
  // flips — a savings figure costed at one training rate describes nothing
  // after the plan trains at another.
  const planScope = [plan.id, plan.entries, plan.markers];
  const costingScope = [...planScope, cloneState];

  const {
    nameFor,
    attributesFor,
    stepLabel,
    pickerSkills,
    editable,
    removalBlockedReason,
    handleStageSkillDetail,
    userSkillTypeIDs,
    levelLabel,
  } = usePlanLookups({ plan, catalog, trainedSkills });
  const {
    loadedAtMs,
    queueProjection,
    pinnedInProgress,
    schedulablePlan,
    scheduleInputs,
    schedule,
    currentLensSchedule,
    currentLensTotalSeconds,
  } = usePlanSchedule({
    plan,
    catalog,
    trainedSkills,
    queueEntries,
    attributes,
    attributeBaseline,
    implants,
    cloneState,
    whatIf,
  });
  const {
    scheduled,
    error,
    startDate,
    boostedSteps,
    alphaCappedSteps,
    totalSeconds,
    finish: planFinish,
    skillCount: scheduledSkillCount,
    stepByKey,
  } = schedule;

  // Plan Milestone (GLOSSARY.md) statuses and the fit-goal picker, against the current schedule.
  const {
    milestoneModal,
    setMilestoneModal,
    fitGoalOpen,
    setFitGoalOpen,
    fitGoalPickerOptions,
    milestoneStatusFor,
    orphanedMilestones,
    headerNextMilestone,
    handleAddMilestone,
    handleRenameMilestone,
    handleRemoveMilestone,
    pickFitGoal,
    submitMilestoneModal,
  } = useMilestones({
    characterId,
    milestones: plan.milestones,
    entries: plan.entries,
    engineSkills: catalog.engineSkills,
    trainedSkills,
    editable,
    scheduled,
    stepByKey,
    startDate,
    onUpdate,
  });
  useSplitLegacyEntries({
    editable,
    engineSkills: catalog.engineSkills,
    trainedSkills,
    trainedSkillsKnown,
    onUpdate,
  });

  const {
    editingMarkerIndex,
    setEditingMarkerIndex,
    normalizedMarkerAttributes,
    markersVerdict,
    computedMarkerAttributesFor,
    markerAttributesFor,
    handleSaveMarkerAttributes,
  } = useRemapMarkers({
    markers: plan.markers,
    schedule,
    engineSkills: catalog.engineSkills,
    attributes,
    effectiveImplants,
    cloneState,
    editable,
    onUpdate,
  });
  const optimize = usePlanOptimize({
    plan,
    engineSkills: catalog.engineSkills,
    trainedSkills,
    attributes,
    remapInfo,
    effectiveImplants,
    cloneState,
    activeBoosters,
    queueProjection,
    editable,
    schedule,
    schedulablePlan,
    scheduleInputs,
    loadedAtMs,
    planScope,
    costingScope,
    markersVerdict,
    onUpdate,
  });
  const { headerProgress, headerBadge, realLensSavingsSeconds } = usePlanHeaderStats({
    plan,
    catalog,
    trainedSkills,
    attributes,
    implants,
    effectiveImplants,
    cloneState,
    activeBoosters,
    schedule,
    currentLensSchedule,
    markersVerdict,
    optimize,
  });

  const { mergedRows, bandsAt } = usePlanRows({
    plan,
    schedule,
    catalog,
    groupingMode: viewPrefs.groupingMode,
  });
  const {
    dropError,
    promoteConfirm,
    removedToast,
    setRemovedToast,
    entriesHeadingRef,
    focusAfterCommit,
    handleDrop,
    handlePromotePrereq,
    requestRemoveEntry,
    handleRemoveMarker,
    handleSetPriority,
  } = usePlanRowActions({
    planId: plan.id,
    planScope,
    editable,
    mergedRows,
    engineSkills: catalog.engineSkills,
    trainedSkills,
    nameFor,
    levelLabel,
    onUpdate,
  });
  const toolActions = usePlanToolActions({
    planId: plan.id,
    editable,
    trainedSkills,
    onUpdate,
  });
  const imports = usePlanImport({
    characterId,
    planId: plan.id,
    planEntryCount: plan.entries.length,
    editable,
    trainedSkills,
    pastedPlanText,
    onUpdate,
  });
  const exporter = usePlanExport({
    scheduled,
    engineSkills: catalog.engineSkills,
    nameFor,
    userSkillTypeIDs,
  });

  const skillsToBuy = (collapsible: boolean) => (
    <SkillsToBuyPanel
      entries={plan.entries}
      trainedSkills={trainedSkills}
      trainedSkillsKnown={trainedSkillsKnown}
      nameFor={nameFor}
      collapsible={collapsible}
    />
  );
  const toolSections = usePlanToolSections({
    characterId,
    plan,
    catalog,
    trainedSkillsKnown,
    remapInfo,
    attributesResult,
    attributeBaseline,
    implants,
    totalSp,
    unallocatedSp,
    isDesktop,
    schedule,
    assumptions,
    optimize,
    toolActions,
    markersVerdict,
    skillsToBuy,
    onAddFitGoal: () => setFitGoalOpen(true),
    onUpdate,
  });

  // One instance, placed on one side or the other — never both. The two
  // homes are genuinely different boxes in the layout (a sidebar column vs.
  // the single scrolling column), which no CSS reordering can bridge without
  // coupling the grid's row heights to each other.
  const toolsPane = <PlanToolsPane sections={toolSections} asDisclosure={!isDesktop} />;

  return (
    <>
      <div
        onDragOver={(e) => {
          // Only a file is ours to take; a text or row drag keeps its own handlers.
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={imports.handleEditorDrop}
      >
        <PlanEditorLayout
          sidebar={
            isDesktop ? (
              <>
                {listPane}
                {toolsPane}
              </>
            ) : undefined
          }
        >
          <PlanHeader
            totalSeconds={totalSeconds}
            skillCount={scheduledSkillCount}
            projectedFinish={planFinish}
            badge={headerBadge}
            nextMilestone={headerNextMilestone}
            progress={headerProgress}
            whatIf={
              currentLensTotalSeconds !== null && !error
                ? {
                    lens:
                      whatIf.kind === 'custom'
                        ? t('plans.whatIfCustom')
                        : whatIf.preset === 'none'
                          ? t('plans.whatIfNone')
                          : whatIf.preset,
                    verdict: whatIfVerdict(currentLensTotalSeconds, totalSeconds),
                  }
                : null
            }
            savingsShrankWithImplants={remapSavingsShrank(
              headerBadge?.savingsSeconds ?? null,
              realLensSavingsSeconds
            )}
            trainedKnown={trainedSkillsKnown}
            name={plan.name}
            onRename={isDesktop ? undefined : (name) => onUpdate({ name })}
            focusName={focusName}
          />

          {implantsAssumed && <ImplantsAssumedNote hint={t('plans.assumesNoImplantsHint')} />}

          {/* Plan Milestones (GLOSSARY.md) whose entry was removed from the plan
            entirely — no row exists to flag any more, so they surface here
            instead of vanishing silently. */}
          {orphanedMilestones.length > 0 && (
            <OrphanedMilestoneNotices
              orphanedMilestones={orphanedMilestones}
              onRemove={handleRemoveMilestone}
              focusAfterCommit={focusAfterCommit}
              entriesHeadingRef={entriesHeadingRef}
            />
          )}

          {/* Below `lg` the plan tools are one collapsed row, which would bury
            the one output worth reading first; this row sits outside them. */}
          {!isDesktop && <Panel padded={false}>{skillsToBuy(true)}</Panel>}

          {!isDesktop && toolsPane}

          <Panel title={t('plans.yourEntries')} headingRef={entriesHeadingRef}>
            <div className="space-y-3">
              <LiveQueueLead
                projection={queueProjection}
                fetchedAt={queueFetchedAt}
                nameFor={nameFor}
              />
              <SkillPicker
                skills={pickerSkills}
                catalog={catalog}
                trainedSkills={trainedSkills}
                planEntries={plan.entries}
                onAdd={(entry) => onUpdate(addEntry(editable, entry))}
                // Group-by and Columns are this list's own view controls —
                // riding the search bar's row keeps them off the page
                // header, which Import/Export already fills.
                controls={<EntryListControls viewPrefs={viewPrefs} />}
              />
              {dropError && <InlineError>{dropError}</InlineError>}
              {promoteConfirm && <PlanConfirmation message={promoteConfirm} />}
              {error ? (
                <p className="text-xs text-danger">{t('plans.computeError', { message: error })}</p>
              ) : (
                <EntryList
                  rows={mergedRows}
                  bandsAt={bandsAt}
                  nameFor={nameFor}
                  attributesFor={attributesFor}
                  columns={viewPrefs.columnVisibility}
                  boostedSteps={boostedSteps}
                  alphaCappedSteps={alphaCappedSteps}
                  startDate={startDate}
                  onReorder={handleDrop}
                  onPromotePrereq={handlePromotePrereq}
                  onRemove={requestRemoveEntry}
                  onStageSkillDetail={handleStageSkillDetail}
                  removalBlockedReason={removalBlockedReason}
                  pinnedInProgress={pinnedInProgress}
                  onRemoveMarker={handleRemoveMarker}
                  markerAttributesFor={markerAttributesFor}
                  markerImplants={effectiveImplants}
                  onEditMarker={setEditingMarkerIndex}
                  onSetPriority={handleSetPriority}
                  milestoneStatusFor={milestoneStatusFor}
                  onAddMilestone={handleAddMilestone}
                  onRenameMilestone={handleRenameMilestone}
                  onRemoveMilestone={handleRemoveMilestone}
                />
              )}
            </div>
          </Panel>
        </PlanEditorLayout>
      </div>

      {headerActionsContainer && (
        <PlanImportExportActions
          container={headerActionsContainer}
          imports={imports}
          exporter={exporter}
          scheduledCount={scheduled.length}
        />
      )}

      <PlanImportDialogs imports={imports} nameFor={nameFor} trainedSkills={trainedSkills} />

      <PlanOptimizeModals
        optimize={optimize}
        schedule={schedule}
        markersVerdict={markersVerdict}
        effectiveImplants={effectiveImplants}
        stepLabel={stepLabel}
        nameFor={nameFor}
      />

      <RemapMarkerModal
        open={editingMarkerIndex !== null}
        onClose={() => setEditingMarkerIndex(null)}
        override={
          editingMarkerIndex === null
            ? null
            : (normalizedMarkerAttributes[editingMarkerIndex] ?? null)
        }
        computed={
          editingMarkerIndex === null ? undefined : computedMarkerAttributesFor(editingMarkerIndex)
        }
        baseline={attributes}
        onSave={(next) => {
          if (editingMarkerIndex !== null) handleSaveMarkerAttributes(editingMarkerIndex, next);
        }}
      />

      <FitGoalModal
        open={fitGoalOpen}
        options={fitGoalPickerOptions}
        onClose={() => setFitGoalOpen(false)}
        onPick={pickFitGoal}
      />
      <MilestoneModal
        open={milestoneModal !== null}
        initialName={milestoneModal?.mode === 'rename' ? milestoneModal.currentName : undefined}
        onClose={() => setMilestoneModal(null)}
        onSave={submitMilestoneModal}
      />

      {removedToast && (
        <Toast
          message={removedToast.message}
          instance={removedToast}
          undo={{ label: t('plans.undo'), onUndo: removedToast.onUndo }}
          onClose={() => setRemovedToast(null)}
        />
      )}
    </>
  );
}
