import { useTranslation } from 'react-i18next';
import { romanLevel } from '@/engine/projection';
import { ProgressBar } from '@/components/ui';
import { SkillLink } from '@/features/entities';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import type { SkillCatalog } from '../skillMap';
import { heroProgress, heroSpPerHour, type QueueRowView } from './queueView';
import { formatCount } from '@/lib/formatCount';

interface NowTrainingCardProps {
  row: QueueRowView;
  /** The level queued right behind this one, if any. */
  next?: QueueRowView;
  catalog: SkillCatalog;
  nowMs: number;
}

/**
 * The level training right now, big: what, how long, how far along. The one
 * thing a pilot opens this page for.
 */
export function NowTrainingCard({ row, next, catalog, nowMs }: NowTrainingCardProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { entry, secondsRemaining } = row;
  const skill = catalog.bySkillTypeID.get(entry.skill_id);
  const name = skill?.name ?? `#${entry.skill_id}`;
  const level = romanLevel(entry.finished_level);
  const progress = heroProgress(entry, nowMs);
  const percent = progress === null ? null : Math.floor(progress * 100);
  const spPerHour = heroSpPerHour(entry);
  const nextSkill = next ? catalog.bySkillTypeID.get(next.entry.skill_id) : undefined;
  const finish =
    secondsRemaining === null
      ? null
      : formatLocalDate(new Date(nowMs + secondsRemaining * 1000), timeZone);

  return (
    <section
      aria-label={t('plans.trainingNow')}
      className="rounded-xs border border-accent-dim bg-panel p-4"
    >
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-success uppercase">
        <span aria-hidden className="size-2 rounded-full bg-success motion-safe:animate-pulse" />
        {t('plans.trainingNow')}
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-text sm:text-2xl">
            <SkillLink typeId={entry.skill_id}>{name}</SkillLink> {level}
          </div>
          {spPerHour !== null && (
            <div className="mt-1 text-sm text-text-dim">
              {skill &&
                `${t('plans.heroAttributes', { primary: t(`skills.attr.${skill.primaryAttr}`), secondary: t(`skills.attr.${skill.secondaryAttr}`) })} · `}
              {t('plans.heroSpPerHour', { sp: formatCount(spPerHour) })}
            </div>
          )}
        </div>
        {secondsRemaining !== null && (
          <div className="sm:text-right">
            <div className="text-xl font-semibold text-text tabular-nums sm:text-2xl">
              {formatCountdown(secondsRemaining)}
            </div>
            <div className="text-sm text-text-dim">{t('plans.heroLeftDone', { date: finish })}</div>
          </div>
        )}
      </div>
      {percent !== null && (
        <ProgressBar
          label={t('plans.heroProgress', { percent, level })}
          value={percent}
          size="md"
          className="mt-4"
        />
      )}
      <div className="mt-1 flex justify-between gap-3 text-xs text-text-dim">
        <span>{percent !== null && t('plans.heroProgress', { percent, level })}</span>
        {next && (
          <span className="truncate">
            {t('plans.heroNext', {
              name: nextSkill?.name ?? `#${next.entry.skill_id}`,
              level: romanLevel(next.entry.finished_level),
            })}
          </span>
        )}
      </div>
    </section>
  );
}
