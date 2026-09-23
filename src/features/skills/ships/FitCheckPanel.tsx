/**
 * Paste an EFT fit, see the skills it still needs, add them to a plan.
 * Reuses `previewClipboardImport`'s eftFit path — narrower than
 * `ImportClipboardDialog` (EFT only) and a panel rather than a modal.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Panel, Spinner } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { readFromClipboard } from '@/lib/clipboard';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import type { CloneState, Attributes, Implants } from '@/engine/types';
import { loadUniverseType } from '../data';
import { loadItemNameMap, loadSkillNameMap } from '../typeCatalog';
import { previewClipboardImport } from '../planner/clipboardImport';
import { SkillRow } from '../SkillRow';
import type { TargetPlan } from '../useTargetPlan';
import { TargetPlanPicker } from '../TargetPlanPicker';
import { buildFitCheckRows, type FitCheckRow } from './fitCheckRows';
import { scheduleEntries } from './scheduleEntries';

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

type CheckState = { kind: 'idle' } | { kind: 'notEftFit' } | ({ kind: 'result' } & CheckedFit);

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
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });

  async function handleCheck() {
    setChecking(true);
    try {
      const [skillByName, typeByName] = await Promise.all([loadSkillNameMap(), loadItemNameMap()]);
      const preview = await previewClipboardImport(text, {
        skillByName,
        typeByName,
        loadType: loadUniverseType,
      });
      if (preview.mode !== 'eftFit') {
        setCheck({ kind: 'notEftFit' });
        return;
      }
      const scheduled = scheduleEntries(preview.entries, {
        skills,
        trainedSkills,
        attributes,
        implants,
        cloneState,
      });
      setCheck({
        kind: 'result',
        shipName: preview.shipName,
        rows: buildFitCheckRows(preview.entries, skills, trainedSkills, scheduled),
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
      setCheck({ kind: 'idle' });
    } catch {
      // Clipboard permission denied — the paste box is still there to type into.
    }
  }

  const result = check.kind === 'result' ? check : null;
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
              setCheck({ kind: 'idle' });
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
              variant="ghost"
              onClick={() => void handleCheck()}
              disabled={checking || text.trim() === ''}
            >
              {checking ? <Spinner size="sm" /> : t('skills.fitCheck.checkButton')}
            </Button>
          </div>
          {check.kind === 'notEftFit' && (
            <p className="text-xs text-danger">{t('skills.fitCheck.notEftFit')}</p>
          )}
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
            missingRows.length > 0 && target.plans !== undefined ? (
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
                  {target.plans.length === 0
                    ? t('skills.fitCheck.createPlanAndAdd')
                    : t('skills.fitCheck.addAllToPlan')}
                </Button>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-1 p-3">
            {result.warnings.map((warning, i) => (
              <p key={`${i}:${warning}`} className="text-xs text-warning">
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
                <div key={row.skillTypeID} className="border-b border-line py-1.5 last:border-b-0">
                  <SkillRow
                    name={row.name}
                    status={row.status}
                    currentLevel={row.currentLevel}
                    timeLabel={
                      row.status === 'trained'
                        ? t('skills.fitCheck.trained')
                        : formatDuration(row.seconds)
                    }
                    addLabel={t('skills.fitCheck.add')}
                    onAdd={() =>
                      void target.addEntries(
                        [{ skillTypeID: row.skillTypeID, targetLevel: row.targetLevel }],
                        result.shipName ?? t('plans.newPlanName')
                      )
                    }
                  />
                </div>
              ))
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
