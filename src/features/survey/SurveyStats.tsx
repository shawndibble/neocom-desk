import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import { formatDuration as formatTotalTime } from '@/lib/duration';
import { createNumberFormat, getDecimalMark } from '@/lib/numberLocale';
import { useNow } from '@/lib/useNow';
import type { SurveySummary } from '@/engine/survey/series';
import { IskAmount, Tooltip } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { formatLocalClock } from './localClock';
import { useDoneAtClock, useDoneAtOverride } from './surveyPref';
import { useHydratedStore } from '@/lib/useHydratedStore';

const toggleClassName = `text-accent text-left whitespace-normal rounded-xs ${interactiveClassName} ${focusRingClassName}`;

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
        data-survey-stat
        className={`text-lg font-semibold break-words tabular-nums ${emphasis ? 'text-accent' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

function shortVolume(value: number): string {
  // eslint-disable-next-line no-restricted-syntax -- English K/M/B; the mark is swapped below.
  const text = value.toLocaleString('en', {
    notation: 'compact',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return getDecimalMark() === ',' ? text.replace('.', ',') : text;
}

const formatPace = createNumberFormat({ maximumFractionDigits: 1 });

export function SurveyStats({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  const now = useNow();
  const clock = useDoneAtClock();
  const local = clock === 'local';
  useHydratedStore(useDoneAtOverride);
  const setClock = useDoneAtOverride((state) => state.setValue);
  const doneAt = summary.finished ? summary.finishedAt : summary.etaAt;
  const tileCount = summary.finished ? 3 : summary.iskLeft === null ? 5 : 6;
  const wideColumns =
    tileCount === 6 ? '@4xl:grid-cols-6' : tileCount === 5 ? '@4xl:grid-cols-5' : '';
  return (
    <div className="@container">
      <div className={`grid grid-cols-3 gap-x-2 gap-y-3 @md:gap-x-4 ${wideColumns}`}>
        {!summary.finished && (
          <Tile label={t('survey.statLeft')}>{shortVolume(summary.leftVolume)}</Tile>
        )}
        <Tile label={t('survey.statPace')}>
          {summary.pace === null ? '–' : formatPace(summary.pace)}
        </Tile>
        <Tile label={t('survey.statDone')} emphasis>
          {doneAt === null || clock === null ? (
            '–'
          ) : (
            <Tooltip content={t(local ? 'survey.showEveTime' : 'survey.showLocalTime')}>
              <button
                type="button"
                className={toggleClassName}
                onClick={() => void setClock(local ? 'eve' : 'local')}
              >
                {local
                  ? formatLocalClock(doneAt)
                  : t('survey.eveTime', { time: formatEveClock(doneAt) })}
              </button>
            </Tooltip>
          )}
        </Tile>
        {summary.finished ? (
          <Tile label={t('survey.statTotalTime')}>{formatTotalTime(summary.elapsedMs / 1000)}</Tile>
        ) : (
          <>
            <Tile label={t('survey.statTimeLeft')}>
              {summary.etaAt === null ? '–' : formatDuration(Math.max(0, summary.etaAt - now))}
            </Tile>
            <Tile label={t('survey.statRocks')}>{summary.rocksLeft}</Tile>
            {summary.iskLeft !== null && (
              <Tile label={t('survey.statIsk')}>
                <IskAmount value={summary.iskLeft} decimals={0} />
              </Tile>
            )}
          </>
        )}
      </div>
    </div>
  );
}
