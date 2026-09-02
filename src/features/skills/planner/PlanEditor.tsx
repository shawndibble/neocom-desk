import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InfoTooltip,
  Modal,
  Panel,
  Tooltip,
} from '@/components/ui';
import { normalizePlan } from '@/engine/plan';
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
  Attributes,
  Booster,
  Implants,
  PlanEntry,
  PlanStep,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { loadCharacterSkillQueue } from '../data';
import { writeToClipboard } from '@/lib/clipboard';
import type { SkillCatalog } from '../skillMap';
import { SkillPicker } from './SkillPicker';
import { EntryList } from './EntryList';
import { ComputedQueue } from './ComputedQueue';
import { PlanHeader } from './PlanHeader';
import {
  evaluateOptimizationBadge,
  toOptimizationBadge,
  MIN_MEANINGFUL_SAVINGS_SECONDS,
} from './planHeaderStats';
import { boostedStepIndices } from '@/engine/boosterImpact';
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
  markerStepIndices,
  markersAfterEntryRemoval,
  removeMarker,
  reorderRows,
} from './markers';
import type { RemapAvailability } from './remapAvailability';
import { whatIfImplants, WHAT_IF_IMPLANT_MODES, type WhatIfImplantMode } from './whatIfImplants';
import { ImportClipboardDialog } from './ImportClipboardDialog';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** "PER 27 / WIL 21 / INT 17 / …": full remap spread, highest first. */
function remapInstruction(attributes: Attributes): string {
  return [...ATTRIBUTE_NAMES]
    .sort((a, b) => attributes[b] - attributes[a])
    .map((name) => `${name.slice(0, 3).toUpperCase()} ${attributes[name]}`)
    .join(' / ');
}

interface PlanEditorProps {
  characterId: number;
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  /** Remaps Available from ESI (bonus + yearly), for the hint next to the count input. */
  remapInfo: RemapAvailability | null;
  onUpdate: (patch: Partial<Pick<SkillPlanRecord, 'entries' | 'remapCount' | 'markers'>>) => void;
}

