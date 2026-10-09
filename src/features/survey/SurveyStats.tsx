/**
 * The Survey's headline numbers as a row of large tiles under the chart: what
 * is left, how fast it is going, when it will be gone and how long that is.
 * Bigger than a `StatChip` on purpose: these are what the pilot reads at a
 * glance and says in fleet chat, not small counts beside a title.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import type { SurveySummary } from '@/engine/survey/series';
import { formatIskCompact } from '@/lib/isk';

function Tile({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 border-l-2 border-line pl-3">
      <div className="text-[0.6875rem] font-semibold tracking-wider text-text-dim uppercase">
        {label}
      </div>
      <div
        className={`truncate text-lg font-semibold tabular-nums ${emphasis ? 'text-accent' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

export function SurveyStats({ summary }: { summary: SurveySummary }) {
  const { t, i18n } = useTranslation();
  const n = (value: number, digits = 0) =>
    value.toLocaleString(i18n.language, { maximumFractionDigits: digits });
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label={t('survey.statLeft')}>
        {t('survey.unitVolume', { value: n(summary.leftVolume) })}
      </Tile>
      <Tile label={t('survey.statPace')}>
        {summary.pace === null ? '–' : t('survey.unitPace', { value: n(summary.pace, 1) })}
      </Tile>
      <Tile label={t('survey.statDone')} emphasis>
        {summary.finished
          ? t('survey.finished')
          : summary.etaAt === null
            ? t('survey.needSecondScan')
            : t('survey.eveTime', { time: formatEveClock(summary.etaAt) })}
      </Tile>
      <Tile label={t('survey.statTimeLeft')}>
        {summary.etaAt === null ? '–' : formatDuration(summary.etaAt - summary.lastAt)}
      </Tile>
      <Tile label={t('survey.statRocks')}>{summary.rocksLeft}</Tile>
      {summary.iskLeft !== null && (
        <Tile label={t('survey.statIsk')}>{formatIskCompact(summary.iskLeft)}</Tile>
      )}
    </div>
  );
}
