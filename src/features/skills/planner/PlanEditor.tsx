import { romanLevel } from '@/engine/projection';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Modal,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  Toast,
  Tooltip,
  Checkbox,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { neighbourFocusCandidates, planRowHandle } from './focusNeighbour';
import { MarketGroupLink } from './MarketGroupLink';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { findRemovalBlockers, planEntryKey } from '@/engine/skills/plan';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { schedulePlanWith, type PlanScheduleInputs, type SchedulablePlan } from './planSchedule';
import { parseSkillQueue } from '@/engine/skills/queueImport';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import { optimizeAtMarkers, ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { PlaceRemapsOptions } from '@/engine/optimizer';
import type {
  AttributeName,
  Attributes,
  CloneState,
  Implants,
  PlanEntry,
  PlanPriority,
  PlanStep,
  TrainedSkill,
} from '@/engine/types';
import { FitGoalModal } from './FitGoalModal';
import { useMilestones } from './useMilestones';
import { useOptimizeAtMarkers, useOptimizeForMe, useOptimizeRemaps } from './useOptimize';
import { useReorder } from './useReorder';
import {
  anchorKeysOf,
  appendedCountMessage,
  confirmRemapOutcome,
  type PricingContext,
} from './optimizeHelpers';
import { OptimizeMenu, type OptimizeMenuItem } from './OptimizeMenu';
import { OptimizeForMeModal, RemapPreviewModal } from './RemapPreviewModal';
import { MilestoneModal } from './MilestoneModal';
import type {
  PlanBooster,
  SkillPlanRecord,
  WhatIfImplantPreset,
  WhatIfImplantSelection,
} from '@/db';
import type { CharacterAttributes, SkillQueueEntry } from '@/esi/endpoints';
import { AttributeChips } from '@/features/skills/AttributeChips';
import { loadCharacterSkillQueue, type CachedResult } from '../data';
import { writeToClipboard } from '@/lib/clipboard';
import type { SkillCatalog } from '../skillMap';
import { SkillPicker } from './SkillPicker';
import { EntryList } from './EntryList';
import type { BandInfo } from './entryList/BandHeader';
import { useColumnVisibility } from './columnPreference';
import { useGroupingMode, GROUPING_MODES, type GroupingMode } from './groupingMode';
import { attributePairBandStarts } from './attributePairBands';
import { PlanHeader } from './PlanHeader';
import { planProgress } from '@/engine/skills/planProgress';
import { assumptionsSummary } from './assumptionsSummary';
import { PlanEditorLayout } from './PlanEditorLayout';
import { importOutcome, type ClipboardImportPreview } from './clipboardImport';
import { previewImportFile, previewImportText } from './importPreview';
import { PlanToolsPane, type PlanToolSection } from './PlanToolsPane';
import { InjectorFactsPanel } from './InjectorFactsPanel';
import { SkillsToBuyPanel } from './SkillsToBuyPanel';
import { CLOSEST_AUTO_LOAD_MAX, WhoIsClosest } from './WhoIsClosest';
import { useCharacters } from '@/features/character/useCharacters';
import { LiveQueueLead } from './LiveQueueLead';
import { projectQueueEnd } from '@/engine/skills/queueStatus';
import {
  evaluateOptimizationBadge,
  remapSavingsShrank,
  toOptimizationBadge,
} from './planHeaderStats';
import { markerVerdict } from './optimizeVerdict';
import { cloneStateFor, useCloneStates, withCloneState } from '../cloneState';
import { acceleratorBonusOf, type AttributeBaseline } from '@/engine/attributeBaseline';
import { queueCsvColumns } from './queueCsv';
import { downloadCsv } from '@/lib/downloadCsv';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import { dedupeEntries } from './reorder';
import { buildRows } from './markers';
import {
  addEntry,
  addRemapMarker,
  appendImport,
  moveRow,
  promotePrereqRow,
  alignedMarkerAttributes,
  removeEntry,
  removeTrainedEntries,
  removeRemapMarker,
  replaceWithImport,
  setPriority,
  setRemapMarkerAttributes,
  splitByLevel,
  type SkillPlanEditable,
} from './skillPlanEdit';
import { RemapMarkerModal } from './RemapMarkerModal';
import { bandStarts, meaningfulBandStarts } from './bands';
import {
  summarizeEntryQueue,
  buildMergedRows,
  placeBandHeaders,
  pinnedInProgressEntry,
  type MergedRow,
} from './queueRows';
import { remapBudget, type RemapAvailability } from './remapAvailability';
import {
  whatIfImplants,
  DEFAULT_WHAT_IF_SELECTION,
  isHypotheticalLens,
  whatIfVerdict,
  normalizeWhatIfSelection,
  readsLoadedImplants,
  setWhatIfBonus,
  toCustomSelection,
  cloneSelection,
  matchingCloneId,
  MAX_IMPLANT_BONUS,
  MIN_IMPLANT_BONUS,
  WHAT_IF_IMPLANT_PRESETS,
} from './whatIfImplants';
import { useJumpCloneImplantSets } from './jumpCloneImplants';
import { resolvePlanBoosters, toBoosters } from './planBooster';
import { BoosterList } from './BoosterList';
import { ImportClipboardDialog } from './ImportClipboardDialog';
import type { SkillPlanImportState } from '@/lib/shortcuts';
import { useScopedState } from './useScopedState';
import { attributeShort } from './remapInstruction';
import { ATTRIBUTE_ENHANCERS_MARKET_GROUP_ID } from './plannerMarketGroups';
import { useHydratedStore } from '@/lib/useHydratedStore';

/** The persisted fields the editor may change. */
export type PlanPatch = Partial<
  Pick<
    SkillPlanRecord,
    | 'name'
    | 'entries'
    | 'markers'
    | 'markerAttributes'
    | 'whatIfImplants'
    | 'boosters'
    | 'milestones'
  >
>;

/** What "Remove trained skills" just did: how many rows went, and the plan as it stood for Undo. */
interface TrainedRemoved {
  count: number;
  undo: Required<SkillPlanEditable>;
}

interface PlanEditorProps {
  characterId: number;
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  /** See `PlanEditorData` — false until /skills has actually been read. */
  trainedSkillsKnown: boolean;
  attributes: Attributes;
  implants: Implants;
  /**
   * ESI's own attributes read, carrying its `fetchedAt` — what the tools
   * pane *displays*. Deliberately not derived from `attributes` above: that
   * one is the scheduler's base sheet, which falls back to placeholder
   * numbers when ESI could not be read and is clamped to the base minimum,
   * so showing it would present a fallback as the character's own sheet.
   */
  attributesResult: CachedResult<CharacterAttributes> | null;
  /**
   * How the base sheet above was arrived at (`engine/attributeBaseline.ts`).
   * Optional: omitting it is the `legal` case, which is a no-op — a character
   * with no accelerator running must see no notice and no prefill.
   */
  attributeBaseline?: AttributeBaseline | null;
  /** Remaps Available from ESI (bonus + yearly), for the hint next to the count input. */
  remapInfo: RemapAvailability | null;
  /** The live in-game queue: the plan's schedule starts where it ends. */
  queueEntries?: readonly SkillQueueEntry[];
  queueFetchedAt?: Date | null;
  /** Queue-corrected total SP (`usePlanEditorData`), for the Skill injectors panel; null until /skills has loaded. */
  totalSp?: number | null;
  /** ESI's `unallocated_sp`, for the Skill injectors panel. */
  unallocatedSp?: number | null;
  /**
   * The plan list, rendered at the top of the sidebar this component lays
   * out. Passed in rather than imported so the route keeps owning plan CRUD
   * and this component keeps owning the two-column grid — the tools pane in
   * that sidebar needs every handler that already lives here, and lifting
   * them out to let the route compose the columns would mean a dozen
   * callbacks crossing the boundary for no gain.
   */
  listPane: ReactNode;
  /**
   * The route's `PageHeader` actions slot, handed down as a live DOM node so
   * Import/Export can render there via a portal instead of in this
   * component's own tree — the route owns the page's one `<h1>` and its
   * "far top right corner" actions cluster (every other route's pattern),
   * but the import/export handlers and the data they act on (the computed
   * queue, catalog, What-If/Booster-costed `scheduled`) live here and would
   * duplicate awkwardly if lifted to the route instead. `null`/undefined
   * (route hasn't mounted the slot yet, or a caller with no such slot, e.g.
   * a future embed) means nothing portals — Import/Export simply don't
   * render rather than throwing.
   */
  headerActionsContainer?: HTMLElement | null;
  onUpdate: (patch: PlanPatch) => void | Promise<void>;
}

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
  const timeZone = useTimeZone();
  const roster = useCharacters();
  const navigate = useNavigate();
  // Which side the tools pane lands on — the same hook the rest of the app's two-column
  // layouts switch on, so this pane can never disagree with them.
  const isDesktop = useIsDesktop();
  // "New plan" navigates here with this flag. Wide screens have the list pane, whose row
  // takes the rename (and spends the flag); narrow ones have no list, so the header field does.
  const location = useLocation();
  const focusName =
    !isDesktop && (location.state as { focusName?: boolean } | null)?.focusName === true;
  // Spent once the field has focus, so a reload or Back doesn't re-steal it.
  useEffect(() => {
    if (focusName) navigate(location.pathname, { replace: true, state: null });
  }, [focusName, location.pathname, navigate]);
  // A skill plan pasted anywhere opens this editor with the Import dialog
  // already on it (`routes/SkillPlans.tsx` made the plan). Held in state so the
  // location can be spent at once: a reload or Back must not reopen it.
  const pastedPlanText = (location.state as Partial<SkillPlanImportState> | null)
    ?.skillPlanImportText;
  const [importSeed, setImportSeed] = useState(pastedPlanText ?? null);
  useEffect(() => {
    if (pastedPlanText) navigate(location.pathname, { replace: true, state: null });
  }, [pastedPlanText, location.pathname, navigate]);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const { show: showCopyConfirm } = useAutoDismiss<boolean>(setCopyConfirm, false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const openImportDialogAfterMenuRef = useRef(false);
  const [importOpen, setImportOpen] = useState(false);
  // What a pasted or dropped import found when it needs a look before applying.
  const [importPreview, setImportPreview] = useState<ClipboardImportPreview | undefined>();
  const [importConfirm, setImportConfirm] = useState<string | null>(null);
  // `cancel` covers the early-cancel-on-Undo case below; `show` supersedes a
  // pending confirmation rather than racing it (Append's 4s vs. Replace's
  // 10s, #1402) — the same guarantee `useAutoDismiss` gives every other
  // beside-the-button confirmation in this file.
  const { show: showImportConfirm, cancel: cancelImportConfirm } = useAutoDismiss<string | null>(
    setImportConfirm,
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  // A queue import parsed on a non-empty plan (#1402): held until the user
  // picks Append or Replace on the choice Modal below. Scoped to plan.id,
  // same as undoImport below — this component doesn't remount on a plan
  // switch, so without that the Modal could stay open across one.
  const [pendingQueueImport, setPendingQueueImport] = useScopedState<PlanEntry[]>([plan.id]);
  // Whether a queue fetch is in flight — disables the Import button so a
  // second click can't race the first (#1402).
  const [queueImporting, setQueueImporting] = useState(false);
  // Read inside handleImport's async continuation after an `await`, where the
  // `plan` captured by that closure is whatever it was at call time and never
  // changes — only a ref kept live across every render can tell that call
  // apart from a plan switch that happened while it was in flight (#1402).
  const currentPlanIdRef = useRef(plan.id);
  useLayoutEffect(() => {
    currentPlanIdRef.current = plan.id;
  });
  // A snapshot taken just before a Replace, for the Undo beside its
  // confirmation — scoped to plan.id so switching plans can't apply an undo
  // meant for a different one (#1402).
  const [undoImport, setUndoImport] = useScopedState<Required<SkillPlanEditable>>([plan.id]);
  // Inline, beside-the-button confirmations (#222) — same pattern as
  // copyConfirm/importConfirm above: small text next to the triggering
  // button, cleared after a couple of seconds. Additive to the full
  // Panel/Modal results those same actions already produce below.
  // "Remove trained skills": the count it removed and the plan as it stood, for the Undo beside it. Scoped to the plan like undoImport.
  const [trainedRemoved, setTrainedRemoved] = useScopedState<TrainedRemoved>([plan.id]);
  const { show: showTrainedRemoved, cancel: cancelTrainedRemoved } =
    useAutoDismiss<TrainedRemoved | null>(setTrainedRemoved, null);
  const [markerConfirm, setMarkerConfirm] = useState(false);
  const { show: showMarkerConfirm } = useAutoDismiss<boolean>(setMarkerConfirm, false);
  // A promoted prereq row is a quieter change than it looks (a dimmed row
  // turns into user data), so it says so. A "that worked" note about the
  // change that just landed, so it clears on its own timer, not with the plan.
  const [promoteConfirm, setPromoteConfirm] = useState<string | null>(null);
  const { show: showPromoteConfirm } = useAutoDismiss<string | null>(setPromoteConfirm, null);
  // Which marker's manual attribute editor (RemapMarkerModal) is open, by
  // ordinal — the same addressing `onRemoveMarker`/`markerAttributesFor` use.
  const [editingMarkerIndex, setEditingMarkerIndex] = useState<number | null>(null);
  // A removed entry goes at once, with an Undo toast rather than a confirm
  // dialog. Scoped to plan.id so a plan switch can't offer an undo for another plan.
  const [removedToast, setRemovedToast] = useScopedState<{
    message: string;
    onUndo: () => void;
  }>([plan.id]);
  // Focus after a remove goes to a neighbour row, else this heading (WCAG 2.4.3).
  const entriesHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  // A ref keeps `requestRemoveEntry` stable, so memoized rows don't re-render on every recompute.
  const mergedRowsRef = useRef<readonly MergedRow[]>([]);
  const editableRef = useRef<SkillPlanEditable>({ entries: [] });

  // "Columns" control (#114): a device-local view preference, applying the
  // same way across every plan on this device rather than per-plan.
  const columnVisibility = useColumnVisibility((state) => state.value);
  const setColumnVisibility = useColumnVisibility((state) => state.setValue);
  useHydratedStore(useColumnVisibility);

  // Grouping toggle (#115): priority (default) or attribute-pair band
  // headers — visual only, same device-local preference shape as Columns.
  const groupingMode = useGroupingMode((state) => state.value);
  const setGroupingMode = useGroupingMode((state) => state.setValue);
  useHydratedStore(useGroupingMode);

  // Clone State (GLOSSARY.md): per Character, not per plan. The control waits
  // for hydration — a write from the empty default would replace the whole
  // blob and drop every other Character's answer.
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useHydratedStore(useCloneStates);
  const setCloneStates = useCloneStates((state) => state.setValue);
  const cloneState = cloneStateFor(cloneStates, characterId);
  const setCloneState = (next: CloneState): void =>
    void setCloneStates(withCloneState(cloneStates, characterId, next));

  // Results about the plan as it stood when they were produced (BUG #1).
  // Scoped, not cleared: each reads as null once the plan is swapped or its
  // entries/markers change, and the Optimize ones also once the Clone State
  // flips — a savings figure costed at one training rate describes nothing
  // after the plan trains at another.
  const planScope = [plan.id, plan.entries, plan.markers];
  const costingScope = [...planScope, cloneState];
  // Outcome of the last drag on the entry list. A drop that would land a
  // skill after something requiring it is refused rather than silently
  // re-normalized back (planDrop.ts), so the refusal has to say why. It
  // describes one drag against one entry order — once the order moves on it
  // describes nothing.
  const [dropError, setDropError] = useScopedState<string>(planScope);

  // What-If Implants (GLOSSARY.md): swap the clone's real implants for a
  // hypothetical set — a uniform preset, or five per-slot bonuses, since EVE's
  // hardwirings are per attribute. Saved on the plan and synced with it, not
  // held for the session: it is one of the two lenses every number on this
  // page is costed under, so a plan that reopened on a different lens reopened
  // quoting different training times than the ones the user left it showing.
  // Device-local view preferences (Columns, Group-by above) are the opposite
  // case — they change what is *shown*, not what is *computed*.
  //
  // Normalized on read rather than trusted: the value can arrive from another
  // device or an older build (whatIfImplants.ts).
  const whatIf = useMemo(
    () => normalizeWhatIfSelection(plan.whatIfImplants),
    [plan.whatIfImplants]
  );
  const setWhatIf = (selection: WhatIfImplantSelection): void => {
    void onUpdate({ whatIfImplants: selection });
  };
  const jumpClones = useJumpCloneImplantSets(characterId);
  const matchedCloneId = matchingCloneId(whatIf, implants, jumpClones);
  const effectiveImplants = useMemo(() => whatIfImplants(whatIf, implants), [whatIf, implants]);

  // Training time assumes no implants only when it is actually reading the
  // (possibly empty) loaded set — an explicit "no implants" or custom What-If
  // choice is the pilot's own call, not a permission gap (issue #1526).
  const implantsAssumed = readsLoadedImplants(whatIf);

  // An in-game cerebral accelerator is baked into the attributes ESI reports
  // and cannot be read back out of any endpoint, so `attributeBaseline`
  // recovers it arithmetically and it is modelled here, through the same
  // Booster the What-If control drives — one mechanism, applied once. Prefill
  // is the point: the alternative is correcting the baseline silently, which
  // leaves the user's plan slower with nothing on screen saying why.
  const detectedAccelerator =
    attributeBaseline?.kind === 'accelerated' ? attributeBaseline.acceleratorBonus : null;

  // Boosters (GLOSSARY.md): an ordered list of cerebral accelerators, each a
  // uniform bonus to every attribute from an optional start until its
  // expiry — EVE has one booster slot, so at most one is ever live. Saved on
  // the plan for the same reason as the lens above.
  //
  // A pure derivation, not seeded state — the prefill rule and its "neither
  // field stored is what 'unanswered' means" gate live in planBooster.ts,
  // where they are unit-tested; the moment the user touches any control the
  // whole answer is written back through `onChange` below. Field-level
  // editing state (draft text, the blur-commit rule, quick picks) lives in
  // `BoosterList` itself, which owns rendering this control.
  const planBoosters = useMemo<PlanBooster[]>(
    () => resolvePlanBoosters(plan.boosters, plan.booster, detectedAccelerator),
    [plan.boosters, plan.booster, detectedAccelerator]
  );
  const activeBoosters = useMemo(() => toBoosters(planBoosters), [planBoosters]);

  // useCallback'd (#408): both cross into EntryList as per-row props
  // (`nameFor`/`attributesFor`), which now wraps its rows in `React.memo` —
  // an identity that changed every render would defeat that regardless of
  // the row components' own memoization. `attributesFor` also returns the
  // catalog's own EngineSkill object rather than a fresh `{primary,
  // secondary}` literal: same reasoning one level deeper, since a *new*
  // object every call would still break memo even with a stable function.
  const nameFor = useCallback(
    (skillTypeID: number): string =>
      catalog.bySkillTypeID.get(skillTypeID)?.name ?? `#${skillTypeID}`,
    [catalog]
  );

  const attributesFor = useCallback(
    (skillTypeID: number): { primary: AttributeName; secondary: AttributeName } | undefined =>
      catalog.engineSkills.get(skillTypeID),
    [catalog]
  );

  /** A cross-link into Market Browser, landed pre-expanded to the given category. */
  function marketGroupLink(label: string, marketGroupId: number) {
    return <MarketGroupLink groupId={marketGroupId} label={label} />;
  }

  const stepLabel = (step: PlanStep): string =>
    `${nameFor(step.skillTypeID)} ${romanLevel(step.level)}`;

  const pickerSkills = useMemo(
    () => [...catalog.bySkillTypeID.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog]
  );

  // What every Skill Plan edit (skillPlanEdit.ts) reads: the three aligned
  // lists alone, so a handler built on it keeps its identity across edits
  // to the plan's other fields (name, boosters, milestones).
  const editable = useMemo<SkillPlanEditable>(
    () => ({
      entries: plan.entries,
      markers: plan.markers,
      markerAttributes: plan.markerAttributes,
    }),
    [plan.entries, plan.markers, plan.markerAttributes]
  );

  /**
   * Which entries the remove button must refuse (#2223): removing one that
   * some other entry still needs would just have it reappear as a dimmed
   * prereq row, which used to look like the removal silently did nothing.
   */
  const removalBlockers = useMemo(
    () => findRemovalBlockers(editable.entries, catalog.engineSkills, trainedSkills),
    [editable.entries, catalog.engineSkills, trainedSkills]
  );

  const removalBlockedReason = useCallback(
    (skillTypeID: number, targetLevel: number): string | undefined => {
      const blocker = removalBlockers.get(planEntryKey(skillTypeID, targetLevel));
      if (!blocker) return undefined;
      return t('plans.removeBlockedByDependent', {
        blocker: `${nameFor(blocker.skillTypeID)} ${romanLevel(blocker.targetLevel)}`,
      });
    },
    [removalBlockers, nameFor, t]
  );

  /** A row's skill name is a link to the shared Skill Detail modal; as it is clicked this plan's own (possibly unsaved) entries are staged for it, so a prereq already staged here reads "Planned". */
  const stageSkillPlanEntries = useSkillDetailModalStore((state) => state.stage);
  const handleStageSkillDetail = useCallback(
    (skillTypeID: number) => stageSkillPlanEntries(skillTypeID, editable.entries),
    [editable.entries, stageSkillPlanEntries]
  );

  // Manual overrides (RemapMarkerModal), aligned to the current markers.
  const normalizedMarkerAttributes = useMemo(() => alignedMarkerAttributes(editable), [editable]);

  // The queue's lead (the levels ahead of the first one this plan lists)
  // trains first, so the plan starts when it ends. One instant feeds the schedule,
  // Optimize Remaps' Booster origin, so the savings figure and the total agree.
  const [loadedAtMs] = useState(() => Date.now());
  const queueProjection = useMemo(
    () => projectQueueEnd(trainedSkills, queueEntries, loadedAtMs, plan.entries),
    [trainedSkills, queueEntries, loadedAtMs, plan.entries]
  );
  // The plan entry that IS the in-game queue's currently-training level, if
  // any (#1701 follow-up) — EntryList shows its real remaining time instead
  // of a bare, misleading "0m" for the zero own-steps that entry contributes.
  const pinnedInProgress = useMemo(
    () => pinnedInProgressEntry(plan.entries, queueProjection, loadedAtMs),
    [plan.entries, queueProjection, loadedAtMs]
  );
  // The one inputs literal every costing below shares (the schedule, the
  // what-if "vs current" pass, Optimize remaps / Optimize for me re-prices), so
  // a new field cannot be wired at one site and missed at another. Implants go
  // in raw: `schedulePlan` applies the What-If lens itself.
  const schedulablePlan = useMemo<SchedulablePlan>(
    () => ({
      entries: plan.entries,
      markers: plan.markers,
      markerAttributes: plan.markerAttributes,
      whatIfImplants: plan.whatIfImplants,
      booster: plan.booster,
      boosters: plan.boosters,
    }),
    [
      plan.entries,
      plan.markers,
      plan.markerAttributes,
      plan.whatIfImplants,
      plan.booster,
      plan.boosters,
    ]
  );
  const scheduleInputs = useMemo<PlanScheduleInputs>(
    () => ({
      catalog,
      trained: trainedSkills,
      queueEntries,
      attributes,
      attributeBaseline,
      implants,
      cloneState,
    }),
    [catalog, trainedSkills, queueEntries, attributes, attributeBaseline, implants, cloneState]
  );
  // Costed by `schedulePlanWith`, the same costing the Calendar makes, so the
  // two can never quote different dates for one plan.
  const schedule = useMemo(
    () => schedulePlanWith(schedulablePlan, scheduleInputs, loadedAtMs),
    [schedulablePlan, scheduleInputs, loadedAtMs]
  );
  // The what-if chip's "vs current" figure: one more pass of the same costing
  // against the clone's real implants, run only while the lens is hypothetical.
  const hypotheticalLens = isHypotheticalLens(whatIf);
  const currentLensSchedule = useMemo(
    () =>
      hypotheticalLens
        ? // Override: force the default (real-implants) lens, ignoring the plan's stored What-If.
          schedulePlanWith(schedulablePlan, scheduleInputs, loadedAtMs, {
            whatIfImplants: DEFAULT_WHAT_IF_SELECTION,
          })
        : null,
    [hypotheticalLens, schedulablePlan, scheduleInputs, loadedAtMs]
  );
  const currentLensTotalSeconds = currentLensSchedule?.totalSeconds ?? null;
  const {
    scheduled,
    entryBoundaries,
    error,
    startDate,
    markersResult: markersAtCurrentPositions,
    priorityMap,
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
  const headerProgress = useMemo(
    () => planProgress(plan.entries, catalog.engineSkills, trainedSkills),
    [plan.entries, catalog.engineSkills, trainedSkills]
  );

  // One row per skill level (reorder.ts). Plans written before that rule —
  // and any entry added at a level several above the character's trained one
  // — hold a single entry spanning "IV–V", which cannot be dragged apart.
  // Split it, once, the first time such a plan is opened, moving its Remap
  // Markers to keep them in front of the same entries. Idempotent, so a plan
  // already split writes nothing and this never loops.
  //
  // Gated on `trainedSkillsKnown`, never on the catalog: the catalog ships in
  // the bundle and loads even when ESI has told us nothing, and splitting a
  // plan against "no levels trained" cuts rows for levels the character
  // already has. Those extra rows train nothing, so a later split cannot
  // remove them — it would rewrite a correct plan into a permanently wrong
  // one, on a fresh device or an expired token, without the user touching
  // anything.
  useEffect(() => {
    if (!trainedSkillsKnown) return;
    const patch = splitByLevel(editable, catalog.engineSkills, trainedSkills);
    if (patch) onUpdate(patch);
  }, [editable, catalog.engineSkills, trainedSkills, trainedSkillsKnown, onUpdate]);

  // Whether the plan holds any row the character already trained: the button is absent when there is nothing to remove.
  const hasTrainedEntries = useMemo(
    () => removeTrainedEntries(editable, trainedSkills) !== null,
    [editable, trainedSkills]
  );

  const userSkillTypeIDs = useMemo(
    () => new Set(plan.entries.map((e) => e.skillTypeID)),
    [plan.entries]
  );

  // `new Date()` matches every other "plan starts now" read in this
  // component (e.g. `scheduleFromNow`). Memoized so its reference stays
  // stable across renders, not invalidating the header badge's own memo.
  const budget = useMemo(
    () => remapBudget(remapInfo, plan.remapCount, new Date()),
    [remapInfo, plan.remapCount]
  );
  // `requestedRemapCount` stays uncapped so `evaluateOptimizationBadge` can
  // tell a genuine over-cap request from one the timed remap alone accounts
  // for; `remapCount` is what the optimizer actually gets.
  const { timed: timedRemap, count: requestedRemapCount, evaluatedCount: remapCount } = budget;

  // Remap-placement inputs shared by every optimize flow that calls `placeRemaps` (directly, or via `optimizeForMe`).
  function buildRemapOptions(): PlaceRemapsOptions {
    return {
      remapCount,
      currentAttributes: attributes,
      implants: effectiveImplants,
      cloneState,
      timedRemap: timedRemap ?? undefined,
      // The same Boosters the computed queue schedules with, so the savings
      // figure and the queue total cannot disagree.
      booster:
        activeBoosters.length > 0
          ? { boosters: activeBoosters, startDate: new Date(queueProjection.startMs) }
          : undefined,
    };
  }
  const pricing: PricingContext = { schedulablePlan, scheduleInputs, loadedAtMs, attributes };
  const optimizeEnv = {
    engineSkills: catalog.engineSkills,
    trainedSkills,
    editable,
    scheduled,
    onUpdate,
  };
  const {
    optimizeResult,
    optimizeVerdict,
    optimizeConfirm,
    handleOptimizeRemaps,
    acceptOptimizeRemaps,
    rejectOptimizeRemaps,
  } = useOptimizeRemaps({
    ...optimizeEnv,
    costingScope,
    buildRemapOptions,
    remapCount,
    timedRemap,
    remapInfo,
    pricing,
    stepKeys: schedule.stepKeys,
  });
  const { optimizeForMePreview, handleOptimizeForMe, acceptOptimizeForMe, rejectOptimizeForMe } =
    useOptimizeForMe({
      ...optimizeEnv,
      costingScope,
      buildRemapOptions,
      pricing,
      priorityMap,
      milestones: plan.milestones,
      loadedAtMs,
    });
  const {
    reorderConfirm,
    reorderPreview,
    setReorderPreview,
    handleSuggestReorder,
    handleSortShortest,
    acceptReorder,
  } = useReorder({
    planScope,
    engineSkills: catalog.engineSkills,
    editable,
    scheduled,
    priorityMap,
    milestones: plan.milestones,
    attributes,
    implants: effectiveImplants,
    cloneState,
    onUpdate,
    pricing,
    loadedAtMs,
  });

  // #112: merge "Your entries" and the computed queue into one row list —
  // one row per entry (own aggregated per-level/cumulative time) plus dimmed
  // prereq rows positioned just ahead of the entry that needed them.
  const entryQueue = useMemo(
    () => summarizeEntryQueue(plan.entries, entryBoundaries, scheduled, schedule.isKnownSkill),
    [plan.entries, entryBoundaries, scheduled, schedule.isKnownSkill]
  );
  // Built once and reused by both mergedRows and bandsAt below (#408: the
  // two used to each call buildRows independently over the same
  // entries/markers, a duplicate pass on every render).
  const rows = useMemo(() => buildRows(plan.entries, plan.markers), [plan.entries, plan.markers]);
  const mergedRows = useMemo(
    () => buildMergedRows(plan.entries, plan.markers, entryQueue, rows),
    [plan.entries, plan.markers, entryQueue, rows]
  );
  useEffect(() => {
    mergedRowsRef.current = mergedRows;
    editableRef.current = editable;
  });
  const bandsAt = useMemo<ReadonlyMap<string, BandInfo>>(() => {
    if (groupingMode === 'attributePair') {
      const placed = placeBandHeaders(
        mergedRows,
        attributePairBandStarts(rows, catalog.engineSkills)
      );
      return new Map(
        [...placed].map(([id, pair]) => [id, { kind: 'attributePair', ...pair } as const])
      );
    }
    const placed = placeBandHeaders(
      mergedRows,
      meaningfulBandStarts(bandStarts(rows, priorityMap))
    );
    return new Map(
      [...placed].map(([id, priority]) => [id, { kind: 'priority', priority } as const])
    );
  }, [groupingMode, mergedRows, rows, priorityMap, catalog.engineSkills]);

  // `markersAtCurrentPositions` (from the schedule, above) already carries a
  // manual override's real attributes when one is set — exactly what the
  // savings badge and Accept must cost against (#1232). But RemapMarkerModal
  // needs the OTHER half for a marker that already has an override: what the
  // optimizer would pick absent that override, to seed a fresh edit without
  // it being mistaken for the existing one. This is a second, override-blind
  // (and Booster-blind) run of the same bounded per-segment search — cheap,
  // unlike `placeRemaps`'s DP — kept only for that seeding purpose.
  const markersOptimizerSpread = useMemo(() => {
    if (!plan.markers || plan.markers.length === 0) return null;
    return optimizeAtMarkers(scheduled, catalog.engineSkills, {
      markers: schedule.markerStepIndices,
      currentAttributes: attributes,
      implants: effectiveImplants,
      cloneState,
    });
  }, [
    plan.markers,
    scheduled,
    schedule.markerStepIndices,
    catalog.engineSkills,
    attributes,
    effectiveImplants,
    cloneState,
  ]);
  const markersVerdict = useMemo(
    () => (markersAtCurrentPositions ? markerVerdict(markersAtCurrentPositions) : null),
    [markersAtCurrentPositions]
  );
  const {
    markersPanelOpen,
    handleOptimizeAtMarkers,
    acceptOptimizeAtMarkers,
    rejectOptimizeAtMarkers,
  } = useOptimizeAtMarkers({
    ...optimizeEnv,
    planScope,
    markersAtCurrentPositions,
    markersVerdict,
  });

  // Header badge: live (no click, no spinner) via Booster-blind costing —
  // the only path cheap enough to run on every render. A Booster expiring
  // mid-plan can push placeRemaps' Booster-aware DP into seconds of
  // synchronous work even at remapCount=1 (measured, not just the docstring's
  // estimate), so while a Booster is active the header instead reuses the
  // explicit "Optimize remaps" result (Booster-aware, computed on click) and
  // shows nothing until the user has clicked it once — never a stale or
  // wrong number, never a spinner.
  //
  // A plan whose markers actually split something gets its chip from them,
  // regardless of remapCount: a marker is the user's own remap decision, not
  // a hypothetical the optimizer proposes, so what it saves against training
  // everything on current attributes is the number that answers "how much is
  // this saving me". Markers all sitting at the plan's end remap nothing, so
  // that plan falls through to the budget path below rather than reporting a
  // 0 the chip would render as "None" — the "remapping cannot help this
  // plan" lie planHeaderStats.ts refuses to tell.
  const headerBadge = useMemo(() => {
    if (markersAtCurrentPositions && markersVerdict?.kind !== 'markersAtEnd') {
      const markerCount = markersAtCurrentPositions.segments.filter((s) => s.remap).length;
      return toOptimizationBadge(
        markersAtCurrentPositions.savingsSeconds,
        markerCount,
        markerCount
      );
    }
    // A plan with no remaps to spend gets no chip on either path — the rule
    // and the reasoning live in evaluateOptimizationBadge, but the Booster
    // branch below never reaches it. Gated on the REQUESTED count: a plan
    // with 0 bonus remaps and the yearly one on cooldown still has one to
    // spend once the cooldown offset is honored.
    if (requestedRemapCount <= 0) return null;
    if (activeBoosters.length > 0) {
      return optimizeResult
        ? toOptimizationBadge(optimizeResult.savingsSeconds, remapCount, requestedRemapCount)
        : null;
    }
    return evaluateOptimizationBadge(scheduled, catalog.engineSkills, {
      remapCount: requestedRemapCount,
      currentAttributes: attributes,
      implants: effectiveImplants,
      cloneState,
      timedRemap: timedRemap ?? undefined,
    });
  }, [
    markersAtCurrentPositions,
    markersVerdict,
    activeBoosters,
    optimizeResult,
    remapCount,
    requestedRemapCount,
    scheduled,
    catalog,
    attributes,
    effectiveImplants,
    cloneState,
    timedRemap,
  ]);

  // The remap saving the header would show on the clone's real implants, so a
  // what-if lens that shrinks it can say why (`remapSavingsShrank`). Mirrors
  // `headerBadge`'s two Booster-blind paths; with a Booster active there is no
  // live figure on either side, so no comparison.
  const realLensSavingsSeconds = useMemo(() => {
    if (!currentLensSchedule || activeBoosters.length > 0) return null;
    const { markersResult, scheduled: realScheduled } = currentLensSchedule;
    if (markersResult && markerVerdict(markersResult).kind !== 'markersAtEnd') {
      return markersResult.savingsSeconds;
    }
    if (requestedRemapCount <= 0) return null;
    return (
      evaluateOptimizationBadge(realScheduled, catalog.engineSkills, {
        remapCount: requestedRemapCount,
        currentAttributes: attributes,
        implants,
        cloneState,
        timedRemap: timedRemap ?? undefined,
      })?.savingsSeconds ?? null
    );
  }, [
    currentLensSchedule,
    activeBoosters,
    requestedRemapCount,
    catalog,
    attributes,
    implants,
    cloneState,
    timedRemap,
  ]);

  async function handleImport() {
    if (queueImporting) return;
    setQueueImporting(true);
    setImportError(null);
    // Compared against currentPlanIdRef once the fetch resolves: a plan
    // switch mid-fetch means this result belongs to neither plan, so it's
    // dropped rather than applied to whichever plan is now current (#1402).
    const requestedPlanId = plan.id;
    try {
      const result = await loadCharacterSkillQueue(characterId);
      if (currentPlanIdRef.current !== requestedPlanId) return;
      if (!result) return;
      const parsed = dedupeEntries(parseSkillQueue(result.data));
      // An empty in-game queue must never wipe the plan (#1402) — it parses
      // to `[]` the same as a genuinely empty import, so this has to be
      // caught before the "empty plan" fast path below would otherwise apply
      // it as a no-op-looking "import".
      if (parsed.length === 0) {
        setImportError(t('plans.importQueueEmpty'));
        return;
      }
      // An empty plan has nothing to lose, so it goes in with no prompt —
      // the choice Modal below exists only to protect entries already there.
      if (plan.entries.length === 0) {
        onUpdate({ entries: parsed });
        return;
      }
      setPendingQueueImport(parsed);
    } catch (err) {
      // BUG #3: malformed/corrupted queue data (parseSkillQueue validates
      // and throws) must surface as a visible, i18n'd note — not an
      // unhandled rejection swallowed by the `void handleImport()` caller.
      setImportError(
        t('plans.importError', { message: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setQueueImporting(false);
    }
  }

  /** Append choice on the queue-import Modal (#1402): same merge rule clipboard import uses. */
  function confirmQueueImportAppend() {
    if (!pendingQueueImport) return;
    const parsed = pendingQueueImport;
    // A pending Undo describes a Replace this Append doesn't touch, but
    // showing it beside an unrelated Append confirmation would let it revert
    // this (and anything since) instead of just the Replace it was for.
    setUndoImport(null);
    onUpdate(appendImport(editable, parsed));
    showImportConfirm(appendedCountMessage(t, trainedSkills, parsed), 4000);
    setPendingQueueImport(null);
  }

  /**
   * Clipboard/file import's commit: append, with an Undo beside the confirmation
   * since nothing was previewed first. The snapshot is the same one Replace
   * takes, so one Undo handler serves both.
   */
  function applyTextImport(entries: PlanEntry[]) {
    setUndoImport({
      entries: editable.entries,
      markers: editable.markers ?? [],
      markerAttributes: editable.markerAttributes ?? [],
    });
    onUpdate(appendImport(editable, entries));
    // Long enough to use the Undo it carries, like Replace's.
    showImportConfirm(appendedCountMessage(t, trainedSkills, entries), 10000);
    setImportOpen(false);
    setImportSeed(null);
    setImportPreview(undefined);
  }

  const applyTextImportRef = useRef(applyTextImport);
  useEffect(() => {
    applyTextImportRef.current = applyTextImport;
  });

  /**
   * A pasted skill plan or a dropped plan file: applied without a dialog when
   * every line parsed, otherwise the dialog opens on what was and wasn't read.
   */
  async function importWithoutDialog(previewing: Promise<ClipboardImportPreview>, openOn?: string) {
    let result: ClipboardImportPreview;
    try {
      result = await previewing;
    } catch {
      // The catalogs would not load: open the dialog on the text so Import can retry.
      setImportSeed(openOn ?? null);
      setImportOpen(true);
      return;
    }
    if (importOutcome(result) === 'apply') {
      // The plan may have changed while the catalogs loaded: apply through the latest render.
      applyTextImportRef.current(result.entries);
      return;
    }
    setImportSeed(openOn ?? null);
    setImportPreview(result);
    setImportOpen(true);
  }

  // A skill plan pasted elsewhere (the seed): spent at once, so a re-render
  // can't import it twice.
  const seedRef = useRef<string | null>(null);
  useEffect(() => {
    if (importSeed === null || seedRef.current === importSeed) return;
    seedRef.current = importSeed;
    void importWithoutDialog(previewImportText(importSeed), importSeed);
  }, [importSeed]);

  /** A plan file dropped on the editor goes through the same import as the dialog's. */
  function handleEditorDrop(e: DragEvent<HTMLDivElement>) {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    void importWithoutDialog(previewImportFile(file));
  }

  /** Replace choice on the queue-import Modal (#1402): swaps entries, clears Remap Markers, leaves an Undo. */
  function confirmQueueImportReplace() {
    if (!pendingQueueImport) return;
    const { patch, undo } = replaceWithImport(editable, pendingQueueImport);
    setUndoImport(undo);
    onUpdate(patch);
    // Longer than Append/clipboard's 4s — this one carries an Undo action, so
    // it has to stay up long enough to use it.
    showImportConfirm(t('plans.importQueueReplaced'), 10000);
    setPendingQueueImport(null);
  }

  /** Undo beside the post-Replace confirmation: restores the snapshot taken just before it. */
  function undoQueueImportReplace() {
    if (!undoImport) return;
    cancelImportConfirm();
    onUpdate(undoImport);
    setUndoImport(null);
    setImportConfirm(null);
  }

  async function handleExport() {
    const text = exportPlanToClipboard(
      scheduled.map((s) => ({ skillTypeID: s.skillTypeID, level: s.level })),
      catalog.engineSkills
    );
    await writeToClipboard(text);
    showCopyConfirm(true);
  }

  function handleExportCsv() {
    downloadCsv('skill-queue', scheduled, queueCsvColumns(t, nameFor, userSkillTypeIDs));
  }

  /**
   * A marker's target attributes, keyed by STEP INDEX, not by ordinal
   * position: `optimizeAtMarkers` dedupes its cut points
   * (`[...new Set(...)]`), so two distinct markers collapse into one remap
   * segment whenever an entry between them contributes no step (already
   * trained, or missing from the catalog) — the two then sit at the same
   * step index. Indexing the remapped segments by ordinal position would
   * misattribute every marker after such a collision to the wrong segment;
   * both colliding markers correctly show the one segment they actually
   * share.
   */
  const markerAttributesByStepIndex = useMemo(() => {
    if (!markersOptimizerSpread) return null;
    return new Map(
      markersOptimizerSpread.segments
        .filter((s) => s.remap)
        .map((s) => [s.startIndex, s.attributes])
    );
  }, [markersOptimizerSpread]);
  const markerStepIndicesForResult = markersOptimizerSpread ? schedule.markerStepIndices : null;
  /** What "Optimize at my markers" computes for this marker, ignoring any manual override — RemapMarkerModal needs this half on its own so it can seed a fresh edit from the optimizer's spread without that spread being mistaken for an existing override. */
  function computedMarkerAttributesFor(markerIndex: number): Attributes | undefined {
    const stepIndex = markerStepIndicesForResult?.[markerIndex];
    return stepIndex === undefined ? undefined : markerAttributesByStepIndex?.get(stepIndex);
  }

  /** A manual override always wins — it is the user overriding the optimizer, not the other way around. */
  function markerAttributesFor(markerIndex: number): Attributes | undefined {
    return normalizedMarkerAttributes[markerIndex] ?? computedMarkerAttributesFor(markerIndex);
  }

  /** RemapMarkerModal's Save/Clear: set (or clear, via `null`) marker `markerIndex`'s manual override. */
  function handleSaveMarkerAttributes(markerIndex: number, attributes: Attributes | null) {
    onUpdate(setRemapMarkerAttributes(editable, markerIndex, attributes));
  }

  /** "{Skill} III" — how a promoted prereq is named back to the user. */
  const levelLabel = useCallback(
    (skillTypeID: number, level: number): string => `${nameFor(skillTypeID)} ${romanLevel(level)}`,
    [nameFor]
  );

  const confirmPromotion = useCallback(
    (skillTypeID: number, level: number) => {
      showPromoteConfirm(t('plans.prereqPromoted', { name: levelLabel(skillTypeID, level) }), 4000);
    },
    [t, levelLabel, showPromoteConfirm]
  );

  /**
   * One drag on the merged list — or the equivalent non-drag move (#408's
   * row-actions menu resolves its own target id and calls this the same way
   * EntryList's DndContext does). planDrop decides what it meant — a plain
   * reorder, a prereq row promoted into a real entry, or a drop the
   * normalizer would silently undo, which is refused with the entry that
   * requires the dragged skill named rather than springing back unexplained.
   *
   * useCallback'd: crosses into EntryList's memoized rows as the row-actions
   * menu's `onReorder` prop (#408) — see nameFor's comment for why an
   * unstable identity there would defeat that memoization.
   */
  const handleDrop = useCallback(
    (activeId: string, overId: string) => {
      const result = moveRow(editable, {
        rows: mergedRows,
        activeId,
        overId,
        skills: catalog.engineSkills,
        trainedSkills,
      });
      if (!result.ok) {
        // A skill is never its own prerequisite: when both sides are the same
        // skill, what refused the drop is one of its own levels being trained
        // first, and the cross-skill wording ("X is a prerequisite of X")
        // reads as gibberish for the very gesture per-level rows exist for.
        setDropError(
          result.skillTypeID === result.blockedBy
            ? t('plans.dropBlockedSameSkill', {
                skill: nameFor(result.skillTypeID),
                level: romanLevel(result.targetLevel),
                blockerLevel: romanLevel(result.blockedByLevel),
              })
            : t('plans.dropBlocked', {
                skill: nameFor(result.skillTypeID),
                blocker: nameFor(result.blockedBy),
              })
        );
        return;
      }
      setDropError(null);
      onUpdate(result.patch);
      if (result.promoted) confirmPromotion(result.promoted.skillTypeID, result.promoted.level);
    },
    [
      editable,
      mergedRows,
      catalog.engineSkills,
      trainedSkills,
      t,
      nameFor,
      confirmPromotion,
      onUpdate,
      setDropError,
    ]
  );

  /** The "+" on a prereq row: the same promotion, without needing a drag. */
  const handlePromotePrereq = useCallback(
    (rowId: string) => {
      const patch = promotePrereqRow(editable, mergedRows, rowId);
      if (!patch) return;
      setDropError(null);
      onUpdate(patch);
      const row = mergedRows.find((r) => r.id === rowId);
      if (row?.kind === 'prereq') {
        confirmPromotion(row.step.skillTypeID, row.step.level);
        // The prereq row becomes an entry row with this id, once the update lands.
        focusAfterCommit(() => planRowHandle(`${row.step.skillTypeID}-${row.step.level}`));
      }
    },
    [editable, mergedRows, onUpdate, confirmPromotion, setDropError, focusAfterCommit]
  );

  /** EntryList's `onRemove`: removes at once and offers Undo, which restores the plan as it was. */
  const requestRemoveEntry = useCallback(
    (skillTypeID: number, targetLevel: number) => {
      const before = editableRef.current;
      const landing = neighbourFocusCandidates(
        mergedRowsRef.current,
        `${skillTypeID}-${targetLevel}`,
        entriesHeadingRef
      );
      const snapshot: Required<SkillPlanEditable> = {
        entries: before.entries,
        markers: before.markers ?? [],
        markerAttributes: before.markerAttributes ?? [],
      };
      const saved = onUpdate(removeEntry(before, skillTypeID, targetLevel));
      setRemovedToast({
        message: t('plans.entryRemoved', { name: levelLabel(skillTypeID, targetLevel) }),
        onUndo: () => {
          setRemovedToast(null);
          void onUpdate(snapshot);
        },
      });
      // The save is async, so the row can outlive the click: once it has
      // landed, move focus off the gone ⋮.
      void Promise.resolve(saved).then(() => focusAfterCommit(...landing));
    },
    [onUpdate, focusAfterCommit, setRemovedToast, levelLabel, t]
  );

  const handleRemoveMarker = useCallback(
    (markerIndex: number) => {
      const marker = mergedRows.find((r) => r.kind === 'marker' && r.markerIndex === markerIndex);
      onUpdate(removeRemapMarker(editable, markerIndex));
      focusAfterCommit(
        ...neighbourFocusCandidates(mergedRows, marker?.id ?? '', entriesHeadingRef)
      );
    },
    [editable, mergedRows, onUpdate, focusAfterCommit]
  );

  const handleSetPriority = useCallback(
    (skillTypeID: number, priority: PlanPriority) =>
      onUpdate(setPriority(editable, skillTypeID, priority)),
    [editable, onUpdate]
  );

  function handleRemoveTrained() {
    const removal = removeTrainedEntries(editable, trainedSkills);
    if (!removal) return;
    onUpdate(removal.patch);
    // Long enough to use the Undo it carries, like Replace's.
    showTrainedRemoved({ count: removal.removed, undo: removal.undo }, 10000);
  }

  function undoRemoveTrained() {
    if (!trainedRemoved) return;
    cancelTrainedRemoved();
    onUpdate(trainedRemoved.undo);
    setTrainedRemoved(null);
  }

  function handleAddMarker() {
    onUpdate(addRemapMarker(editable));
    showMarkerConfirm(true);
  }

  /**
   * One action in the tools pane: a full-width row, glyph left, label beside
   * it. `size="md"` is deliberate — these are the pane's primary targets, so
   * they take the `h-9` touch tier (DESIGN.md §3) rather than `sm`,
   * which is for controls nested inside an already-dense row and would hand
   * a phone a 36px target.
   *
   * This replaces #224's two renderings of every action (full-text `Button`
   * at `lg`+, icon-only `IconButton` below it). That split existed because
   * centred pills wrapped badly in a wide row; stacked in a narrow column
   * the problem is gone, and a labelled row is self-describing where an
   * icon-only strip that scrolled sideways was not.
   *
   * Returned as a bare `Button` by `toolButton` so the Export dropdown can
   * hand the same element to its Radix trigger's `asChild`, which needs a
   * single element to clone props onto and so cannot take a Tooltip wrapper.
   */
  function toolButton({
    icon,
    label,
    onClick,
    disabled,
  }: {
    icon: ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) {
    return (
      <Button size="md" align="start" className="w-full" onClick={onClick} disabled={disabled}>
        {/* Decorative: the label beside it is the accessible name (DESIGN.md §5). */}
        <span aria-hidden="true" className="shrink-0 text-text-dim">
          {icon}
        </span>
        {label}
      </Button>
    );
  }

  function toolAction(args: Parameters<typeof toolButton>[0] & { tooltip?: string }): ReactNode {
    const button = toolButton(args);
    return args.tooltip ? <Tooltip content={args.tooltip}>{button}</Tooltip> : button;
  }

  /** Transient "it worked" note, under the action that produced it. `action`, when given, is an extra control beside it (e.g. Undo). */
  function confirmation(message: string, action?: ReactNode) {
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-success">
        {message}
        {action}
      </p>
    );
  }

  /** The Optimize menu's items, in display order — one shared shape (label, hint, disabled, handler) instead of near-identical `DropdownMenuItem` blocks. */
  const optimizeMenuItems: OptimizeMenuItem[] = [
    {
      key: 'for-me',
      label: t('plans.optimizeForMeItem'),
      hint: t('plans.optimizeForMeHint'),
      disabled: scheduled.length === 0,
      onSelect: handleOptimizeForMe,
    },
    {
      key: 'reorder',
      label: t('plans.optimizeModeReorder'),
      hint: t('plans.optimizeModeReorderHint'),
      disabled: scheduled.length === 0,
      onSelect: handleSuggestReorder,
    },
    {
      key: 'shortest',
      label: t('plans.sortShortest'),
      hint: t('plans.sortShortestTooltip'),
      disabled: scheduled.length === 0,
      onSelect: handleSortShortest,
    },
    {
      key: 'remaps',
      label: t('plans.optimizeModeRemaps'),
      hint: t('plans.optimizeModeRemapsHint'),
      disabled: scheduled.length === 0,
      onSelect: handleOptimizeRemaps,
    },
    {
      key: 'markers',
      label: t('plans.optimizeModeMarkers'),
      hint:
        (plan.markers?.length ?? 0) === 0
          ? t('plans.optimizeModeMarkersDisabledHint')
          : t('plans.optimizeModeMarkersHint'),
      disabled: scheduled.length === 0 || (plan.markers?.length ?? 0) === 0,
      onSelect: handleOptimizeAtMarkers,
    },
  ];

  const skillsToBuy = (collapsible: boolean) => (
    <SkillsToBuyPanel
      entries={plan.entries}
      trainedSkills={trainedSkills}
      trainedSkillsKnown={trainedSkillsKnown}
      nameFor={nameFor}
      collapsible={collapsible}
    />
  );

  const toolSections: PlanToolSection[] = [
    {
      id: 'actions',
      title: t('plans.toolsActions'),
      content: (
        <div className="space-y-2">
          {/* Read-only: the optimizer's whole remap budget comes from EVE
              now, not a free-typed number the optimizer half ignored. */}
          <p className="text-[0.6875rem] text-text-dim">
            {remapInfo
              ? `${t('plans.remapBudget', { bonus: remapInfo.bonus })} ${
                  remapInfo.yearlyReady
                    ? t('plans.remapBudgetYearlyReady')
                    : t('plans.remapBudgetYearlyFrom', {
                        date: remapInfo.cooldownUntil
                          ? formatLocalDate(remapInfo.cooldownUntil, timeZone)
                          : '',
                      })
                }`
              : t('plans.remapBudgetFallback', { count: plan.remapCount })}
          </p>
          <div className="space-y-1.5">
            <OptimizeMenu items={optimizeMenuItems} disabled={scheduled.length === 0} />
            {reorderConfirm &&
              confirmation(
                t(
                  reorderConfirm === 'shortest'
                    ? 'plans.sortShortestSuggested'
                    : 'plans.reorderSuggested'
                )
              )}
            {optimizeConfirm && confirmation(optimizeConfirm)}
            {toolAction({
              icon: <Icon.AddMarker size={Icon.ICON_SIZE.sm} />,
              label: t('plans.addMarker'),
              onClick: handleAddMarker,
            })}
            {toolAction({
              icon: <Icon.Ships size={Icon.ICON_SIZE.sm} />,
              label: t('plans.fitGoal.add'),
              onClick: () => setFitGoalOpen(true),
            })}
            {/* Absent, not greyed, when there is nothing to remove (or trained skills are unknown). */}
            {trainedSkillsKnown &&
              hasTrainedEntries &&
              toolAction({
                icon: <Icon.Done size={Icon.ICON_SIZE.sm} />,
                label: t('plans.removeTrained'),
                onClick: handleRemoveTrained,
              })}
            {trainedRemoved &&
              confirmation(
                t('plans.trainedRemoved', { count: trainedRemoved.count }),
                <Button size="md" variant="ghost" onClick={undoRemoveTrained}>
                  {t('plans.importQueueUndo')}
                </Button>
              )}
            {markerConfirm && confirmation(t('plans.markerAdded'))}
            {/* Standing, not a post-click toast: the moment the plan carries
                a Remap Marker, what it saves is a fact about the plan, and
                waiting behind a click hid it from the user who placed the
                marker precisely to find out. The Modal the button opens is
                still the place to *accept* the spread. */}
            {markersVerdict && (
              // Success green only when the markers actually save something.
              // A standing line saying "no remap improves this plan" painted
              // green would be a status color used decoratively (DESIGN.md
              // §6) — tolerable for a two-second toast, not for something
              // that never leaves the pane.
              <p
                className={
                  markersVerdict.kind === 'saves' ? 'text-xs text-success' : 'text-xs text-text-dim'
                }
              >
                {confirmRemapOutcome(t, markersVerdict, undefined, timeZone)}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      // Round 17 called this section "Training" and gave it the two what-if
      // lenses. It is the character's *attributes* that those lenses move,
      // and attributes are the one piece of character state that explains
      // every number on this page — training time, projected finish, the
      // savings the remap optimizer quotes. So the section leads with the
      // sheet itself and keeps the lenses beneath it, which is why it is
      // named for the sheet now (and named the same as the plan list's
      // pane, which shows exactly this).
      //
      // Why here, and not a fourth panel: the sidebar already carries the
      // plan list plus this one tools panel, and the round-17 redesign
      // exists precisely because the page had grown too many peer panels.
      // Another one would cost another header strip to say the same thing,
      // and below `lg` — where there is no sidebar at all — it would land as
      // a second always-open block above the entry list, undoing the "the
      // whole tool set costs one collapsed row" rule. Inside the pane, the
      // attributes cost no rows on a phone and sit a line above the control
      // that reinterprets them on a desktop.
      //
      // The tradeoff that buys: below `lg` the attributes are behind the
      // same one tap as every other tool. Accepted deliberately — the plan
      // leads the page there, and a reference read is worth a tap where a
      // permanently-open block is not.
      id: 'attributes',
      title: t('plans.toolsAttributes'),
      // Dated like every other ESI-derived view, and in the same place the
      // plan list's Attributes panel dates it.
      actions: attributesResult?.fetchedAt && <DataAgeBadge date={attributesResult.fetchedAt} />,
      content: (
        <div className="space-y-2 text-xs">
          {/* The clone's real sheet, never re-rendered through the what-if
              lens below: "current" has to keep meaning current, or the one
              honest reading of the character on this page becomes another
              hypothetical. The lens's effect is visible where it belongs —
              in the plan's own numbers. */}
          <AttributeChips
            attributes={attributesResult?.data ?? null}
            implantBonuses={implants}
            boosterBonus={acceleratorBonusOf(attributeBaseline)}
            dense
            short
          />
          {/* An impossible sheet is reported, never quietly approximated: the
              scheduler below is running on the placeholder spread, and a
              number presented without that caveat is the bug this fixes. */}
          {attributeBaseline?.kind === 'impossible' && (
            <p className="text-warning">
              {t('plans.attributesImpossible', { total: attributeBaseline.reportedTotal })}
            </p>
          )}
        </div>
      ),
    },
    // Skills to buy is an output, not a setting, so it sits right under the
    // attributes it is read beside rather than last. Below `lg` it is not in
    // this pane at all: the row in the main column puts it outside the
    // collapsed pane.
    ...(isDesktop
      ? [
          {
            id: 'skills-to-buy',
            title: t('plans.skillsToBuy.title'),
            content: skillsToBuy(false),
          },
        ]
      : []),
    // Alpha, the What-If Implants and the Booster change every number on the
    // page, and injectors are costed under Alpha, so they share one closed
    // row; its summary keeps whatever is set visible.
    {
      id: 'assumptions',
      title: t('plans.assumptions.title'),
      group: {
        summary: assumptionsSummary(
          {
            alpha: cloneState === 'alpha',
            whatIf,
            matchedJumpClone: matchedCloneId !== null,
            // What the scheduler applies, not every row: a prefilled accelerator
            // with no expiry yet is costed as none.
            boosterCount: activeBoosters.length,
          },
          t
        ),
        sections: [
          {
            id: 'assumption-controls',
            title: t('plans.assumptions.title'),
            hideTitle: true,
            content: (
              <div className="space-y-2 text-xs">
                <label className={`flex items-center gap-1.5 ${tappableRowClassName}`}>
                  <Checkbox
                    checked={cloneState === 'alpha'}
                    disabled={!cloneStatesHydrated}
                    onChange={(e) => setCloneState(e.target.checked ? 'alpha' : 'omega')}
                  />
                  {t('plans.alphaClone')}
                </label>
                <p className="text-[0.6875rem] text-text-dim">{t('plans.alphaCloneNote')}</p>
                {alphaCappedSteps.size > 0 && (
                  <p className="text-warning">
                    {t('plans.alphaCappedCount', { count: alphaCappedSteps.size })}
                  </p>
                )}

                <div className="flex items-center gap-1">
                  <label className="flex flex-1 items-center justify-between gap-2">
                    {t('plans.whatIfImplants')}
                    <Select
                      value={
                        matchedCloneId !== null
                          ? `clone:${matchedCloneId}`
                          : whatIf.kind === 'custom'
                            ? 'custom'
                            : whatIf.preset
                      }
                      // Picking 'custom' freezes what is in force into five editable
                      // slots without changing a number (toCustomSelection).
                      onValueChange={(value) => {
                        const clone = jumpClones.find((c) => `clone:${c.id}` === value);
                        setWhatIf(
                          clone
                            ? cloneSelection(clone)
                            : value === 'custom'
                              ? toCustomSelection(whatIf, implants)
                              : { kind: 'preset', preset: value as WhatIfImplantPreset }
                        );
                      }}
                    >
                      <SelectTrigger
                        size="md"
                        aria-label={t('plans.whatIfImplants')}
                        className="w-36"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WHAT_IF_IMPLANT_PRESETS.map((preset) => (
                          <SelectItem key={preset} value={preset}>
                            {preset === 'none'
                              ? t('plans.whatIfNone')
                              : preset === 'current'
                                ? t('plans.whatIfCurrent')
                                : preset}
                          </SelectItem>
                        ))}
                        {jumpClones.map((clone) => (
                          <SelectItem key={clone.id} value={`clone:${clone.id}`}>
                            {t('plans.whatIfJumpClone', { label: clone.label })}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">{t('plans.whatIfCustom')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  {marketGroupLink(
                    t('plans.whatIfMarketLink'),
                    ATTRIBUTE_ENHANCERS_MARKET_GROUP_ID
                  )}
                </div>

                {/* EVE's hardwirings are per slot (+4 PER / +5 INT / nothing in
              CHA), which a uniform preset cannot say. One row of five, shown
              only under "Custom" (pick it, or edit a value): editing one
              leaves the other four alone. Under a preset a one-line readout
              says what the plan is being costed against. The three-letter codes are the same abbreviation the
              entry list's attribute-pair badge uses; each input's accessible
              name spells the attribute out. */}
                {whatIf.kind === 'custom' ? (
                  <div
                    role="group"
                    aria-label={t('plans.whatIfPerAttribute')}
                    className="grid grid-cols-5 gap-1"
                  >
                    {ATTRIBUTE_NAMES.map((name) => (
                      <label key={name} className="flex flex-col items-center gap-0.5">
                        <span className="text-[0.625rem] tracking-widest text-text-dim uppercase">
                          {attributeShort(name)}
                        </span>
                        <TextInput
                          size="md"
                          type="number"
                          min={MIN_IMPLANT_BONUS}
                          max={MAX_IMPLANT_BONUS}
                          step={1}
                          aria-label={t('plans.whatIfAttributeBonus', {
                            attribute: t(`skills.attr.${name}`),
                          })}
                          value={effectiveImplants[name]}
                          onChange={(e) =>
                            setWhatIf(
                              setWhatIfBonus(whatIf, implants, name, Number(e.target.value))
                            )
                          }
                          // `field-no-spinner` (src/styles/index.css): Chrome draws
                          // the spin buttons on hover and focus into a 29.6px content
                          // box, taking about half of it and shoving the digit left —
                          // so the cell under the cursor would break the row's
                          // alignment with the other four.
                          className="field-no-spinner w-full text-center"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-[0.6875rem] text-text-dim">
                    {ATTRIBUTE_NAMES.map(
                      (name) => `${attributeShort(name)} +${effectiveImplants[name]}`
                    ).join(' · ')}
                  </p>
                )}

                <BoosterList
                  boosters={planBoosters}
                  detectedAccelerator={detectedAccelerator}
                  onChange={(boosters) => onUpdate({ boosters })}
                />
              </div>
            ),
          },
          {
            id: 'injectors',
            title: t('plans.injectors.title'),
            content: (
              <InjectorFactsPanel
                scheduled={scheduled}
                totalSp={totalSp}
                unallocatedSp={unallocatedSp}
                cloneState={cloneState}
              />
            ),
          },
        ],
      },
    },
    // Several Characters only: a single-Character account has no one to rank.
    ...(roster.length > 1
      ? [
          {
            id: 'closest',
            title: t('plans.closest.title'),
            hideTitle: roster.length > CLOSEST_AUTO_LOAD_MAX,
            content: (
              <WhoIsClosest
                roster={roster}
                ownerId={characterId}
                entries={plan.entries}
                skills={catalog.engineSkills}
              />
            ),
          },
        ]
      : []),
  ];

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
        onDrop={handleEditorDrop}
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
            <div className="flex flex-wrap gap-2 text-xs">
              {orphanedMilestones.map((status) => (
                <span
                  key={status.milestone.id}
                  className="inline-flex items-center gap-1.5 text-warning"
                >
                  {t('plans.milestone.orphanedNotice', { name: status.milestone.name })}
                  <IconButton
                    icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
                    label={t('plans.milestone.removeLabel', { name: status.milestone.name })}
                    onClick={() => {
                      handleRemoveMilestone(status.milestone.id);
                      focusAfterCommit(entriesHeadingRef);
                    }}
                    size="sm"
                    tone="danger"
                  />
                </span>
              ))}
            </div>
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
                controls={
                  // Group-by and Columns are this list's own view controls —
                  // riding the search bar's row keeps them off the page
                  // header, which Import/Export already fills.
                  <>
                    <label className="flex items-center gap-1">
                      {t('plans.groupBy')}
                      <Select
                        value={groupingMode}
                        onValueChange={(value) => void setGroupingMode(value as GroupingMode)}
                      >
                        <SelectTrigger
                          size="md"
                          aria-label={t('plans.groupBy')}
                          className="w-36 lg:scroll-mt-40"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GROUPING_MODES.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {mode === 'priority'
                                ? t('plans.groupByPriority')
                                : t('plans.groupByAttributePair')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          icon={<Icon.ColumnsPicker />}
                          label={t('plans.columns')}
                          className="lg:scroll-mt-40"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(
                          [
                            ['attributePair', 'plans.columnAttributePair'],
                            ['priority', 'plans.columnPriority'],
                            ['perLevelTime', 'plans.columnPerLevel'],
                            ['cumulativeTime', 'plans.columnCumulative'],
                          ] as const
                        ).map(([key, labelKey]) => (
                          <DropdownMenuCheckboxItem
                            key={key}
                            checked={columnVisibility[key]}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={(checked) =>
                              void setColumnVisibility({ ...columnVisibility, [key]: checked })
                            }
                          >
                            {t(labelKey)}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                }
              />
              {dropError && (
                <p role="alert" className="text-xs text-danger">
                  {dropError}
                </p>
              )}
              {promoteConfirm && confirmation(promoteConfirm)}
              {error ? (
                <p className="text-xs text-danger">{t('plans.computeError', { message: error })}</p>
              ) : (
                <EntryList
                  rows={mergedRows}
                  bandsAt={bandsAt}
                  nameFor={nameFor}
                  attributesFor={attributesFor}
                  columns={columnVisibility}
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

      {/* Import/Export: the route's page-level actions cluster, "far top
          right corner" like every other route (Wallet.tsx, Assets.tsx) —
          portaled in because the route owns that DOM slot but the handlers
          and the data they act on (scheduled, catalog) live here. */}
      {headerActionsContainer &&
        createPortal(
          <>
            <DropdownMenu open={importMenuOpen} onOpenChange={setImportMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button size="md" disabled={queueImporting}>
                  <Icon.ImportClipboard aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                  {t('plans.import')}
                  <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={() => {
                  // Open the dialog only once the menu has handed focus back to
                  // the trigger: the native <dialog> records the focused
                  // element to restore on close, and that must be the trigger,
                  // not a menu item that is about to unmount.
                  if (openImportDialogAfterMenuRef.current) {
                    openImportDialogAfterMenuRef.current = false;
                    setImportOpen(true);
                  }
                }}
              >
                <DropdownMenuItem onSelect={() => void handleImport()}>
                  {t('plans.importFromQueueItem')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    openImportDialogAfterMenuRef.current = true;
                  }}
                >
                  {t('plans.importFromTextOrFileItem')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button size="md">
                  <Icon.Export aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                  {t('plans.export')}
                  <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(event) => {
                    // Keep the menu open (skip Radix's default auto-close)
                    // until the write settles, then close it ourselves:
                    // closing first moves focus back to the trigger as part
                    // of the same transition, and writeText() called
                    // mid-transition can throw "Document is not focused"
                    // (NotAllowedError).
                    event.preventDefault();
                    void handleExport().finally(() => setExportMenuOpen(false));
                  }}
                >
                  {t('plans.exportClipboard')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleExportCsv} disabled={scheduled.length === 0}>
                  {t('plans.exportCsvQueue')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Beside the buttons that produced them, not down in the entries
                panel — a confirmation/error disconnected from its trigger
                reads as belonging to something else. */}
            {copyConfirm && confirmation(t('plans.exportCopied'))}
            {importConfirm &&
              confirmation(
                importConfirm,
                undoImport && (
                  <Button size="md" variant="ghost" onClick={undoQueueImportReplace}>
                    {t('plans.importQueueUndo')}
                  </Button>
                )
              )}
            {importError && (
              <p role="alert" className="text-xs text-danger">
                {importError}
              </p>
            )}
          </>,
          headerActionsContainer
        )}

      {importOpen && (
        <ImportClipboardDialog
          onApply={applyTextImport}
          onClose={() => {
            setImportOpen(false);
            setImportSeed(null);
            setImportPreview(undefined);
          }}
          initialText={importSeed ?? undefined}
          initialPreview={importPreview}
          nameFor={nameFor}
          trainedSkills={trainedSkills}
        />
      )}

      {/* Queue import into a non-empty plan (#1402): neither choice applies
          until the user picks one, so an empty or paused in-game queue can
          never silently wipe a plan someone spent an hour building. */}
      <Modal
        open={pendingQueueImport !== null}
        onClose={() => setPendingQueueImport(null)}
        title={t('plans.importQueueChoiceTitle')}
      >
        <p className="text-xs text-text-dim">
          {t('plans.importQueueChoiceBody', { count: pendingQueueImport?.length ?? 0 })}
        </p>
        <div className="mt-2 flex gap-2">
          {/* md, not this file's usual sm-in-a-Modal: the ticket calls out the
              36px touch floor by name for this Modal specifically. */}
          <Button variant="primary" size="md" onClick={confirmQueueImportAppend}>
            {t('plans.importQueueAppend')}
          </Button>
          <Button variant="danger" size="md" onClick={confirmQueueImportReplace}>
            {t('plans.importQueueReplace')}
          </Button>
          <Button size="md" onClick={() => setPendingQueueImport(null)}>
            {t('plans.importCancel')}
          </Button>
        </div>
      </Modal>

      <OptimizeForMeModal
        kind={reorderPreview?.kind}
        preview={
          reorderPreview
            ? {
                order: reorderPreview.order,
                remaps: {
                  segments: [],
                  totalSeconds: reorderPreview.totalSeconds,
                  currentSeconds: reorderPreview.totalSeconds,
                  savingsSeconds: 0,
                },
              }
            : null
        }
        currentOrder={scheduled}
        totalSeconds={totalSeconds}
        prioritized={[...priorityMap.values()].some((priority) => priority !== 'normal')}
        nameFor={nameFor}
        stepLabel={stepLabel}
        implants={effectiveImplants}
        onAccept={acceptReorder}
        onReject={() => setReorderPreview(null)}
      />

      <OptimizeForMeModal
        preview={optimizeForMePreview}
        currentOrder={scheduled}
        totalSeconds={totalSeconds}
        prioritized={[...priorityMap.values()].some((priority) => priority !== 'normal')}
        nameFor={nameFor}
        stepLabel={stepLabel}
        implants={effectiveImplants}
        onAccept={acceptOptimizeForMe}
        onReject={rejectOptimizeForMe}
      />

      <RemapPreviewModal
        title={t('plans.optimizeRemaps')}
        open={optimizeResult !== null}
        verdict={optimizeVerdict}
        // `remapNoGain` blames the entry order and points at "Suggest
        // reorder" — true only when a remap was actually weighed and lost,
        // never when there was none to spend. No segments on this branch:
        // a search that found nothing to remap has no plan-as-trained to
        // show, unlike the markers Modal below, which already has one.
        segments={optimizeVerdict?.kind === 'saves' && optimizeResult ? optimizeResult : null}
        message={
          optimizeVerdict?.kind === 'noRemapsAvailable'
            ? t('plans.remapNoneAvailable')
            : t('plans.remapNoGain')
        }
        onAccept={acceptOptimizeRemaps}
        onClose={rejectOptimizeRemaps}
        stepByKey={schedule.stepByKey}
        stepLabel={stepLabel}
        implants={effectiveImplants}
      />

      <RemapPreviewModal
        title={t('plans.optimizeAtMarkers')}
        open={markersPanelOpen && markersAtCurrentPositions !== null}
        verdict={markersVerdict}
        // Segments are the plan as the markers would train it — worth
        // seeing even when the trade is poor, but not when no marker split
        // anything: the lone "keep current attributes" row would then read
        // as a contradiction of the message above it.
        segments={
          markersAtCurrentPositions && markersVerdict?.kind !== 'markersAtEnd'
            ? {
                segments: markersAtCurrentPositions.segments,
                anchorKeys: anchorKeysOf(schedule.stepKeys, markersAtCurrentPositions.segments),
              }
            : null
        }
        message={
          markersVerdict?.kind === 'markersAtEnd'
            ? t('plans.markersAtEnd')
            : t('plans.markersNoGain')
        }
        onAccept={acceptOptimizeAtMarkers}
        onClose={rejectOptimizeAtMarkers}
        stepByKey={schedule.stepByKey}
        stepLabel={stepLabel}
        implants={effectiveImplants}
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
