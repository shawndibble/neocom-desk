/**
 * "What skills do I need to fly this fit?" — paste an EFT fit, see the
 * skills it still needs, add them to a plan. Reuses the same parse/resolve
 * path as the Skill Plan editor's own "Import from clipboard" (eftFit mode
 * of `previewClipboardImport`) and Industry's Fit Import — this panel is a
 * new, narrower presentation of that shared engine, not a new parser: unlike
 * `ImportClipboardDialog`, it only ever reads an EFT fit (no skill-plan-paste
 * or file tabs) and shows the result as a first-class panel instead of a
 * modal preview.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Panel, SkillBar, Spinner } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { readFromClipboard } from '@/lib/clipboard';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import { computeSkillPlanSchedule } from '@/engine/skillPlanSchedule';
import type { CloneState, Attributes, Implants } from '@/engine/types';
import { loadUniverseType } from '../data';
import { loadItemNameMap, loadSkillNameMap } from '../typeCatalog';
import { previewClipboardImport } from '../planner/clipboardImport';
import type { TargetPlan } from '../useTargetPlan';
import { TargetPlanPicker } from '../TargetPlanPicker';
import { buildFitCheckRows, type FitCheckRow } from './fitCheckRows';

export interface FitCheckPanelProps {
  target: TargetPlan;
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
}

interface CheckedFit {
  shipName?: string;
  rows: FitCheckRow[];
  warnings: string[];
}

export function FitCheckPanel({
  target,
  skills,
  trainedSkills,
  attributes,
  implants,
  cloneState,
}: FitCheckPanelProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckedFit | null>(null);
  const [notEftFit, setNotEftFit] = useState(false);

  async function handleCheck() {
    setChecking(true);
    setNotEftFit(false);
    setResult(null);
    try {
      const [skillByName, typeByName] = await Promise.all([loadSkillNameMap(), loadItemNameMap()]);
      const preview = await previewClipboardImport(text, {
        skillByName,
        typeByName,
        loadType: loadUniverseType,
      });
      if (preview.mode !== 'eftFit') {
        setNotEftFit(true);
        return;
      }
      const schedule = computeSkillPlanSchedule({
        entries: preview.entries,
        skills,
        trainedSkills,
        attributes,
        implants,
        boosters: [],
        markers: undefined,
        markerAttributes: [],
        cloneState,
        startDate: new Date(),
      });
      setResult({
        shipName: preview.shipName,
        rows: buildFitCheckRows(preview.entries, skills, trainedSkills, schedule.scheduled),
        warnings: preview.warnings,
      });
    } finally {
      setChecking(false);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const clip = await readFromClipboard();
      setText(clip);
      setResult(null);
    } catch {
      // Clipboard permission denied — the paste box is still there to type into.
    }
  }

  const missingRows = result?.rows.filter((r) => r.status !== 'trained') ?? [];

  return (
    <div className="space-y-4">
      <Panel title={t('skills.fitCheck.title')}>
        <div className="space-y-2 p-3">
          <label className="block text-xs text-text-dim" htmlFor="fit-check-text">
            {t('skills.fitCheck.pasteLabel')}
          </label>
          <textarea
            id="fit-check-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
              setNotEftFit(false);
            }}
            rows={8}
            className="w-full rounded-xs border border-line bg-panel-2 p-2 text-xs text-text"
            placeholder={t('skills.fitCheck.pastePlaceholder')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void handlePasteFromClipboard()}>
              {t('plans.pasteFromClipboard')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void handleCheck()}
              disabled={checking || text.trim() === ''}
            >
              {checking ? <Spinner size="sm" /> : t('skills.fitCheck.checkButton')}
            </Button>
          </div>
          {notEftFit && <p className="text-xs text-danger">{t('skills.fitCheck.notEftFit')}</p>}
        </div>
      </Panel>

      {result && (
        <Panel
          title={
            result.rows.length === 0
              ? t('skills.fitCheck.resultsTitleEmpty')
              : t('skills.fitCheck.resultsTitle', { count: missingRows.length })
          }
          actions={
            missingRows.length > 0 ? (
              <div className="flex items-center gap-2">
                <TargetPlanPicker target={target} />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    void target.addEntries(
                      missingRows.map((r) => ({
                        skillTypeID: r.skillTypeID,
                        targetLevel: r.targetLevel,
                      })),
                      result.shipName ?? t('plans.newPlanName')
                    )
                  }
                >
                  {target.plans && target.plans.length === 0
                    ? t('skills.fitCheck.createPlanAndAdd')
                    : t('skills.fitCheck.addAllToPlan')}
                </Button>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-1 p-3">
            {result.warnings.map((warning) => (
              <p key={warning} className="text-xs text-warning">
                {warning}
              </p>
            ))}
            {result.rows.length === 0 ? (
              <EmptyState
                title={t('skills.fitCheck.emptyTitle')}
                hint={t('skills.fitCheck.emptyHint')}
              />
            ) : (
              result.rows.map((row) => (
                <div
                  key={row.skillTypeID}
                  className="flex items-center gap-3 border-b border-line py-1.5 text-xs last:border-b-0"
                >
                  <StatusIcon status={row.status} />
                  <span className="flex-1 text-text">{row.name}</span>
                  <SkillBar level={row.currentLevel} />
                  <span className="w-16 text-right text-text-dim tabular-nums">
                    {row.status === 'trained'
                      ? t('skills.fitCheck.trained')
                      : formatDuration(row.seconds)}
                  </span>
                  {row.status !== 'trained' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void target.addEntries(
                          [{ skillTypeID: row.skillTypeID, targetLevel: row.targetLevel }],
                          result.shipName ?? t('plans.newPlanName')
                        )
                      }
                    >
                      {t('skills.fitCheck.add')}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: FitCheckRow['status'] }) {
  const { t } = useTranslation();
  if (status === 'trained') {
    return (
      <span className="text-success" aria-label={t('skills.fitCheck.statusTrained')}>
        ✓
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="text-warning" aria-label={t('skills.fitCheck.statusPartial')}>
        ◐
      </span>
    );
  }
  return (
    <span className="text-danger" aria-label={t('skills.fitCheck.statusMissing')}>
      ✕
    </span>
  );
}
