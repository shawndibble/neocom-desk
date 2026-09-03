import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InfoTooltip,
  Modal,
  NativeSelect,
  Panel,
  TextInput,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useIsDesktop } from '@/lib/useIsDesktop';
import {
  useViewportBoundedHeight,
  VIEWPORT_BOUNDED_BOTTOM_GAP_PX,
} from '@/lib/useViewportBoundedHeight';
import { normalizePlanWithBoundaries } from '@/engine/plan';
import { effectivePriority } from '@/engine/planPriority';
import { computeSchedule } from '@/engine/schedule';
import { parseSkillQueue } from '@/engine/queueImport';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import {
  optimizeAtMarkers,
  MAX_SUPPORTED_REMAPS,
  placeRemaps,
  suggestReorder,
  ATTRIBUTE_NAMES,
} from '@/engine/optimizer';
import type { PlaceRemapsResult, RemapSegment } from '@/engine/optimizer';
import type {
  AttributeName,
  Attributes,
  Booster,
  Implants,
  PlanEntry,
  PlanStep,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import type { CharacterAttributes } from '@/esi/endpoints';
import { AttributeChips } from '@/features/skills/AttributeChips';
import { loadCharacterSkillQueue, type CachedResult } from '../data';
import { writeToClipboard } from '@/lib/clipboard';
import type { SkillCatalog } from '../skillMap';
import { SkillPicker } from './SkillPicker';
import { EntryList } from './EntryList';
import type { BandInfo } from './EntryList';
import { useColumnVisibility } from './columnPreference';
import { useGroupingMode, GROUPING_MODES, type GroupingMode } from './groupingMode';
import { attributePairBandStarts } from './attributePairBands';
import { PlanHeader } from './PlanHeader';
import { PlanEditorLayout } from './PlanEditorLayout';
import { PlanToolsPane, type PlanToolSection } from './PlanToolsPane';
import { evaluateOptimizationBadge, toOptimizationBadge } from './planHeaderStats';
import { markerVerdict, remapVerdict, type OptimizeVerdict } from './optimizeVerdict';
import { boostedStepIndices } from '@/engine/boosterImpact';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import { queueCsvColumns } from './queueCsv';
import { downloadCsv } from '@/lib/downloadCsv';
import { formatDate, formatDuration } from '@/lib/duration';
import {
  dedupeEntries,
  removeEntry,
  upsertEntry,
  applyReorderSuggestion,
  setEntryPriority,
} from './reorder';
import {
  addMarker,
  buildRows,
  markerStepIndices,
  markersAfterEntryRemoval,
  removeMarker,
} from './markers';
import { planDrop, promotePrereq } from './planDrop';
import { bandStarts } from './bands';
import { summarizeEntryQueue, buildMergedRows, placeBandHeaders } from './queueRows';
import type { RemapAvailability } from './remapAvailability';
import {
  whatIfImplants,
  setWhatIfBonus,
  DEFAULT_WHAT_IF_SELECTION,
  MAX_IMPLANT_BONUS,
  MIN_IMPLANT_BONUS,
  WHAT_IF_IMPLANT_PRESETS,
  type WhatIfImplantPreset,
  type WhatIfImplantSelection,
} from './whatIfImplants';
import { ImportClipboardDialog } from './ImportClipboardDialog';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** "PER": the house three-letter attribute code, as EntryList's pair badge writes it. */
function attributeShort(name: AttributeName): string {
  return name.slice(0, 3).toUpperCase();
}

/** "PER 27 / WIL 21 / INT 17 / …": full remap spread, highest first. */
function remapInstruction(attributes: Attributes): string {
  return [...ATTRIBUTE_NAMES]
    .sort((a, b) => attributes[b] - attributes[a])
    .map((name) => `${attributeShort(name)} ${attributes[name]}`)
    .join(' / ');
}

interface PlanEditorProps {
  characterId: number;
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
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
  /**
   * The plan list, rendered at the top of the sidebar this component lays
   * out. Passed in rather than imported so the route keeps owning plan CRUD
   * and this component keeps owning the two-column grid — the tools pane in
   * that sidebar needs every handler that already lives here, and lifting
   * them out to let the route compose the columns would mean a dozen
   * callbacks crossing the boundary for no gain.
   */
  listPane: ReactNode;
  onUpdate: (patch: Partial<Pick<SkillPlanRecord, 'entries' | 'remapCount' | 'markers'>>) => void;
}

interface ComputeResult {
  scheduled: ScheduledStep[];
  /** entryBoundaries[i] = scheduled.length after processing validEntries[0..i] (see normalizePlanWithBoundaries). */
  entryBoundaries: number[];
  error: string | null;
  /**
   * "Now" at compute time — the single wall-clock origin fed to
   * computeSchedule's booster-expiry math AND used to derive the plan
   * timeline (#20), so the two can never disagree.
   */
  startDate: Date;
}

function computeQueue(
  entries: readonly PlanEntry[],
  catalog: SkillCatalog,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  attributes: Attributes,
  implants: Implants,
  boosters: Booster[]
): ComputeResult {
  // Guard against unknown typeIDs (stale plan, imported skill not in the current SDE snapshot).
  const validEntries = entries.filter((e) => catalog.engineSkills.has(e.skillTypeID));
  const startDate = new Date();
  try {
    const { steps, entryBoundaries } = normalizePlanWithBoundaries(
      validEntries,
      catalog.engineSkills,
      trainedSkills
    );
    const scheduled = computeSchedule(
      steps,
      // `trainedSkills` is read twice, for two different things:
      // normalizePlanWithBoundaries takes the levels (which steps to emit),
      // computeSchedule takes the SP (how much of the first such step is
      // already paid for). Without the second, a plan that opens on the skill
      // the character is currently training re-charges the whole level and
      // reads hours longer than the in-game queue for it.
      { attributes, implants, boosters, startDate, trainedSkills },
      catalog.engineSkills
    );
    return { scheduled, entryBoundaries, error: null, startDate };
  } catch (err) {
    return {
      scheduled: [],
      entryBoundaries: [],
      error: err instanceof Error ? err.message : String(err),
      startDate,
    };
  }
}

export function PlanEditor({
  characterId,
  plan,
  catalog,
  trainedSkills,
  attributes,
  implants,
  attributesResult,
  attributeBaseline = null,
  remapInfo,
  listPane,
  onUpdate,
}: PlanEditorProps) {
  const { t } = useTranslation();
  // Which side the tools pane lands on, and whether the entry list gets its
  // own capped scroller — the same hook the rest of the app's two-column
  // layouts switch on, so this pane can never disagree with them.
  const isDesktop = useIsDesktop();
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<PlaceRemapsResult | null>(null);
  const [markersResult, setMarkersResult] = useState<PlaceRemapsResult | null>(null);
  // Why each result came out the way it did (optimizeVerdict.ts). Held
  // beside the result rather than derived at render: the verdict depends on
  // the Remaps Available the run actually used, and the user can edit that
  // input afterwards without invalidating the result itself.
  const [optimizeVerdict, setOptimizeVerdict] = useState<OptimizeVerdict | null>(null);
  const [markersVerdict, setMarkersVerdict] = useState<OptimizeVerdict | null>(null);
  const [reorderPreview, setReorderPreview] = useState<PlanStep[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Inline, beside-the-button confirmations (#222) — same pattern as
  // copyConfirm/importConfirm above: small text next to the triggering
  // button, cleared after a couple of seconds. Additive to the full
  // Panel/Modal results those same actions already produce below.
  const [optimizeConfirm, setOptimizeConfirm] = useState<string | null>(null);
  const [markerConfirm, setMarkerConfirm] = useState(false);
  const [markersOptimizeConfirm, setMarkersOptimizeConfirm] = useState<string | null>(null);
  const [reorderConfirm, setReorderConfirm] = useState(false);
  // Outcome of the last drag on the entry list. A drop that would land a
  // skill after something requiring it is refused rather than silently
  // re-normalized back (planDrop.ts), so the refusal has to say why; a
  // promoted prereq row is a quieter change than it looks (a dimmed row turns
  // into user data), so it says so too.
  const [dropError, setDropError] = useState<string | null>(null);
  const [promoteConfirm, setPromoteConfirm] = useState<string | null>(null);

  // The entry list is the only thing that scrolls independently: it gets a
  // live-measured cap so it fills the room actually left below it, while the
  // summary strip and the sidebar beside it stay put. That replaces the pair
  // of sticky panels this pane used to run (#221/#229), whose offsets had to
  // be measured off each other's rendered height and drifted apart whenever
  // either one's content changed height.
  const [listScrollerRef, listMaxHeight] = useViewportBoundedHeight(VIEWPORT_BOUNDED_BOTTOM_GAP_PX);

  // "Columns" control (#114): a device-local view preference, applying the
  // same way across every plan on this device rather than per-plan.
  const columnVisibility = useColumnVisibility((state) => state.value);
  const hydrateColumnVisibility = useColumnVisibility((state) => state.hydrate);
  const setColumnVisibility = useColumnVisibility((state) => state.setValue);
  useEffect(() => {
    void hydrateColumnVisibility();
  }, [hydrateColumnVisibility]);

  // Grouping toggle (#115): priority (default) or attribute-pair band
  // headers — visual only, same device-local preference shape as Columns.
  const groupingMode = useGroupingMode((state) => state.value);
  const hydrateGroupingMode = useGroupingMode((state) => state.hydrate);
  const setGroupingMode = useGroupingMode((state) => state.setValue);
  useEffect(() => {
    void hydrateGroupingMode();
  }, [hydrateGroupingMode]);

  // What-If Implants (CONTEXT.md): swap the clone's real implants for a
  // hypothetical set — a uniform preset, or five per-slot bonuses, since EVE's
  // hardwirings are per attribute. For optimizer/schedule exploration only,
  // and never persisted (plan.remapCount etc. stay the source of truth for the
  // plan itself; this is a "what if" lens on top of it). Session-local rather
  // than a stored preference like Columns/Group-by above, because it changes
  // the *numbers* — and below `lg` this pane is a collapsed disclosure, so a
  // remembered lens would inflate every figure on the page with nothing on
  // screen saying why.
  const [whatIf, setWhatIf] = useState<WhatIfImplantSelection>(DEFAULT_WHAT_IF_SELECTION);
  const effectiveImplants = useMemo(() => whatIfImplants(whatIf, implants), [whatIf, implants]);

  // Booster (CONTEXT.md): a single optional cerebral accelerator, applying a
  // uniform bonus to every attribute until its expiry. Session-local only.
  const [boosterEnabled, setBoosterEnabled] = useState(false);
  const [boosterBonus, setBoosterBonus] = useState(3);
  const [boosterExpiresAt, setBoosterExpiresAt] = useState('');
  const booster = useMemo<Booster | null>(() => {
    if (!boosterEnabled || !boosterExpiresAt) return null;
    const expiresAt = new Date(boosterExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) return null;
    const bonus: Partial<Attributes> = {};
    for (const name of ATTRIBUTE_NAMES) bonus[name] = boosterBonus;
    return { bonus, expiresAt };
  }, [boosterEnabled, boosterExpiresAt, boosterBonus]);
  const activeBoosters = useMemo<Booster[]>(() => (booster ? [booster] : []), [booster]);

  // An in-game cerebral accelerator is baked into the attributes ESI reports
  // and cannot be read back out of any endpoint, so `attributeBaseline`
  // recovers it arithmetically and it is modelled here, through the same
  // Booster the What-If control drives — one mechanism, applied once. Prefill
  // is the point: the alternative is correcting the baseline silently, which
  // leaves the user's plan slower with nothing on screen saying why.
  //
  // Seeded during render (React's "adjusting state when a prop changes"),
  // like the stale-result clear below, so it lands in the same commit as the
  // data rather than a tick later. Keyed on the detected NUMBER and gated on
  // a still-pristine control, so a user's own edit is never stomped.
  const detectedAccelerator =
    attributeBaseline?.kind === 'accelerated' ? attributeBaseline.acceleratorBonus : null;
  const [seededAccelerator, setSeededAccelerator] = useState<number | null>(null);
  if (detectedAccelerator !== null && detectedAccelerator !== seededAccelerator) {
    setSeededAccelerator(detectedAccelerator);
    if (!boosterEnabled && boosterExpiresAt === '') {
      setBoosterEnabled(true);
      setBoosterBonus(detectedAccelerator);
    }
  }

  // Display-only "expired" hint: reads the wall clock, which is unavoidably
  // impure (there's no ticking-clock store in this codebase to subscribe to
  // instead). computeSchedule itself is unaffected — it already treats a
  // past expiry as "no bonus" regardless of this flag.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const boosterExpired = booster !== null && booster.expiresAt.getTime() <= Date.now();

  const nameFor = (skillTypeID: number): string =>
    catalog.bySkillTypeID.get(skillTypeID)?.name ?? `#${skillTypeID}`;

  const attributesFor = (
    skillTypeID: number
  ): { primary: AttributeName; secondary: AttributeName } | undefined => {
    const skill = catalog.engineSkills.get(skillTypeID);
    return skill ? { primary: skill.primary, secondary: skill.secondary } : undefined;
  };

  const stepLabel = (step: PlanStep): string =>
    `${nameFor(step.skillTypeID)} ${ROMAN[step.level - 1]}`;

  const pickerSkills = useMemo(
    () => [...catalog.bySkillTypeID.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog]
  );

  const { scheduled, entryBoundaries, error, startDate } = useMemo(
    () =>
      computeQueue(
        plan.entries,
        catalog,
        trainedSkills,
        attributes,
        effectiveImplants,
        activeBoosters
      ),
    [plan.entries, catalog, trainedSkills, attributes, effectiveImplants, activeBoosters]
  );

  // BUG #1: optimizeResult/reorderPreview index into `scheduled` by position.
  // Once entries change (add/remove/reorder) or the plan itself is swapped,
  // those positions are stale and can point past the end of the new
  // `scheduled` array — clear both rather than render or crash against
  // outdated data. Derived-and-cleared during render (React's sanctioned
  // "adjusting state when a prop changes" pattern) instead of an effect, so
  // the clear lands in the same commit as the prop change rather than one
  // tick later.
  const [prevPlanId, setPrevPlanId] = useState(plan.id);
  const [prevEntries, setPrevEntries] = useState(plan.entries);
  const [prevMarkers, setPrevMarkers] = useState(plan.markers);
  if (prevPlanId !== plan.id || prevEntries !== plan.entries || prevMarkers !== plan.markers) {
    setPrevPlanId(plan.id);
    setPrevEntries(plan.entries);
    setPrevMarkers(plan.markers);
    setOptimizeResult(null);
    setMarkersResult(null);
    setOptimizeVerdict(null);
    setMarkersVerdict(null);
    setReorderPreview(null);
    setOptimizeConfirm(null);
    setMarkersOptimizeConfirm(null);
    // A refusal describes one drag against one entry order — once the order
    // moves on it describes nothing. (promoteConfirm is the opposite: a
    // "that worked" note about the change that just landed, so it clears on
    // its own timer like markerAdded, not here.)
    setDropError(null);
  }

  const userSkillTypeIDs = useMemo(
    () => new Set(plan.entries.map((e) => e.skillTypeID)),
    [plan.entries]
  );

  // Effective priority per skill (#27): each entry's own band, inherited by
  // its prerequisites so one never reads as less urgent than what needs it.
  // Guard against unknown typeIDs the same way computeQueue does.
  const priorityMap = useMemo(
    () =>
      effectivePriority(
        plan.entries.filter((e) => catalog.engineSkills.has(e.skillTypeID)),
        catalog.engineSkills
      ),
    [plan.entries, catalog]
  );

  // The plan keeps whatever count the user set (ESI prefills bonus remaps).
  // Only the optimizer is capped, and the header badge says so rather than
  // quietly answering a different question than the one on screen.
  const remapCount = Math.min(plan.remapCount, MAX_SUPPORTED_REMAPS);

  // Which queue rows the Booster actually speeds up: trained inside its window
  // AND on an attribute it raises. Both, or the mark is a lie.
  const boostedSteps = useMemo(
    () =>
      activeBoosters.length > 0
        ? boostedStepIndices(scheduled, catalog.engineSkills, activeBoosters, startDate)
        : new Set<number>(),
    [scheduled, catalog, activeBoosters, startDate]
  );

  // #112: merge "Your entries" and the computed queue into one row list —
  // one row per entry (own aggregated per-level/cumulative time) plus dimmed
  // prereq rows positioned just ahead of the entry that needed them.
  const entryQueue = useMemo(
    () =>
      summarizeEntryQueue(plan.entries, entryBoundaries, scheduled, (skillTypeID) =>
        catalog.engineSkills.has(skillTypeID)
      ),
    [plan.entries, entryBoundaries, scheduled, catalog]
  );
  const mergedRows = useMemo(
    () => buildMergedRows(plan.entries, plan.markers, entryQueue),
    [plan.entries, plan.markers, entryQueue]
  );
  const bandsAt = useMemo<ReadonlyMap<string, BandInfo>>(() => {
    const rows = buildRows(plan.entries, plan.markers);
    if (groupingMode === 'attributePair') {
      const placed = placeBandHeaders(
        mergedRows,
        attributePairBandStarts(rows, catalog.engineSkills)
      );
      return new Map(
        [...placed].map(([id, pair]) => [id, { kind: 'attributePair', ...pair } as const])
      );
    }
    const placed = placeBandHeaders(mergedRows, bandStarts(rows, priorityMap));
    return new Map(
      [...placed].map(([id, priority]) => [id, { kind: 'priority', priority } as const])
    );
  }, [groupingMode, mergedRows, plan.entries, plan.markers, priorityMap, catalog.engineSkills]);

  const totalSeconds = scheduled.length > 0 ? scheduled[scheduled.length - 1].cumulativeSeconds : 0;
  // No steps means no plan finish to project — never invent one for an
  // empty (or all-trained) queue (#20).
  const planFinish =
    scheduled.length > 0 ? new Date(startDate.getTime() + totalSeconds * 1000) : null;
  // Distinct skills in `scheduled`, not just plan.entries.length — scheduled
  // also carries prerequisite steps normalizePlan injected, and totalSeconds
  // already reflects their training time, so the header's skill count must
  // count the same set it's timing.
  const scheduledSkillCount = useMemo(
    () => new Set(scheduled.map((s) => s.skillTypeID)).size,
    [scheduled]
  );

  // Header badge: live (no click, no spinner) via Booster-blind costing —
  // the only path cheap enough to run on every render. A Booster expiring
  // mid-plan can push placeRemaps' Booster-aware DP into seconds of
  // synchronous work even at remapCount=1 (measured, not just the docstring's
  // estimate), so while a Booster is active the header instead reuses the
  // explicit "Optimize remaps" result (Booster-aware, computed on click) and
  // shows nothing until the user has clicked it once — never a stale or
  // wrong number, never a spinner.
  const headerBadge = useMemo(() => {
    // A plan with no remaps to spend gets no chip on either path — the rule
    // and the reasoning live in evaluateOptimizationBadge, but the Booster
    // branch below never reaches it.
    if (plan.remapCount <= 0) return null;
    if (activeBoosters.length > 0) {
      return optimizeResult
        ? toOptimizationBadge(optimizeResult.savingsSeconds, remapCount, plan.remapCount)
        : null;
    }
    return evaluateOptimizationBadge(scheduled, catalog.engineSkills, {
      remapCount: plan.remapCount,
      currentAttributes: attributes,
      implants: effectiveImplants,
    });
  }, [
    activeBoosters,
    optimizeResult,
    remapCount,
    plan.remapCount,
    scheduled,
    catalog,
    attributes,
    effectiveImplants,
  ]);

  function update(entries: PlanEntry[]) {
    onUpdate({ entries });
  }

  async function handleImport() {
    setImportError(null);
    try {
      const result = await loadCharacterSkillQueue(characterId);
      if (!result) return;
      update(dedupeEntries(parseSkillQueue(result.data)));
    } catch (err) {
      // BUG #3: malformed/corrupted queue data (parseSkillQueue validates
      // and throws) must surface as a visible, i18n'd note — not an
      // unhandled rejection swallowed by the `void handleImport()` caller.
      setImportError(
        t('plans.importError', { message: err instanceof Error ? err.message : String(err) })
      );
    }
  }

  async function handleExport() {
    const text = exportPlanToClipboard(
      scheduled.map((s) => ({ skillTypeID: s.skillTypeID, level: s.level })),
      catalog.engineSkills
    );
    await writeToClipboard(text);
    setCopyConfirm(true);
    setTimeout(() => setCopyConfirm(false), 2000);
  }

  function handleExportCsv() {
    downloadCsv('skill-queue', scheduled, queueCsvColumns(t, nameFor, userSkillTypeIDs));
  }

  // Same beside-the-button confirmation for both Optimize Modes: the savings
  // figure when meaningful, otherwise *why* there is none. A run that placed
  // no remap at all — nothing to spend, or every marker at the plan's end —
  // is a no-op, not a finding about the plan, and saying "no meaningful
  // savings" for it sends the user off fixing the wrong thing.
  function confirmRemapOutcome(verdict: OptimizeVerdict): string {
    switch (verdict.kind) {
      case 'saves':
        return t('plans.optimizeConfirmSaves', {
          duration: formatDuration(verdict.savingsSeconds),
        });
      case 'noRemapsAvailable':
        return t('plans.optimizeConfirmNoRemaps');
      case 'markersAtEnd':
        return t('plans.optimizeConfirmMarkersAtEnd');
      case 'noGain':
        return t('plans.optimizeConfirmNoGain');
    }
  }

  function handleOptimizeRemaps() {
    if (scheduled.length === 0) return;
    const result = placeRemaps(scheduled, catalog.engineSkills, {
      remapCount,
      currentAttributes: attributes,
      implants: effectiveImplants,
      // The same Boosters the computed queue schedules with, so the savings
      // figure and the queue total cannot disagree.
      booster:
        activeBoosters.length > 0 ? { boosters: activeBoosters, startDate: new Date() } : undefined,
    });
    const verdict = remapVerdict(result, remapCount);
    setOptimizeResult(result);
    setOptimizeVerdict(verdict);
    setOptimizeConfirm(confirmRemapOutcome(verdict));
    setTimeout(() => setOptimizeConfirm(null), 2000);
  }

  function handleOptimizeAtMarkers() {
    if (scheduled.length === 0) return;
    const result = optimizeAtMarkers(scheduled, catalog.engineSkills, {
      markers: markerStepIndices(plan.entries, plan.markers, catalog.engineSkills, trainedSkills),
      currentAttributes: attributes,
      implants: effectiveImplants,
    });
    const verdict = markerVerdict(result);
    setMarkersResult(result);
    setMarkersVerdict(verdict);
    setMarkersOptimizeConfirm(confirmRemapOutcome(verdict));
    setTimeout(() => setMarkersOptimizeConfirm(null), 2000);
  }

  /** "{Skill} III" — how a promoted prereq is named back to the user. */
  function levelLabel(skillTypeID: number, level: number): string {
    return `${nameFor(skillTypeID)} ${ROMAN[level - 1]}`;
  }

  function confirmPromotion(skillTypeID: number, level: number) {
    setPromoteConfirm(t('plans.prereqPromoted', { name: levelLabel(skillTypeID, level) }));
    setTimeout(() => setPromoteConfirm(null), 4000);
  }

  /**
   * One drag on the merged list. planDrop decides what it meant — a plain
   * reorder, a prereq row promoted into a real entry, or a drop the
   * normalizer would silently undo, which is refused with the entry that
   * requires the dragged skill named rather than springing back unexplained.
   */
  function handleDrop(activeId: string, overId: string) {
    const result = planDrop({
      entries: plan.entries,
      markers: plan.markers,
      rows: mergedRows,
      activeId,
      overId,
      skills: catalog.engineSkills,
      trainedSkills,
    });
    if (!result.ok) {
      setDropError(
        t('plans.dropBlocked', {
          skill: nameFor(result.skillTypeID),
          blocker: nameFor(result.blockedBy),
        })
      );
      return;
    }
    setDropError(null);
    onUpdate({ entries: result.entries, markers: result.markers });
    if (result.promoted) confirmPromotion(result.promoted.skillTypeID, result.promoted.level);
  }

  /** The "+" on a prereq row: the same promotion, without needing a drag. */
  function handlePromotePrereq(rowId: string) {
    const result = promotePrereq({
      entries: plan.entries,
      markers: plan.markers,
      rows: mergedRows,
      rowId,
    });
    if (!result) return;
    setDropError(null);
    onUpdate({ entries: result.entries, markers: result.markers });
    const row = mergedRows.find((r) => r.id === rowId);
    if (row?.kind === 'prereq') confirmPromotion(row.step.skillTypeID, row.step.level);
  }

  function handleAddMarker() {
    onUpdate({ markers: addMarker(plan.markers, plan.entries.length) });
    setMarkerConfirm(true);
    setTimeout(() => setMarkerConfirm(false), 2000);
  }

  // Shared per-segment rendering for both optimize modes: a remapped segment
  // gets the remap instruction; the leading current-attributes segment
  // (remap: false) is labeled as "keep current attributes" instead.
  function renderSegments(segments: readonly RemapSegment[]) {
    return (
      <ul className="space-y-1">
        {segments.map((segment, index) => {
          // Defensive: results are cleared whenever plan.entries/markers
          // change (see the derive-and-clear block above), but guard the
          // index anyway so a stale result can never crash the route.
          const anchor = scheduled[segment.startIndex];
          if (!anchor) return null;
          return (
            <li
              key={index}
              className="flex flex-wrap items-center gap-2 border-b border-line pb-1 last:border-b-0"
            >
              <span className="font-semibold">{t('plans.segment', { index: index + 1 })}</span>
              <span className="flex-1">
                {segment.remap
                  ? t('plans.segmentRemap', {
                      skill: stepLabel(anchor),
                      attributes: remapInstruction(segment.attributes),
                    })
                  : t('plans.segmentCurrent', { skill: stepLabel(anchor) })}
              </span>
              <span className="tabular-nums text-text-dim">{formatDuration(segment.seconds)}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  function handleSuggestReorder() {
    if (scheduled.length === 0) return;
    setReorderPreview(suggestReorder(scheduled, catalog.engineSkills, priorityMap));
    setReorderConfirm(true);
    setTimeout(() => setReorderConfirm(false), 2000);
  }

  function acceptReorder() {
    if (!reorderPreview) return;
    update(applyReorderSuggestion(plan.entries, reorderPreview));
    setReorderPreview(null);
  }

  /**
   * One action in the tools pane: a full-width row, glyph left, label beside
   * it. `size="md"` is deliberate — these are the pane's primary targets, so
   * they take the `h-11 md:h-9` touch tier (DESIGN.md §3) rather than `sm`,
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

  /** Transient "it worked" note, under the action that produced it. */
  function confirmation(message: string) {
    return (
      <p role="status" aria-live="polite" className="text-xs text-success">
        {message}
      </p>
    );
  }

  const toolSections: PlanToolSection[] = [
    {
      id: 'actions',
      title: t('plans.toolsActions'),
      content: (
        <div className="space-y-2">
          {/* Remaps-available is a control with a value and an explanatory
              hint, not header adornment — in a panel header the hint wrapped
              to three lines and squeezed the title to nothing. */}
          <div className="flex flex-wrap items-center gap-1 text-[0.6875rem] text-text-dim">
            <label htmlFor="plan-remap-count">{t('plans.remapCount')}</label>
            <InfoTooltip
              label={t('plans.remapCountTooltipLabel')}
              content={t('plans.remapCountTooltip')}
            />
            <TextInput
              id="plan-remap-count"
              size="md"
              type="number"
              min={0}
              max={5}
              value={plan.remapCount}
              onChange={(e) =>
                onUpdate({ remapCount: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })
              }
              className="field-no-spinner w-14 text-center"
            />
          </div>
          {remapInfo && (
            <p className="text-[0.6875rem] text-text-dim">
              {remapInfo.yearlyReady
                ? t('plans.remapFromEveReady', { bonus: remapInfo.bonus })
                : t('plans.remapFromEveCooldown', {
                    bonus: remapInfo.bonus,
                    date: remapInfo.cooldownUntil ? formatDate(remapInfo.cooldownUntil) : '',
                  })}
            </p>
          )}
          <div className="space-y-1.5">
            {toolAction({
              icon: <Icon.OptimizeRemaps size={Icon.ICON_SIZE.sm} />,
              label: t('plans.optimizeRemaps'),
              onClick: handleOptimizeRemaps,
              disabled: scheduled.length === 0,
              tooltip: t('plans.optimizeRemapsTooltip'),
            })}
            {optimizeConfirm && confirmation(optimizeConfirm)}
            {toolAction({
              icon: <Icon.AddMarker size={Icon.ICON_SIZE.sm} />,
              label: t('plans.addMarker'),
              onClick: handleAddMarker,
            })}
            {markerConfirm && confirmation(t('plans.markerAdded'))}
            {toolAction({
              icon: <Icon.OptimizeAtMarkers size={Icon.ICON_SIZE.sm} />,
              label: t('plans.optimizeAtMarkers'),
              onClick: handleOptimizeAtMarkers,
              disabled: scheduled.length === 0 || (plan.markers?.length ?? 0) === 0,
            })}
            {markersOptimizeConfirm && confirmation(markersOptimizeConfirm)}
            {toolAction({
              icon: <Icon.SuggestReorder size={Icon.ICON_SIZE.sm} />,
              label: t('plans.suggestReorder'),
              onClick: handleSuggestReorder,
              disabled: scheduled.length === 0,
            })}
            {reorderConfirm && confirmation(t('plans.reorderSuggested'))}
          </div>

          {/* Read-only findings from the two optimize actions, under the
              buttons that produced them. They used to be two more panels at
              the bottom of the page, far from their own triggers. */}
          {optimizeResult && optimizeVerdict && (
            <div className="border-t border-line pt-2 text-xs">
              {/* The summary badge already discloses a capped evaluation
                  live, before any click — repeating it here would show the
                  same warning twice. */}
              {optimizeVerdict.kind === 'saves' ? (
                <div className="space-y-2">
                  <p className="font-semibold text-success">
                    {t('plans.remapSaves', {
                      duration: formatDuration(optimizeVerdict.savingsSeconds),
                    })}
                  </p>
                  {renderSegments(optimizeResult.segments)}
                </div>
              ) : (
                // `remapNoGain` blames the entry order and points at
                // "Suggest reorder" — true only when a remap was actually
                // weighed and lost, never when there was none to spend.
                <p className="text-text-dim">
                  {optimizeVerdict.kind === 'noRemapsAvailable'
                    ? t('plans.remapNoneAvailable')
                    : t('plans.remapNoGain')}
                </p>
              )}
            </div>
          )}
          {markersResult && markersVerdict && (
            <div className="space-y-2 border-t border-line pt-2 text-xs">
              {markersVerdict.kind === 'saves' ? (
                <p className="font-semibold text-success">
                  {t('plans.remapSaves', {
                    duration: formatDuration(markersVerdict.savingsSeconds),
                  })}
                </p>
              ) : (
                <p className="text-text-dim">
                  {markersVerdict.kind === 'markersAtEnd'
                    ? t('plans.markersAtEnd')
                    : t('plans.markersNoGain')}
                </p>
              )}
              {/* Segments are the plan as the markers would train it — worth
                  seeing even when the trade is poor, but not when no marker
                  split anything: the lone "keep current attributes" row then
                  reads as a contradiction of the message above it. */}
              {markersVerdict.kind !== 'markersAtEnd' && renderSegments(markersResult.segments)}
            </div>
          )}
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
            dense
          />
          {/* Says which half of this section is fact. An earlier draft read
              "every estimate on this page is costed against these", which is
              false the moment the lens leaves "current" — the estimates are
              costed against the lens, not against the chips. */}
          <p className="text-[0.6875rem] text-text-dim">{t('plans.attributesCurrentNote')}</p>
          {/* An impossible sheet is reported, never quietly approximated: the
              scheduler below is running on the placeholder spread, and a
              number presented without that caveat is the bug this fixes. */}
          {attributeBaseline?.kind === 'impossible' && (
            <p className="text-warning">
              {t('plans.attributesImpossible', { total: attributeBaseline.reportedTotal })}
            </p>
          )}

          <label className="flex items-center justify-between gap-2">
            {t('plans.whatIfImplants')}
            <NativeSelect
              size="md"
              value={whatIf.kind === 'custom' ? 'custom' : whatIf.preset}
              onChange={(e) => {
                const value = e.target.value;
                // 'custom' is a readout of the grid below, never a thing to
                // pick — it is only in the list while it is already the state.
                if (value !== 'custom') {
                  setWhatIf({ kind: 'preset', preset: value as WhatIfImplantPreset });
                }
              }}
            >
              {WHAT_IF_IMPLANT_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset === 'none'
                    ? t('plans.whatIfNone')
                    : preset === 'current'
                      ? t('plans.whatIfCurrent')
                      : preset}
                </option>
              ))}
              {whatIf.kind === 'custom' && (
                <option value="custom">{t('plans.whatIfCustom')}</option>
              )}
            </NativeSelect>
          </label>

          {/* EVE's hardwirings are per slot (+4 PER / +5 INT / nothing in
              CHA), which a uniform preset cannot say. One row of five, always
              visible: a preset fills them in, editing one leaves the other
              four alone and flips the select above to "Custom", so what the
              plan is being costed against is legible without opening
              anything. The three-letter codes are the same abbreviation the
              entry list's attribute-pair badge uses; each input's accessible
              name spells the attribute out. */}
          <div
            role="group"
            aria-label={t('plans.whatIfPerAttribute')}
            className="grid grid-cols-5 gap-1"
          >
            {ATTRIBUTE_NAMES.map((name) => (
              <label key={name} className="flex flex-col items-center gap-0.5">
                <span className="text-[0.625rem] tracking-wide text-text-dim uppercase">
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
                    setWhatIf(setWhatIfBonus(whatIf, implants, name, Number(e.target.value)))
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

          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={boosterEnabled}
              onChange={(e) => setBoosterEnabled(e.target.checked)}
            />
            {t('plans.booster')}
          </label>
          {/* Outside the checkbox's own block on purpose: unticking it is a
              legitimate answer ("that accelerator is gone"), and the reason
              the sheet was corrected has to survive that. */}
          {detectedAccelerator !== null && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('plans.boosterDetected', { bonus: detectedAccelerator })}
            </p>
          )}
          {boosterEnabled && (
            // Indented under its own checkbox: these only exist while the
            // booster is on, and the rule says so without a second heading.
            <div className="space-y-2 border-l border-line pl-2">
              <label className="flex items-center justify-between gap-2">
                {t('plans.boosterBonus')}
                <TextInput
                  size="md"
                  type="number"
                  min={1}
                  // Accelerator tiers run past the +9 this once allowed: the
                  // reported case was a +12, and a detected bonus the field
                  // cannot hold would be prefilled into an invalid input.
                  max={30}
                  value={boosterBonus}
                  onChange={(e) => setBoosterBonus(Number(e.target.value) || 0)}
                  className="field-no-spinner w-16 text-center"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                {t('plans.boosterExpiresAt')}
                {/* `min-w-0` so a datetime field can shrink inside the
                    sidebar instead of forcing the column wider. */}
                <TextInput
                  size="md"
                  type="datetime-local"
                  value={boosterExpiresAt}
                  onChange={(e) => setBoosterExpiresAt(e.target.value)}
                  className="min-w-0 flex-1"
                />
              </label>
              {/* A blank expiry means no Booster is applied at all, so a
                  prefilled bonus would otherwise sit there looking active
                  while every number on the page ignored it. */}
              {detectedAccelerator !== null && boosterExpiresAt === '' && (
                <p className="text-warning">{t('plans.boosterDetectedNoExpiry')}</p>
              )}
              {boosterExpired && <p className="text-warning">{t('plans.boosterExpired')}</p>}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'importExport',
      title: t('plans.importExport'),
      content: (
        <div className="space-y-1.5">
          {toolAction({
            icon: <Icon.ImportQueue size={Icon.ICON_SIZE.sm} />,
            label: t('plans.importQueue'),
            onClick: () => void handleImport(),
          })}
          {toolAction({
            icon: <Icon.ImportClipboard size={Icon.ICON_SIZE.sm} />,
            label: t('plans.importClipboard'),
            onClick: () => setImportOpen(true),
          })}
          <DropdownMenu open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
            <DropdownMenuTrigger asChild>
              {toolButton({
                icon: <Icon.Export size={Icon.ICON_SIZE.sm} />,
                label: t('plans.export'),
              })}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={(event) => {
                  // Keep the menu open (skip Radix's default auto-close) until
                  // the write settles, then close it ourselves: closing first
                  // moves focus back to the trigger as part of the same
                  // transition, and writeText() called mid-transition can
                  // throw "Document is not focused" (NotAllowedError).
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
          {copyConfirm && confirmation(t('plans.exportCopied'))}
          {importConfirm && confirmation(importConfirm)}
          {importError && (
            <p role="alert" className="text-xs text-danger">
              {importError}
            </p>
          )}
        </div>
      ),
    },
  ];

  // One instance, placed on one side or the other — never both. The two
  // homes are genuinely different boxes in the layout (a sidebar column vs.
  // the single scrolling column), which no CSS reordering can bridge without
  // coupling the grid's row heights to each other.
  const toolsPane = <PlanToolsPane sections={toolSections} asDisclosure={!isDesktop} />;

  return (
    <>
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
          // Only when it actually shortened these totals: an expired Booster
          // is ignored by computeSchedule, so disclosing one would be its own
          // small lie. The tools pane keeps the "Expired" hint for that case.
          //
          // Read off `booster.bonus` — the map computeSchedule costed with —
          // rather than the `boosterBonus` input beside it. They agree while
          // the input writes one figure into all five attributes, but a
          // per-attribute Booster would desync them, and a chip stating a
          // bonus the arithmetic did not apply is the very thing it exists
          // to prevent.
          booster={
            booster && !boosterExpired
              ? {
                  bonus: Math.max(...ATTRIBUTE_NAMES.map((name) => booster.bonus[name] ?? 0)),
                  expiresAt: booster.expiresAt,
                }
              : null
          }
        />

        {!isDesktop && toolsPane}

        <Panel
          title={t('plans.yourEntries')}
          actions={
            <div className="flex items-center gap-2 text-[0.6875rem] whitespace-nowrap text-text-dim">
              <span className="tabular-nums">{formatDuration(totalSeconds)}</span>
              {planFinish && (
                <span>{t('plans.projectedFinish', { date: formatDate(planFinish) })}</span>
              )}
            </div>
          }
        >
          <div className="space-y-3">
            {/* Group-by and Columns are view controls for the list below, and
                they were the two widest things in the panel header. Sat there
                with the two stats, the row could not fit a phone. */}
            <div className="flex flex-wrap items-center justify-end gap-2 text-[0.6875rem] text-text-dim">
              <label className="flex items-center gap-1">
                {t('plans.groupBy')}
                <NativeSelect
                  size="sm"
                  aria-label={t('plans.groupBy')}
                  value={groupingMode}
                  onChange={(e) => void setGroupingMode(e.target.value as GroupingMode)}
                >
                  {GROUPING_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === 'priority'
                        ? t('plans.groupByPriority')
                        : t('plans.groupByAttributePair')}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">{t('plans.columns')}</Button>
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
            </div>
            <SkillPicker
              skills={pickerSkills}
              catalog={catalog}
              trainedSkills={trainedSkills}
              onAdd={(entry) => update(upsertEntry(plan.entries, entry))}
            />
            {/* Outside the scroller, so a refusal is on screen wherever in a
                long queue the drag happened. */}
            {dropError && (
              <p role="alert" className="text-xs text-danger">
                {dropError}
              </p>
            )}
            {promoteConfirm && confirmation(promoteConfirm)}
            {/* Only the list scrolls: the panel header, the view controls and
                the picker above stay put, so adding a skill never means
                scrolling back up past a long queue to reach the field. The
                cap is measured live against the viewport, and applies at `lg`
                only — below it the page itself scrolls and a nested scroller
                would just trap the list inside one. */}
            <div
              ref={listScrollerRef}
              className="lg:overflow-y-auto"
              style={isDesktop && listMaxHeight !== null ? { maxHeight: listMaxHeight } : undefined}
            >
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
                  startDate={startDate}
                  onReorder={handleDrop}
                  onPromotePrereq={handlePromotePrereq}
                  onRemove={(skillTypeID) => {
                    const entryIndex = plan.entries.findIndex((e) => e.skillTypeID === skillTypeID);
                    onUpdate({
                      entries: removeEntry(plan.entries, skillTypeID),
                      ...(plan.markers
                        ? {
                            markers: markersAfterEntryRemoval(
                              plan.markers,
                              entryIndex,
                              plan.entries.length
                            ),
                          }
                        : {}),
                    });
                  }}
                  onRemoveMarker={(markerIndex) =>
                    onUpdate({
                      markers: removeMarker(plan.markers, markerIndex, plan.entries.length),
                    })
                  }
                  onSetPriority={(skillTypeID, priority) =>
                    update(setEntryPriority(plan.entries, skillTypeID, priority))
                  }
                />
              )}
            </div>
          </div>
        </Panel>
      </PlanEditorLayout>

      {importOpen && (
        <ImportClipboardDialog
          onApply={(entries) => {
            update(
              entries.reduce((acc, entry) => upsertEntry(acc, entry), plan.entries as PlanEntry[])
            );
            const addedCount = entries.filter(
              (entry) => (trainedSkills.get(entry.skillTypeID)?.level ?? 0) < entry.targetLevel
            ).length;
            setImportConfirm(
              addedCount > 0
                ? t('plans.importAddedCount', { count: addedCount })
                : t('plans.importAddedNone')
            );
            setTimeout(() => setImportConfirm(null), 4000);
            setImportOpen(false);
          }}
          onClose={() => setImportOpen(false)}
          nameFor={nameFor}
          trainedSkills={trainedSkills}
        />
      )}

      <Modal
        open={reorderPreview !== null}
        onClose={() => setReorderPreview(null)}
        title={t('plans.reorderPreviewTitle')}
      >
        <ul className="max-h-56 overflow-y-auto text-xs">
          {reorderPreview?.map((step, i) => (
            <li
              key={`${step.skillTypeID}-${step.level}-${i}`}
              className="border-b border-line py-1 last:border-b-0"
            >
              {nameFor(step.skillTypeID)} {ROMAN[step.level - 1]}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Button variant="primary" size="sm" onClick={acceptReorder}>
            {t('plans.reorderAccept')}
          </Button>
          <Button size="sm" onClick={() => setReorderPreview(null)}>
            {t('plans.reorderReject')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
