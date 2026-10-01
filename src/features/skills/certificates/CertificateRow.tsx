import { useTranslation } from 'react-i18next';
import { Button, Caret } from '@/components/ui';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { isEntryCovered, plannedLevelFor } from '@/features/skills/planner/reorder';
import { SkillRow } from '@/features/skills/SkillRow';
import { skillTrainingStatus } from '@/features/skills/skillStatus';
import { formatCountdown } from '@/lib/duration';
import { cx } from '@/lib/cx';
import { ELITE, type CertificateRow as Row } from './certificatesModel';

const GRADES = [1, 2, 3, 4, 5] as const;

/**
 * The grade as five pips, filled up to it. Pips past an Alpha clone's reach
 * are drawn dashed in `warning`; the grade word always sits under them, so
 * colour is never the only signal.
 */
function GradePips({ grade, alphaReach }: { grade: number; alphaReach: number | null }) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0">
      <div className="flex gap-0.5" aria-hidden="true">
        {GRADES.map((n) => (
          <span
            key={n}
            className={cx(
              'h-2 w-5 border',
              n <= grade
                ? 'border-accent bg-accent'
                : alphaReach !== null && n > alphaReach
                  ? 'border-dashed border-warning'
                  : 'border-line-bright'
            )}
          />
        ))}
      </div>
      <div className="mt-1 text-[0.6875rem] text-text-dim tabular-nums">
        {grade === 0
          ? t('skills.certificates.grade.0')
          : t('skills.certificates.gradeOf', {
              grade: t(`skills.certificates.grade.${grade}`),
              level: grade,
            })}
      </div>
    </div>
  );
}

export interface CertificateRowProps {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  /** Total time to the next grade, by the plan scheduler; absent at Elite. */
  secondsToNext: number | undefined;
  /** Per-skill time for the expanded list. */
  skillSeconds: ReadonlyMap<number, number>;
  /** Highest grade an Alpha clone reaches; null for an Omega Character. */
  alphaReach: number | null;
  planEntries: readonly PlanEntry[];
  trainedLevel: (skillTypeID: number) => number;
  skillName: (skillTypeID: number) => string;
  /** Null while the Character's plans are still loading — no Add until then. */
  onAdd: (() => void) | null;
}

export function CertificateRow({
  row,
  expanded,
  onToggle,
  secondsToNext,
  skillSeconds,
  alphaReach,
  planEntries,
  trainedLevel,
  skillName,
  onAdd,
}: CertificateRowProps) {
  const { t } = useTranslation();
  const { certificate, grade, next, unplanned, alphaCapped } = row;
  const elite = grade === ELITE;
  const nextGrade = elite ? '' : t(`skills.certificates.grade.${grade + 1}`);
  const capped = alphaCapped.length > 0;
  const panelId = `certificate-${certificate.id}-needs`;

  let action;
  if (elite) {
    action = (
      <Button size="sm" disabled>
        {t('skills.certificates.complete')}
      </Button>
    );
  } else if (capped) {
    action = (
      <Button size="sm" disabled>
        {t('skills.certificates.omegaOnly')}
      </Button>
    );
  } else if (unplanned.length === 0) {
    action = <span className="text-text-dim">{t('skills.certificates.inPlan')}</span>;
  } else {
    action = (
      <Button size="sm" variant="primary" onClick={onAdd ?? undefined} disabled={!onAdd}>
        {t('skills.certificates.add', { grade: nextGrade })}
      </Button>
    );
  }

  return (
    <li className="border-t border-line text-xs">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-3 py-2 sm:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.4fr)_auto]">
        {elite ? (
          <span className="min-w-0 truncate text-sm font-medium text-text">{certificate.name}</span>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={t('skills.certificates.showNeeds', {
              grade: nextGrade,
              name: certificate.name,
            })}
            onClick={onToggle}
            className="flex min-h-9 min-w-0 items-center gap-1.5 text-left text-sm font-medium text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Caret expanded={expanded} />
            <span className="truncate">{certificate.name}</span>
          </button>
        )}
        <GradePips grade={grade} alphaReach={alphaReach} />
        <p className="col-span-2 min-w-0 text-text-dim sm:col-span-1">
          {elite ? (
            <span className="text-success">{t('skills.certificates.eliteDone')}</span>
          ) : capped ? (
            <span className="text-warning">
              {t('skills.certificates.alphaCapped', {
                grade: nextGrade,
                skills: alphaCapped
                  .map((e) => `${skillName(e.skillTypeID)} ${romanLevel(e.targetLevel)}`)
                  .join(', '),
              })}
            </span>
          ) : (
            t('skills.certificates.nextNeeds', {
              grade: nextGrade,
              count: next.length,
              time: formatCountdown(secondsToNext ?? 0),
            })
          )}
        </p>
        <div className="col-span-2 flex justify-end sm:col-span-1">{action}</div>
      </div>
      {expanded && !elite && (
        <div id={panelId} className="mx-3 mb-3 border border-line bg-bg px-3 py-2">
          <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('skills.certificates.missingFor', { grade: nextGrade })}
          </p>
          <ul className="space-y-1">
            {next.map((entry) => {
              const have = trainedLevel(entry.skillTypeID);
              return (
                <li key={entry.skillTypeID}>
                  <SkillRow
                    name={`${skillName(entry.skillTypeID)} ${romanLevel(entry.targetLevel)}`}
                    skillTypeID={entry.skillTypeID}
                    planEntries={planEntries}
                    status={skillTrainingStatus(have, entry.targetLevel)}
                    currentLevel={have}
                    timeLabel={formatCountdown(skillSeconds.get(entry.skillTypeID) ?? 0)}
                    inPlanLabel={
                      isEntryCovered(planEntries, entry.skillTypeID, entry.targetLevel)
                        ? t('skills.fitCheck.inPlan')
                        : undefined
                    }
                    plannedLevel={plannedLevelFor(planEntries, entry.skillTypeID)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
