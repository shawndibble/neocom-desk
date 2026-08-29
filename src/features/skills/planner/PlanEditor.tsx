import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { normalizePlan } from '@/engine/plan';
import { computeSchedule } from '@/engine/schedule';
import { parseSkillQueue } from '@/engine/queueImport';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import { placeRemaps, suggestReorder, ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { PlaceRemapsResult } from '@/engine/optimizer';
import type {
  Attributes,
  Implants,
  PlanEntry,
  PlanStep,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { loadCharacterSkillQueue } from '../data';
import { writeToClipboard } from '../clipboard';
import type { SkillCatalog } from '../skillMap';
import { SkillPicker } from './SkillPicker';
import { EntryList } from './EntryList';
import { ComputedQueue } from './ComputedQueue';
import { formatDuration } from './duration';
import {
  dedupeEntries,
  handleReorder,
  removeEntry,
  upsertEntry,
  applyReorderSuggestion,
} from './reorder';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

interface PlanEditorProps {
  characterId: number;
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  onUpdate: (patch: Partial<Pick<SkillPlanRecord, 'entries' | 'remapCount'>>) => void;
}

interface ComputeResult {
  scheduled: ScheduledStep[];
  error: string | null;
}

function computeQueue(
  entries: readonly PlanEntry[],
  catalog: SkillCatalog,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  attributes: Attributes,
  implants: Implants
): ComputeResult {
  // Guard against unknown typeIDs (stale plan, imported skill not in the current SDE snapshot).
  const validEntries = entries.filter((e) => catalog.engineSkills.has(e.skillTypeID));
  try {
    const steps = normalizePlan(validEntries, catalog.engineSkills, trainedSkills);
    const scheduled = computeSchedule(steps, { attributes, implants }, catalog.engineSkills);
    return { scheduled, error: null };
  } catch (err) {
    return { scheduled: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export function PlanEditor({
  characterId,
  plan,
  catalog,
  trainedSkills,
  attributes,
  implants,
  onUpdate,
}: PlanEditorProps) {
  const { t } = useTranslation();
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<PlaceRemapsResult | null>(null);
  const [reorderPreview, setReorderPreview] = useState<PlanStep[] | null>(null);

  const nameFor = (skillTypeID: number): string =>
    catalog.bySkillTypeID.get(skillTypeID)?.name ?? `#${skillTypeID}`;

  const pickerSkills = useMemo(
    () => [...catalog.bySkillTypeID.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog]
  );

  const { scheduled, error } = useMemo(
    () => computeQueue(plan.entries, catalog, trainedSkills, attributes, implants),
    [plan.entries, catalog, trainedSkills, attributes, implants]
  );

  const userSkillTypeIDs = useMemo(
    () => new Set(plan.entries.map((e) => e.skillTypeID)),
    [plan.entries]
  );
  const totalSeconds = scheduled.length > 0 ? scheduled[scheduled.length - 1].cumulativeSeconds : 0;

  function update(entries: PlanEntry[]) {
    onUpdate({ entries });
  }

  async function handleImport() {
    const result = await loadCharacterSkillQueue(characterId);
    if (!result) return;
    update(dedupeEntries(parseSkillQueue(result.data)));
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

  function handleOptimizeRemaps() {
    if (scheduled.length === 0) return;
    setOptimizeResult(
      placeRemaps(scheduled, catalog.engineSkills, {
        remapCount: plan.remapCount,
        currentAttributes: attributes,
        implants,
      })
    );
  }

  function handleSuggestReorder() {
    if (scheduled.length === 0) return;
    setReorderPreview(suggestReorder(scheduled, catalog.engineSkills));
  }

  function acceptReorder() {
    if (!reorderPreview) return;
    update(applyReorderSuggestion(plan.entries, reorderPreview));
    setReorderPreview(null);
  }

  return (
    <div className="space-y-4">
      <Panel title={t('plans.yourEntries')}>
        <div className="space-y-3">
          <SkillPicker
            skills={pickerSkills}
            onAdd={(entry) => update(upsertEntry(plan.entries, entry))}
          />
          <EntryList
            entries={plan.entries}
            nameFor={nameFor}
            onReorder={(activeId, overId) => update(handleReorder(plan.entries, activeId, overId))}
            onRemove={(skillTypeID) => update(removeEntry(plan.entries, skillTypeID))}
          />
        </div>
      </Panel>

      <Panel
        title={t('plans.toolbar')}
        actions={
          <span className="flex items-center gap-2 text-[11px] text-text-dim">
            <label className="flex items-center gap-1">
              {t('plans.remapCount')}
              <input
                type="number"
                min={0}
                max={5}
                value={plan.remapCount}
                onChange={(e) =>
                  onUpdate({ remapCount: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })
                }
                className="h-6 w-12 rounded-xs border border-line bg-panel-2 px-1 text-center text-text"
              />
            </label>
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void handleImport()}>
            {t('plans.importQueue')}
          </Button>
          <Button size="sm" onClick={() => void handleExport()}>
            {copyConfirm ? t('plans.exportCopied') : t('plans.exportClipboard')}
          </Button>
          <Button size="sm" onClick={handleOptimizeRemaps} disabled={scheduled.length === 0}>
            {t('plans.optimizeRemaps')}
          </Button>
          <Button size="sm" onClick={handleSuggestReorder} disabled={scheduled.length === 0}>
            {t('plans.suggestReorder')}
          </Button>
        </div>
      </Panel>

      {optimizeResult && (
        <Panel title={t('plans.optimizeRemaps')}>
          <ul className="space-y-1 text-xs">
            {optimizeResult.segments.map((segment, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-2 border-b border-line pb-1"
              >
                <span className="font-semibold">{t('plans.segment', { index: index + 1 })}</span>
                <span className="tabular-nums text-text-dim">
                  {ATTRIBUTE_NAMES.map(
                    (name) => `${name.slice(0, 3).toUpperCase()} ${segment.attributes[name]}`
                  ).join(' · ')}
                </span>
                <span className="tabular-nums">{formatDuration(segment.seconds)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-4 text-xs">
            <span>
              {t('plans.totalTime')}: <strong>{formatDuration(optimizeResult.totalSeconds)}</strong>
            </span>
            <span>
              {t('plans.currentTime')}: {formatDuration(optimizeResult.currentSeconds)}
            </span>
            <span className="text-success">
              {t('plans.savings')}: {formatDuration(optimizeResult.savingsSeconds)}
            </span>
          </div>
        </Panel>
      )}

      {reorderPreview && (
        <Panel title={t('plans.reorderPreviewTitle')}>
          <ul className="max-h-56 overflow-y-auto text-xs">
            {reorderPreview.map((step, i) => (
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
        </Panel>
      )}

      <Panel
        title={t('plans.computedQueue')}
        actions={<span className="text-[11px] text-text-dim">{formatDuration(totalSeconds)}</span>}
      >
        {error ? (
          <p className="text-xs text-danger">{t('plans.computeError', { message: error })}</p>
        ) : (
          <ComputedQueue steps={scheduled} nameFor={nameFor} userSkillTypeIDs={userSkillTypeIDs} />
        )}
      </Panel>
    </div>
  );
}