interface ComputeResult {
  scheduled: ScheduledStep[];
  error: string | null;
  /** At least one entry refers to a skill the current catalog knows about (UX-REVIEW #9's empty-state discriminator). */
  hasValidEntries: boolean;
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
  const hasValidEntries = validEntries.length > 0;
  const startDate = new Date();
  try {
    const steps = normalizePlan(validEntries, catalog.engineSkills, trainedSkills);
    const scheduled = computeSchedule(
      steps,
      { attributes, implants, boosters, startDate },
      catalog.engineSkills
    );
    return { scheduled, error: null, hasValidEntries, startDate };
  } catch (err) {
    return {
      scheduled: [],
      error: err instanceof Error ? err.message : String(err),
      hasValidEntries,
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
  remapInfo,
  onUpdate,
}: PlanEditorProps) {
  const { t } = useTranslation();
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<PlaceRemapsResult | null>(null);
  const [markersResult, setMarkersResult] = useState<PlaceRemapsResult | null>(null);
  const [reorderPreview, setReorderPreview] = useState<PlanStep[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // What-If Implants (CONTEXT.md): swap the clone's real implants for a
  // hypothetical set, for optimizer/schedule exploration only — never
  // persisted (plan.remapCount etc. stay the source of truth for the plan
  // itself; this is a "what if" lens on top of it).
  const [whatIfMode, setWhatIfMode] = useState<WhatIfImplantMode>('current');
  const effectiveImplants = useMemo(
    () => whatIfImplants(whatIfMode, implants),
    [whatIfMode, implants]
  );

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

  // Display-only "expired" hint: reads the wall clock, which is unavoidably
  // impure (there's no ticking-clock store in this codebase to subscribe to
  // instead). computeSchedule itself is unaffected — it already treats a
  // past expiry as "no bonus" regardless of this flag.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const boosterExpired = booster !== null && booster.expiresAt.getTime() <= Date.now();

  const nameFor = (skillTypeID: number): string =>
    catalog.bySkillTypeID.get(skillTypeID)?.name ?? `#${skillTypeID}`;

  const stepLabel = (step: PlanStep): string =>
    `${nameFor(step.skillTypeID)} ${ROMAN[step.level - 1]}`;

  const pickerSkills = useMemo(
    () => [...catalog.bySkillTypeID.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog]
  );

  const { scheduled, error, hasValidEntries, startDate } = useMemo(
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
    setReorderPreview(null);
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

  function handleOptimizeRemaps() {
    if (scheduled.length === 0) return;
    setOptimizeResult(
      placeRemaps(scheduled, catalog.engineSkills, {
        remapCount,
        currentAttributes: attributes,
        implants: effectiveImplants,
        // The same Boosters the computed queue schedules with, so the savings
        // figure and the queue total cannot disagree.
        booster:
          activeBoosters.length > 0
            ? { boosters: activeBoosters, startDate: new Date() }
            : undefined,
      })
    );
  }

  function handleOptimizeAtMarkers() {
    if (scheduled.length === 0) return;
    setMarkersResult(
      optimizeAtMarkers(scheduled, catalog.engineSkills, {
        markers: markerStepIndices(plan.entries, plan.markers, catalog.engineSkills, trainedSkills),
        currentAttributes: attributes,
        implants: effectiveImplants,
      })
    );
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
  }

  function acceptReorder() {
    if (!reorderPreview) return;
    update(applyReorderSuggestion(plan.entries, reorderPreview));
    setReorderPreview(null);
  }

  return (
    <div className="space-y-4">
      <PlanHeader
        totalSeconds={totalSeconds}
        skillCount={scheduledSkillCount}
        projectedFinish={planFinish}
        badge={headerBadge}
      />

      <Panel title={t('plans.importExport')}>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void handleImport()}>
            {t('plans.importQueue')}
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            {t('plans.importClipboard')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">{t('plans.export')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => void handleExport()}>
                {t('plans.exportClipboard')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportCsv} disabled={scheduled.length === 0}>
                {t('plans.exportCsvQueue')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {copyConfirm && (
            <span role="status" aria-live="polite" className="text-xs text-success">
              {t('plans.exportCopied')}
            </span>
          )}
        </div>
      </Panel>

      <Panel
        title={t('plans.toolbar')}
        className="sticky top-0 z-10"
        actions={
          <span className="flex items-center gap-1 text-[0.6875rem] text-text-dim">
            <label htmlFor="plan-remap-count">{t('plans.remapCount')}</label>
            <InfoTooltip
              label={t('plans.remapCountTooltipLabel')}
              content={t('plans.remapCountTooltip')}
            />
            <input
              id="plan-remap-count"
              type="number"
              min={0}
              max={5}
              value={plan.remapCount}
              onChange={(e) =>
                onUpdate({ remapCount: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })
              }
              className="h-6 w-12 rounded-xs border border-line bg-panel-2 px-1 text-center text-text"
            />
            {remapInfo && (
              <span className="text-text-faint">
                {remapInfo.yearlyReady
                  ? t('plans.remapFromEveReady', { bonus: remapInfo.bonus })
                  : t('plans.remapFromEveCooldown', {
                      bonus: remapInfo.bonus,
                      date: remapInfo.cooldownUntil ? formatDate(remapInfo.cooldownUntil) : '',
                    })}
              </span>
            )}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip content={t('plans.optimizeRemapsTooltip')}>
            <Button size="sm" onClick={handleOptimizeRemaps} disabled={scheduled.length === 0}>
              {t('plans.optimizeRemaps')}
            </Button>
          </Tooltip>
          <Button
            size="sm"
            onClick={() => onUpdate({ markers: addMarker(plan.markers, plan.entries.length) })}
          >
            {t('plans.addMarker')}
          </Button>
          <Button
            size="sm"
            onClick={handleOptimizeAtMarkers}
            disabled={scheduled.length === 0 || (plan.markers?.length ?? 0) === 0}
          >
            {t('plans.optimizeAtMarkers')}
          </Button>
          <Button size="sm" onClick={handleSuggestReorder} disabled={scheduled.length === 0}>
            {t('plans.suggestReorder')}
          </Button>
        </div>
      </Panel>

      <Panel title={t('plans.yourEntries')}>
        <div className="space-y-3">
          <SkillPicker
            skills={pickerSkills}
            catalog={catalog}
            trainedSkills={trainedSkills}
            onAdd={(entry) => update(upsertEntry(plan.entries, entry))}
          />
          <EntryList
            entries={plan.entries}
            markers={plan.markers}
            priorityFor={priorityMap}
            nameFor={nameFor}
            onReorder={(activeId, overId) =>
              onUpdate(reorderRows(plan.entries, plan.markers, activeId, overId))
            }
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
              onUpdate({ markers: removeMarker(plan.markers, markerIndex, plan.entries.length) })
            }
            onSetPriority={(skillTypeID, priority) =>
              update(setEntryPriority(plan.entries, skillTypeID, priority))
            }
          />
        </div>
      </Panel>

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

      {importConfirm && (
        <p role="status" aria-live="polite" className="text-xs text-success">
          {importConfirm}
        </p>
      )}

      {importError && (
        <p role="alert" className="text-xs text-danger">
          {importError}
        </p>
      )}

      <Panel title={t('plans.trainingOptions')}>
        <div className="flex flex-wrap items-start gap-6">
          <label className="flex items-center gap-2 text-xs">
            {t('plans.whatIfImplants')}
            <select
              value={whatIfMode}
              onChange={(e) => setWhatIfMode(e.target.value as WhatIfImplantMode)}
              className="h-7 rounded-xs border border-line bg-panel-2 px-1 text-text"
            >
              {WHAT_IF_IMPLANT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'none'
                    ? t('plans.whatIfNone')
                    : mode === 'current'
                      ? t('plans.whatIfCurrent')
                      : mode}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={boosterEnabled}
                onChange={(e) => setBoosterEnabled(e.target.checked)}
              />
              {t('plans.booster')}
            </label>
            {boosterEnabled && (
              <>
                <label className="flex items-center gap-1">
                  {t('plans.boosterBonus')}
                  <input
                    type="number"
                    min={1}
                    max={9}
                    value={boosterBonus}
                    onChange={(e) => setBoosterBonus(Number(e.target.value) || 0)}
                    className="h-7 w-14 rounded-xs border border-line bg-panel-2 px-1 text-center text-text"
                  />
                </label>
                <label className="flex items-center gap-1">
                  {t('plans.boosterExpiresAt')}
                  <input
                    type="datetime-local"
                    value={boosterExpiresAt}
                    onChange={(e) => setBoosterExpiresAt(e.target.value)}
                    className="h-7 rounded-xs border border-line bg-panel-2 px-1 text-text"
                  />
                </label>
                {boosterExpired && (
                  <span className="text-warning">{t('plans.boosterExpired')}</span>
                )}
              </>
            )}
          </div>
        </div>
      </Panel>

      {optimizeResult && (
        <Panel title={t('plans.optimizeRemaps')}>
          {/* The header badge above already discloses a capped evaluation
              live, before any click — repeating it here would just be the
              same warning shown twice. */}
          {optimizeResult.savingsSeconds < MIN_MEANINGFUL_SAVINGS_SECONDS ? (
            <p className="text-xs text-text-dim">{t('plans.remapNoGain')}</p>
          ) : (
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-success">
                {t('plans.remapSaves', {
                  duration: formatDuration(optimizeResult.savingsSeconds),
                })}
              </p>
              {renderSegments(optimizeResult.segments)}
            </div>
          )}
        </Panel>
      )}

      {markersResult && (
        <Panel title={t('plans.optimizeAtMarkers')}>
          <div className="space-y-2 text-xs">
            {markersResult.savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS ? (
              <p className="font-semibold text-success">
                {t('plans.remapSaves', {
                  duration: formatDuration(markersResult.savingsSeconds),
                })}
              </p>
            ) : (
              <p className="text-text-dim">{t('plans.markersNoGain')}</p>
            )}
            {renderSegments(markersResult.segments)}
          </div>
        </Panel>
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

      <Panel
        title={t('plans.computedQueue')}
        actions={
          <div className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
            <span>{formatDuration(totalSeconds)}</span>
            {planFinish && (
              <span>{t('plans.projectedFinish', { date: formatDate(planFinish) })}</span>
            )}
          </div>
        }
      >
        {error ? (
          <p className="text-xs text-danger">{t('plans.computeError', { message: error })}</p>
        ) : (
          <ComputedQueue
            steps={scheduled}
            nameFor={nameFor}
            userSkillTypeIDs={userSkillTypeIDs}
            boostedSteps={boostedSteps}
            hasValidEntries={hasValidEntries}
            startDate={startDate}
          />
        )}
      </Panel>
    </div>
  );
}
